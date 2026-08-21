/**
 * AGRUPAMENTO DA FILA NO ESCRITÓRIO VIRTUAL (puro, sem rede).
 *
 * Espelha a regra canônica de agrupamento por data usada na Visão Geral /
 * modo foco: o card é agrupado pela data de INÍCIO (`due_date`), exceto quando
 * ele começou antes de hoje e ainda termina hoje ou depois — nesse caso ele
 * pertence ao grupo de HOJE (card em andamento atravessando dias).
 *
 * Aqui só existe representação visual: nada é gravado nem reordenado.
 */

export interface OfficeQueueGroupItem {
  id: string;
  title: string;
  stageLabel?: string;
  dueDate?: string | null;
  deliveryDate?: string | null;
}

export interface OfficeQueueGroup<T extends OfficeQueueGroupItem = OfficeQueueGroupItem> {
  key: string;
  label: string;
  /** Total de cards do agrupamento (inclusive os não renderizados). */
  total: number;
  /** Itens efetivamente renderizados na mini-pilha. */
  visible: T[];
  /** Quantos ficaram fora da renderização (badge `+N`). */
  overflow: number;
}

const NO_DATE = "__sem_data__";

const shiftISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const dayLabel = (iso: string, todayISO: string): string => {
  if (iso === todayISO) return "Hoje";
  if (iso === shiftISO(todayISO, 1)) return "Amanhã";
  if (iso === shiftISO(todayISO, -1)) return "Ontem";
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
};

/** Data-chave canônica do card (mesma leitura da Visão Geral, modo "início"). */
export function queueGroupKey(item: OfficeQueueGroupItem, todayISO: string): string {
  const start = item.dueDate || null;
  const end = item.deliveryDate || null;
  if (!start) return end && end >= todayISO ? todayISO : NO_DATE;
  if (start < todayISO && end && end >= todayISO) return todayISO;
  return start;
}

export interface GroupOfficeQueueOptions {
  todayISO: string;
  /** Itens renderizados por mini-pilha (default 4). */
  visibleLimit?: number;
  /** Mini-pilhas renderizadas (default 3); o excedente vira um grupo resumo. */
  maxGroups?: number;
}

/**
 * Agrupa a fila em mini-pilhas com DOM constante: no máximo
 * `maxGroups` grupos × `visibleLimit` itens, independentemente do volume.
 */
export function groupOfficeQueue<T extends OfficeQueueGroupItem>(
  items: T[],
  opts: GroupOfficeQueueOptions,
): OfficeQueueGroup<T>[] {
  const visibleLimit = Math.max(1, opts.visibleLimit ?? 4);
  const maxGroups = Math.max(1, opts.maxGroups ?? 3);
  const buckets = new Map<string, T[]>();

  items.forEach((item) => {
    if (!item?.id) return;
    const key = queueGroupKey(item, opts.todayISO);
    const list = buckets.get(key) || [];
    list.push(item);
    buckets.set(key, list);
  });

  const ordered = Array.from(buckets.entries()).sort(([a], [b]) => {
    if (a === NO_DATE) return 1;
    if (b === NO_DATE) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const head = ordered.slice(0, maxGroups).map(([key, list]) => ({
    key,
    label: key === NO_DATE ? "Sem data" : dayLabel(key, opts.todayISO),
    total: list.length,
    visible: list.slice(0, visibleLimit),
    overflow: Math.max(0, list.length - visibleLimit),
  }));

  const rest = ordered.slice(maxGroups);
  if (rest.length > 0) {
    const total = rest.reduce((sum, [, list]) => sum + list.length, 0);
    head.push({
      key: "__depois__",
      label: "Depois",
      total,
      visible: [],
      overflow: total,
    });
  }

  return head;
}
