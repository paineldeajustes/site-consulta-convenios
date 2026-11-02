import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}): Promise<string> {
  const tokenUri = serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = header + "." + claim;
  const privateKey = serviceAccount.private_key.replace(/\\n/g, "\n");
  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemContents), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  const jwt = unsignedToken + "." + base64url(new Uint8Array(signature));
  const tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      "Falha na autenticação do Google: " +
      (tokenData.error_description ?? tokenData.error ?? tokenResponse.status),
    );
  }
  return tokenData.access_token as string;
}

function normalize(value: string): string {
  return value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function splitSemicolon(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ";" && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function canonicalAdjustmentKey(numberAndYear: string, letterValue: string): string | null {
  const match = numberAndYear.trim().match(/^(\d{1,5})\s*\/\s*(\d{4})$/);
  if (!match) return null;
  const number = match[1].padStart(5, "0");
  const year = match[2];
  const letter = normalize(letterValue).replace(/[^A-Z0-9]/g, "");
  return normalize(number + "/" + year + "-" + letter).replace(/[^A-Z0-9]/g, "");
}

function parseBrazilianNumber(value: string): number | null {
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function parseDateDMY(value: string): string | null {
  const raw = value.trim();
  if (!/^\d{8}$/.test(raw) || raw === "00000000") return null;
  const day = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4));
  const year = Number(raw.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function getColumnIndex(header: string[], name: string, occurrence = 0): number {
  const normalizedName = normalize(name);
  let seen = 0;
  for (let index = 0; index < header.length; index++) {
    if (normalize(header[index]) !== normalizedName) continue;
    if (seen === occurrence) return index;
    seen++;
  }
  return -1;
}

function getValue(row: string[], header: string[], name: string, occurrence = 0): string {
  const index = getColumnIndex(header, name, occurrence);
  return index >= 0 ? clean(row[index]) : "";
}

function toUniqueFieldObject(header: string[], row: string[]): Record<string, string> {
  const output: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (let index = 0; index < header.length; index++) {
    const base = header[index].trim();
    if (!base) continue;
    const normalizedBase = normalize(base);
    const occurrence = (seen.get(normalizedBase) ?? 0) + 1;
    seen.set(normalizedBase, occurrence);
    const key = occurrence === 1 ? base : base + "__" + occurrence;
    output[key] = clean(row[index]);
  }
  return output;
}

function inferExercise(fileType: "empenho" | "pagamento", header: string[], lines: string[]): number {
  const counts = new Map<number, number>();
  const primaryColumn = fileType === "empenho" ? "ANO-NE" : "DATA";
  const fallbackColumn = fileType === "empenho" ? "DATA" : "dt-bo";
  for (let i = 1; i < lines.length && i <= 8000; i++) {
    if (!lines[i].trim()) continue;
    const row = splitSemicolon(lines[i]);
    let year = 0;
    if (fileType === "empenho") {
      const value = getValue(row, header, primaryColumn);
      if (/^20\d{2}$/.test(value)) year = Number(value);
      if (!year) {
        const dateValue = getValue(row, header, fallbackColumn);
        if (/^\d{8}$/.test(dateValue)) year = Number(dateValue.slice(4, 8));
      }
    } else {
      const dateValue = getValue(row, header, primaryColumn);
      if (/^\d{8}$/.test(dateValue) && dateValue !== "00000000") {
        year = Number(dateValue.slice(4, 8));
      }
      if (!year) {
        const fallback = getValue(row, header, fallbackColumn);
        if (/^\d{8}$/.test(fallback) && fallback !== "00000000") year = Number(fallback.slice(4, 8));
      }
      if (!year) {
        const op = getValue(row, header, "OP");
        if (/^20\d{7}$/.test(op)) year = Number(op.slice(0, 4));
      }
    }
    if (year >= 2000 && year <= 2099) counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (!best) throw new Error("Não foi possível identificar o exercício nos registros do arquivo.");
  return best[0];
}

async function isAdminOrInternal(authorization: string): Promise<boolean> {
  const expectedSecret = Deno.env.get("IMPORT_FUNCTION_SECRET");
  if (expectedSecret && authorization === "Bearer " + expectedSecret) return true;

  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicAuthKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    serviceKey;
  if (!supabaseUrl || !serviceKey || !publicAuthKey) return false;

  const authClient = createClient(supabaseUrl, publicAuthKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const email = userData?.user?.email?.trim().toLowerCase();
  if (userError || !email) return false;

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("panel_users")
    .select("email,is_admin,is_active")
    .eq("email", email)
    .maybeSingle();
  if (profileError) {
    console.error("Falha ao consultar perfil administrativo:", profileError.message);
    return false;
  }
  return profile?.is_admin === true && profile?.is_active === true;
}

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
};

async function findDriveFolderId(accessToken: string, serviceAccount: string): Promise<string> {
  const configuredFolderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID")?.trim();
  if (configuredFolderId) return configuredFolderId;

  // O arquivo cadastral já utilizado pelo projeto fica na pasta que concentra os TXT do ORCOM.
  // Consultamos os pais do próprio CadConvenios.txt para evitar exigir um segundo ID manual.
  const cadFileId = Deno.env.get("GOOGLE_CAD_FILE_ID") || "1x0SlFbGrQTBBO3LjBkGweXcaRpbqKFCz";
  const metadataResponse = await fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(cadFileId) +
      "?fields=id,name,parents&supportsAllDrives=true",
    { headers: { Authorization: "Bearer " + accessToken } },
  );
  if (!metadataResponse.ok) {
    const detail = await metadataResponse.text();
    throw new Error(
      "Não foi possível identificar a pasta do CadConvenios.txt no Google Drive. " +
      "Verifique o ID cadastral e o compartilhamento da pasta com a conta de serviço. " +
      detail.slice(0, 300),
    );
  }
  const metadata = await metadataResponse.json();
  const parent = Array.isArray(metadata.parents) ? metadata.parents[0] : "";
  if (!parent) {
    throw new Error(
      "O Google Drive não retornou a pasta de origem do CadConvenios.txt. " +
      "Defina GOOGLE_DRIVE_FOLDER_ID nas variáveis da função para indicar a pasta Arquivos.",
    );
  }
  return String(parent);
}

async function listMovementFiles(folderId: string, accessToken: string): Promise<DriveFile[]> {
  const q = "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false";
  let pageToken = "";
  const files: DriveFile[] = [];
  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,modifiedTime,md5Checksum,size)",
      pageSize: "1000",
      orderBy: "name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?" + params.toString(),
      { headers: { Authorization: "Bearer " + accessToken } },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Falha ao listar os arquivos da pasta do ORCOM: " + response.status + " " + detail.slice(0, 300));
    }
    const page = await response.json();
    if (Array.isArray(page.files)) files.push(...page.files);
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

async function downloadDriveText(file: DriveFile, accessToken: string): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) +
      "?alt=media&supportsAllDrives=true",
    { headers: { Authorization: "Bearer " + accessToken } },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Falha ao baixar " + file.name + ": " + response.status + " " + detail.slice(0, 250));
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxBytes = 60 * 1024 * 1024;
  if (contentLength > maxBytes) throw new Error(file.name + " excede o limite de 60 MB.");
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error(file.name + " está vazio.");
  if (buffer.byteLength > maxBytes) throw new Error(file.name + " excede o limite de 60 MB.");
  return new TextDecoder("windows-1252").decode(buffer).replace(/^\uFEFF/, "");
}

