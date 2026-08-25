/**
 * GASTO AVULSO (`recurrence_type = 'one_off'`) — cadastro **e** fato do mês.
 *
 * Semântica canônica:
 * - `kind` diz O QUE é (`expense` = conta/despesa, `tool` = ferramenta...);
 * - `recurrence_type` diz COMO se repete (`one_off` = uma única vez);
 * - a FORMA DE PAGAMENTO decide o domínio operacional: cartão vira componente
 *   da fatura, Pix/Boleto/Transferência/Dinheiro/Débito vira pagamento direto.
 *
 * Por isso `tool + one_off` é válido (ferramenta comprada uma vez) e aparece em
 * Assinaturas **e** no domínio operacional da forma de pagamento — são duas
 * VISÕES do mesmo fato, nunca dois lançamentos.
 *
 * Defeito que este módulo corrige: `isProjectableInMonth('one_off')` é `false`,
 * então um avulso salvo apenas em `finance_items` desapareceria do mês e não
 * teria linha para registrar o fato. Ao criar um avulso, materializamos a
 * ocorrência da competência escolhida na MESMA operação lógica.
 */
import { CARD_PAYMENT_METHOD, FinanceCurrency, FinanceItem } from "./financeModel";

/** Fato do mês que acompanha a criação de um avulso. */
export interface OneOffFact {
  /** Competência de destino (`YYYY-MM-01`). */
  competenceMonth: string;
  /** Data real do gasto/vencimento (`YYYY-MM-DD`). `null` quando não informada. */
  date: string | null;
  currency: FinanceCurrency;
  amountOriginal: number | null;
  amountBrl: number | null;
  exchangeRate: number | null;
  /** Forma de pagamento efetiva. `null` = não definida. */
  paymentMethod: string | null;
  /** Cartão efetivo, quando a forma é cartão de crédito. */
  cardItemId: string | null;
}

/** O payload que está sendo criado é um avulso que precisa virar fato do mês? */
export function shouldMaterializeOneOff(
  payload: Partial<FinanceItem>,
  existingId?: string | null,
): boolean {
  if (existingId) return false; // edição nunca cria fato novo
  if (payload.recurrence_type !== "one_off") return false;
  // Recurso incluído não gera custo próprio; cartão não é despesa.
  return payload.kind !== "included_resource" && payload.kind !== "card";
}

/** A forma de pagamento do avulso é cartão de crédito? */
export function oneOffOnCard(fact: OneOffFact): boolean {
  return fact.paymentMethod === CARD_PAYMENT_METHOD && !!fact.cardItemId;
}

/**
 * Linha de `finance_occurrences` do avulso.
 *
 * No cartão a data é COBRANÇA (quem vence é a fatura); fora do cartão a data é
 * VENCIMENTO. O snapshot de forma de pagamento é gravado para o mês nunca ser
 * reescrito por uma mudança futura no cadastro. Nunca marca como pago.
 */
export function buildOneOffOccurrenceInsert(params: {
  tenantId: string;
  itemId: string;
  fact: OneOffFact;
  createdBy?: string | null;
}): Record<string, unknown> {
  const { tenantId, itemId, fact } = params;
  const onCard = oneOffOnCard(fact);
  return {
    tenant_id: tenantId,
    item_id: itemId,
    competence_month: fact.competenceMonth,
    charge_date: onCard ? fact.date : null,
    due_date: onCard ? null : fact.date,
    currency: fact.currency,
    amount_original: fact.amountOriginal,
    exchange_rate: fact.exchangeRate,
    amount_brl: fact.amountBrl,
    payment_method_snapshot: fact.paymentMethod,
    card_item_id_snapshot: onCard ? fact.cardItemId : null,
    paid_at: null,
    paid_amount_brl: null,
    created_by: params.createdBy ?? null,
  };
}

export interface OneOffCreateResult {
  ok: boolean;
  /** `true` quando o cadastro foi desfeito porque o fato do mês falhou. */
  rolledBack: boolean;
}

/**
 * Criação atômica do par cadastro + fato.
 *
 * Se a ocorrência falhar, o cadastro é REMOVIDO: nunca deixamos item órfão
 * (um avulso sem ocorrência é invisível no mês e mentiria nos KPIs).
 */
export async function createItemWithOneOff(deps: {
  insertItem: () => Promise<{ id: string | null; error: unknown }>;
  insertOccurrence: (itemId: string) => Promise<{ error: unknown }>;
  deleteItem: (itemId: string) => Promise<void>;
}): Promise<OneOffCreateResult> {
  const created = await deps.insertItem();
  if (created.error || !created.id) return { ok: false, rolledBack: false };

  const occ = await deps.insertOccurrence(created.id);
  if (occ.error) {
    try {
      await deps.deleteItem(created.id);
    } catch {
      // Falha ao desfazer não muda o resultado: a operação não foi concluída.
    }
    return { ok: false, rolledBack: true };
  }
  return { ok: true, rolledBack: false };
}
