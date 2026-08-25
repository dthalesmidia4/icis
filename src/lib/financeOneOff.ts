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
 * Argumentos da RPC transacional `create_finance_one_off`.
 *
 * ATOMICIDADE REAL: cadastro e fato do mês nascem na MESMA transação Postgres.
 * Não existe mais insert+insert com DELETE compensatório no cliente — no escopo
 * `tools` o DELETE em `finance_items` é restrito, então o rollback client-side
 * podia falhar e deixar item órfão (avulso invisível no mês, mentindo nos KPIs).
 *
 * No cartão a data é COBRANÇA (quem vence é a fatura); fora do cartão é
 * VENCIMENTO. Valores vão em plaintext: os BEFORE triggers cifram e nulificam o
 * plaintext em repouso — o cliente NUNCA escreve colunas `_enc`.
 */
export function buildOneOffRpcArgs(params: {
  tenantId: string;
  payload: Partial<FinanceItem>;
  fact: OneOffFact;
}): Record<string, unknown> {
  const { tenantId, payload, fact } = params;
  const onCard = oneOffOnCard(fact);
  return {
    _tenant_id: tenantId,
    _kind: payload.kind ?? null,
    _name: payload.name ?? null,
    _cost_center: payload.cost_center ?? null,
    _currency: fact.currency,
    _competence_month: fact.competenceMonth,
    _payment_method: fact.paymentMethod,
    _card_item_id: onCard ? fact.cardItemId : null,
    _date: fact.date,
    _amount_mode: payload.amount_mode ?? "fixed",
    _amount_original: fact.amountOriginal,
    _exchange_rate: fact.exchangeRate,
    _amount_brl: fact.amountBrl,
    _purpose: payload.purpose ?? null,
    _category: payload.category ?? null,
    _link: payload.link ?? null,
    _notes: payload.notes ?? null,
    _parent_item_id: payload.parent_item_id ?? null,
  };
}
