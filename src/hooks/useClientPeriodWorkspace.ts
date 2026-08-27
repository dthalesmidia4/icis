import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPeriodForClient, type CurrentPeriodInfo } from "@/lib/periodCounts";


export interface WorkspacePlanItem {
  titulo: string;
  tipo: string | null;
  canal: string | null;
  objetivo: string | null;
  conteudo: string | null;
  instrucoes: string | null;
  cta: string | null;
  data: string | null;
  typeKey: string | null;
  source: "normal" | "ultra";
}

/** Attachment enxuto consumido pela prévia do feed (nunca `rejected_attachments`). */
export interface WorkspaceAttachment {
  url: string;
  name?: string | null;
  type?: string | null;
  storagePath?: string | null;
}

export interface WorkspaceDemand {
  id: string;
  title: string;
  demand_type: string | null;
  demand_type_key: string | null;
  publish_date: string | null;
  publish_time: string | null;
  due_date: string | null;
  delivery_date: string | null;
  current_function_key: string | null;
  status_id: string | null;
  assigned_to: string | null;
  archived_at: string | null;
  released_at: string | null;
  classifications: string[] | null;
  ad_plan: Record<string, any> | null;
  channel: string | null;
  post_caption: string | null;
  attachments: WorkspaceAttachment[] | null;
  /** Fallback visual do Feed Simulado — nunca fonte canônica de publicação. */
  reference_attachments: WorkspaceAttachment[] | null;
}

const normalizePlanItem = (raw: any, source: "normal" | "ultra"): WorkspacePlanItem => ({
  titulo: String(raw?.titulo ?? raw?.title ?? "").trim(),
  tipo: raw?.tipo ?? raw?.type ?? null,
  canal: raw?.canal ?? null,
  objetivo: raw?.objetivo ?? null,
  conteudo: raw?.conteudo ?? null,
  instrucoes: raw?.instrucoes_de_producao ?? null,
  cta: raw?.cta_recomendado ?? null,
  data: raw?.data_sugerida ?? raw?.data ?? null,
  typeKey: raw?.type_key ?? null,
  source,
});

export interface ClientPeriodWorkspace {
  loading: boolean;
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  statusNames: Record<string, { name: string; isFinal: boolean }>;
  stageNames: Record<string, string>;
  memberNames: Record<string, string>;
  strategyText: string | null;
  reload: () => void;
}

/**
 * Carrega tudo que o Hub do Cliente precisa para exibir o período em andamento:
 * plano do período, demandas geradas, rótulos de etapa/status e responsáveis.
 */
export function useClientPeriodWorkspace(params: {
  tenantId: string | null | undefined;
  clientId: string | null | undefined;
  refreshKey?: number;
  /** `false` = aba que não usa período/plano/demandas: NENHUMA consulta. */
  enabled?: boolean;
}): ClientPeriodWorkspace {
  const { tenantId, clientId, refreshKey = 0, enabled = true } = params;
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<CurrentPeriodInfo | null>(null);
  const [planItems, setPlanItems] = useState<WorkspacePlanItem[]>([]);
  const [demands, setDemands] = useState<WorkspaceDemand[]>([]);
  const [statusNames, setStatusNames] = useState<Record<string, { name: string; isFinal: boolean }>>({});
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [strategyText, setStrategyText] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);

  const reload = useCallback(() => setLocalKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled || !tenantId || !clientId) {
      setLoading(false);
      setPeriod(null);
      setPlanItems([]);
      setDemands([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const started = import.meta.env.DEV ? performance.now() : 0;

    (async () => {
      try {
        const current = await getCurrentPeriodForClient({ tenantId, clientId });
        if (cancelled) return;
        setPeriod(current);

        let snapshotItems: WorkspacePlanItem[] = [];
        if (current) {
          // `final_plan` já vem do período atual — nunca reconsultar `period_plans`.
          const finalPlan = Array.isArray(current.final_plan) ? current.final_plan : null;
          const items: WorkspacePlanItem[] = finalPlan
            ? finalPlan.map((i: any) => normalizePlanItem(i, "normal"))
            : [
                ...current.default_plan.map((i: any) => normalizePlanItem(i, "normal")),
                ...current.ultra_plan.map((i: any) => normalizePlanItem(i, "ultra")),
              ];
          snapshotItems = items.filter((i) => i.titulo);
        }



        let demandQuery = supabase
          .from("demands")
          .select(
            "id, title, demand_type, demand_type_key, publish_date, publish_time, due_date, delivery_date, current_function_key, status_id, assigned_to, archived_at, released_at, classifications, ad_plan, channel, post_caption, attachments, reference_attachments"
          )
          .eq("tenant_id", tenantId)
          .eq("client_id", clientId)
          .eq("is_draft", false);
        demandQuery = current
          ? demandQuery.eq("period_plan_id", current.id)
          : demandQuery.is("period_plan_id", null);

        const [{ data: demandRows }, { data: statusRows }, { data: stageRows }, { data: strategyRow }] =
          await Promise.all([
            demandQuery,
            supabase.from("pipeline_statuses").select("id, name, is_final"),
            supabase.from("flow_functions").select("function_key, name").eq("tenant_id", tenantId),
            supabase
              .from("strategies")
              .select("strategy_text")
              .eq("company_id", clientId)
              .eq("tenant_id", tenantId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
        if (cancelled) return;

        const list = ((demandRows as any[]) || []) as WorkspaceDemand[];
        setDemands(list);
        // O snapshot do período é devolvido COMPLETO: ele é a memória do ciclo
        // (canais, objetivos, arquitetura) e não pode ser esvaziado quando as
        // peças viram demands. O dedupe snapshot × demand pertence a cada
        // componente que combina as duas fontes para renderizar linhas
        // (CalendarTab, DemandsTab, InstagramFeedTab).
        setPlanItems(snapshotItems);

        setStatusNames(
          Object.fromEntries(
            ((statusRows as any[]) || []).map((s) => [s.id, { name: s.name, isFinal: !!s.is_final }])
          )
        );
        setStageNames(
          Object.fromEntries(((stageRows as any[]) || []).map((s) => [s.function_key, s.name]))
        );
        setStrategyText(((strategyRow as any)?.strategy_text as string | null) ?? null);

        // Essencial já está na tela: os nomes dos responsáveis chegam depois.
        if (!cancelled) setLoading(false);
        if (import.meta.env.DEV) {
          console.debug(
            `[perf] client-period-workspace ${(performance.now() - started).toFixed(1)}ms · ${list.length} demanda(s)`,
          );
        }

        const userIds = [...new Set(list.map((d) => d.assigned_to).filter(Boolean))] as string[];
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds);
          if (!cancelled) {
            setMemberNames(
              Object.fromEntries(((profiles as any[]) || []).map((p) => [p.id, p.full_name || "—"]))
            );
          }
        } else {
          setMemberNames({});
        }
      } catch (err) {
        console.error("[useClientPeriodWorkspace]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId, clientId, refreshKey, localKey]);


  return {
    loading,
    period,
    planItems,
    demands,
    statusNames,
    stageNames,
    memberNames,
    strategyText,
    reload,
  };
}
