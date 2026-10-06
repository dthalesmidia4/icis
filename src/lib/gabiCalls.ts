import { supabase } from "@/integrations/supabase/client";

/** Tradução defensiva de mensagens antigas/inglesas da chamada da Gabi. */
const KNOWN: Array<[RegExp, string]> = [
  [/already an active commercial voice call/i, "Já existe uma chamada da Gabi em andamento para este prospect. Aguarde a finalização antes de tentar novamente."],
  [/ELEVENLABS_API_KEY not configured/i, "Integração com a ElevenLabs não configurada."],
  [/valid Brazilian phone/i, "O prospect não possui um telefone brasileiro válido."],
  [/ElevenLabs rejected/i, "A ElevenLabs recusou o início da chamada."],
  [/Failed to reach ElevenLabs/i, "Não foi possível conectar à ElevenLabs."],
];

export const GABI_CALL_FALLBACK = "Não foi possível iniciar a chamada.";

export function translateGabiCallError(message: string | null | undefined): string {
  const text = (message ?? "").trim();
  if (!text) return GABI_CALL_FALLBACK;
  for (const [re, pt] of KNOWN) if (re.test(text)) return pt;
  // Texto técnico em inglês não traduzido nunca chega ao usuário.
  const looksEnglish = /\b(the|is|not|failed|error|call|for|this|already|invalid|unauthorized|non-2xx)\b/i.test(text)
    && !/[ãõçáéíóúâêô]/i.test(text);
  return looksEnglish ? GABI_CALL_FALLBACK : text;
}

export interface GabiCallSummary {
  status: string;
  voicemail_detected: boolean | null;
  duration_seconds: number | null;
  conversation_summary: string | null;
  created_at: string;
}

export function gabiCallStatusLabel(call: Pick<GabiCallSummary, "status" | "voicemail_detected">): string {
  switch (call.status) {
    case "initiating":
    case "initiated":
    case "in_progress":
      return "Em andamento";
    case "completed":
      return call.voicemail_detected ? "Caixa postal / sem resposta humana" : "Concluída";
    case "busy":
      return "Ocupado";
    case "no_answer":
      return "Sem resposta";
    case "failed":
    case "initiation_failed":
      return "Falhou";
    case "canceled":
      return "Cancelada";
    default:
      return "Status desconhecido";
  }
}

export function formatCallDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}min ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/** Leitura única do registro mais recente (sem polling). */
export async function loadLastGabiCall(clientId: string): Promise<GabiCallSummary | null> {
  const { data, error } = await supabase
    .from("commercial_voice_calls")
    .select("status, voicemail_detected, duration_seconds, conversation_summary, created_at")
    .eq("system_client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as GabiCallSummary | null) ?? null;
}
