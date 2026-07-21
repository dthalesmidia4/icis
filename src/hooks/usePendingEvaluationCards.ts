import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback, useRealtimePeriodPlans } from "@/hooks/realtime";
import { EVALUATION_FUNCTION_KEY } from "@/lib/flowFunctions";

export interface PendingEvaluationCard {
  key: string;                       // stable id (periodId:source:index)
  periodId: string;
  periodTitle: string;
  clientId: string;
  clientName: string;
  source: "default" | "ultra";
  indexInPlan: number;
  card: any;                          // raw JSON payload
  title: string;
  demandType: string | null;
  channel: string | null;
  suggestedDate: string | null;
  assignedTo: string | null;          // resolved responsible id ("__unassigned__" if none)
}

interface PeriodRow {
  id: string;
  period_title: string;
  company_id: string;
  tenant_id: string;
  default_plan: any;
  ultra_plan: any;
}

/**
 * Fetch pending planning cards (JSON) para toda a tenant e resolve
 * o responsável por avaliá-los usando `collaborator_function_assignments`
 * para `function_key = 'avaliar'`. Cards já materializados como demands
 * (mesmo period_plan_id + mesmo título) são excluídos.
 */
export function usePendingEvaluationCards(tenantId: string | null) {
  const [cards, setCards] = useState<PendingEvaluationCard[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchCards = useCallback(async () => {
    if (!tenantId) {
      setCards([]);
      return;
    }
    setLoading(true);
    try {
      const [{ data: periods }, { data: assigns }, { data: existingDemands }, { data: companies }] = await Promise.all([
        supabase
          .from("period_plans")
          .select("id, period_title, company_id, tenant_id, default_plan, ultra_plan")
          .eq("tenant_id", tenantId)
          .eq("operational_status", "em_andamento"),
        supabase
          .from("collaborator_function_assignments")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("function_key", EVALUATION_FUNCTION_KEY)
          .eq("allowed", true),
        supabase
          .from("demands")
          .select("period_plan_id, title")
          .eq("tenant_id", tenantId)
          .not("period_plan_id", "is", null),
        supabase
          .from("tenant_companies")
          .select("id, name, fantasy_name")
          .eq("tenant_id", tenantId),
      ]);

      const responsibles = Array.from(new Set(((assigns as any[]) || []).map(a => a.user_id).filter(Boolean)));

      const materializedByPeriod = new Map<string, Set<string>>();
      ((existingDemands as any[]) || []).forEach((d) => {
        if (!d.period_plan_id) return;
        const set = materializedByPeriod.get(d.period_plan_id) || new Set<string>();
        set.add((d.title || "").trim());
        materializedByPeriod.set(d.period_plan_id, set);
      });

      const clientNameById = new Map<string, string>();
      ((companies as any[]) || []).forEach((c) => {
        clientNameById.set(c.id, c.fantasy_name || c.name || "Cliente");
      });

      // Simple deterministic assignment: hash of clientId into responsibles array.
      const pickAssignee = (clientId: string): string | null => {
        if (responsibles.length === 0) return null;
        if (responsibles.length === 1) return responsibles[0];
        let hash = 0;
        for (let i = 0; i < clientId.length; i++) hash = ((hash << 5) - hash + clientId.charCodeAt(i)) | 0;
        return responsibles[Math.abs(hash) % responsibles.length];
      };

      const out: PendingEvaluationCard[] = [];
      ((periods as PeriodRow[]) || []).forEach((p) => {
        const alreadyTitles = materializedByPeriod.get(p.id) || new Set<string>();
        const dp = Array.isArray(p.default_plan) ? p.default_plan : [];
        const up = Array.isArray(p.ultra_plan) ? p.ultra_plan : [];
        const clientName = clientNameById.get(p.company_id) || "Cliente";
        const assignee = pickAssignee(p.company_id);

        const push = (items: any[], source: "default" | "ultra") => {
          items.forEach((raw, i) => {
            const title = String(raw?.titulo ?? raw?.title ?? "").trim();
            if (!title) return;
            if (alreadyTitles.has(title)) return;
            out.push({
              key: `${p.id}:${source}:${i}`,
              periodId: p.id,
              periodTitle: p.period_title,
              clientId: p.company_id,
              clientName,
              source,
              indexInPlan: i,
              card: raw,
              title,
              demandType: raw?.tipo ?? raw?.tipo_conteudo ?? raw?.type ?? null,
              channel: raw?.canal ?? raw?.channel ?? null,
              suggestedDate: raw?.data_sugerida ?? raw?.suggested_date ?? raw?.date ?? null,
              assignedTo: assignee ?? "__unassigned__",
            });
          });
        };
        push(dp, "default");
        push(up, "ultra");
      });

      if (mountedRef.current) setCards(out);
    } catch (err) {
      console.error("[usePendingEvaluationCards] fetch error", err);
      if (mountedRef.current) setCards([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const debouncedRefetch = useDebouncedCallback(() => fetchCards(), 300);
  useRealtimePeriodPlans({
    tenantId,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId,
  });

  // Agrupar por usuário responsável
  const byAssignee = useMemo(() => {
    const map = new Map<string, PendingEvaluationCard[]>();
    cards.forEach((c) => {
      const key = c.assignedTo || "__unassigned__";
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    });
    return map;
  }, [cards]);

  return { cards, byAssignee, loading, refetch: fetchCards, totalCount: cards.length };
}
