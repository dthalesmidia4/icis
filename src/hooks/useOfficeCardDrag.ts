import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ARRASTE POR PONTEIRO NO ESCRITÓRIO VIRTUAL.
 *
 * O drag-and-drop nativo do HTML5 é frágil aqui (folhas dentro de um painel em
 * portal que se oculta + mesas em containers com `transform: scale()`), então o
 * arraste é feito com pointer events: determinístico, funciona no painel e no
 * monitor, e o alvo é resolvido por posição via `data-office-desk-user`.
 *
 * Este hook é puramente de interação — quem grava é o `onDrop` do consumidor
 * (fluxo canônico de reassign).
 */

export interface OfficeDragState {
  cardId: string;
  title: string;
  /** Mesa de origem (para nunca considerar drop na própria mesa). */
  fromUserId: string | null;
  x: number;
  y: number;
  targetUserId: string | null;
}

interface UseOfficeCardDragOptions {
  /** Soltou sobre uma mesa válida. */
  onDrop: (cardId: string, targetUserId: string) => void;
  /** Ativação do arraste (ex.: ocultar o painel lateral). */
  onDragStart?: (cardId: string) => void;
  onDragEnd?: () => void;
  /** Long-press mínimo para ativar (ms). */
  holdMs?: number;
  /** Distância mínima para ativar por movimento (px). */
  moveThreshold?: number;
}

const DESK_ATTR = "data-office-desk-user";

const deskUserAt = (x: number, y: number): string | null => {
  const el = document.elementFromPoint(x, y);
  const desk = el?.closest?.(`[${DESK_ATTR}]`) as HTMLElement | null;
  return desk?.getAttribute(DESK_ATTR) || null;
};

export function useOfficeCardDrag({
  onDrop,
  onDragStart,
  onDragEnd,
  holdMs = 250,
  moveThreshold = 6,
}: UseOfficeCardDragOptions) {
  const [drag, setDrag] = useState<OfficeDragState | null>(null);
  const pending = useRef<{
    cardId: string;
    title: string;
    fromUserId: string | null;
    x: number;
    y: number;
    pointerId: number;
    timer: number | null;
  } | null>(null);
  const active = useRef(false);
  const suppressClick = useRef(false);

  const reset = useCallback(() => {
    if (pending.current?.timer) window.clearTimeout(pending.current.timer);
    pending.current = null;
    if (active.current) {
      active.current = false;
      onDragEnd?.();
    }
    setDrag(null);
  }, [onDragEnd]);

  const activate = useCallback(
    (x: number, y: number) => {
      const p = pending.current;
      if (!p || active.current) return;
      active.current = true;
      suppressClick.current = true;
      onDragStart?.(p.cardId);
      setDrag({
        cardId: p.cardId,
        title: p.title,
        fromUserId: p.fromUserId,
        x,
        y,
        targetUserId: deskUserAt(x, y),
      });
    },
    [onDragStart],
  );

  /** Handler para `onPointerDown` do elemento arrastável. */
  const startPress = useCallback(
    (
      e: React.PointerEvent,
      card: { id: string; title: string; fromUserId?: string | null },
    ) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (pending.current?.timer) window.clearTimeout(pending.current.timer);
      const x = e.clientX;
      const y = e.clientY;
      pending.current = {
        cardId: card.id,
        title: card.title,
        fromUserId: card.fromUserId ?? null,
        x,
        y,
        pointerId: e.pointerId,
        timer: window.setTimeout(() => {
          const p = pending.current;
          if (p) activate(p.x, p.y);
        }, holdMs),
      };
    },
    [activate, holdMs],
  );

  /** Consome a supressão de clique gerada por um arraste (usar no onClick). */
  const consumeClickSuppression = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || p.pointerId !== e.pointerId) return;
      if (!active.current) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (dist < moveThreshold) return;
        activate(e.clientX, e.clientY);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      e.preventDefault();
      setDrag((prev) =>
        prev
          ? { ...prev, x: e.clientX, y: e.clientY, targetUserId: deskUserAt(e.clientX, e.clientY) }
          : prev,
      );
    };

    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || p.pointerId !== e.pointerId) return;
      const wasActive = active.current;
      const cardId = p.cardId;
      const fromUserId = p.fromUserId;
      const target = wasActive ? deskUserAt(e.clientX, e.clientY) : null;
      reset();
      if (wasActive && target && target !== fromUserId) onDrop(cardId, target);
    };

    const cancel = () => reset();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [activate, moveThreshold, onDrop, reset]);

  return { drag, startPress, consumeClickSuppression, dragging: !!drag };
}

export default useOfficeCardDrag;
