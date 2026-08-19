import { useCallback, useEffect, useRef, useState } from "react";
import {
  edgeScrollAction,
  hasVerticalOverflow,
  resolveScrollContainer,
  scrollKeyIntent,
  shouldHandleScrollKey,
  type ScrollMetrics,
} from "@/lib/feedScroll";

interface UseEdgeScrollOptions {
  /** Desativa o teclado enquanto um modal/preview está aberto. */
  modalOpen?: boolean;
  /** Dependências que alteram a altura do conteúdo (filtros, nº de cards). */
  revalidateKey?: unknown;
  enabled?: boolean;
}

/**
 * Resolve o scroll container real (o <main> do Layout), habilita
 * PageUp/PageDown/Home/End sem exigir clique prévio e expõe o estado do
 * botão flutuante topo/fim.
 */
export function useEdgeScroll<T extends HTMLElement = HTMLDivElement>({
  modalOpen = false,
  revalidateKey,
  enabled = true,
}: UseEdgeScrollOptions = {}) {
  const anchorRef = useRef<T | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [action, setAction] = useState<"down" | "up">("down");

  const metrics = (el: HTMLElement): ScrollMetrics => ({
    scrollTop: el.scrollTop,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  });

  const sync = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const m = metrics(el);
    setCanScroll(hasVerticalOverflow(m));
    setAction(edgeScrollAction(m));
  }, []);

  // Resolve o container e observa scroll/resize/mutação de conteúdo.
  useEffect(() => {
    if (!enabled) return;
    const el = resolveScrollContainer(anchorRef.current);
    containerRef.current = el;
    if (!el) return;

    sync();
    el.addEventListener("scroll", sync, { passive: true });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    if (anchorRef.current) ro?.observe(anchorRef.current);
    window.addEventListener("resize", sync);

    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, [enabled, sync]);

  // Recalcula quando filtros/quantidade de cards mudam (inclui realtime).
  useEffect(() => {
    if (!enabled) return;
    const id = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(id);
  }, [revalidateKey, enabled, sync]);

  // Teclado global: funciona sem clique prévio, sem atrapalhar campos de texto.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (
        !shouldHandleScrollKey({
          key: e.key,
          target: e.target,
          modalOpen,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
        })
      ) {
        return;
      }
      const intent = scrollKeyIntent(e.key, el.clientHeight);
      if (!intent) return;
      e.preventDefault();
      if (intent.type === "top") el.scrollTo({ top: 0, behavior: "smooth" });
      else if (intent.type === "bottom") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else el.scrollBy({ top: intent.delta, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, modalOpen]);

  const scrollToEdge = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = edgeScrollAction(metrics(el)) === "down" ? el.scrollHeight : 0;
    el.scrollTo({ top: target, behavior: "smooth" });
  }, []);

  return { anchorRef, canScroll, action, scrollToEdge, sync };
}
