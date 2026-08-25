/**
 * Camada de leitura segura dos valores financeiros.
 *
 * Os números sensíveis (valores, câmbio, limites, orçamento) existem no banco
 * SOMENTE cifrados. O frontend NUNCA vê ciphertext nem chave: os valores
 * chegam claros exclusivamente pelas RPCs SECURITY DEFINER, que checam
 * `has_finance_access` / `has_finance_tools_access` antes de descriptografar.
 *
 * A metadata não sensível (nome, tipo, datas, recorrência) continua vindo das
 * tabelas via RLS. Este módulo só ENRIQUECE essa metadata com os números.
 *
 * Pós-cutover: a RPC segura é OBRIGATÓRIA. Não existe fallback para plaintext.
 * Se a RPC falhar, os helpers lançam `FinanceSecureReadError` — o chamador deve
 * mostrar erro e oferecer nova tentativa, nunca exibir zeros como se fossem
 * dados válidos.
 */
import { supabase } from "@/integrations/supabase/client";
import type { FinanceItem, FinanceOccurrence } from "@/lib/financeModel";

/** Falha na leitura segura: nunca deve ser convertida em zeros na UI. */
export class FinanceSecureReadError extends Error {
  code = "FINANCE_SECURE_READ_FAILED" as const;
  constructor(
    public readonly source: string,
    cause?: unknown,
  ) {
    super(`Falha na leitura segura dos valores financeiros (${source})`);
    this.name = "FinanceSecureReadError";
    (this as any).cause = cause;
  }
}

export interface SecureItemValues {
  default_amount_original: number | null;
  default_exchange_rate: number | null;
  default_amount_brl: number | null;
  card_limit_brl: number | null;
}

export interface SecureOccurrenceValues {
  amount_original: number | null;
  exchange_rate: number | null;
  amount_brl: number | null;
  paid_amount_brl: number | null;
}

export interface SecureTenantValues {
  monthlyBudgetBrl: number | null;
  defaultUsdRate: number | null;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);


/* --------------------------- Colunas de metadata --------------------------- */

/**
 * Após o cutover, os valores só existem cifrados. As tabelas nunca devem ser
 * consultadas com `*`: as colunas monetárias (plaintext vazias e `_enc`)
 * ficam fora do SELECT e chegam exclusivamente pelas RPCs seguras.
 */
export const FINANCE_ITEM_METADATA_COLUMNS = [
  "id",
  "tenant_id",
  "kind",
  "name",
  "purpose",
  "category",
  "cost_center",
  "active",
  "payment_method",
  "card_item_id",
  "bank_name",
  "card_last4",
  "statement_closing_day",
  "statement_due_day",
  "currency",
  "recurrence_type",
  "charge_day",
  "due_day",
  "subscription_date",
  "link",
  "parent_item_id",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
  "installment_start_date",
  "installment_count",
  "recurrence_interval_months",
  "recurrence_start_date",
  "amount_mode",
].join(",");

export const FINANCE_OCCURRENCE_METADATA_COLUMNS = [
  "id",
  "tenant_id",
  "item_id",
  "competence_month",
  "charge_date",
  "due_date",
  "currency",
  "is_estimated",
  "statement_occurrence_id",
  "paid_at",
  "attachment_url",
  "attachment_name",
  "observations",
  "legacy_bill_id",
  "created_by",
  "created_at",
  "updated_at",
  "payment_method_snapshot",
  "card_item_id_snapshot",
  "statement_competence_snapshot",
].join(",");

/* ------------------------------- Merges puros ------------------------------ */

/**
 * Aplica os valores seguros sobre os itens. Sem mapa (RPC indisponível na fase
 * de transição), os itens são devolvidos intactos.
 */
export function mergeItemValues(
  items: FinanceItem[],
  values: Map<string, SecureItemValues> | null,
): FinanceItem[] {
  if (!values) return items;
  return items.map((item) => {
    const v = values.get(item.id);
    if (!v) return item;
    return {
      ...item,
      default_amount_original: v.default_amount_original,
      default_exchange_rate: v.default_exchange_rate,
      default_amount_brl: v.default_amount_brl,
      card_limit_brl: v.card_limit_brl,
    };
  });
}

export function mergeOccurrenceValues(
  occurrences: FinanceOccurrence[],
  values: Map<string, SecureOccurrenceValues> | null,
): FinanceOccurrence[] {
  if (!values) return occurrences;
  return occurrences.map((occ) => {
    const v = values.get(occ.id);
    if (!v) return occ;
    return {
      ...occ,
      amount_original: v.amount_original,
      exchange_rate: v.exchange_rate,
      amount_brl: v.amount_brl,
      paid_amount_brl: v.paid_amount_brl,
    };
  });
}

/* ---------------------------------- Fetch --------------------------------- */

export async function fetchSecureItemValues(
  tenantId: string,
): Promise<Map<string, SecureItemValues> | null> {
  const { data, error } = await (supabase as any).rpc("finance_read_item_values", {
    _tenant_id: tenantId,
  });
  if (error || !Array.isArray(data)) return null;
  const map = new Map<string, SecureItemValues>();
  for (const row of data as any[]) {
    map.set(row.id, {
      default_amount_original: num(row.default_amount_original),
      default_exchange_rate: num(row.default_exchange_rate),
      default_amount_brl: num(row.default_amount_brl),
      card_limit_brl: num(row.card_limit_brl),
    });
  }
  return map;
}

export async function fetchSecureOccurrenceValues(
  tenantId: string,
  from?: string | null,
  to?: string | null,
): Promise<Map<string, SecureOccurrenceValues> | null> {
  const { data, error } = await (supabase as any).rpc("finance_read_occurrence_values", {
    _tenant_id: tenantId,
    _from: from ?? null,
    _to: to ?? null,
  });
  if (error || !Array.isArray(data)) return null;
  const map = new Map<string, SecureOccurrenceValues>();
  for (const row of data as any[]) {
    map.set(row.id, {
      amount_original: num(row.amount_original),
      exchange_rate: num(row.exchange_rate),
      amount_brl: num(row.amount_brl),
      paid_amount_brl: num(row.paid_amount_brl),
    });
  }
  return map;
}

/** Orçamento e câmbio padrão — somente escopo `full`. */
export async function fetchSecureTenantValues(
  tenantId: string,
): Promise<SecureTenantValues | null> {
  const { data, error } = await (supabase as any).rpc("finance_read_tenant_values", {
    _tenant_id: tenantId,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { monthlyBudgetBrl: null, defaultUsdRate: null };
  return {
    monthlyBudgetBrl: num(row.finance_monthly_budget_brl),
    defaultUsdRate: num(row.finance_default_usd_rate),
  };
}
