import { memo } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { paperStackShape } from "@/lib/officeLayout";

interface PaperStackProps {
  queueCount: number;
  awaitingClientCount: number;
  collaboratorName: string;
  onOpenQueue: () => void;
  /** Âncora da pilha para a animação de transferência (registry por userId). */
  anchorRef?: (el: HTMLElement | null) => void;
}

/**
 * Pilha física de folhas apoiada no tampo + contador IMEDIATAMENTE ABAIXO da
 * pilha (parte visual da própria pilha, nunca junto ao nome do colaborador).
 * Volume alto (16+) sinaliza em vermelho/destructive apenas no badge.
 */
export const PaperStack = memo(function PaperStack({
  queueCount,
  awaitingClientCount,
  collaboratorName,
  onOpenQueue,
  anchorRef,
}: PaperStackProps) {
  const { sheets, step, overload } = paperStackShape(queueCount);
  const stackHeight = Math.max(6, sheets * step + 5);

  return (
    <div className="flex items-end gap-1.5">
      <button
        type="button"
        ref={anchorRef}
        onClick={onOpenQueue}
        aria-label={`${queueCount} demandas na fila de ${collaboratorName}`}
        title={`${queueCount} na fila`}
        className="group/stack flex flex-col items-center justify-end rounded-sm outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
      >

        <span className="relative block w-[32px]" style={{ height: stackHeight }}>
          {sheets === 0 ? (
            <span className="absolute bottom-0 left-0 h-[3px] w-[30px] rounded-[2px] border border-dashed border-foreground/25" />
          ) : (
            Array.from({ length: sheets }).map((_, i) => (
              <span
                key={i}
                className="absolute h-[5px] w-[28px] rounded-[2px] border border-border bg-card shadow-[0_1px_1px_-1px_hsl(var(--foreground)/0.5)] transition-colors group-hover/stack:border-primary/50"
                style={{ bottom: i * step, left: (i % 3) * 1.2 }}
              />
            ))
          )}
        </span>
        {/* contador da pilha: encostado logo abaixo dela, sobre o tampo */}
        <span
          className={cn(
            "-mt-[1px] inline-flex min-w-[18px] items-center justify-center rounded-full border px-1 text-[9px] font-bold leading-[13px] tabular-nums shadow-sm",
            overload
              ? "border-destructive/60 bg-destructive text-destructive-foreground"
              : "border-border bg-background/95 text-foreground",
          )}
        >
          {queueCount}
        </span>
      </button>

      {awaitingClientCount > 0 && (
        <button
          type="button"
          onClick={onOpenQueue}
          aria-label={`${awaitingClientCount} aguardando cliente`}
          title={`${awaitingClientCount} aguardando cliente`}
          className="flex flex-col items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-[12px] w-[22px] items-end justify-center rounded-[2px] border border-dashed border-foreground/30 bg-background/70">
            <Inbox className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
          <span className="text-[8px] font-semibold leading-3 tabular-nums text-muted-foreground">
            {awaitingClientCount}
          </span>
        </button>
      )}
    </div>
  );
});

export default PaperStack;
