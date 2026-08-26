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
import { isTrackedCompetence } from "@/lib/financeTrackingPeriod";

import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  buildMonthRows,
  operationalMonthRows,
  buildStatementGroups,
  computeTotals,
  detectPackageOverlaps,
  skippedEntriesInMonth,
} from "@/lib/financeModel";
import type { FinanceRecurrenceRule } from "@/lib/financeRecurrenceSchedule";
import {
  FinancePaymentBatch,
  FinancePaymentBatchEntry,
  FinancePaymentRule,
  buildBatchSettlementIndex,
} from "@/lib/financePaymentSchedule";
import { buildStatementSettlementIndex, mergeSettlementIndexes } from "@/lib/financeSettlement";
import { financeSettingsRpcPayload } from "@/lib/financeSettingsPayload";
import {
  OneOffFact,
  buildOneOffRpcArgs,
  shouldMaterializeOneOff,
} from "@/lib/financeOneOff";



import { paymentDateToTimestamp } from "@/lib/financePaymentDate";
import {
  FINANCE_ITEM_METADATA_COLUMNS,
  FINANCE_OCCURRENCE_METADATA_COLUMNS,
  FinanceSecureReadError,
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
  /** Versões da regra de recorrência (histórico por cadastro). */
  const [rules, setRules] = useState<FinanceRecurrenceRule[]>([]);
  /**
   * AGENDA DE PAGAMENTO (independente da agenda da despesa) + LOTES: um
   * pagamento pode quitar várias ocorrências sem duplicar despesa.
   */
  const [paymentRules, setPaymentRules] = useState<FinancePaymentRule[]>([]);
  const [batches, setBatches] = useState<FinancePaymentBatch[]>([]);
  const [batchEntries, setBatchEntries] = useState<FinancePaymentBatchEntry[]>([]);


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
      const [
        itemsRes,
        occRes,
        rulesRes,
        payRulesRes,
        batchesRes,
        batchEntriesRes,
        itemValues,
        occValues,
        tenantValues,
      ] = await Promise.all([
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
        // Histórico da regra: metadata não sensível, lida por RLS.
        (supabase as any)
          .from("finance_recurrence_rules")
          .select("id,tenant_id,item_id,effective_from,frequency,interval_count,weekday,day_of_month,anchor_date,note")
          .eq("tenant_id", agencyId)
          .order("effective_from", { ascending: true }),
        // Agenda de PAGAMENTO (não guarda valor: só cronograma).
        (supabase as any)
          .from("finance_payment_rules")
          .select("id,tenant_id,item_id,effective_from,mode,interval_count,weekday,day_of_month,note")
          .eq("tenant_id", agencyId)
          .order("effective_from", { ascending: true }),
        (supabase as any)
          .from("finance_payment_batches")
          .select("id,tenant_id,item_id,competence_month,scheduled_date,paid_at,note")
          .eq("tenant_id", agencyId)
          .in("competence_month", [
            competenceToISO(prev),
            competenceToISO(normalized),
            competenceToISO(next),
          ]),
        (supabase as any)
          .from("finance_payment_batch_entries")
          .select("id,tenant_id,batch_id,item_id,scheduled_date")
          .eq("tenant_id", agencyId),
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
        setRules([]);
        setPaymentRules([]);
        setBatches([]);
        setBatchEntries([]);
        setLoadError(message);
        return;
      }

      setItems(mergeItemValues(((itemsRes.data as any[]) ?? []) as FinanceItem[], itemValues));
      setOccurrences(
        mergeOccurrenceValues(((occRes.data as any[]) ?? []) as FinanceOccurrence[], occValues),
      );
      setRules(((rulesRes?.data as any[]) ?? []) as FinanceRecurrenceRule[]);
      setPaymentRules(((payRulesRes?.data as any[]) ?? []) as FinancePaymentRule[]);
      setBatches(((batchesRes?.data as any[]) ?? []) as FinancePaymentBatch[]);
      setBatchEntries(((batchEntriesRes?.data as any[]) ?? []) as FinancePaymentBatchEntry[]);
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
      setRules([]);
      setPaymentRules([]);
      setBatches([]);
      setBatchEntries([]);
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_recurrence_rules", filter: `tenant_id=eq.${agencyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_payment_rules", filter: `tenant_id=eq.${agencyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_payment_batches", filter: `tenant_id=eq.${agencyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_payment_batch_entries", filter: `tenant_id=eq.${agencyId}` },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [agencyId, fetchAll]);

  /**
   * Corte operacional (`FINANCE_TRACKING_START`): março–julho/2026 são legado
   * (`legacy_bill_id`) e não têm fato nativo. Renderizar vazio protege o
   * histórico de virar projeção, atraso ou fatura inventada.
   */
  const tracked = isTrackedCompetence(normalized);

  const rows = useMemo(
    () =>
      tracked
        ? operationalMonthRows(
            buildMonthRows({
              items,
              occurrences,
              competence: normalized,
              fallbackRate: settings.defaultUsdRate,
              rules,
            }),
          )
        : [],
    [items, occurrences, rules, normalized.year, normalized.month, settings.defaultUsdRate, tracked],
  );

  const statements = useMemo(
    () =>
      tracked
        ? buildStatementGroups({
            items,
            occurrences,
            competence: normalized,
            fallbackRate: settings.defaultUsdRate,
            rules,
          })
        : [],
    [items, occurrences, rules, normalized.year, normalized.month, settings.defaultUsdRate, tracked],
  );

  /** Exceções do mês (lançamentos ignorados) — fora de qualquer total. */
  const skipped = useMemo(
    () => (tracked ? skippedEntriesInMonth({ items, occurrences, competence: normalized }) : []),
    [items, occurrences, normalized.year, normalized.month, tracked],
  );



  /**
   * Liquidação por fatura: derivada DEPOIS dos grupos, para que KPIs, composição
   * e badges usem exatamente a mesma noção de pago.
   */
  const statementSettlement = useMemo(
    () => buildStatementSettlementIndex(statements),
    [statements],
  );

  /**
   * Liquidação por LOTE de pagamento: mesma arquitetura derivada da fatura — o
   * lote é a saída de caixa e nada é gravado ocorrência por ocorrência.
   */
  const batchSettlement = useMemo(
    () => buildBatchSettlementIndex({ rows, batches, entries: batchEntries }),
    [rows, batches, batchEntries],
  );

  const settlement = useMemo(
    () => mergeSettlementIndexes(statementSettlement, batchSettlement),
    [statementSettlement, batchSettlement],
  );

  const totals = useMemo(() => computeTotals(rows, settlement), [rows, settlement]);
  const overlaps = useMemo(() => detectPackageOverlaps(items), [items]);


  const cards = useMemo(() => items.filter((i) => i.kind === "card"), [items]);
  const packages = useMemo(() => items.filter((i) => i.kind === "package"), [items]);

  /* ----------------------------- Persistência ---------------------------- */

  /**
   * Materializa (ou atualiza) a ocorrência de um item na competência.
   *
   * IDENTIDADE: quando a linha vem de um cronograma sub-mensal, a ocorrência
   * nasce com `scheduled_date` = data agendada. Alterar a data efetiva depois
   * NUNCA reescreve essa identidade (o banco bloqueia), então a alteração
   * continua sendo "somente este lançamento" e o padrão segue intacto.
   */
  const saveOccurrence = useCallback(
    async (row: MonthRow, patch: Partial<FinanceOccurrence>) => {
      if (!agencyId) return null;
      if (row.occurrence) {
        const { scheduled_date: _ignored, ...safePatch } = patch as any;
        const { data, error } = await supabase
          .from("finance_occurrences")
          .update(safePatch as any)
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
          scheduled_date: row.scheduledDate,
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

  /**
   * IGNORA uma ocorrência do cronograma (exceção do mês).
   * Só o servidor decide se pode: pago ou liquidado por fatura paga é imutável.
   */
  const skipOccurrence = useCallback(
    async (row: MonthRow, reason?: string | null) => {
      const scheduled = row.scheduledDate ?? row.dueDate ?? row.chargeDate;
      if (!scheduled) {
        toast.error("Este lançamento não tem data agendada para ignorar");
        return false;
      }
      const { error } = await (supabase as any).rpc("finance_skip_occurrence", {
        _item_id: row.item.id,
        _scheduled_date: scheduled,
        _reason: reason ?? null,
      });
      if (error) {
        toast.error(error.message || "Não foi possível ignorar o lançamento");
        return false;
      }
      toast.success("Lançamento ignorado — a recorrência continua normalmente");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  /** Restaura uma ocorrência ignorada, preservando a trilha. */
  const restoreOccurrence = useCallback(
    async (occurrenceId: string) => {
      const { error } = await (supabase as any).rpc("finance_restore_occurrence", {
        _occurrence_id: occurrenceId,
      });
      if (error) {
        toast.error(error.message || "Não foi possível restaurar o lançamento");
        return false;
      }
      toast.success("Lançamento restaurado");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  /**
   * Altera a recorrência A PARTIR de uma data: cria uma nova versão de regra e
   * atualiza o cadastro mestre. O passado permanece explicado pela versão
   * anterior — nada é reescrito.
   */
  const setRecurrenceFuture = useCallback(
    async (input: {
      itemId: string;
      effectiveFrom: string;
      frequency: "daily" | "weekly" | "monthly";
      interval: number;
      weekday?: number | null;
      dayOfMonth?: number | null;
    }) => {
      const { error } = await (supabase as any).rpc("finance_set_recurrence_future", {
        _item_id: input.itemId,
        _effective_from: input.effectiveFrom,
        _frequency: input.frequency,
        _interval: input.interval,
        _weekday: input.weekday ?? null,
        _day_of_month: input.dayOfMonth ?? null,
        _anchor_date: input.effectiveFrom,
      });
      if (error) {
        toast.error(error.message || "Não foi possível alterar a recorrência");
        return false;
      }
      toast.success("Recorrência alterada para os próximos lançamentos");
      await fetchAll();
      return true;
    },
    [fetchAll],
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
   * Paga a FATURA do cartão.
   *
   * A fatura é a única unidade de liquidação: o banco grava `paid_at` e
   * `paid_amount_brl` APENAS na ocorrência da fatura. Os componentes não são
   * marcados um a um nem recebem `statement_occurrence_id` por efeito
   * colateral — eles passam a ser considerados liquidados pela regra DERIVADA
   * da fatura (`financeSettlement.ts`), recalculada em cada tela.
   *
   * `paidDateISO` é o FATO do pagamento (`paid_at`). `due_date` nunca é enviado
   * nem alterado aqui — o vencimento é histórico.
   */
  const payStatement = useCallback(
    async (
      occurrenceId: string,
      paidAmountBrl: number | null,
      paidDateISO?: string | null,
      /**
       * Reconciliação cambial das compras em dólar da fatura. A RPC recalcula
       * cada câmbio no servidor, materializa projeções e SÓ ENTÃO marca a
       * fatura como paga — tudo na mesma transação. Array vazio = fatura sem
       * componentes USD, mesma rota única.
       */
      usdComponents?: unknown[],
      /**
       * Repasse de IOF cobrado pelo banco junto com a fatura. Persistido no
       * PRÓPRIO acerto da fatura (cifrado), nunca como despesa cadastrada.
       */
      iofBrl?: number | null,
    ) => {
      const { error } = await supabase.rpc("pay_finance_statement_reconciled", {
        _occurrence_id: occurrenceId,
        _usd_components: usdComponents ?? [],
        _iof_brl: iofBrl != null && iofBrl > 0 ? iofBrl : 0,
        ...(paidDateISO ? { _paid_at: paymentDateToTimestamp(paidDateISO) } : {}),
        ...(paidAmountBrl != null ? { _paid_amount_brl: paidAmountBrl } : {}),
      } as any);
      if (error) {
        toast.error(error.message || "Não foi possível pagar a fatura");
        return false;
      }
      toast.success("Fatura registrada como paga — as compras dela contam como liquidadas");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  /** Ajusta apenas a classificação de IOF de uma fatura já paga. */
  const setPaidStatementIof = useCallback(
    async (occurrenceId: string, iofBrl: number) => {
      const { error } = await supabase.rpc("set_paid_finance_statement_iof", {
        _occurrence_id: occurrenceId,
        _iof_brl: iofBrl,
      } as any);
      if (error) {
        toast.error(error.message || "Não foi possível ajustar o IOF da fatura");
        return false;
      }
      toast.success(iofBrl > 0 ? "IOF da fatura atualizado" : "Classificação de IOF removida");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );




  const saveSettings = useCallback(
    async (next: FinanceSettings) => {
      if (!agencyId) return false;
      const { error } = await supabase.rpc(
        "set_finance_settings",
        financeSettingsRpcPayload(agencyId, next) as any,
      );

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

  /**
   * Grava a agenda de PAGAMENTO válida a partir de uma data. Não toca na agenda
   * da despesa: o gasto continua acontecendo quando acontece.
   */
  const savePaymentRule = useCallback(
    async (input: {
      itemId: string;
      effectiveFrom: string;
      mode: FinancePaymentRule["mode"];
      interval: number;
      weekday?: number | null;
      dayOfMonth?: number | null;
    }) => {
      if (!agencyId) return false;
      const { error } = await (supabase as any)
        .from("finance_payment_rules")
        .upsert(
          {
            tenant_id: agencyId,
            item_id: input.itemId,
            effective_from: input.effectiveFrom,
            mode: input.mode,
            interval_count: input.interval > 0 ? Math.trunc(input.interval) : 1,
            weekday: input.weekday ?? null,
            day_of_month: input.dayOfMonth ?? null,
            created_by: user?.id ?? null,
          },
          { onConflict: "item_id,effective_from" },
        );
      if (error) {
        console.error("[finance] falha ao salvar agenda de pagamento", error);
        toast.error("Não foi possível salvar a forma de pagamento");
        return false;
      }
      await fetchAll();
      return true;
    },
    [agencyId, user?.id, fetchAll],
  );

  /**
   * Cria/atualiza cadastro. Para um gasto AVULSO novo, cadastro + ocorrência da
   * competência nascem na MESMA transação Postgres via `create_finance_one_off`:
   * sem a ocorrência o avulso não apareceria no mês (`one_off` não é projetável).
   * Falha em qualquer parte => rollback integral no banco, sem DELETE no cliente.
   *
   * `paymentSchedule` é a AGENDA DE PAGAMENTO do cadastro (quando eu pago) —
   * separada da agenda da despesa (quando o gasto acontece).
   */
  const saveItem = useCallback(
    async (
      payload: Partial<FinanceItem>,
      id?: string,
      oneOff?: OneOffFact | null,
      paymentSchedule?: {
        mode: FinancePaymentRule["mode"];
        interval: number;
        weekday?: number | null;
        dayOfMonth?: number | null;
        effectiveFrom?: string | null;
      } | null,
    ) => {
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
        // Mensagem segura para o usuário, causa técnica no console (sem valor
        // financeiro). Constraint de coluna NOT NULL/violação de check some
        // silenciosamente se só mostrarmos "Erro ao atualizar cadastro".
        console.error("[finance] falha ao salvar cadastro", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        const isConstraint = error.code === "23502" || error.code === "23514" || error.code === "23505";
        toast.error(
          isConstraint
            ? "Cadastro inválido: revise dias de cobrança/vencimento e a recorrência"
            : id
              ? "Erro ao atualizar cadastro"
              : "Erro ao criar cadastro",
        );
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
  /* ----------------------- AGENDA DE PAGAMENTO ---------------------------- */

  /**
   * Grava a agenda de PAGAMENTO válida a partir de uma data. Não toca na agenda
   * da despesa: o gasto continua acontecendo quando acontece.
   */
  const savePaymentRule = useCallback(
    async (input: {
      itemId: string;
      effectiveFrom: string;
      mode: FinancePaymentRule["mode"];
      interval: number;
      weekday?: number | null;
      dayOfMonth?: number | null;
    }) => {
      if (!agencyId) return false;
      const { error } = await (supabase as any)
        .from("finance_payment_rules")
        .upsert(
          {
            tenant_id: agencyId,
            item_id: input.itemId,
            effective_from: input.effectiveFrom,
            mode: input.mode,
            interval_count: input.interval > 0 ? Math.trunc(input.interval) : 1,
            weekday: input.weekday ?? null,
            day_of_month: input.dayOfMonth ?? null,
            created_by: user?.id ?? null,
          },
          { onConflict: "item_id,effective_from" },
        );
      if (error) {
        console.error("[finance] falha ao salvar agenda de pagamento", error);
        toast.error("Não foi possível salvar a forma de pagamento");
        return false;
      }
      await fetchAll();
      return true;
    },
    [agencyId, user?.id, fetchAll],
  );

  /**
   * Cria o LOTE (saída de caixa) com as identidades escolhidas e, opcionalmente,
   * já registra o pagamento. Não duplica despesa: o lote não tem valor próprio —
   * o valor continua nas ocorrências que ele quita.
   */
  const createPaymentBatch = useCallback(
    async (input: {
      itemId: string | null;
      scheduledDate: string | null;
      entries: { itemId: string; scheduledDate: string }[];
      note?: string | null;
      payNow?: boolean;
      paidDateISO?: string | null;
    }) => {
      if (!agencyId) return false;
      if (input.entries.length === 0) {
        toast.error("Selecione ao menos um lançamento para o pagamento");
        return false;
      }
      const { data, error } = await (supabase as any)
        .from("finance_payment_batches")
        .insert({
          tenant_id: agencyId,
          item_id: input.itemId,
          competence_month: competenceToISO(normalized),
          scheduled_date: input.scheduledDate,
          note: input.note ?? null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .maybeSingle();
      if (error || !data?.id) {
        console.error("[finance] falha ao criar lote de pagamento", error);
        toast.error("Não foi possível criar o pagamento agrupado");
        return false;
      }
      const batchId = data.id as string;
      const { error: entriesError } = await (supabase as any)
        .from("finance_payment_batch_entries")
        .insert(
          input.entries.map((entry) => ({
            tenant_id: agencyId,
            batch_id: batchId,
            item_id: entry.itemId,
            scheduled_date: entry.scheduledDate,
          })),
        );
      if (entriesError) {
        // Lote vazio é inútil e a RPC recusa pagá-lo: desfazemos para não sujar.
        await (supabase as any).from("finance_payment_batches").delete().eq("id", batchId);
        console.error("[finance] falha ao vincular lançamentos ao lote", entriesError);
        toast.error(
          entriesError.code === "23505"
            ? "Algum lançamento já pertence a outro pagamento agrupado"
            : "Não foi possível vincular os lançamentos ao pagamento",
        );
        return false;
      }
      if (input.payNow) {
        const { error: payError } = await (supabase as any).rpc("finance_pay_payment_batch", {
          _batch_id: batchId,
          ...(input.paidDateISO ? { _paid_at: paymentDateToTimestamp(input.paidDateISO) } : {}),
        });
        if (payError) {
          toast.error(payError.message || "Não foi possível registrar o pagamento do lote");
          await fetchAll();
          return false;
        }
      }
      toast.success(
        input.payNow
          ? "Pagamento agrupado registrado — os lançamentos dele contam como pagos"
          : "Pagamento agrupado criado",
      );
      await fetchAll();
      return true;
    },
    [agencyId, normalized, user?.id, fetchAll],
  );

  /** Registra o pagamento de um lote existente. */
  const payPaymentBatch = useCallback(
    async (batchId: string, paidDateISO?: string | null) => {
      const { error } = await (supabase as any).rpc("finance_pay_payment_batch", {
        _batch_id: batchId,
        ...(paidDateISO ? { _paid_at: paymentDateToTimestamp(paidDateISO) } : {}),
      });
      if (error) {
        toast.error(error.message || "Não foi possível registrar o pagamento do lote");
        return false;
      }
      toast.success("Pagamento agrupado registrado");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  /** Desfaz o pagamento do lote (os lançamentos voltam a constar em aberto). */
  const unpayPaymentBatch = useCallback(
    async (batchId: string) => {
      const { error } = await (supabase as any).rpc("finance_unpay_payment_batch", {
        _batch_id: batchId,
      });
      if (error) {
        toast.error(error.message || "Não foi possível desfazer o pagamento do lote");
        return false;
      }
      toast.success("Pagamento do lote desfeito");
      await fetchAll();
      return true;
    },
    [fetchAll],
  );

  /** Exclui um lote AINDA NÃO PAGO (a RLS recusa excluir lote pago). */
  const deletePaymentBatch = useCallback(
    async (batchId: string) => {
      const { error } = await (supabase as any)
        .from("finance_payment_batches")
        .delete()
        .eq("id", batchId);
      if (error) {
        toast.error("Não foi possível excluir o pagamento agrupado");
        return false;
      }
      toast.success("Pagamento agrupado removido");
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
    rules,
    paymentRules,
    batches,
    batchEntries,
    rows,
    statements,
    settlement,
    totals,
    skipped,

    overlaps,
    cards,
    packages,
    settings,
    refresh: fetchAll,
    saveOccurrence,
    skipOccurrence,
    restoreOccurrence,
    setRecurrenceFuture,
    togglePaid,

    payStatement,
    setPaidStatementIof,
    savePaymentRule,
    createPaymentBatch,
    payPaymentBatch,
    unpayPaymentBatch,
    deletePaymentBatch,
    saveSettings,
    saveItem,
    setItemActive,
  };
}
