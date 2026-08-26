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
  OneOffFact,
  buildOneOffRpcArgs,
  shouldMaterializeOneOff,
} from "@/lib/financeOneOff";

import {
  SafeStatementStatusMap,
  buildSafeStatementStatusMap,
} from "@/lib/financeSafeStatement";
import {
  FINANCE_ITEM_METADATA_COLUMNS,
  FINANCE_OCCURRENCE_METADATA_COLUMNS,
  FinanceSecureReadError,
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
  /**
   * Estado SEGURO das faturas reais da competência (existência, vencimento e
   * pagamento). Sem isso, um componente do cartão cairia em "aguardando dados
   * da fatura" mesmo com a fatura do mês já paga.
   */
  const [statementStatuses, setStatementStatuses] = useState<SafeStatementStatusMap>(new Map());
  const [loading, setLoading] = useState(true);
  /** Pós-cutover: falha na leitura segura não pode virar total zerado. */
  const [loadError, setLoadError] = useState<string | null>(null);

  const normalized = normalizeCompetence(competence);

  const fetchAll = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);

    const monthISO = competenceToISO(normalized);
    try {
      const [itemsRes, occRes, cardsRes, statementRes, itemValues, occValues] = await Promise.all([
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
        supabase.rpc("list_finance_safe_card_statement_status", {
          _tenant_id: agencyId,
          _competence_month: monthISO,
        } as any),
        fetchSecureItemValues(agencyId),
        fetchSecureOccurrenceValues(agencyId, monthISO, monthISO),
      ]);

      if (itemsRes.error || occRes.error) {
        const message = itemsRes.error
          ? "Erro ao carregar assinaturas e ferramentas"
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
      setCards(((cardsRes.data as any[]) ?? []) as SafeCard[]);
      setStatementStatuses(buildSafeStatementStatusMap((statementRes.data as any[]) ?? []));
      setLoadError(null);

    } catch (err) {
      const message =
        err instanceof FinanceSecureReadError
          ? "Não foi possível carregar os valores financeiros com segurança. Tente novamente."
          : "Não foi possível carregar assinaturas e ferramentas. Tente novamente.";
      toast.error(message);
      setItems([]);
      setOccurrences([]);
      setStatementStatuses(new Map());
      setLoadError(message);

    } finally {
      setLoading(false);
    }
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

  /**
   * Corte operacional: antes de agosto/2026 não existe mês do novo mecanismo —
   * o legado fica preservado no banco, mas nunca é projetado como fato atual.
   */
  const tracked = isTrackedCompetence(normalized);

  const rows = useMemo(
    () =>
      tracked
        ? buildMonthRows({ items, occurrences, competence: normalized, fallbackRate: null })
        : [],
    [items, occurrences, normalized.year, normalized.month, tracked],
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

  /**
   * Cria/atualiza cadastro. Ferramenta comprada UMA VEZ (`tool + one_off`) é um
   * fato do mês: cadastro + ocorrência nascem na MESMA transação Postgres via
   * `create_finance_one_off` (que revalida o escopo `tools`: só tool/pacote e
   * nunca centro administrativo). Falha => rollback integral no banco.
   */
  const saveItem = useCallback(
    async (payload: Partial<FinanceItem>, id?: string, oneOff?: OneOffFact | null) => {
      if (!agencyId) return false;
      const body: any = { ...payload, tenant_id: agencyId };

      if (!id && oneOff && shouldMaterializeOneOff(payload)) {
        const { error } = await supabase.rpc(
          "create_finance_one_off",
          buildOneOffRpcArgs({ tenantId: agencyId, payload, fact: oneOff }) as any,
        );
        if (error) {
          toast.error("Não foi possível criar o lançamento — nada foi salvo");
          return false;
        }
        toast.success("Lançamento criado");
        await fetchAll();
        return true;
      }


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
    loadError,
    items,
    occurrences,
    rows,
    cards,
    statementStatuses,

    packages,
    overlaps,
    refresh: fetchAll,
    saveOccurrence,
    togglePaid,
    saveItem,
    setItemActive,
  };
}
