/**
 * Agrupamento de APRESENTAÇÃO das assinaturas e ferramentas por origem de
 * pagamento. É derivado em tempo real de `card_item_id` / `payment_method`:
 * nunca há estado manual duplicado, então editar o vínculo move o item de grupo
 * no próximo refetch.
 *
 * Não altera nenhuma regra contábil: itens pagos no cartão continuam sendo
 * assinaturas e também aparecem como componentes da fatura (referência cruzada).
 */
import {
  CARD_PAYMENT_METHOD,
  FinanceItem,
  PAYMENT_METHODS,
  cardDisplayLabel,
  cycleGapLabel,
  isCostBearing,
} from "@/lib/financeModel";

export type SubscriptionGroupKind = "card" | "direct" | "undefined";

export interface SubscriptionGroup {
  key: string;
  title: string;
  kind: SubscriptionGroupKind;
  /** Cadastro real do cartão quando `kind === "card"`. */
  card: FinanceItem | null;
  /** Aviso de ciclo incompleto do cartão — mostrado só no cabeçalho do grupo. */
  warning: string | null;
  items: FinanceItem[];
  /** Total conhecido (BRL) das cobranças do grupo nesta competência. */
  total: number;
}

export const UNDEFINED_GROUP_TITLE = "Sem forma de pagamento definida";

function directOrder(method: string): number {
  const idx = PAYMENT_METHODS.filter((m) => m !== CARD_PAYMENT_METHOD).indexOf(method as any);
  return idx === -1 ? PAYMENT_METHODS.length : idx;
}

/**
 * Monta os grupos na ordem: cartões cadastrados, pagamentos diretos e, por
 * último, itens sem forma definida. Grupos vazios nunca são retornados.
 */
export function buildSubscriptionGroups(params: {
  items: FinanceItem[];
  cards: FinanceItem[];
}): SubscriptionGroup[] {
  const { items, cards } = params;
  const map = new Map<string, SubscriptionGroup>();

  const ensure = (group: Omit<SubscriptionGroup, "items" | "total">) => {
    const existing = map.get(group.key);
    if (existing) return existing;
    const created: SubscriptionGroup = { ...group, items: [], total: 0 };
    map.set(group.key, created);
    return created;
  };

  for (const item of items) {
    const card = item.card_item_id ? cards.find((c) => c.id === item.card_item_id) ?? null : null;
    let group: SubscriptionGroup;

    if (item.card_item_id && card) {
      group = ensure({
        key: `card:${card.id}`,
        title: cardDisplayLabel(card),
        kind: "card",
        card,
        warning: cycleGapLabel(card),
      });
    } else {
      const method = (item.payment_method ?? "").trim();
      const isDirect = !!method && method !== CARD_PAYMENT_METHOD;
      group = isDirect
        ? ensure({ key: `method:${method}`, title: method, kind: "direct", card: null, warning: null })
        : ensure({
            key: "undefined",
            title: UNDEFINED_GROUP_TITLE,
            kind: "undefined",
            card: null,
            warning: null,
          });
    }

    group.items.push(item);
    if (isCostBearing(item)) group.total += item.default_amount_brl ?? 0;
  }

  const rank = (g: SubscriptionGroup) => (g.kind === "card" ? 0 : g.kind === "direct" ? 1 : 2);

  return Array.from(map.values())
    .filter((g) => g.items.length > 0)
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.kind === "direct" && b.kind === "direct") {
        const diff = directOrder(a.title) - directOrder(b.title);
        if (diff !== 0) return diff;
      }
      return a.title.localeCompare(b.title, "pt-BR");
    });
}
