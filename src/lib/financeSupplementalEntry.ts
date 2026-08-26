/**
 * LANÇAMENTO SUPLEMENTAR (recarga/extra) — lógica pura.
 *
 * Um mesmo cadastro pode ter mais de um FATO no mês sem virar outro cadastro:
 * a assinatura mensal (`Renovação`) e as recargas de crédito compradas no meio
 * do mês são fatos distintos do MESMO item.
 *
 * Regras que este módulo protege:
 *  - suplementar NUNCA tem `scheduled_date` (a identidade dele é a própria PK);
 *  - suplementar NUNCA projeta futuro: ele só existe como fato persistido;
 *  - natureza do fato decide a data: no cartão é COBRANÇA (`charge_date`), em
 *    pagamento direto é VENCIMENTO (`due_date`) — nunca as duas;
 *  - fatura de cartão não aceita suplementar (o cartão é a unidade de caixa).
 */
import {
  CARD_PAYMENT_METHOD,
  type FinanceCurrency,
  type FinanceEntryRole,
  type FinanceItem,
  itemSupportsSupplemental,
  supplementalRoleFor,
} from "./financeModel";
import { isValidPaymentDate } from "./financePaymentDate";

export type SupplementalRole = Exclude<FinanceEntryRole, "regular">;

export const SUPPLEMENTAL_ACTION_LABELS: Record<SupplementalRole, string> = {
  recharge: "Adicionar recarga",
  extra: "Adicionar lançamento extra",
};

export const SUPPLEMENTAL_TITLES: Record<SupplementalRole, string> = {
  recharge: "Nova recarga",
  extra: "Novo lançamento extra",
};

/** Ação disponível para o cadastro, ou `null` quando ele não aceita. */
export function supplementalAction(
  item: FinanceItem,
): { role: SupplementalRole; label: string; title: string } | null {
  if (!itemSupportsSupplemental(item)) return null;
  const role = supplementalRoleFor(item);
  return { role, label: SUPPLEMENTAL_ACTION_LABELS[role], title: SUPPLEMENTAL_TITLES[role] };
}

export interface SupplementalFormState {
  factDate: string;
  currency: FinanceCurrency;
  amountOriginal: number | null;
  exchangeRate: number | null;
  amountBrl: number | null;
  paymentMethod: string | null;
  cardItemId: string | null;
  observations: string;
}

/** Argumentos da RPC `finance_create_supplemental_occurrence`. */
export interface SupplementalRpcArgs {
  _item_id: string;
  _entry_role: SupplementalRole;
  _fact_date: string;
  _currency: FinanceCurrency;
  _amount_original: number | null;
  _exchange_rate: number | null;
  _amount_brl: number | null;
  _payment_method_snapshot: string | null;
  _card_item_id_snapshot: string | null;
  _observations: string | null;
}

/** Motivo que impede o registro, ou `null` quando pode salvar. */
export function supplementalBlockReason(
  item: FinanceItem,
  state: SupplementalFormState,
): string | null {
  if (!itemSupportsSupplemental(item)) {
    return "Este cadastro não aceita lançamento suplementar";
  }
  if (!isValidPaymentDate(state.factDate)) {
    return "Informe a data real do lançamento";
  }
  if (state.amountBrl == null || !(state.amountBrl > 0)) {
    return "Informe o valor real do lançamento";
  }
  if (state.currency === "USD" && (state.amountOriginal == null || !(state.amountOriginal > 0))) {
    return "Informe o valor em dólar da compra";
  }
  return null;
}

export function canSubmitSupplemental(item: FinanceItem, state: SupplementalFormState): boolean {
  return supplementalBlockReason(item, state) === null;
}

/** A cobrança cai em cartão? (snapshot do formulário vence o cadastro.) */
export function supplementalOnCard(item: FinanceItem, state: SupplementalFormState): boolean {
  if (state.cardItemId) return true;
  if (state.paymentMethod) return state.paymentMethod === CARD_PAYMENT_METHOD;
  return !!item.card_item_id || item.payment_method === CARD_PAYMENT_METHOD;
}

export function buildSupplementalArgs(
  item: FinanceItem,
  role: SupplementalRole,
  state: SupplementalFormState,
): SupplementalRpcArgs {
  return {
    _item_id: item.id,
    _entry_role: role,
    _fact_date: state.factDate,
    _currency: state.currency,
    _amount_original: state.currency === "USD" ? state.amountOriginal : null,
    _exchange_rate: state.currency === "USD" ? state.exchangeRate : null,
    _amount_brl: state.amountBrl,
    _payment_method_snapshot: state.paymentMethod,
    _card_item_id_snapshot: state.cardItemId,
    _observations: state.observations.trim() || null,
  };
}

/** Estado inicial do formulário, herdando a origem do cadastro. */
export function initialSupplementalState(
  item: FinanceItem,
  today: string,
): SupplementalFormState {
  return {
    factDate: today,
    currency: item.currency,
    amountOriginal: null,
    exchangeRate: item.default_exchange_rate ?? null,
    amountBrl: null,
    paymentMethod: item.payment_method ?? null,
    cardItemId: item.card_item_id ?? null,
    observations: "",
  };
}