function parseMovementFile(
  file: DriveFile,
  textContent: string,
): {
  fileType: "empenho" | "pagamento";
  exercise: number;
  finalized: boolean;
  headers: string[];
  rows: Array<{
    rowNumber: number;
    adjustmentKey: string | null;
    documentKey: string | null;
    documentNumber: string | null;
    fields: Record<string, string>;
    amount: number | null;
    categoryCode: string | null;
    sourceCode: string | null;
    transactionKind: string | null;
    dateValue: string | null;
    isValidPayment: boolean;
  }>;
} {
  const match = file.name.match(/^TXT_(EMPENHO|PAGAMENTO)(?:-(20\d{2}))?\.txt$/i);
  if (!match) throw new Error("Nome de arquivo fora do padrão permitido.");
  const fileType = match[1].toUpperCase() === "EMPENHO" ? "empenho" : "pagamento";
  const finalized = Boolean(match[2]);
  const explicitYear = match[2] ? Number(match[2]) : null;
  const lines = textContent.split(/\r?\n/);
  const headerLine = lines.find((line) => line.trim() !== "");
  if (!headerLine) throw new Error(file.name + " não contém cabeçalho.");
  const headerIndex = lines.indexOf(headerLine);
  const headers = splitSemicolon(headerLine).map((value) => value.trim().replace(/^\uFEFF/, ""));
  if (headers.length < 5) throw new Error(file.name + " não possui um cabeçalho delimitado válido.");

  const required = fileType === "empenho"
    ? ["ANO-NE", "NUM-NE", "NUM-CF", "LETRA-CF", "CAT", "FT", "VLR"]
    : ["OP", "e/o/r", "DATA", "dt-bo", "EMPENHO", "CAT", "FT", "VALOR", "nacf", "lacf"];
  const missing = required.filter((name) => getColumnIndex(headers, name, 0) < 0);
  if (missing.length) throw new Error(file.name + " não possui as colunas obrigatórias: " + missing.join(", ") + ".");

  const dataLines = lines.slice(headerIndex + 1);
  const exercise = explicitYear ?? inferExercise(fileType, headers, [headerLine, ...dataLines]);
  const outputRows: Array<{
    rowNumber: number;
    adjustmentKey: string | null;
    documentKey: string | null;
    documentNumber: string | null;
    fields: Record<string, string>;
    amount: number | null;
    categoryCode: string | null;
    sourceCode: string | null;
    transactionKind: string | null;
    dateValue: string | null;
    isValidPayment: boolean;
  }> = [];
  let rowNumber = headerIndex + 2;

  for (const rawLine of dataLines) {
    const currentRowNumber = rowNumber++;
    if (!rawLine.trim()) continue;
    let values = splitSemicolon(rawLine);
    if (values.length < headers.length) {
      values = [...values, ...Array(headers.length - values.length).fill("")];
    }
    const get = (name: string, occurrence = 0) => getValue(values, headers, name, occurrence);
    const amountField = fileType === "empenho" ? "VLR" : "VALOR";
    const amount = parseBrazilianNumber(get(amountField));
    const categoryCode = get("CAT") || null;
    const sourceCode = get("FT") || null;
    const transactionKind = fileType === "pagamento" ? normalize(get("e/o/r")) : null;
    const fullNumber = fileType === "empenho" ? get("NUM-CF") : get("nacf");
    const adjustmentLetter = fileType === "empenho" ? get("LETRA-CF") : get("lacf", 0);
    const adjustmentKey = canonicalAdjustmentKey(fullNumber, adjustmentLetter);

    let documentKey: string | null = null;
    let documentNumber: string | null = null;
    let dateValue: string | null = null;
    let isValidPayment = false;

    if (fileType === "empenho") {
      const year = get("ANO-NE");
      const number = get("NUM-NE");
      if (year && number) {
        documentKey = year + "|" + number;
        documentNumber = number.padStart(5, "0") + "/" + year;
      }
      dateValue = parseDateDMY(get("DATA"));
    } else {
      const op = get("OP");
      if (op) {
        documentKey = op;
        documentNumber = op;
      }
      dateValue = parseDateDMY(get("dt-bo"));
      const cancel = get("CANC");
      const annulment = get("ANULACAO");
      const accountingAdjustment = normalize(get("ACERTO-ORC"));
      isValidPayment =
        (transactionKind === "O" || transactionKind === "R") &&
        amount !== null && amount > 0 &&
        dateValue !== null &&
        !cancel &&
        !annulment &&
        (!accountingAdjustment || accountingAdjustment === "N");
    }

    outputRows.push({
      rowNumber: currentRowNumber,
      adjustmentKey,
      documentKey,
      documentNumber,
      fields: toUniqueFieldObject(headers, values),
      amount,
      categoryCode,
      sourceCode,
      transactionKind,
      dateValue,
      isValidPayment,
    });
  }

  if (!outputRows.length) throw new Error(file.name + " não contém linhas de dados.");
  return { fileType, exercise, finalized, headers, rows: outputRows };
}

