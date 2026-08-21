import { memo } from "react";
import type { DeskObjectKey } from "@/lib/officeDeskObjects";

interface DeskObjectProps {
  objectKey: DeskObjectKey;
  /** Escala em px da altura base do objeto. */
  size?: number;
}

/**
 * Objetos pessoais sobre o tampo — CSS puro, todos pequenos e apoiados na base
 * (`items-end`) para nunca sobrepor monitor ou pilha de papéis.
 */
export const DeskObject = memo(function DeskObject({ objectKey, size = 14 }: DeskObjectProps) {
  const s = (n: number) => Math.round(size * n);

  switch (objectKey) {
    case "mug":
      return (
        <span className="relative block" style={{ width: s(0.85), height: s(0.8) }} aria-hidden="true">
          <span className="absolute inset-0 rounded-b-[3px] rounded-t-[1px] bg-primary/70" />
          <span
            className="absolute rounded-full border-2 border-primary/60"
            style={{ right: -s(0.3), top: s(0.2), width: s(0.4), height: s(0.4) }}
          />
        </span>
      );
    case "plant":
      return (
        <span className="relative flex flex-col items-center" style={{ height: size }} aria-hidden="true">
          <span className="flex items-end gap-[1px]">
            <span className="rounded-full bg-emerald-500/70" style={{ width: s(0.2), height: s(0.5) }} />
            <span className="rounded-full bg-emerald-500/80" style={{ width: s(0.22), height: s(0.7) }} />
            <span className="rounded-full bg-emerald-500/60" style={{ width: s(0.2), height: s(0.45) }} />
          </span>
          <span className="rounded-b-[3px] bg-orange-400/70" style={{ width: s(0.7), height: s(0.35) }} />
        </span>
      );
    case "pen_holder":
      return (
        <span className="relative flex flex-col items-center" style={{ height: size }} aria-hidden="true">
          <span className="flex items-end gap-[1px]">
            <span className="bg-destructive/70" style={{ width: s(0.12), height: s(0.5) }} />
            <span className="bg-primary/70" style={{ width: s(0.12), height: s(0.6) }} />
            <span className="bg-foreground/50" style={{ width: s(0.12), height: s(0.45) }} />
          </span>
          <span className="rounded-b-[2px] bg-muted-foreground/60" style={{ width: s(0.6), height: s(0.4) }} />
        </span>
      );
    case "headphones":
      return (
        <span className="relative block" style={{ width: s(1), height: s(0.7) }} aria-hidden="true">
          <span className="absolute inset-x-0 top-0 rounded-t-full border-2 border-b-0 border-foreground/55" style={{ height: s(0.45) }} />
          <span className="absolute bottom-0 left-0 rounded-[2px] bg-foreground/55" style={{ width: s(0.22), height: s(0.32) }} />
          <span className="absolute bottom-0 right-0 rounded-[2px] bg-foreground/55" style={{ width: s(0.22), height: s(0.32) }} />
        </span>
      );
    case "lamp":
      return (
        <span className="relative flex flex-col items-center" style={{ height: size * 1.1 }} aria-hidden="true">
          <span className="rounded-t-[3px] bg-foreground/55" style={{ width: s(0.55), height: s(0.28), transform: "skewX(-14deg)" }} />
          <span className="bg-foreground/45" style={{ width: s(0.1), height: s(0.6) }} />
          <span className="rounded-full bg-foreground/50" style={{ width: s(0.6), height: s(0.14) }} />
        </span>
      );
    case "notebook":
      return (
        <span className="relative block rounded-[2px] bg-primary/60" style={{ width: s(1), height: s(0.4) }} aria-hidden="true">
          <span className="absolute inset-y-[1px] left-[2px] w-[2px] rounded-full bg-background/70" />
        </span>
      );
    case "photo_frame":
      return (
        <span
          className="relative block rounded-[2px] border-2 border-foreground/45 bg-muted"
          style={{ width: s(0.8), height: s(0.9) }}
          aria-hidden="true"
        >
          <span className="absolute bottom-0 left-0 right-0 h-1/2 bg-primary/25" />
          <span className="absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-primary/50" />
        </span>
      );
    case "mini_calendar":
      return (
        <span
          className="relative block rounded-[2px] border border-border bg-card"
          style={{ width: s(0.85), height: s(0.75) }}
          aria-hidden="true"
        >
          <span className="absolute inset-x-0 top-0 bg-destructive/60" style={{ height: s(0.2) }} />
        </span>
      );
    default:
      return null;
  }
});

export default DeskObject;
