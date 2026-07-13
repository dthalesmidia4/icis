// Definição canônica dos campos aceitos pelo preenchimento por voz.
// Mantenha sincronizado com supabase/functions/transcribe-and-map-form-voice/index.ts

export type VoiceFieldType =
  | "text"
  | "longtext"
  | "number"
  | "boolean_sim_nao"
  | "enum_disponibilidade_video"
  | "date"
  | "string_array";

export interface VoiceFieldDef {
  key: string;
  label: string;
  type: VoiceFieldType;
  hint?: string;
  options?: string[];
}

// ============ ANAMNESIS ============
const ANAMNESIS_INDEXED_QUESTIONS = 27;

export function getAnamnesisIndexedFields(labels: string[]): VoiceFieldDef[] {
  return labels.slice(0, ANAMNESIS_INDEXED_QUESTIONS).map((label, idx) => ({
    key: `question_${idx}`,
    label,
    type: "longtext" as const,
  }));
}

export const ANAMNESIS_GUIDELINE_FIELDS: VoiceFieldDef[] = [
  { key: "tone_of_voice", label: "Tom de voz ideal", type: "longtext" },
  { key: "content_pillars", label: "Pilares de conteúdo (3–5 temas)", type: "longtext" },
  { key: "preferred_ctas", label: "CTAs preferidos", type: "longtext" },
  { key: "forbidden_words", label: "Palavras/temas proibidos", type: "longtext" },
  { key: "active_channels", label: "Canais ativos hoje", type: "longtext" },
  { key: "offer_and_ticket", label: "Oferta principal e ticket médio", type: "longtext" },
  { key: "main_competitors", label: "Concorrentes / referências", type: "longtext" },
];

// ============ PERIOD PLANNING ============
export const CHANNEL_OPTIONS = ["instagram", "facebook", "tiktok", "youtube", "linkedin"];
export const OBJETIVO_OPTIONS = [
  "Gerar vendas",
  "Atrair leads",
  "Lançar produto",
  "Crescer seguidores",
  "Educar o mercado",
];

export const PERIOD_PLANNING_FIELDS: VoiceFieldDef[] = [
  { key: "periodTitle", label: "Título do período", type: "text" },
  { key: "periodStart", label: "Data de início (YYYY-MM-DD)", type: "date" },
  { key: "periodEnd", label: "Data de fim (YYYY-MM-DD)", type: "date" },
  {
    key: "selectedChannels",
    label: "Canais prioritários",
    type: "string_array",
    options: CHANNEL_OPTIONS,
    hint: "instagram, facebook, tiktok, youtube, linkedin",
  },
  {
    key: "objetivosSelecionados",
    label: "Objetivos do período",
    type: "string_array",
    options: OBJETIVO_OPTIONS,
  },
  { key: "objetivoOutro", label: "Outro objetivo (texto livre)", type: "text" },
  { key: "metaNumerica", label: "Meta numérica", type: "text" },
  { key: "porqueObjetivo", label: "Por que esse objetivo agora", type: "longtext" },
  { key: "produtoFoco", label: "Produto/serviço em foco", type: "longtext" },
  { key: "temPromocao", label: "Tem promoção? (sim/nao)", type: "boolean_sim_nao" },
  { key: "promocaoDescricao", label: "Descrição da promoção", type: "longtext" },
  { key: "comoComprar", label: "Como o cliente compra/contrata", type: "longtext" },
  { key: "temDataComemorativa", label: "Tem data comemorativa? (sim/nao)", type: "boolean_sim_nao" },
  { key: "dataComemorativaDescricao", label: "Descrição da data comemorativa", type: "longtext" },
  { key: "temNovidade", label: "Tem novidade/lançamento? (sim/nao)", type: "boolean_sim_nao" },
  { key: "novidadeDescricao", label: "Descrição da novidade", type: "longtext" },
  {
    key: "disponibilidadeVideo",
    label: "Disponibilidade para gravar vídeo",
    type: "enum_disponibilidade_video",
    hint: "sim | nao | parcial",
  },
  { key: "temMateriaisNovos", label: "Tem materiais novos? (sim/nao)", type: "boolean_sim_nao" },
  { key: "materiaisNovosDescricao", label: "Descrição dos materiais novos", type: "longtext" },
  { key: "quantidadeConteudos", label: "Quantidade de conteúdos (1–50)", type: "number" },
  { key: "observations", label: "Observações gerais", type: "longtext" },
];

// ============ Normalizadores ============

export function normalizeBooleanSimNao(v: unknown): "sim" | "nao" | null {
  if (typeof v === "boolean") return v ? "sim" : "nao";
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (["sim", "yes", "true", "1", "com certeza"].includes(s)) return "sim";
  if (["nao", "não", "no", "false", "0"].includes(s)) return "nao";
  return null;
}

export function normalizeDisponibilidadeVideo(
  v: unknown
): "sim" | "nao" | "parcial" | null {
  if (typeof v === "boolean") return v ? "sim" : "nao";
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (["sim", "yes", "true", "com certeza"].includes(s)) return "sim";
  if (["nao", "não", "no", "false", "impossivel", "impossível"].includes(s)) return "nao";
  if (
    [
      "parcial",
      "parcialmente",
      "talvez",
      "as vezes",
      "às vezes",
      "pouca",
      "pouco",
      "depende",
      "maybe",
      "partial",
    ].includes(s)
  )
    return "parcial";
  return null;
}

export function normalizeDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeStringArray(v: unknown, options?: string[]): string[] {
  const arr = Array.isArray(v)
    ? v
    : typeof v === "string"
    ? v.split(/[,;/]/)
    : [];
  const cleaned = arr.map((s) => String(s).trim()).filter(Boolean);
  if (!options) return cleaned;
  const lowerOptions = options.map((o) => o.toLowerCase());
  const out: string[] = [];
  for (const c of cleaned) {
    const idx = lowerOptions.indexOf(c.toLowerCase());
    if (idx >= 0 && !out.includes(options[idx])) out.push(options[idx]);
  }
  return out;
}

export function normalizeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
