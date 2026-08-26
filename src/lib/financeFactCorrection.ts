/**
 * FATO DO MÊS: DIGITÁVEL SEMPRE, PROVA DE PAGAMENTO SEMPRE PROTEGIDA.
 *
 * O primeiro modal (`FinanceOccurrenceModal`) é o lugar do FATO daquele mês:
 * valor real, data real e origem real. "Editar cadastro" só fala do padrão.
 *
 * Duas permissões INDEPENDENTES, sem modo de correção nem botão para destravar:
 *
 *   - `factFieldsEditable` — valor, data do fato, origem do mês e observações.
 *     Abertos desde o primeiro render em QUALQUER linha que não seja a própria
 *     fatura (`kind=card`), inclusive quando o lançamento já está pago ou
 *     liquidado pela fatura. Um fato errado precisa ser corrigível na hora.
 *
 *   - `paymentProofEditable` — `paid`/`paid_at`/`paid_amount_brl` e comprovante.
 *     Só enquanto o fato está aberto: pagamento é prova separada e tem fluxo
 *     próprio (fatura, desfazer pagamento). Corrigir valor não desfaz pagamento.
 *
 * Imutáveis por regra de negócio (nem UI nem RPC tocam): `scheduled_date`,
 * `competence_month`, `item_id`, vínculos de fatura e metadados de skip.
 *
 * A persistência de um fato FECHADO vai automaticamente pela RPC
 * `finance_correct_occurrence` (whitelist repetida no banco + trilha em
 * `finance_occurrence_corrections`); a transição direta→cartão vai pela
 * `finance_convert_occurrence_to_card_charge`. O Save decide a rota — o usuário
 * nunca precisa entrar num modo especial.
 */
import { CARD_PAYMENT_METHOD, type FinanceOccurrence, type MonthRow } from "./financeModel";

/**
 * Campos factuais do mês abrem imediatamente. Só a PRÓPRIA fatura fica em
 * consulta: os valores dela são derivados dos componentes, não digitados.
 */
export function factFieldsEditable(input: { statementRow: boolean }): boolean {
  return !input.statementRow;
}

/**
 * Prova de pagamento: bloqueada em fato fechado e inexistente em compra de
 * cartão (a liquidação é derivada do pagamento da fatura).
 */
export function paymentProofEditable(input: {
  cardRow: boolean;
  statementRow: boolean;
  closed: boolean;
}): boolean {
  if (input.statementRow) return false;
  if (input.cardRow) return false;
  return !input.closed;
}

/** Rota de persistência escolhida pelo Save (sem gate de UI). */
export type OccurrenceSaveRoute =
  /** Nada a salvar aqui (fatura). */
  | "blocked"
  /** Fato aberto: upsert normal da ocorrência. */
  | "normal"
  /** Fato fechado: correção auditada via RPC segura. */
  | "correction"
  /** Fato direto legado que passa a ser cobrança do cartão, depois corrigido. */
  | "convert_then_correct";

export function occurrenceSaveRoute(input: {
  statementRow: boolean;
  /** A linha tem ocorrência REAL persistida? */
  hasOccurrence: boolean;
  /** `effectivePaid(row, ...)` — fato fechado/pago. */
  closed: boolean;
  /** `isLegacyDirectPaymentOnCard(row)`. */
  legacyDirectOnCard: boolean;
  /** Data do fato digitada (`YYYY-MM-DD`), quando válida. */
  factDate: string;
}): OccurrenceSaveRoute {
  if (input.statementRow) return "blocked";
  if (!input.closed || !input.hasOccurrence) return "normal";
  if (input.legacyDirectOnCard && /^\d{4}-\d{2}-\d{2}$/.test(input.factDate)) {
    return "convert_then_correct";
  }
  return "correction";
}

export const FACT_CORRECTION_SUCCESS = "Lançamento corrigido";
export const FACT_CORRECTION_NOTE =
  "Você pode corrigir valor, data, origem e observações deste mês. O pagamento registrado não é alterado por aqui.";
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
 * Fato avulso pago DIRETO que hoje pertence a um cartão.
 *
 * O destino do pagamento é cartão (por snapshot do mês OU pelo cadastro), mas o
 * fato ficou numa mistura impossível: `paid_at` próprio, sem `charge_date`, com
 * `due_date` de pagamento direto. Sem `charge_date` ele nunca entra numa fatura,
 * e o `paid_at` legado o mantém "pago" fora de qualquer fatura.
 *
 * Detectar NÃO depende de snapshot nulo: o caso real (Adobe) já tem snapshot de
 * cartão preenchido. A data nunca é inventada — a conversão só acontece quando o
 * usuário digita a data real da cobrança.
 */
export function isLegacyDirectPaymentOnCard(row: MonthRow | null | undefined): boolean {
  const occ = row?.occurrence;
  if (!row || !occ) return false;
  if (row.item.kind === "card") return false;
  if (!occ.paid_at) return false;
  if (occ.charge_date) return false;
  return destinationIsCard(row);
}

/** O pagamento deste mês vai para um cartão? Snapshot manda; senão o cadastro. */
function destinationIsCard(row: MonthRow): boolean {
  const occ = row.occurrence;
  if (occ?.card_item_id_snapshot) return true;
  if (occ?.payment_method_snapshot) return occ.payment_method_snapshot === CARD_PAYMENT_METHOD;
  return row.item.payment_method === CARD_PAYMENT_METHOD && !!row.item.card_item_id;
}

export const LEGACY_DIRECT_ON_CARD_NOTE =
  "Pagamento direto registrado antes do vínculo ao cartão. Informe a data real da cobrança: ao salvar, este lançamento passa a ser cobrança do cartão e é liquidado pela fatura.";

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
