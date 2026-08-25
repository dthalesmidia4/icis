/**
 * POLÍTICA CONTÁBIL DE EXCLUSÃO x INATIVAÇÃO (espelho puro do servidor).
 *
 * A autoridade real são as RPCs `delete_finance_item_safe`,
 * `inactivate_finance_item_safe` e `delete_finance_occurrence_safe`
 * (SECURITY DEFINER, escopo `full`). Este módulo existe apenas para a UI saber
 * o que OFERECER — nunca para autorizar.
 *
 * Regra que não se negocia: fato FECHADO (pago, ou liquidado por fatura paga)
 * nunca é destruído. Recorrente/parcelado não tem "excluir a projeção do mês":
 * apagar a ocorrência faria o cadastro projetar de novo. O caminho é inativar
 * o cadastro, que preserva o passado e interrompe o futuro.
 */
import type { FinanceItem, MonthRow } from "./financeModel";

/* --------------------------- CADASTRO (master) --------------------------- */

export type ItemDeleteAction =
  /** Nunca usado: pode ser apagado definitivamente. */
  | "delete"
  /** Tem história: só inativar. */
  | "inactivate"
  /** Já inativo e com história: nada a fazer além de preservar. */
  | "keep_history"
  /** Cartão em uso por despesa ativa: reatribuir antes. */
  | "blocked_card_referenced";

export interface ItemDeleteDecision {
  action: ItemDeleteAction;
  kind: string;
  recurrence_type: string | null;
  active: boolean;
  occurrence_count: number;
  child_count: number;
  referencing_item_count: number;
  referencing_active_item_count: number;
  snapshot_count: number;
}

/** Normaliza o payload da RPC (defensivo contra formato inesperado). */
export function parseItemDeleteDecision(raw: unknown): ItemDeleteDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const action = data.action;
  if (
    action !== "delete" &&
    action !== "inactivate" &&
    action !== "keep_history" &&
    action !== "blocked_card_referenced"
  ) {
    return null;
  }
  const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0) || 0);
  return {
    action,
    kind: typeof data.kind === "string" ? data.kind : "",
    recurrence_type: typeof data.recurrence_type === "string" ? data.recurrence_type : null,
    active: data.active === true,
    occurrence_count: num(data.occurrence_count),
    child_count: num(data.child_count),
    referencing_item_count: num(data.referencing_item_count),
    referencing_active_item_count: num(data.referencing_active_item_count),
    snapshot_count: num(data.snapshot_count),
  };
}

export const ITEM_DECISION_HINTS: Record<ItemDeleteAction, string> = {
  delete: "Este cadastro nunca teve lançamento — pode ser excluído definitivamente.",
  inactivate:
    "Este cadastro já tem histórico. Inativar preserva os meses anteriores e interrompe as projeções futuras.",
  keep_history:
    "Cadastro inativo com histórico: os meses anteriores são preservados e nada é projetado para o futuro.",
  blocked_card_referenced:
    "Este cartão é a forma de pagamento de despesas ativas. Reatribua essas despesas antes de excluir ou inativar.",
};

/* --------------------------- LANÇAMENTO (mês) ---------------------------- */

export type OccurrenceDeleteAction =
  /** Fatura de cartão informada e não paga: apaga só a fatura. */
  | "delete_statement"
  /** Avulso aberto e único fato do cadastro: apaga ocorrência + cadastro. */
  | "delete_one_off"
  /** Recorrente/parcelado: o caminho é inativar o cadastro. */
  | "inactivate_item"
  /** Fato fechado: imutável. */
  | "blocked_closed"
  /** Projeção sem fato no banco: não há o que excluir. */
  | "nothing_to_delete";

export interface OccurrenceDeleteInput {
  item: Pick<FinanceItem, "kind" | "recurrence_type">;
  /** Existe ocorrência persistida? */
  persisted: boolean;
  /** Pago diretamente OU liquidado por fatura paga (ver `effectivePaid`). */
  closed: boolean;
}

export function occurrenceDeleteAction(input: OccurrenceDeleteInput): OccurrenceDeleteAction {
  if (input.closed) return "blocked_closed";
  if (!input.persisted) return "nothing_to_delete";
  if (input.item.kind === "card") return "delete_statement";
  if (input.item.recurrence_type === "one_off") return "delete_one_off";
  return "inactivate_item";
}

export const OCCURRENCE_ACTION_LABELS: Record<OccurrenceDeleteAction, string> = {
  delete_statement: "Excluir fatura informada",
  delete_one_off: "Excluir lançamento",
  inactivate_item: "Inativar cadastro",
  blocked_closed: "Registro fechado — preservado no histórico",
  nothing_to_delete: "Nada informado neste mês",
};

/** Decisão a partir de uma linha da tela (açúcar para os modais). */
export function occurrenceDeleteActionForRow(row: MonthRow, closed: boolean): OccurrenceDeleteAction {
  return occurrenceDeleteAction({
    item: row.item,
    persisted: !!row.occurrence,
    closed,
  });
}
