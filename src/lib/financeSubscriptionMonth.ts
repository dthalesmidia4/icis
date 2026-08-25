/**
 * Visão MENSAL de `Assinaturas e ferramentas`.
 *
 * A pergunta que esta tela responde é uma só:
 * “quais ferramentas, assinaturas e pacotes fazem parte DESTE mês?”
 *
 * Regras não negociáveis:
 * - relevância mensal vem de fato real (`occurrence`) ou projeção válida de um
 *   cadastro ATIVO — cadastro inativo sem ocorrência real não aparece;
 * - recursos incluídos (`included_resource`) NUNCA são cobranças: eles vivem
 *   dentro do pacote e não entram em nenhum total;
 * - grupos por forma de pagamento são construídos DEPOIS do filtro mensal, então
 *   grupo vazio simplesmente não existe.
 */
import {
  CARD_PAYMENT_METHOD,
  FinanceItem,
  MonthRow,
  PAYMENT_METHODS,
  cardDisplayLabel,
  cycleGapLabel,
  isProjectableInMonth,
} from "@/lib/financeModel";
import { Competence } from "@/lib/financeCardCycle";

/**
 * Cartão em formato SEGURO: é exatamente o que `list_finance_safe_cards`
 * devolve (rótulo e ciclo). Nunca carrega limite nem valores de fatura.
 */
export interface SafeCard {
  id: string;
  bank_name?: string | null;
  card_last4?: string | null;
  statement_closing_day?: number | null;
  statement_due_day?: number | null;
  /** Presente quando o cartão vem do cadastro completo (escopo `full`). */
  name?: string | null;
}

/** Converte um cadastro completo de cartão no formato seguro. */
export function toSafeCard(card: FinanceItem): SafeCard {
  return {
    id: card.id,
    bank_name: card.bank_name ?? card.name ?? null,
    card_last4: card.card_last4 ?? null,
    statement_closing_day: card.statement_closing_day ?? null,
    statement_due_day: card.statement_due_day ?? null,
  };
}

/** Rótulo humano do cartão seguro: `Itaú ••••7587`. */
export function safeCardLabel(card: SafeCard): string {
  return cardDisplayLabel({
    name: card.name ?? card.bank_name ?? "Cartão",
    card_last4: card.card_last4,
  } as FinanceItem);
}

function safeCardCycleWarning(card: SafeCard): string | null {
  return cycleGapLabel({
    statement_closing_day: card.statement_closing_day,
    statement_due_day: card.statement_due_day,
  } as FinanceItem);
}

/** Pai cost-bearing do domínio de assinaturas. */
export function isSubscriptionParent(item: FinanceItem): boolean {
  return item.kind === "tool" || item.kind === "package";
}

/**
 * O cadastro pertence à competência selecionada?
 *
 * A. fato real (occurrence) no mês -> sempre relevante (inclusive histórico);
 * B. cadastro ativo e projetável no mês -> relevante;
 * C. cadastro inativo sem fato real -> NÃO relevante (nunca projetamos inativo).
 */
export function isSubscriptionRelevantForCompetence(
  item: FinanceItem,
  rows: MonthRow[],
  competence: Competence,
): boolean {
  if (!isSubscriptionParent(item)) return false;
  const row = rows.find((r) => r.item.id === item.id) ?? null;
  if (row?.occurrence) return true;
  if (!item.active) return false;
  if (row) return true;
  return isProjectableInMonth(item, competence);
}

export interface SubscriptionEntry {
  item: FinanceItem;
  /** Linha do mês (fato real ou projeção). `null` quando ainda não há linha. */
  row: MonthRow | null;
  /** Recursos incluídos do pacote — nunca somam custo. */
  children: FinanceItem[];
  /** Valor considerado no total do mês (BRL). */
  amountBrl: number;
}

export type SubscriptionGroupKind = "card" | "direct" | "undefined";

export interface SubscriptionMonthGroup {
  key: string;
  title: string;
  kind: SubscriptionGroupKind;
  card: SafeCard | null;
  warning: string | null;
  entries: SubscriptionEntry[];
  total: number;
}

export const UNDEFINED_GROUP_TITLE = "Sem forma de pagamento definida";

function directOrder(method: string): number {
  const idx = PAYMENT_METHODS.filter((m) => m !== CARD_PAYMENT_METHOD).indexOf(method as never);
  return idx === -1 ? PAYMENT_METHODS.length : idx;
}

function matchesTerm(item: FinanceItem, term: string): boolean {
  if (!term) return true;
  return (
    item.name.toLowerCase().includes(term) ||
    (item.purpose ?? "").toLowerCase().includes(term) ||
    (item.category ?? "").toLowerCase().includes(term)
  );
}

