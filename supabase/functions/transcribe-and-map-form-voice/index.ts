// Edge Function: transcribe-and-map-form-voice
// Auth: verify_jwt = true (configured in supabase/config.toml)
// Recebe áudio + contexto, transcreve via Lovable AI, mapeia campos via chat.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const CHAT_MODEL = "google/gemini-2.5-flash";
const TRANSCRIBE_MODEL = "openai/gpt-4o-transcribe";

// ============ WHITELIST DE CAMPOS ============

const ANAMNESIS_INDEXED = Array.from({ length: 27 }, (_, i) => `question_${i}`);
const ANAMNESIS_GUIDELINES = [
  "tone_of_voice",
  "content_pillars",
  "preferred_ctas",
  "forbidden_words",
  "active_channels",
  "offer_and_ticket",
  "main_competitors",
];
const ANAMNESIS_ALLOWED = new Set([...ANAMNESIS_INDEXED, ...ANAMNESIS_GUIDELINES]);

const PERIOD_ALLOWED = new Set([
  "periodTitle",
  "periodStart",
  "periodEnd",
  "selectedChannels",
  "objetivosSelecionados",
  "objetivoOutro",
  "metaNumerica",
  "porqueObjetivo",
  "produtoFoco",
  "temPromocao",
  "promocaoDescricao",
  "comoComprar",
  "temDataComemorativa",
  "dataComemorativaDescricao",
  "temNovidade",
  "novidadeDescricao",
  "disponibilidadeVideo",
  "temMateriaisNovos",
  "materiaisNovosDescricao",
  "quantidadeConteudos",
  "observations",
]);

function allowedFor(formType: string): Set<string> {
  return formType === "anamnesis" ? ANAMNESIS_ALLOWED : PERIOD_ALLOWED;
}

// ============ HELPERS ============

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function transcribeAudio(file: File): Promise<string> {
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", file, file.name || "audio.wav");
  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: form,
    }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Transcrição falhou (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return String(data.text || "").trim();
}

async function mapWithAI(
  formType: string,
  fields: any[],
  currentValues: Record<string, unknown>,
  transcript: string
): Promise<any> {
  const systemPrompt = `Você recebe a transcrição de uma fala de usuário preenchendo um formulário do tipo "${formType}".

Sua tarefa: mapear trechos da fala para os campos mais adequados da lista fornecida.

REGRAS ABSOLUTAS:
- Não invente dados. Só preencha campo com base no que foi realmente falado.
- Pode dividir uma frase entre vários campos, se fizer sentido.
- Se um trecho não se encaixa com segurança, coloque em unmappedText.
- Só use campos que estão na lista "Campos disponíveis".
- Respeite o tipo de cada campo:
  - "text"/"longtext": string
  - "number": número
  - "boolean_sim_nao": "sim" ou "nao"
  - "enum_disponibilidade_video": exatamente "sim", "nao" ou "parcial" (use "parcial" para "talvez", "pouca disponibilidade", "depende")
  - "date": string YYYY-MM-DD
  - "string_array": array de strings; se options for informado, use apenas valores dessa lista

Retorne APENAS JSON válido no formato:
{
  "mappedFields": {
    "<field_key>": {
      "value": <valor no tipo correto>,
      "sourceText": "<trecho da transcrição>",
      "confidence": "alta" | "media" | "baixa"
    }
  },
  "unmappedText": ["<trecho1>", "<trecho2>"]
}`;

  const userPrompt = `Campos disponíveis:
${JSON.stringify(fields, null, 2)}

Valores atuais do formulário (para contexto — não repita se já preenchido igual):
${JSON.stringify(currentValues, null, 2)}

Transcrição:
"""
${transcript}
"""`;

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Mapeamento falhou (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("JSON inválido retornado pela IA");
  }
}

