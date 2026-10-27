import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const account = JSON.parse(serviceAccountJson);
  if (!account.client_email || !account.private_key) {
    throw new Error("A conta de serviço do Google não contém client_email ou private_key.");
  }
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)),
  );
  const assertion = signingInput + "." + base64url(signature);
  const tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" + encodeURIComponent(assertion),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error("Não foi possível obter autorização de leitura no Google Drive.");
  }
  return tokenBody.access_token as string;
}

function splitSemicolon(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ";" && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalize(value: string): string {
  return value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function canonicalJoinKey(numberValue: string, yearValue: string, letterValue: string): string {
  const numberDigits = numberValue.replace(/\D/g, "");
  const yearDigits = yearValue.replace(/\D/g, "").slice(-4);
  if (!numberDigits || yearDigits.length !== 4) return "";
  const paddedNumber = numberDigits.padStart(5, "0");
  const letter = letterValue.trim().toUpperCase();
  return normalize(paddedNumber + "/" + yearDigits + "-" + letter).replace(/[^A-Z0-9]/g, "");
}

function isValidDateValue(value: string): boolean {
  return /^\d{8}$/.test(value) && value !== "00000000";
}

type CadRecord = {
  join_key: string;
  number: string;
  year: string;
  letter: string;
  type_code: string;
  process: string;
  signed_date: string;
  object: string;
  object_full: string;
  last_validity: string;
  entity: string;
};

function mergeCadRecord(target: CadRecord, candidate: CadRecord): CadRecord {
  const fields: (keyof CadRecord)[] = [
    "number", "year", "letter", "type_code", "process",
    "signed_date", "object", "object_full", "entity",
  ];
  for (const field of fields) {
    if (!target[field] && candidate[field]) target[field] = candidate[field];
  }
  if (isValidDateValue(candidate.last_validity)) {
    if (!isValidDateValue(target.last_validity) || candidate.last_validity > target.last_validity) {
      target.last_validity = candidate.last_validity;
    }
  }
  return target;
}

async function isAdminOrInternal(authorization: string): Promise<boolean> {
  const expectedSecret = Deno.env.get("IMPORT_FUNCTION_SECRET");
  if (expectedSecret && authorization === "Bearer " + expectedSecret) return true;
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
    .from("panel_users").select("email,is_admin,is_active").eq("email", email).maybeSingle();
  return !profileError && profile?.is_admin === true && profile?.is_active === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Método não permitido." }, 405);

  const providedAuthorization = req.headers.get("Authorization") || "";
  if (!(await isAdminOrInternal(providedAuthorization))) {
    return jsonResponse({ success: false, error: "Não autorizado: somente o administrador pode executar a importação." }, 401);
  }

  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
  // ID do arquivo CadConvenios.txt no Drive. O ID identifica o arquivo, mas não concede acesso sem a conta de serviço.
  const fileId = "1x0SlFbGrQTBBO3LjBkGweXcaRpbqKFCz";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceAccountJson || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({
      success: false,
      error: "Faltam segredos necessários: GOOGLE_SERVICE_ACCOUNT_JSON, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let importId = "";
  try {
    const { data: importRecord, error: createError } = await admin
      .from("ret_fontes_imports")
      .insert({ file_name: "CadConvenios.txt", status: "processing", row_count: 0 })
      .select("id")
      .single();
    if (createError || !importRecord) {
      throw new Error("Não foi possível iniciar o registro da importação cadastral: " +
        (createError?.message || "nenhum registro retornado"));
    }
    importId = importRecord.id as string;

    const accessToken = await getGoogleAccessToken(serviceAccountJson);
    const driveResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media",
      { headers: { Authorization: "Bearer " + accessToken } },
    );
    if (!driveResponse.ok) {
      throw new Error("Não foi possível baixar CadConvenios.txt do Google Drive. Verifique o ID e o compartilhamento com a conta de serviço.");
    }

    const contentLength = Number(driveResponse.headers.get("content-length") || 0);
    const maxBytes = 50 * 1024 * 1024;
    if (contentLength > maxBytes) throw new Error("CadConvenios.txt excede o limite de 50 MB.");
    const buffer = await driveResponse.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error("CadConvenios.txt está vazio.");
    if (buffer.byteLength > maxBytes) throw new Error("CadConvenios.txt excede o limite de 50 MB.");

    // O arquivo de origem é texto Windows-1252/ANSI, com separador ponto e vírgula.
    const textContent = new TextDecoder("windows-1252").decode(buffer).replace(/^\uFEFF/, "");
    const lines = textContent.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) throw new Error("CadConvenios.txt não contém linhas de dados.");

    const header = splitSemicolon(lines[0]).map((field) => field.trim().replace(/^"|"$/g, ""));
    while (header.length && header[header.length - 1] === "") header.pop();
    const columnIndex = new Map<string, number>();
    header.forEach((field, index) => {
      const key = normalize(field);
      if (!columnIndex.has(key)) columnIndex.set(key, index);
    });

    const requiredColumns = [
      "NUMCONV", "ANOCONV", "LETRA", "TP-AJUSTE", "PROCESSO",
      "DT-ASSINA", "OBJETO", "ULT-VIGENCIA", "R-SOCIAL",
    ];
    const missingColumns = requiredColumns.filter((column) => !columnIndex.has(normalize(column)));
    if (missingColumns.length) {
      throw new Error("Cabeçalho de CadConvenios.txt sem as colunas necessárias: " + missingColumns.join(", "));
    }

    const getColumn = (row: string[], name: string): string => {
      const index = columnIndex.get(normalize(name));
      return index === undefined ? "" : clean(row[index]);
    };

    const unique = new Map<string, CadRecord>();
    for (let i = 1; i < lines.length; i++) {
      const row = splitSemicolon(lines[i]);
      const number = getColumn(row, "NUMCONV");
      const year = getColumn(row, "ANOCONV");
      const letter = getColumn(row, "LETRA");
      const joinKey = canonicalJoinKey(number, year, letter);
      if (!joinKey) continue;

      const candidate: CadRecord = {
        join_key: joinKey,
        number: number.replace(/\D/g, "").padStart(5, "0"),
        year: year.replace(/\D/g, "").slice(-4),
        letter: letter.trim().toUpperCase(),
        type_code: getColumn(row, "TP-AJUSTE").replace(/^0+/, "") || getColumn(row, "TP-AJUSTE"),
        process: getColumn(row, "PROCESSO"),
        signed_date: getColumn(row, "DT-ASSINA"),
        object: getColumn(row, "OBJETO"),
        object_full: getColumn(row, "OBJETO COMPLETO"),
        last_validity: getColumn(row, "ULT-VIGENCIA"),
        entity: getColumn(row, "R-SOCIAL"),
      };
      const prior = unique.get(joinKey);
      unique.set(joinKey, prior ? mergeCadRecord(prior, candidate) : candidate);
    }
    if (!unique.size) throw new Error("Nenhum ajuste válido foi identificado em CadConvenios.txt.");

    const records = [...unique.values()];
    const batchSize = 500;
    for (let start = 0; start < records.length; start += batchSize) {
      const batch = records.slice(start, start + batchSize).map((fields, offset) => ({
        import_id: importId,
        row_number: start + offset + 1,
        raw_line: "CadConvenios:" + fields.join_key,
        fields,
      }));
      const { error: insertError } = await admin.from("ret_fontes_rows").insert(batch);
      if (insertError) throw new Error("Falha ao gravar o cadastro consolidado no Supabase: " + insertError.message);
    }

    const { error: finishError } = await admin
      .from("ret_fontes_imports")
      .update({
        status: "success",
        row_count: records.length,
        finished_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", importId);
    if (finishError) throw new Error("Os dados foram gravados, mas não foi possível finalizar o registro da importação.");

    return jsonResponse({
      success: true,
      import_id: importId,
      row_count: records.length,
      source_lines: lines.length - 1,
      message: "Importação cadastral concluída.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (importId) {
      await admin.from("ret_fontes_imports")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_message: message })
        .eq("id", importId);
    }
    return jsonResponse({ success: false, error: message }, 500);
  }
});
