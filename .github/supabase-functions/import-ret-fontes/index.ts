
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function base64url(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input;

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getGoogleAccessToken(
  serviceAccount: {
    client_email: string;
    private_key: string;
    token_uri?: string;
  },
): Promise<string> {
  const tokenUri =
    serviceAccount.token_uri ??
    "https://oauth2.googleapis.com/token";

  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );

  const claim = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );

  const unsignedToken = `${header}.${claim}`;

  const privateKey = serviceAccount.private_key
    .replace(/\\n/g, "\n");

  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const keyBytes = Uint8Array.from(
    atob(pemContents),
    (char) => char.charCodeAt(0),
  );

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  const jwt = `${unsignedToken}.${base64url(
    new Uint8Array(signature),
  )}`;

  const tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      `Falha na autenticação do Google: ${
        tokenData.error_description ??
        tokenData.error ??
        tokenResponse.status
      }`,
    );
  }

  return tokenData.access_token;
}

async function isAdminOrInternal(authorization: string): Promise<boolean> {
  const expectedSecret = Deno.env.get("IMPORT_FUNCTION_SECRET");
  if (expectedSecret && authorization === `Bearer ${expectedSecret}`) return true;

  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return false;

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  const email = userData?.user?.email?.toLowerCase();
  if (userError || !email) return false;

  const { data: profile, error: profileError } = await adminClient
    .from("panel_users")
    .select("email,is_admin,is_active")
    .eq("email", email)
    .maybeSingle();

  return !profileError && profile?.is_admin === true && profile?.is_active === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Use o método POST." },
      405,
    );
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";

    if (!(await isAdminOrInternal(authorization))) {
      return jsonResponse(
        { success: false, error: "Não autorizado: somente o administrador pode executar a importação." },
        401,
      );
    }

    const serviceAccountJson = Deno.env.get(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
    );
    const driveFileId = Deno.env.get("GOOGLE_DRIVE_FILE_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (
      !serviceAccountJson ||
      !driveFileId ||
      !supabaseUrl ||
      !serviceKey
    ) {
      throw new Error(
        "Faltam segredos necessários à importação.",
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: importRecord, error: createError } =
      await supabase
        .from("ret_fontes_imports")
        .insert({
          file_name: "RET_FONTES.txt",
          status: "processing",
        })
        .select("id")
        .single();

    if (createError || !importRecord) {
      throw new Error(
        `Falha ao criar registro: ${
          createError?.message ?? "nenhum registro retornado"
        }`,
      );
    }

    const importId = importRecord.id;

    try {
      const serviceAccount = JSON.parse(serviceAccountJson);

      const googleToken = await getGoogleAccessToken(
        serviceAccount,
      );

      const driveResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          driveFileId,
        )}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${googleToken}`,
          },
        },
      );

      if (!driveResponse.ok) {
        const driveError = await driveResponse.text();
        throw new Error(
          `Falha ao baixar arquivo do Google Drive: ${driveResponse.status} ${driveError}`,
        );
      }

      const fileText = await driveResponse.text();

      if (!fileText.trim()) {
        throw new Error("O arquivo RET_FONTES.txt está vazio.");
      }

      if (new TextEncoder().encode(fileText).length > 20 * 1024 * 1024) {
        throw new Error(
          "O arquivo ultrapassa o limite de 20 MB.",
        );
      }

      const lines = fileText
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "");

      if (lines.length < 2) {
        throw new Error(
          "O arquivo precisa conter cabeçalho e ao menos uma linha de dados.",
        );
      }

      const headerFields = lines[0].split(";");

      if (headerFields.length < 25 || headerFields.length > 27) {
        throw new Error(
          `O cabeçalho possui ${headerFields.length} campos; eram esperados de 25 a 27.`,
        );
      }

      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].split(";");

        if (fields.length < 25 || fields.length > 27) {
          throw new Error(
            `A linha ${i + 1} possui ${fields.length} campos; eram esperados de 25 a 27.`,
          );
        }

        rows.push({
          import_id: importId,
          row_number: i + 1,
          raw_line: lines[i],
          fields,
        });
      }

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);

        const { error: rowsError } = await supabase
          .from("ret_fontes_rows")
          .insert(batch);

        if (rowsError) {
          throw new Error(
            `Falha ao inserir dados a partir da linha ${
              batch[0].row_number
            }: ${rowsError.message}`,
          );
        }
      }

      const { error: updateError } = await supabase
        .from("ret_fontes_imports")
        .update({
          status: "success",
          row_count: rows.length,
          finished_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", importId);

      if (updateError) {
        throw new Error(
          `Falha ao finalizar importação: ${updateError.message}`,
        );
      }

      return jsonResponse({
        success: true,
        import_id: importId,
        row_count: rows.length,
        message: "Importação concluída.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await supabase
        .from("ret_fontes_imports")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq("id", importId);

      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return jsonResponse(
      { success: false, error: message },
      500,
    );
  }
});
