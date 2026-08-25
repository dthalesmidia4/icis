import { memo } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { paperStackVisualMetrics } from "@/lib/paperStack";

interface PaperStackProps {
  /** Total de demandas na fila (excluindo a que está no monitor). */
  queueCount: number;
  awaitingClientCount: number;
  collaboratorName: string;
  onOpenQueue: () => void;
  /** Âncora da pilha para a animação de transferência (registry por userId). */
  anchorRef?: (el: HTMLElement | null) => void;
}

/**
 * PILHA FÍSICA SIMPLES (visualização leve): uma única pilha de folhas anônimas
 * cuja altura reflete o volume da fila, com contador. Clicar abre a fila
 * lateral — nada de agrupamentos nem nomes aqui.
 *
 * A escala visual é progressiva: 1:1 até 6 demandas, depois compressão
 * controlada até o teto de 14 folhas (ver `paperStackVisualMetrics`). O
 * contador mostra o número REAL de demandas.
 */
export const PaperStack = memo(function PaperStack({
  queueCount,
  awaitingClientCount,
  collaboratorName,
  onOpenQueue,
  anchorRef,
}: PaperStackProps) {
  const { sheets, sheetWidth, overload, empty } = paperStackVisualMetrics(queueCount);

  return (
    <div className="flex items-end gap-1.5">
      <div ref={anchorRef} className="flex items-end">
        <button
          type="button"
          onClick={onOpenQueue}
          aria-label={
            empty
              ? `Fila vazia de ${collaboratorName}`
              : `${queueCount} demandas na fila de ${collaboratorName}`
          }
          title={empty ? "Fila vazia" : `${queueCount} na fila`}
          className="flex flex-col items-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {empty ? (
            <span className="h-[3px] w-[30px] rounded-[2px] border border-dashed border-foreground/25" />
          ) : (
            <span className="flex flex-col-reverse gap-[1px]">
              {Array.from({ length: sheets }).map((_, i) => (
                <span
                  key={i}
                  className="block h-[3px] w-[30px] rounded-[2px] border border-border bg-card shadow-[0_1px_1px_-1px_hsl(var(--foreground)/0.5)]"
                  style={{ marginLeft: i % 2 === 0 ? 0 : 1 }}
                />
              ))}
            </span>
          )}
          <span
            className={cn(
              "inline-flex min-w-[18px] items-center justify-center rounded-full border px-1 text-[9px] font-bold leading-[13px] tabular-nums",
              overload
                ? "border-destructive/60 bg-destructive text-destructive-foreground"
                : "border-border bg-background/95 text-foreground",
            )}
          >
            {queueCount}
          </span>
        </button>
      </div>

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
