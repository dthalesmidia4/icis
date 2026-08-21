import { useEffect, useRef, type RefObject } from "react";
import type { TransferEvent } from "@/lib/officeTransfers";
import { transferKey } from "@/lib/officeTransfers";

export interface QueuedTransfer extends TransferEvent {
  /** chave única do disparo (permite o mesmo trajeto de novo mais tarde). */
  key: string;
}

interface OfficeTransferLayerProps {
  /** Container do mundo (referência para calcular coordenadas relativas). */
  containerRef: RefObject<HTMLElement>;
  /** Âncora (pilha de papéis) de cada colaborador, por userId. */
  anchors: RefObject<Map<string, HTMLElement>>;
  /** Lista append-only de transferências detectadas. */
  events: QueuedTransfer[];
}

const MAX_CONCURRENT = 3;
const DURATION = 4200;

/**
 * Camada de OVERLAY do escritório: desenha um "ghost card" (folha física) que
 * viaja da pilha de origem até a pilha de destino. Puramente representacional —
 * não move nós reais nem altera contadores (o realtime já faz isso).
 */
export default function OfficeTransferLayer({
  containerRef,
  anchors,
  events,
}: OfficeTransferLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const pending = useRef<QueuedTransfer[]>([]);
  const active = useRef(0);
  const cleanups = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    const layer = layerRef.current;
    const container = containerRef.current;
    if (!layer || !container) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const pulse = (el: HTMLElement, kind: "nudge" | "bounce") => {
      el.classList.add(kind === "nudge" ? "office-nudge" : "office-bounce");
      const t = window.setTimeout(
        () => el.classList.remove(kind === "nudge" ? "office-nudge" : "office-bounce"),
        1600,
      );
      const undo = () => window.clearTimeout(t);
      cleanups.current.add(undo);
    };

    const run = (ev: QueuedTransfer) => {
      const from = anchors.current?.get(ev.fromUserId);
      const to = anchors.current?.get(ev.toUserId);
      // Estação fora da tela (filtro de área) => não anima.
      if (!from || !to) {
        pump();
        return;
      }

      const base = container.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const p1 = { x: a.left - base.left + a.width / 2, y: a.top - base.top + a.height / 2 };
      const p2 = { x: b.left - base.left + b.width / 2, y: b.top - base.top + b.height / 2 };

      pulse(from, "nudge");

      if (reduced) {
        pulse(to, "bounce");
        pump();
        return;
      }

      active.current += 1;
      const ghost = document.createElement("div");
      ghost.className =
        "pointer-events-none absolute z-50 w-[86px] rounded-[3px] border border-border bg-card px-1.5 py-1 text-[9px] font-semibold leading-tight text-foreground shadow-[0_4px_10px_-4px_hsl(var(--foreground)/0.6)]";
      ghost.style.left = "0px";
      ghost.style.top = "0px";
      ghost.innerHTML = `<span aria-hidden="true" style="display:block;font-size:8px;opacity:.7">→ transferido</span>`;
      const title = document.createElement("span");
      title.textContent = ev.title;
      title.style.display = "-webkit-box";
      title.style.webkitBoxOrient = "vertical";
      (title.style as any).WebkitLineClamp = "2";
      title.style.overflow = "hidden";
      ghost.appendChild(title);
      layer.appendChild(ghost);

      const midX = (p1.x + p2.x) / 2;
      const midY = Math.min(p1.y, p2.y) - 60;

      const animation = ghost.animate(
        [
          { transform: `translate(${p1.x - 43}px, ${p1.y - 14}px) scale(0.7) rotate(-3deg)`, opacity: 0 },
          { transform: `translate(${p1.x - 43}px, ${p1.y - 34}px) scale(1) rotate(-2deg)`, opacity: 1, offset: 0.12 },
          // pausa na origem: dá tempo de ver de quem saiu
          { transform: `translate(${p1.x - 43}px, ${p1.y - 36}px) scale(1) rotate(-2deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${midX - 43}px, ${midY}px) scale(1.04) rotate(4deg)`, opacity: 1, offset: 0.62 },
          // pausa no destino antes de desaparecer
          { transform: `translate(${p2.x - 43}px, ${p2.y - 26}px) scale(0.95) rotate(0deg)`, opacity: 1, offset: 0.86 },
          { transform: `translate(${p2.x - 43}px, ${p2.y - 20}px) scale(0.82) rotate(0deg)`, opacity: 0 },
        ],
        { duration: DURATION, easing: "cubic-bezier(.4,.2,.4,.9)", fill: "forwards" },
      );

      const finish = () => {
        ghost.remove();
        active.current = Math.max(0, active.current - 1);
        const dest = anchors.current?.get(ev.toUserId);
        if (dest) pulse(dest, "bounce");
        pump();
      };
      animation.onfinish = finish;
      animation.oncancel = () => {
        ghost.remove();
        active.current = Math.max(0, active.current - 1);
      };
      cleanups.current.add(() => animation.cancel());
    };

    const pump = () => {
      while (active.current < MAX_CONCURRENT && pending.current.length > 0) {
        const next = pending.current.shift();
        if (next) run(next);
      }
    };

    events.forEach((ev) => {
      if (seen.current.has(ev.key)) return;
      seen.current.add(ev.key);
      pending.current.push(ev);
    });
    pump();
  }, [events, anchors, containerRef]);

  // Cleanup ao desmontar o /escritorio.
  useEffect(
    () => () => {
      cleanups.current.forEach((fn) => fn());
      cleanups.current.clear();
      pending.current = [];
      active.current = 0;
    },
    [],
  );

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
    />
  );
}

export { transferKey };
