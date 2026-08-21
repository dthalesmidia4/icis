import { memo } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { paperStackShape } from "@/lib/officeLayout";

interface PaperStackProps {
  queueCount: number;
  awaitingClientCount: number;
  collaboratorName: string;
  onOpenQueue: () => void;
}

/**
 * Pilha física de folhas sobre a mesa: leitura principal da carga de trabalho.
 * Número máximo de camadas é limitado (~8) e o restante vira altura + contador.
 */
export const PaperStack = memo(function PaperStack({
  queueCount,
  awaitingClientCount,
  collaboratorName,
  onOpenQueue,
}: PaperStackProps) {
  const { sheets, step } = paperStackShape(queueCount);
  const stackHeight = Math.max(10, sheets * step + 6);

  return (
    <div className="flex items-end gap-1.5">
      <button
        type="button"
        onClick={onOpenQueue}
        aria-label={`${queueCount} demandas na fila de ${collaboratorName}`}
        title={`${queueCount} na fila`}
        className="group/stack relative flex flex-col items-center rounded-sm outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative block w-[34px]" style={{ height: stackHeight }}>
          {sheets === 0 ? (
            // Bandeja vazia: mesa limpa.
            <span className="absolute bottom-0 left-0 h-2 w-[32px] rounded-[2px] border border-dashed border-foreground/25" />
          ) : (
            Array.from({ length: sheets }).map((_, i) => (
              <span
                key={i}
                className="absolute h-[6px] w-[30px] rounded-[2px] border border-border bg-card shadow-[0_1px_1px_-1px_hsl(var(--foreground)/0.5)] transition-colors group-hover/stack:border-primary/50"
                style={{ bottom: i * step, left: (i % 3) * 1.6 }}
              />
            ))
          )}
        </span>
        <span
          className={cn(
            "-mt-0.5 rounded-full border px-1.5 text-[9px] font-bold leading-4 tabular-nums",
            queueCount > 15
              ? "border-destructive/40 bg-destructive/15 text-destructive"
              : "border-border bg-background/85 text-foreground",
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
          <span className="flex h-[14px] w-[22px] items-end justify-center rounded-[2px] border border-dashed border-foreground/30 bg-background/70">
            <Inbox className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
          <span className="text-[9px] font-semibold leading-3 tabular-nums text-muted-foreground">
            {awaitingClientCount}
          </span>
        </button>
      )}
    </div>
  );
});

export default PaperStack;
