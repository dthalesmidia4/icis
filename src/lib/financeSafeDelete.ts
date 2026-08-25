/**
 * ÚNICO caminho de exclusão/inativação do Financeiro no cliente.
 *
 * Nada aqui usa `.delete()` no PostgREST: DELETE direto foi revogado no banco
 * exatamente porque `finance_occurrences.item_id` é `ON DELETE CASCADE` e um
 * DELETE de cadastro apagaria o histórico inteiro. Toda destruição passa por
 * RPC SECURITY DEFINER que valida escopo `full` e as regras contábeis.
 */
import { supabase } from "@/integrations/supabase/client";
import { ItemDeleteDecision, parseItemDeleteDecision } from "./financeDeletePolicy";

type Rpc = typeof supabase.rpc;

/** Mensagem do Postgres já é escrita para humano — repassamos limpa. */
export function safeDeleteErrorMessage(error: { message?: string } | null | undefined): string {
  const raw = (error?.message ?? "").trim();
  if (!raw) return "Não foi possível concluir a operação";
  return raw.replace(/^.*?ERROR:\s*/i, "");
}

export async function fetchItemDeleteDecision(itemId: string): Promise<ItemDeleteDecision | null> {
  const { data, error } = await (supabase.rpc as unknown as Rpc)(
    "finance_item_delete_decision" as never,
    { _item_id: itemId } as never,
  );
  if (error) return null;
  return parseItemDeleteDecision(data);
}

export interface SafeResult {
  ok: boolean;
  message?: string;
  deletedItem?: boolean;
}

export async function deleteFinanceItemSafe(itemId: string): Promise<SafeResult> {
  const { error } = await (supabase.rpc as unknown as Rpc)(
    "delete_finance_item_safe" as never,
    { _item_id: itemId } as never,
  );
  if (error) return { ok: false, message: safeDeleteErrorMessage(error) };
  return { ok: true, deletedItem: true };
}

export async function inactivateFinanceItemSafe(itemId: string): Promise<SafeResult> {
  const { error } = await (supabase.rpc as unknown as Rpc)(
    "inactivate_finance_item_safe" as never,
    { _item_id: itemId } as never,
  );
  if (error) return { ok: false, message: safeDeleteErrorMessage(error) };
  return { ok: true };
}

export async function deleteFinanceOccurrenceSafe(occurrenceId: string): Promise<SafeResult> {
  const { data, error } = await (supabase.rpc as unknown as Rpc)(
    "delete_finance_occurrence_safe" as never,
    { _occurrence_id: occurrenceId } as never,
  );
  if (error) return { ok: false, message: safeDeleteErrorMessage(error) };
  const payload = (data ?? {}) as Record<string, unknown>;
  return { ok: true, deletedItem: payload.deleted_item === true };
}
