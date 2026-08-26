/**
 * CORREÇÃO EXPLÍCITA DO FATO (lógica pura).
 *
 * O primeiro modal (`FinanceOccurrenceModal`) é o lugar do FATO daquele mês:
 * valor real, data real e origem real. "Editar cadastro" só fala do padrão.
 *
 * Um fato FECHADO (pago direto ou liquidado por fatura paga) abre em consulta.
 * A correção nunca é implícita: existe o botão `Corrigir lançamento`, e nesse
 * modo só os campos que podem legitimamente estar errados abrem:
 *
 *   - valor real (BRL / USD / câmbio);
 *   - data do fato — `charge_date` no cartão, `due_date` no pagamento direto;
 *   - origem do pagamento DESTE mês (snapshot);
 *   - observações.
 *
 * Fora do escopo, por regra de negócio:
 *   - `paid_at` / `paid_amount_brl`: o pagamento é prova separada e tem fluxo
 *     próprio (fatura, desfazer pagamento). Corrigir valor não desfaz pagamento.
 *   - `scheduled_date`, `competence_month`, `item_id`, vínculos de fatura e
 *     metadados de skip: imutáveis.
 *   - fatura (`kind=card`) paga continua bloqueada: ela não é corrigida aqui.
 *
 * A persistência dessas correções vai pela RPC `finance_correct_occurrence`
 * (whitelist repetida no banco + trilha em `finance_occurrence_corrections`).
 */
import { CARD_PAYMENT_METHOD, type FinanceOccurrence, type MonthRow } from "./financeModel";

export type FactCorrectionMode =
  /** Fato aberto: fluxo normal de edição. */
  | "editable"
  /** Fato fechado: consulta, com correção explícita disponível. */
  | "correctable"
  /** Fatura paga (ou fato sem ocorrência real): nada a corrigir aqui. */
  | "locked";

export function factCorrectionMode(input: {
  /** A linha tem ocorrência REAL persistida? Sem fato não há o que corrigir. */
  hasOccurrence: boolean;
  /** `isStatementRow(row)` — a própria fatura. */
  statementRow: boolean;
  /** `effectivePaid(row, ...)` — fato fechado/pago. */
  closed: boolean;
}): FactCorrectionMode {
  if (!input.closed) return "editable";
  if (input.statementRow) return "locked";
  if (!input.hasOccurrence) return "locked";
  return "correctable";
}

export const FACT_CORRECTION_BUTTON = "Corrigir lançamento";
export const FACT_CORRECTION_SAVE_LABEL = "Salvar correção";
export const FACT_CORRECTION_SUCCESS = "Lançamento corrigido";
export const FACT_CORRECTION_NOTE =
  "Correção do fato deste mês: valor, data, origem e observações. O pagamento registrado não é alterado por aqui.";
export const FACT_CORRECTION_INCONSISTENT =
  "A alteração não foi confirmada. Tente novamente.";

/* --------------------------- patch da correção ---------------------------- */

export interface FactCorrectionInput {
  cardRow: boolean;
  currency: "BRL" | "USD";
  amountOriginal: number | null;
  amountBrl: number | null;
  exchangeRate: number | null;
  /** Data do fato digitada (`YYYY-MM-DD`) — cobrança no cartão, vencimento direto. */
  factDate: string;
  observations: string;
  /** Snapshot da origem deste mês (já resolvido pelo formulário). */
  paymentMethodSnapshot: string | null;
  cardItemIdSnapshot: string | null;
}

/** Patch JSON aceito pela RPC — apenas chaves da whitelist. */
export type FactCorrectionPatch = Record<string, string | number | null>;

export function buildFactCorrectionPatch(input: FactCorrectionInput): FactCorrectionPatch {
  const patch: FactCorrectionPatch = {
    currency: input.currency,
    amount_original: input.amountOriginal,
    amount_brl: input.amountBrl,
    exchange_rate: input.currency === "USD" ? input.exchangeRate : null,
    observations: input.observations.trim() || null,
    payment_method_snapshot: input.paymentMethodSnapshot,
    card_item_id_snapshot: input.cardItemIdSnapshot,
  };
  // Uma data só: cartão corrige a COBRANÇA, direto corrige o VENCIMENTO.
  if (input.cardRow) patch.charge_date = input.factDate || null;
  else patch.due_date = input.factDate || null;
  return patch;
}

/* ---------------------- transição incoerente (CROPY) ---------------------- */

/**
 * Fato avulso pago DIRETO que passou a pertencer a um cartão.
 *
 * O cadastro foi corretamente alterado para cartão, mas o fato existente ficou
 * numa mistura impossível: `due_date` de pagamento direto + `paid_at` próprio +
 * `charge_date` ausente. Sem `charge_date` ele nunca entra numa fatura, e o
 * `paid_at` legado o mantém "pago" fora de qualquer fatura.
 *
 * Detecção conservadora: só quando NÃO existe snapshot explícito no fato (isto
 * é, o fato segue o cadastro) e o cadastro aponta para um cartão.
 */
export function isLegacyDirectPaymentOnCard(row: MonthRow | null | undefined): boolean {
  const occ = row?.occurrence;
  if (!row || !occ) return false;
  if (occ.payment_method_snapshot || occ.card_item_id_snapshot) return false;
  if (!occ.paid_at) return false;
  if (occ.charge_date) return false;
  const item = row.item;
  if (item.payment_method !== CARD_PAYMENT_METHOD) return false;
  return !!item.card_item_id;
}

export const LEGACY_DIRECT_ON_CARD_NOTE =
  "Pagamento direto registrado antes do vínculo ao cartão. Informe a data real da cobrança para converter este lançamento em cobrança do cartão — a partir daí ele é liquidado pela fatura.";
export const LEGACY_CONVERT_LABEL = "Converter em cobrança do cartão";
export const LEGACY_CONVERT_SUCCESS = "Lançamento convertido em cobrança do cartão";
export const LEGACY_CONVERT_NEEDS_DATE =
  "Informe a data real da cobrança no cartão para converter.";

/* ------------------------ verificação de consistência --------------------- */

const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

/**
 * O banco confirmou a correção? Comparamos só o que é verificável na metadata
 * recarregada (datas e observações). Valores voltam cifrados e são conferidos
 * pela leitura segura, não aqui.
 */
export function correctionWasApplied(
  patch: FactCorrectionPatch,
  saved: FinanceOccurrence | null | undefined,
): boolean {
  if (!saved) return false;
  if ("charge_date" in patch) {
    if (dateOnly(saved.charge_date) !== dateOnly(patch.charge_date as string | null)) return false;
    if (dateOnly(saved.due_date) !== null) return false;
  }
  if ("due_date" in patch && !("charge_date" in patch)) {
    if (dateOnly(saved.due_date) !== dateOnly(patch.due_date as string | null)) return false;
  }
  if ("observations" in patch) {
    if ((saved.observations ?? null) !== (patch.observations ?? null)) return false;
  }
  return true;
}
