import { memo } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficeQueueGroup } from "@/lib/officeQueueGroups";
import type { OfficeCard } from "@/hooks/useOfficeOverview";

interface PaperStackProps {
  /** Mini-pilhas por agrupamento (mesma regra da Visão Geral). */
  groups: OfficeQueueGroup<OfficeCard>[];
  queueCount: number;
  awaitingClientCount: number;
  collaboratorName: string;
  onOpenQueue: () => void;
  onOpenCard?: (cardId: string) => void;
  /** Início do arraste de uma folha (transferência entre mesas). */
  onDragCardStart?: (cardId: string) => void;
  onDragCardEnd?: () => void;
  /** Âncora da pilha para a animação de transferência (registry por userId). */
  anchorRef?: (el: HTMLElement | null) => void;
}

/**
 * FILA VISUAL INTERATIVA (leve): cada agrupamento vira uma mini-pilha com
 * folhas nomeadas. O DOM é constante — no máximo `visible` folhas por grupo,
 * o excedente aparece como `+N`. Nada de TaskCard aqui.
 */
export const PaperStack = memo(function PaperStack({
  groups,
  queueCount,
  awaitingClientCount,
  collaboratorName,
  onOpenQueue,
  onOpenCard,
  onDragCardStart,
  onDragCardEnd,
  anchorRef,
}: PaperStackProps) {
  const overload = queueCount >= 16;
  const empty = queueCount === 0;

  return (
    <div className="flex items-end gap-1.5">
      <div ref={anchorRef} className="flex max-w-[150px] items-end gap-1">
        {empty ? (
          <button
            type="button"
            onClick={onOpenQueue}
            aria-label={`Fila vazia de ${collaboratorName}`}
            title="Fila vazia"
            className="flex flex-col items-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="h-[3px] w-[30px] rounded-[2px] border border-dashed border-foreground/25" />
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full border border-border bg-background/95 px-1 text-[9px] font-bold leading-[13px] tabular-nums">
              0
            </span>
          </button>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="flex w-[58px] flex-col items-stretch gap-[1px]">
              {/* folhas nomeadas (de cima para baixo) */}
              <div className="flex flex-col-reverse gap-[1px]">
                {group.visible.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.id);
                      e.dataTransfer.effectAllowed = "move";
                      onDragCardStart?.(card.id);
                    }}
                    onDragEnd={() => onDragCardEnd?.()}
                    onClick={() => onOpenCard?.(card.id)}
                    title={`${card.stageLabel} · ${card.title}`}
                    className={cn(
                      "block w-full cursor-grab truncate rounded-[2px] border border-border bg-card px-[2px] text-left text-[7px] font-medium leading-[11px]",
                      "shadow-[0_1px_1px_-1px_hsl(var(--foreground)/0.5)] outline-none transition-colors",
                      "hover:border-primary/60 hover:text-primary focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing",
                    )}
                  >
                    {card.title}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onOpenQueue}
                aria-label={`${group.total} demandas em ${group.label} na fila de ${collaboratorName}`}
                className="flex items-center justify-between gap-[2px] rounded-[2px] px-[2px] text-[7px] leading-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="truncate font-semibold text-muted-foreground">{group.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-[3px] font-bold tabular-nums",
                    overload
                      ? "border-destructive/60 bg-destructive text-destructive-foreground"
                      : "border-border bg-background/95 text-foreground",
                  )}
                >
                  {group.overflow > 0 ? `+${group.overflow}` : group.total}
                </span>
              </button>
            </div>
          ))
        )}
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
