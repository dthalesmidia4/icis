/**
 * Configuração de retorno automático dos cards em "Aguardando cliente".
 *
 * A rotina de cron (`return-awaiting-client-cards`) usa os mesmos padrões:
 * sem config salva, considera 10:00 e 24h de espera.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ClientReturnConfig {
  wait_hours: number;
  return_times: string[];
  max_resends: number | null;
  timezone: string;
}

export const DEFAULT_CLIENT_RETURN: ClientReturnConfig = {
  wait_hours: 24,
  return_times: ["10:00"],
  max_resends: null,
  timezone: "America/Sao_Paulo",
};

export type WorkArea = "midia" | "sistemas";

const isValidTime = (t: unknown) => /^\d{1,2}:\d{2}$/.test(String(t || "").trim());

export function normalizeClientReturn(raw: any): ClientReturnConfig {
  const times = Array.isArray(raw?.return_times) ? raw.return_times.filter(isValidTime) : [];
  return {
    wait_hours: Math.max(1, Number(raw?.wait_hours) || DEFAULT_CLIENT_RETURN.wait_hours),
    return_times: times.length > 0 ? times : [...DEFAULT_CLIENT_RETURN.return_times],
    max_resends: raw?.max_resends == null ? null : Number(raw.max_resends),
    timezone: raw?.timezone || DEFAULT_CLIENT_RETURN.timezone,
  };
}

/** Carrega a config de retorno por área, aplicando os padrões quando ausente. */
export async function loadClientReturnConfigs(
  tenantId: string,
): Promise<Record<WorkArea, ClientReturnConfig>> {
  const out: Record<WorkArea, ClientReturnConfig> = {
    midia: { ...DEFAULT_CLIENT_RETURN },
    sistemas: { ...DEFAULT_CLIENT_RETURN },
  };
  const { data } = await supabase
    .from("flow_functions")
    .select("work_area, config")
    .eq("tenant_id", tenantId)
    .eq("function_key", "aguardando_cliente");
  ((data as any[]) || []).forEach((row) => {
    const area: WorkArea = row.work_area === "sistemas" ? "sistemas" : "midia";
    out[area] = normalizeClientReturn(row?.config?.client_return);
  });
  return out;
}

/**
 * Garante que a config exibida na tela realmente exista no banco.
 * Antes disso, a UI mostrava "10:00" apenas como estado local e a rotina de
 * cron ignorava o tenant por não achar `client_return`.
 */
export async function ensureClientReturnPersisted(
  tenantId: string,
  area: WorkArea,
  cfg: ClientReturnConfig,
): Promise<boolean> {
  const { data } = await supabase
    .from("flow_functions")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("work_area", area)
    .eq("function_key", "aguardando_cliente")
    .maybeSingle();
  const currentConfig = (data as any)?.config || {};
  const existing = currentConfig?.client_return;
  const hasTimes = Array.isArray(existing?.return_times) && existing.return_times.filter(isValidTime).length > 0;
  if (hasTimes) return false;
  const { error } = await supabase
    .from("flow_functions")
    .update({ config: { ...currentConfig, client_return: cfg } })
    .eq("tenant_id", tenantId)
    .eq("work_area", area)
    .eq("function_key", "aguardando_cliente");
  if (error) {
    console.error("[clientReturn] persist defaults", error);
    return false;
  }
  return true;
}

const parseHM = (t: string): { h: number; m: number } | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
};

export interface NextReturnInfo {
  /** Ex.: "hoje 10:00", "amanhã 10:00", "12/05 15:00". */
  label: string | null;
  /** Limite de reenvios atingido: não volta mais sozinho. */
  limitReached: boolean;
}

/** Próximo horário em que a rotina devolverá o card ao fluxo. */
export function describeNextReturn(
  since: string | null | undefined,
  resendCount: number | null | undefined,
  cfg: ClientReturnConfig,
): NextReturnInfo {
  if (cfg.max_resends != null && (Number(resendCount) || 0) >= cfg.max_resends) {
    return { label: null, limitReached: true };
  }
  if (!since || cfg.return_times.length === 0) return { label: null, limitReached: false };
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return { label: null, limitReached: false };

  const eligibleFrom = start + cfg.wait_hours * 3600 * 1000;
  const floor = Math.max(eligibleFrom, Date.now() - 30 * 60 * 1000);

  const base = new Date();
  for (let day = 0; day <= 14; day++) {
    for (const t of [...cfg.return_times].sort()) {
      const hm = parseHM(t);
      if (!hm) continue;
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + day, hm.h, hm.m, 0, 0);
      if (d.getTime() >= floor) {
        const todayKey = new Date().toDateString();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const hhmm = `${String(hm.h).padStart(2, "0")}:${String(hm.m).padStart(2, "0")}`;
        const prefix =
          d.toDateString() === todayKey
            ? "hoje"
            : d.toDateString() === tomorrow.toDateString()
              ? "amanhã"
              : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return { label: `${prefix} ${hhmm}`, limitReached: false };
      }
    }
  }
  return { label: null, limitReached: false };
}
