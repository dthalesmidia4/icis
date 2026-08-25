/**
 * Dados do Financeiro: cadastro (`finance_items`) + fatos do mês
 * (`finance_occurrences`) + configurações do tenant (orçamento e câmbio).
 *
 * Meses futuros NÃO são pré-criados: a linha só é persistida quando o usuário
 * registra um fato (valor real, pagamento, comprovante).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Competence,
  competenceToISO,
  competenceFromISO,
  normalizeCompetence,
} from "@/lib/financeCardCycle";
import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  detectPackageOverlaps,
} from "@/lib/financeModel";
import {
  FINANCE_ITEM_METADATA_COLUMNS,
  FINANCE_OCCURRENCE_METADATA_COLUMNS,
  fetchSecureItemValues,
  fetchSecureOccurrenceValues,
  fetchSecureTenantValues,
  mergeItemValues,
  mergeOccurrenceValues,
} from "@/lib/financeSecureData";

export interface FinanceSettings {
  monthlyBudgetBrl: number | null;
  defaultUsdRate: number | null;
}

/** Competência do mês corrente no fuso de São Paulo. */
export function currentCompetence(): Competence {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return competenceFromISO(iso);
}

/** Data de hoje (ISO) no fuso de São Paulo. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function useFinance(competence: Competence) {
  const { agencyId } = useAgency();
  const { user } = useAuth();
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [occurrences, setOccurrences] = useState<FinanceOccurrence[]>([]);
  const [settings, setSettings] = useState<FinanceSettings>({
    monthlyBudgetBrl: null,
    defaultUsdRate: null,
  });
  const [loading, setLoading] = useState(true);
  /**
   * Pós-cutover não existe fallback plaintext: se a leitura segura falhar, a
   * tela precisa mostrar erro em vez de totais zerados.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const normalized = normalizeCompetence(competence);

  const fetchAll = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);

    // Busca o mês atual e o anterior: o mês anterior alimenta a fatura do cartão.
    const prev = normalizeCompetence({ year: normalized.year, month: normalized.month - 1 });
    const next = normalizeCompetence({ year: normalized.year, month: normalized.month + 1 });

    try {
      const [itemsRes, occRes, itemValues, occValues, tenantValues] = await Promise.all([
        supabase
          .from("finance_items")
          .select(FINANCE_ITEM_METADATA_COLUMNS)
          .eq("tenant_id", agencyId)
          .order("name", { ascending: true }),
        supabase
          .from("finance_occurrences")
          .select(FINANCE_OCCURRENCE_METADATA_COLUMNS)
          .eq("tenant_id", agencyId)
          .in("competence_month", [
            competenceToISO(prev),
            competenceToISO(normalized),
            competenceToISO(next),
          ]),
        fetchSecureItemValues(agencyId),
        fetchSecureOccurrenceValues(agencyId, competenceToISO(prev), competenceToISO(next)),
        fetchSecureTenantValues(agencyId),
      ]);

      if (itemsRes.error || occRes.error) {
        const message = itemsRes.error
          ? "Erro ao carregar cadastros financeiros"
          : "Erro ao carregar movimentação do mês";
        toast.error(message);
        setItems([]);
        setOccurrences([]);
        setLoadError(message);
        return;
      }

      setItems(mergeItemValues(((itemsRes.data as any[]) ?? []) as FinanceItem[], itemValues));
      setOccurrences(
        mergeOccurrenceValues(((occRes.data as any[]) ?? []) as FinanceOccurrence[], occValues),
      );
      setSettings({
        monthlyBudgetBrl: tenantValues.monthlyBudgetBrl,
        defaultUsdRate: tenantValues.defaultUsdRate,
      });
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof FinanceSecureReadError
          ? "Não foi possível carregar os valores financeiros com segurança. Tente novamente."
          : "Não foi possível carregar o Financeiro. Tente novamente.";
      toast.error(message);
      // Nunca deixar dados parciais no ar: zeros virariam “informação”.
      setItems([]);
      setOccurrences([]);
      setSettings({ monthlyBudgetBrl: null, defaultUsdRate: null });
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [agencyId, normalized.year, normalized.month]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);


  // Realtime: qualquer mudança de cadastro ou ocorrência reflete na hora.
  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`finance-${agencyId}`)
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
    () =>
      buildMonthRows({
        items,
        occurrences,
        competence: normalized,
        fallbackRate: settings.defaultUsdRate,
      }),
    [items, occurrences, normalized.year, normalized.month, settings.defaultUsdRate],
  );

  const statements = useMemo(
    () =>
      buildStatementGroups({
        items,
        occurrences,
        competence: normalized,
        fallbackRate: settings.defaultUsdRate,
      }),
    [items, occurrences, normalized.year, normalized.month, settings.defaultUsdRate],
  );

  const totals = useMemo(() => computeTotals(rows), [rows]);
  const overlaps = useMemo(() => detectPackageOverlaps(items), [items]);

  const cards = useMemo(() => items.filter((i) => i.kind === "card"), [items]);
  const packages = useMemo(() => items.filter((i) => i.kind === "package"), [items]);

  /* ----------------------------- Persistência ---------------------------- */

  /** Materializa (ou atualiza) a ocorrência de um item na competência. */
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

  /** Marca/desmarca pagamento de uma linha comum (não fatura). */
  const togglePaid = useCallback(
    async (row: MonthRow, paid: boolean) => {
      const patch: Partial<FinanceOccurrence> = paid
        ? { paid_at: new Date().toISOString(), paid_amount_brl: row.amountBrl }
        : { paid_at: null, paid_amount_brl: null };
      const saved = await saveOccurrence(row, patch);
      if (saved) toast.success(paid ? "Pagamento registrado" : "Pagamento desfeito");
    },
    [saveOccurrence],
  );

  /**
   * Paga a fatura do cartão: liquida a fatura e, na mesma transação do banco,
   * os componentes vinculados a ela.
   */
  const payStatement = useCallback(
    async (occurrenceId: string, paidAmountBrl: number | null) => {
      const { error } = await supabase.rpc("pay_finance_statement", {
        _occurrence_id: occurrenceId,
        ...(paidAmountBrl != null ? { _paid_amount_brl: paidAmountBrl } : {}),
      } as any);
      if (error) {
        toast.error("Não foi possível pagar a fatura");
        return false;
      }
      toast.success("Fatura paga — componentes liquidados");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  const saveSettings = useCallback(
    async (next: FinanceSettings) => {
      if (!agencyId) return false;
      const { error } = await supabase.rpc("set_finance_settings", {
        _tenant_id: agencyId,
        _monthly_budget_brl: next.monthlyBudgetBrl ?? 0,
        _default_usd_rate: next.defaultUsdRate ?? 0,
      } as any);
      if (error) {
        toast.error("Não foi possível salvar as configurações");
        return false;
      }
      setSettings(next);
      toast.success("Configurações salvas");
      await fetchAll();
      return true;
    },
    [agencyId, fetchAll],
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
    statements,
    totals,
    overlaps,
    cards,
    packages,
    settings,
    refresh: fetchAll,
    saveOccurrence,
    togglePaid,
    payStatement,
    saveSettings,
    saveItem,
    setItemActive,
  };
}