function sanitizeMapped(
  raw: any,
  allowed: Set<string>,
  fieldTypes: Map<string, string>
): { mappedFields: Record<string, any>; unmappedText: string[] } {
  const out: Record<string, any> = {};
  const mapped = raw?.mappedFields;
  if (mapped && typeof mapped === "object") {
    for (const [key, val] of Object.entries(mapped)) {
      if (!allowed.has(key)) continue;
      if (!val || typeof val !== "object") continue;
      const v = (val as any).value;
      if (v === null || v === undefined || v === "") continue;
      const type = fieldTypes.get(key);
      // Validação leve de tipos
      if (type === "boolean_sim_nao") {
        const s = String(v).toLowerCase();
        if (!["sim", "nao"].includes(s) && typeof v !== "boolean") continue;
      }
      if (type === "enum_disponibilidade_video") {
        const s = String(v).toLowerCase();
        if (!["sim", "nao", "parcial"].includes(s)) continue;
      }
      if (type === "number" && !Number.isFinite(Number(v))) continue;
      if (type === "string_array" && !Array.isArray(v) && typeof v !== "string")
        continue;
      const conf = (val as any).confidence;
      out[key] = {
        value: v,
        sourceText: typeof (val as any).sourceText === "string"
          ? (val as any).sourceText
          : "",
        confidence: ["alta", "media", "baixa"].includes(conf) ? conf : "media",
      };
    }
  }
  const unmapped = Array.isArray(raw?.unmappedText)
    ? raw.unmappedText.filter((s: unknown) => typeof s === "string").slice(0, 20)
    : [];
  return { mappedFields: out, unmappedText: unmapped };
}

// ============ HANDLER ============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Auth client
  const supaAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supaAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  // Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Corpo inválido (esperado multipart/form-data)" }, 400);
  }

  const audio = formData.get("audio");
  const formType = String(formData.get("formType") || "");
  const tenantId = String(formData.get("tenantId") || "");
  const clientId = String(formData.get("clientId") || "");
  const fieldsRaw = String(formData.get("fields") || "[]");
  const currentValuesRaw = String(formData.get("currentFormValues") || "{}");

  if (!(audio instanceof File)) return jsonResponse({ error: "Áudio ausente" }, 400);
  if (!["anamnesis", "period_planning"].includes(formType)) {
    return jsonResponse({ error: "formType inválido" }, 400);
  }
  if (!tenantId || !clientId) {
    return jsonResponse({ error: "tenantId/clientId obrigatórios" }, 400);
  }
  if (audio.size < 2048) {
    return jsonResponse({ error: "Áudio muito curto" }, 400);
  }
  if (audio.size > 25 * 1024 * 1024) {
    return jsonResponse({ error: "Áudio muito grande" }, 413);
  }

  // Autorização de tenant/client via service role
  const supaAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: tenantOk, error: tenantErr } = await supaAdmin.rpc(
    "user_has_tenant_access",
    { _user_id: userId, _tenant_id: tenantId }
  );
  if (tenantErr || !tenantOk) {
    return jsonResponse({ error: "Sem acesso ao tenant" }, 403);
  }
  const { data: client, error: clientErr } = await supaAdmin
    .from("tenant_companies")
    .select("id, tenant_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr || !client || client.tenant_id !== tenantId) {
    return jsonResponse({ error: "Cliente não pertence ao tenant" }, 403);
  }

  // Parse contexto
  let fields: any[] = [];
  let currentValues: Record<string, unknown> = {};
  try {
    fields = JSON.parse(fieldsRaw);
    currentValues = JSON.parse(currentValuesRaw);
  } catch {
    return jsonResponse({ error: "fields/currentFormValues inválidos" }, 400);
  }
  const allowed = allowedFor(formType);
  const filteredFields = (Array.isArray(fields) ? fields : []).filter(
    (f) => f && typeof f.key === "string" && allowed.has(f.key)
  );
  const fieldTypes = new Map<string, string>(
    filteredFields.map((f) => [f.key, String(f.type || "text")])
  );

  // Transcrição
  let transcript: string;
  try {
    transcript = await transcribeAudio(audio);
  } catch (err: any) {
    console.error("[voice] transcribe error", err?.message);
    return jsonResponse({ error: err?.message || "Falha na transcrição" }, 502);
  }
  if (!transcript) {
    return jsonResponse(
      { transcript: "", mappedFields: {}, unmappedText: [], error: "Áudio vazio" },
      200
    );
  }

  // Mapeamento
  let mappedRaw: any;
  try {
    mappedRaw = await mapWithAI(formType, filteredFields, currentValues, transcript);
  } catch (err: any) {
    console.error("[voice] map error", err?.message);
    return jsonResponse(
      { transcript, mappedFields: {}, unmappedText: [], error: err?.message },
      200
    );
  }

  const { mappedFields, unmappedText } = sanitizeMapped(mappedRaw, allowed, fieldTypes);

  return jsonResponse({ transcript, mappedFields, unmappedText });
});
