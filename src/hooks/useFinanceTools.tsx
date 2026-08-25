/**
 * Dados do escopo `tools` (Assinaturas e ferramentas).
 *
 * Este hook existe para NÃO consultar nada que o escopo restrito não pode ver:
 * nenhuma leitura de orçamento do tenant, de cadastro de cartão, de limite ou
 * de fatura. Os cartões vêm da RPC `list_finance_safe_cards`, que devolve
 * apenas rótulo e ciclo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Competence, competenceToISO, normalizeCompetence } from "@/lib/financeCardCycle";
import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  buildMonthRows,
  detectPackageOverlaps,
} from "@/lib/financeModel";
import { SafeCard } from "@/lib/financeSubscriptionMonth";
import {
  FINANCE_ITEM_METADATA_COLUMNS,
  FINANCE_OCCURRENCE_METADATA_COLUMNS,
  fetchSecureItemValues,
  fetchSecureOccurrenceValues,
  mergeItemValues,
  mergeOccurrenceValues,
} from "@/lib/financeSecureData";

export function useFinanceTools(competence: Competence) {
  const { agencyId } = useAgency();
  const { user } = useAuth();
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [occurrences, setOccurrences] = useState<FinanceOccurrence[]>([]);
  const [cards, setCards] = useState<SafeCard[]>([]);
  const [loading, setLoading] = useState(true);

  const normalized = normalizeCompetence(competence);

  const fetchAll = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);

    const monthISO = competenceToISO(normalized);
    const [itemsRes, occRes, cardsRes, itemValues, occValues] = await Promise.all([
      supabase
        .from("finance_items")
        .select(FINANCE_ITEM_METADATA_COLUMNS)
        .eq("tenant_id", agencyId)
        .in("kind", ["tool", "package", "included_resource"])
        .order("name", { ascending: true }),
      supabase
        .from("finance_occurrences")
        .select(FINANCE_OCCURRENCE_METADATA_COLUMNS)
        .eq("tenant_id", agencyId)
        .eq("competence_month", monthISO),
      supabase.rpc("list_finance_safe_cards", { _tenant_id: agencyId }),
      fetchSecureItemValues(agencyId),
      fetchSecureOccurrenceValues(agencyId, monthISO, monthISO),
    ]);

    if (itemsRes.error) toast.error("Erro ao carregar assinaturas e ferramentas");
    if (occRes.error) toast.error("Erro ao carregar movimentação do mês");

    setItems(mergeItemValues(((itemsRes.data as any[]) ?? []) as FinanceItem[], itemValues));
    setOccurrences(
      mergeOccurrenceValues(((occRes.data as any[]) ?? []) as FinanceOccurrence[], occValues),
    );
    setCards(((cardsRes.data as any[]) ?? []) as SafeCard[]);
    setLoading(false);
  }, [agencyId, normalized.year, normalized.month]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`finance-tools-${agencyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_items", filter: `tenant_id=eq.${agencyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_occurrences", filter: `tenant_id=eq.${agencyId}` },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [agencyId, fetchAll]);

  const rows = useMemo(
    () => buildMonthRows({ items, occurrences, competence: normalized, fallbackRate: null }),
    [items, occurrences, normalized.year, normalized.month],
  );

  const overlaps = useMemo(() => detectPackageOverlaps(items), [items]);
  const packages = useMemo(() => items.filter((i) => i.kind === "package"), [items]);

  const saveOccurrence = useCallback(
    async (row: MonthRow, patch: Partial<FinanceOccurrence>) => {
      if (!agencyId) return null;
      if (row.occurrence) {
        const { data, error } = await supabase
          .from("finance_occurrences")
          .update(patch as any)
          .eq("id", row.occurrence.id)
          .select(FINANCE_OCCURRENCE_METADATA_COLUMNS)
          .maybeSingle();
        if (error) {
          toast.error("Não foi possível salvar o lançamento");
          return null;
        }
        await fetchAll();
        return data as any as FinanceOccurrence;
      }
      const { data, error } = await supabase
        .from("finance_occurrences")
        .insert({
          tenant_id: agencyId,
          item_id: row.item.id,
          competence_month: competenceToISO(normalized),
          charge_date: row.chargeDate,
          due_date: row.dueDate,
          currency: row.currency,
          amount_original: row.amountOriginal,
          exchange_rate: row.exchangeRate,
          amount_brl: row.amountBrl,
          created_by: user?.id ?? null,
          ...(patch as any),
        } as any)
        .select(FINANCE_OCCURRENCE_METADATA_COLUMNS)
        .maybeSingle();
      if (error) {
        toast.error("Não foi possível registrar o lançamento");
        return null;
      }
      await fetchAll();
      return data as any as FinanceOccurrence;
    },
    [agencyId, normalized, user?.id, fetchAll],
  );

  const togglePaid = useCallback(
    async (row: MonthRow, paid: boolean) => {
      const saved = await saveOccurrence(
        row,
        paid
          ? { paid_at: new Date().toISOString(), paid_amount_brl: row.amountBrl }
          : { paid_at: null, paid_amount_brl: null },
      );
      if (saved) toast.success(paid ? "Pagamento registrado" : "Pagamento desfeito");
    },
    [saveOccurrence],
  );

  const saveItem = useCallback(
    async (payload: Partial<FinanceItem>, id?: string) => {
      if (!agencyId) return false;
      const body: any = { ...payload, tenant_id: agencyId };
      const query = id
        ? supabase.from("finance_items").update(body).eq("id", id)
        : supabase.from("finance_items").insert({ ...body, created_by: user?.id ?? null });
      const { error } = await query;
      if (error) {
        toast.error(id ? "Erro ao atualizar cadastro" : "Erro ao criar cadastro");
        return false;
      }
      toast.success(id ? "Cadastro atualizado" : "Cadastro criado");
      await fetchAll();
      return true;
    },
    [agencyId, user?.id, fetchAll],
  );

  const setItemActive = useCallback(
    async (id: string, active: boolean) => {
      const { error } = await supabase.from("finance_items").update({ active }).eq("id", id);
      if (error) {
        toast.error("Erro ao alterar situação do cadastro");
        return false;
      }
      toast.success(active ? "Cadastro reativado" : "Cadastro desativado");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  return {
    loading,
    items,
    occurrences,
    rows,
    cards,
    packages,
    overlaps,
    refresh: fetchAll,
    saveOccurrence,
    togglePaid,
    saveItem,
    setItemActive,
  };
}
