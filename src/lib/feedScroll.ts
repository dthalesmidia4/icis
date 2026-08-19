/**
 * Helpers puros de rolagem do Feed Simulado.
 *
 * Motivo: o scroll container real da aplicação é o <main> do Layout
 * (`flex-1 overflow-auto`), que não é focável. Sem foco, as teclas
 * PageUp/PageDown/Home/End iam para o <body> (que não rola) e o usuário
 * precisava clicar dentro do conteúdo antes de rolar pelo teclado.
 * Estes helpers resolvem o container real e traduzem teclas em deslocamento.
 */

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

const SCROLLABLE_OVERFLOW = /(auto|scroll|overlay)/;

/**
 * Sobe a árvore a partir de `el` e devolve o primeiro ancestral que realmente
 * rola verticalmente. Sem candidato, devolve o elemento de rolagem do documento.
 */
export function resolveScrollContainer(
  el: HTMLElement | null,
  getStyle: (node: Element) => { overflowY: string } = (node) =>
    window.getComputedStyle(node)
): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getStyle(node);
    if (SCROLLABLE_OVERFLOW.test(overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return typeof document === "undefined" ? null : (document.scrollingElement as HTMLElement | null);
}

/** Margem de tolerância para considerar que existe overflow real. */
export const OVERFLOW_MARGIN = 24;

export function hasVerticalOverflow(m: ScrollMetrics, margin = OVERFLOW_MARGIN): boolean {
  return m.scrollHeight > m.clientHeight + margin;
}

/**
 * Ação do botão flutuante: na metade superior desce ao fim, na inferior sobe ao topo.
 */
export function edgeScrollAction(m: ScrollMetrics): "down" | "up" {
  return m.scrollTop + m.clientHeight / 2 < m.scrollHeight / 2 ? "down" : "up";
}

export type ScrollKeyIntent =
  | { type: "delta"; delta: number }
  | { type: "top" }
  | { type: "bottom" };

/** Traduz a tecla em intenção de rolagem (≈ uma viewport para Page Up/Down). */
export function scrollKeyIntent(key: string, clientHeight: number): ScrollKeyIntent | null {
  const page = Math.max(clientHeight - 80, 120);
  if (key === "PageDown") return { type: "delta", delta: page };
  if (key === "PageUp") return { type: "delta", delta: -page };
  if (key === "Home") return { type: "top" };
  if (key === "End") return { type: "bottom" };
  return null;
}

/** Nunca sequestrar navegação de campos editáveis. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

/** Só tratamos a tecla quando não há edição em foco e nenhum overlay ativo. */
export function shouldHandleScrollKey(params: {
  key: string;
  target: EventTarget | null;
  modalOpen: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (params.modalOpen) return false;
  if (params.metaKey || params.ctrlKey || params.altKey) return false;
  if (isEditableTarget(params.target)) return false;
  return scrollKeyIntent(params.key, 1000) !== null;
}