/** Recursos incluídos de um pacote (`parent_item_id`). */
export function packageChildren(items: FinanceItem[], packageId: string): FinanceItem[] {
  return items
    .filter((i) => i.kind === "included_resource" && i.parent_item_id === packageId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export interface SubscriptionMonthView {
  groups: SubscriptionMonthGroup[];
  /** Soma dos itens cost-bearing relevantes. Nunca inclui included_resource. */
  total: number;
  /** Quantos cadastros relevantes existem no mês (antes da busca). */
  relevantCount: number;
}

export function buildSubscriptionMonthView(params: {
  items: FinanceItem[];
  rows: MonthRow[];
  cards: SafeCard[];
  competence: Competence;
  search?: string;
}): SubscriptionMonthView {
  const { items, rows, cards, competence } = params;
  const term = (params.search ?? "").trim().toLowerCase();

  const relevant = items.filter((item) =>
    isSubscriptionRelevantForCompetence(item, rows, competence),
  );

  const entries: SubscriptionEntry[] = [];
  for (const item of relevant) {
    const children = item.kind === "package" ? packageChildren(items, item.id) : [];
    // A busca também encontra o pacote pelo nome de um recurso incluído.
    const matched = matchesTerm(item, term) || children.some((c) => matchesTerm(c, term));
    if (!matched) continue;
    const row = rows.find((r) => r.item.id === item.id) ?? null;
    entries.push({
      item,
      row,
      children,
      amountBrl: row?.amountBrl ?? item.default_amount_brl ?? 0,
    });
  }

  const map = new Map<string, SubscriptionMonthGroup>();
  const ensure = (group: Omit<SubscriptionMonthGroup, "entries" | "total">) => {
    const existing = map.get(group.key);
    if (existing) return existing;
    const created: SubscriptionMonthGroup = { ...group, entries: [], total: 0 };
    map.set(group.key, created);
    return created;
  };

  for (const entry of entries) {
    const item = entry.item;
    const cardId = entry.row?.cardItemId ?? item.card_item_id ?? null;
    const card = cardId ? cards.find((c) => c.id === cardId) ?? null : null;
    let group: SubscriptionMonthGroup;

    if (cardId && card) {
      group = ensure({
        key: `card:${card.id}`,
        title: safeCardLabel(card),
        kind: "card",
        card,
        warning: safeCardCycleWarning(card),
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

    group.entries.push(entry);
    group.total += entry.amountBrl;
  }

  const rank = (g: SubscriptionMonthGroup) => (g.kind === "card" ? 0 : g.kind === "direct" ? 1 : 2);

  const groups = Array.from(map.values())
    // Grupo vazio nunca é renderizado — aqui ele nem existe.
    .filter((g) => g.entries.length > 0)
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.kind === "direct" && b.kind === "direct") {
        const diff = directOrder(a.title) - directOrder(b.title);
        if (diff !== 0) return diff;
      }
      return a.title.localeCompare(b.title, "pt-BR");
    });

  for (const group of groups) {
    group.entries.sort((a, b) => a.item.name.localeCompare(b.item.name, "pt-BR"));
  }

  return {
    groups,
    total: groups.reduce((sum, g) => sum + g.total, 0),
    relevantCount: relevant.length,
  };
}

/* -------------------------------------------------------------------------- */
/*                        CATÁLOGO (Gerenciar cadastros)                      */
/* -------------------------------------------------------------------------- */

export type CatalogFilter = "active" | "inactive" | "all";

export interface CatalogEntry {
  item: FinanceItem;
  /** Pacote de origem quando é recurso incluído. */
  parentName: string | null;
}

/**
 * Catálogo de CADASTROS (não é fechamento mensal): mostra ativos e inativos,
 * incluindo recursos incluídos, com busca e filtro de situação.
 */
export function buildSubscriptionCatalog(params: {
  items: FinanceItem[];
  filter: CatalogFilter;
  search?: string;
}): CatalogEntry[] {
  const term = (params.search ?? "").trim().toLowerCase();
  const byId = new Map(params.items.map((i) => [i.id, i]));

  return params.items
    .filter((i) => i.kind === "tool" || i.kind === "package" || i.kind === "included_resource")
    .filter((i) => (params.filter === "all" ? true : params.filter === "active" ? i.active : !i.active))
    .filter((i) => matchesTerm(i, term))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((item) => ({
      item,
      parentName: item.parent_item_id ? byId.get(item.parent_item_id)?.name ?? null : null,
    }));
}