async function importOneFile(
  admin: ReturnType<typeof createClient>,
  file: DriveFile,
  accessToken: string,
  finalizedNamesByType: Map<string, Set<number>>,
): Promise<Record<string, unknown>> {
  const content = await downloadDriveText(file, accessToken);
  const parsed = parseMovementFile(file, content);

  if (!parsed.finalized && finalizedNamesByType.get(parsed.fileType)?.has(parsed.exercise)) {
    return {
      file_name: file.name,
      file_type: parsed.fileType,
      exercise: parsed.exercise,
      status: "skipped",
      reason: "Existe arquivo histórico definitivo com sufixo para este exercício; ele tem precedência sobre o arquivo corrente.",
      row_count: parsed.rows.length,
    };
  }

  const { data: previousImports, error: previousError } = await admin
    .from("orcom_file_imports")
    .select("id,file_name,drive_md5_checksum,drive_modified_at,file_size_bytes,is_finalized")
    .eq("file_type", parsed.fileType)
    .eq("exercise", parsed.exercise)
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(20);
  if (previousError) throw new Error("Não foi possível consultar a última importação de " + file.name + ": " + previousError.message);

  const md5 = file.md5Checksum ?? null;
  const modified = file.modifiedTime ?? null;
  const size = Number(file.size ?? 0);
  const sameImport = (previousImports ?? []).find((item: Record<string, unknown>) =>
    item.file_name === file.name &&
    item.is_finalized === parsed.finalized &&
    (
      (md5 && item.drive_md5_checksum === md5) ||
      (!md5 && item.drive_modified_at === modified && Number(item.file_size_bytes ?? 0) === size)
    )
  );
  if (sameImport) {
    return {
      file_name: file.name,
      file_type: parsed.fileType,
      exercise: parsed.exercise,
      status: "unchanged",
      reason: "O arquivo não sofreu alteração desde a última importação bem-sucedida.",
      row_count: parsed.rows.length,
    };
  }

  const { data: importRecord, error: createError } = await admin
    .from("orcom_file_imports")
    .insert({
      file_type: parsed.fileType,
      file_name: file.name,
      exercise: parsed.exercise,
      is_finalized: parsed.finalized,
      drive_file_id: file.id,
      drive_modified_at: modified,
      drive_md5_checksum: md5,
      file_size_bytes: size || new TextEncoder().encode(content).length,
      headers: parsed.headers,
      row_count: 0,
      linked_row_count: 0,
      status: "processing",
    })
    .select("id")
    .single();
  if (createError || !importRecord) {
    throw new Error("Não foi possível registrar o início da importação de " + file.name + ": " + (createError?.message ?? "sem ID retornado"));
  }
  const importId = String(importRecord.id);
  try {
    const batchSize = 1000;
    let linkedCount = 0;
    for (let start = 0; start < parsed.rows.length; start += batchSize) {
      const rows = parsed.rows.slice(start, start + batchSize);
      linkedCount += rows.filter((row) => Boolean(row.adjustmentKey)).length;
      const payload = rows.map((row) => ({
        import_id: importId,
        row_number: row.rowNumber,
        file_type: parsed.fileType,
        exercise: parsed.exercise,
        adjustment_key: row.adjustmentKey,
        document_key: row.documentKey,
        document_number: row.documentNumber,
        fields: row.fields,
        amount: row.amount,
        category_code: row.categoryCode,
        source_code: row.sourceCode,
        transaction_kind: row.transactionKind,
        date_value: row.dateValue,
        is_valid_payment: row.isValidPayment,
      }));
      const { error: insertError } = await admin.from("orcom_movement_rows").insert(payload);
      if (insertError) throw new Error("Falha ao gravar linhas de " + file.name + ": " + insertError.message);
    }

    const { error: finishError } = await admin
      .from("orcom_file_imports")
      .update({
        status: "success",
        row_count: parsed.rows.length,
        linked_row_count: linkedCount,
        finished_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", importId);
    if (finishError) throw new Error("Não foi possível concluir o registro de " + file.name + ": " + finishError.message);

    const { error: supersedeError } = await admin
      .from("orcom_file_imports")
      .update({ status: "superseded" })
      .eq("file_type", parsed.fileType)
      .eq("exercise", parsed.exercise)
      .eq("status", "success")
      .neq("id", importId);
    if (supersedeError) {
      console.warn("A nova versão de " + file.name + " foi importada, mas não foi possível marcar todas as versões anteriores como substituídas:", supersedeError.message);
    }

    return {
      file_name: file.name,
      file_type: parsed.fileType,
      exercise: parsed.exercise,
      status: "imported",
      row_count: parsed.rows.length,
      linked_row_count: linkedCount,
      finalized: parsed.finalized,
    };
  } catch (error) {
    await admin.from("orcom_file_imports")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", importId);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Método não permitido." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!(await isAdminOrInternal(authorization))) {
    return jsonResponse({ success: false, error: "Não autorizado: somente o administrador pode executar a importação." }, 401);
  }

  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceAccountJson || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({
      success: false,
      error: "Faltam segredos necessários: GOOGLE_SERVICE_ACCOUNT_JSON, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    }, 500);
  }

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.json();
  } catch {
    requestBody = {};
  }
  const requestedFileName = typeof requestBody.file_name === "string" ? requestBody.file_name.trim() : "";
  const action = String(requestBody.action ?? (requestedFileName ? "import_file" : "list"));

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const folderId = await findDriveFolderId(accessToken, serviceAccountJson);
    const listedFiles = await listMovementFiles(folderId, accessToken);
    const pattern = /^TXT_(EMPENHO|PAGAMENTO)(?:-(20\d{2}))?\.txt$/i;
    const matching = listedFiles.filter((file) => pattern.test(file.name));

    // Se houver nomes duplicados no Drive, usa o arquivo mais recentemente modificado.
    const byName = new Map<string, DriveFile>();
    for (const file of matching) {
      const previous = byName.get(file.name);
      if (!previous || String(file.modifiedTime ?? "") > String(previous.modifiedTime ?? "")) {
        byName.set(file.name, file);
      }
    }
    const files = [...byName.values()];
    if (!files.length) {
      return jsonResponse({
        success: false,
        error: "Nenhum arquivo TXT_EMPENHO/TXT_PAGAMENTO atual ou histórico foi localizado na pasta do CadConvenios.txt.",
        folder_id_found: true,
        files: [],
      }, 200);
    }

    const finalizedNamesByType = new Map<string, Set<number>>();
    for (const file of files) {
      const match = file.name.match(/^TXT_(EMPENHO|PAGAMENTO)-(20\d{2})\.txt$/i);
      if (!match) continue;
      const type = match[1].toUpperCase() === "EMPENHO" ? "empenho" : "pagamento";
      if (!finalizedNamesByType.has(type)) finalizedNamesByType.set(type, new Set<number>());
      finalizedNamesByType.get(type)!.add(Number(match[2]));
    }

    if (action === "list") {
      const ordered = files.sort((a, b) => {
        const aFinal = /^TXT_(EMPENHO|PAGAMENTO)-20\d{2}\.txt$/i.test(a.name) ? 1 : 0;
        const bFinal = /^TXT_(EMPENHO|PAGAMENTO)-20\d{2}\.txt$/i.test(b.name) ? 1 : 0;
        return bFinal - aFinal || a.name.localeCompare(b.name, "pt-BR");
      });
      return jsonResponse({
        success: true,
        folder_id_found: true,
        files_found: ordered.length,
        files: ordered.map((file) => ({
          name: file.name,
          modified_time: file.modifiedTime ?? null,
          md5_checksum: file.md5Checksum ?? null,
          size_bytes: Number(file.size ?? 0),
        })),
        message: "Lista de arquivos ORCOM localizada. Solicite a importação de cada arquivo individualmente.",
      }, 200);
    }

    if (action !== "import_file" || !requestedFileName) {
      return jsonResponse({
        success: false,
        error: "Informe action='list' ou action='import_file' com o campo file_name.",
      }, 400);
    }

    const target = files.find((file) => file.name === requestedFileName);
    if (!target || !pattern.test(target.name)) {
      return jsonResponse({
        success: false,
        error: "O arquivo solicitado não existe na pasta autorizada ou não segue o padrão TXT_EMPENHO/TXT_PAGAMENTO.",
        file_name: requestedFileName,
      }, 404);
    }

    try {
      const result = await importOneFile(admin, target, accessToken, finalizedNamesByType);
      const failed = result.status === "failed";
      return jsonResponse({
        success: !failed,
        file: result,
        message: failed
          ? "A importação do arquivo falhou; a última versão válida foi preservada."
          : "Arquivo verificado. A importação nova foi concluída ou o arquivo permaneceu inalterado conforme sua versão anterior.",
      }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Falha ao importar " + requestedFileName + ":", message);
      return jsonResponse({
        success: false,
        file_name: requestedFileName,
        error: message,
      }, 200);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Falha na importação dos movimentos ORCOM:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
