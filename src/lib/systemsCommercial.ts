import { supabase } from "@/integrations/supabase/client";
import { hasMigrationAvailable, isFinalStage, type SystemsClient } from "@/lib/systemsClients";

/** Classificação operacional da próxima ação. */
export type NextActionBucket = "atrasado" | "hoje" | "futuro" | "sem_acao" | "final";

export interface LastTouch {
  type: string;
  occurredAt: string;
}

export interface OpportunityRow {
  client: SystemsClient;
  lastTouch: LastTouch | null;
  bucket: NextActionBucket;
}

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Classifica uma oportunidade pela próxima ação.
 * Etapas finais (ganho/perdido/pausado) nunca entram na fila operacional.
 */
export function classifyNextAction(
  client: Pick<SystemsClient, "next_action_at" | "commercial_stage">,
  now: Date = new Date(),
): NextActionBucket {
  if (isFinalStage(client.commercial_stage)) return "final";
  if (!client.next_action_at) return "sem_acao";
  const when = new Date(client.next_action_at);
  if (Number.isNaN(when.getTime())) return "sem_acao";
  if (when.getTime() < now.getTime()) {
    // Vencida hoje mais cedo ainda conta como atrasada.
    return "atrasado";
  }
  const dayStart = startOfDay(now).getTime();
  const dayEnd = dayStart + 86_400_000;
  if (when.getTime() < dayEnd) return "hoje";
  return "futuro";
}

const BUCKET_ORDER: Record<NextActionBucket, number> = {
  atrasado: 0,
  hoje: 1,
  futuro: 2,
  sem_acao: 3,
  final: 4,
};

/**
 * Ordenação operacional: atrasados mais antigos → hoje pela hora → futuras →
 * sem próxima ação → etapas finais. Empates resolvem por nome.
 */
export function sortOpportunities<T extends { client: SystemsClient; bucket: NextActionBucket }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ba = BUCKET_ORDER[a.bucket];
    const bb = BUCKET_ORDER[b.bucket];
    if (ba !== bb) return ba - bb;
    const ta = a.client.next_action_at ? new Date(a.client.next_action_at).getTime() : 0;
    const tb = b.client.next_action_at ? new Date(b.client.next_action_at).getTime() : 0;
    if (ta !== tb && ta && tb) return ta - tb;
    return a.client.name.localeCompare(b.client.name, "pt-BR");
  });
}

export interface QuickCounters {
  hoje: number;
  atrasados: number;
  semAcao: number;
  simplesvet: number;
  avaliacao: number;
  negociacao: number;
}

export function countQuickFilters(rows: OpportunityRow[]): QuickCounters {
  const counters: QuickCounters = {
    hoje: 0,
    atrasados: 0,
    semAcao: 0,
    simplesvet: 0,
    avaliacao: 0,
    negociacao: 0,
  };
  rows.forEach(({ client, bucket }) => {
    if (bucket === "hoje") counters.hoje += 1;
    if (bucket === "atrasado") counters.atrasados += 1;
    if (bucket === "sem_acao") counters.semAcao += 1;
    if (hasMigrationAvailable(client.current_system)) counters.simplesvet += 1;
    if (client.commercial_stage === "avaliacao") counters.avaliacao += 1;
    if (client.commercial_stage === "negociacao") counters.negociacao += 1;
  });
  return counters;
}

/**
 * Último touchpoint por subcliente, em UMA query (sem N+1).
 * Os registros vêm ordenados desc, então a primeira ocorrência já é a mais recente.
 */
export async function loadLastTouchBySubclient(
  tenantId: string,
  subclientIds: string[],
): Promise<Map<string, LastTouch>> {
  const map = new Map<string, LastTouch>();
  if (subclientIds.length === 0) return map;
  const { data, error } = await supabase
    .from("client_touchpoints")
    .select("subclient_id, touchpoint_type, occurred_at")
    .eq("tenant_id", tenantId)
    .in("subclient_id", subclientIds)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  (data || []).forEach((t: any) => {
    if (!t.subclient_id || map.has(t.subclient_id)) return;
    map.set(t.subclient_id, { type: t.touchpoint_type, occurredAt: t.occurred_at });
  });
  return map;
}

/** Monta as linhas da tela comercial já classificadas e ordenadas. */
export function buildOpportunityRows(
  prospects: SystemsClient[],
  lastTouches: Map<string, LastTouch>,
  now: Date = new Date(),
): OpportunityRow[] {
  const rows = prospects.map((client) => ({
    client,
    lastTouch: lastTouches.get(client.id) ?? null,
    bucket: classifyNextAction(client, now),
  }));
  return sortOpportunities(rows);
}
