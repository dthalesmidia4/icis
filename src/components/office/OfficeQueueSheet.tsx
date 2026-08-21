import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";

interface OfficeQueueSheetProps {
  station: OfficeStationData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCard: (cardId: string) => void;
  /** Segurar/arrastar um card daqui: o painel se oculta para liberar as mesas. */
  onDragCardStart?: (cardId: string) => void;
  onDragCardEnd?: () => void;
}

const timeLabel = (date?: string | null, time?: string | null) => {
  if (!date) return "sem início";
  const [, m, d] = date.split("-");
  return `${d}/${m}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

/**
 * Painel lateral read-only com a fila de um colaborador.
 *
 * Ele é NÃO-MODAL e é apenas OCULTADO durante o arraste (nunca desmontado):
 * desmontar a folha em pleno drag cancela o HTML5 drag-and-drop e deixa
 * destaque preso nas mesas.
 */
export function OfficeQueueSheet({
  station,
  open,
  onOpenChange,
  onOpenCard,
  onDragCardStart,
  onDragCardEnd,
}: OfficeQueueSheetProps) {
  const [dragging, setDragging] = useState(false);

  // Rede de segurança: qualquer fim de arraste na janela restaura o painel.
  useEffect(() => {
    if (!dragging) return;
    const clear = () => setDragging(false);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, [dragging]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-4 border-l bg-background p-6 shadow-lg transition-opacity sm:max-w-md",
            dragging && "pointer-events-none opacity-0",
          )}
        >
          <div className="flex flex-col space-y-1 text-left">
            <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
              {station?.collaborator.fullName || "Fila"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {station
                ? `${station.queueCount} na fila${
                    station.awaitingClientCount > 0
                      ? ` · ${station.awaitingClientCount} aguardando cliente`
                      : ""
                  }`
                : ""}
            </DialogPrimitive.Description>
          </div>

          <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
            <div className="space-y-2">
              {(station?.queue || []).map((card, index) => (
                <button
                  key={card.id}
                  type="button"
                  draggable={!!onDragCardStart}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", card.id);
                    e.dataTransfer.effectAllowed = "move";
                    onDragCardStart?.(card.id);
                    setDragging(true);
                  }}
                  onDragEnd={() => {
                    setDragging(false);
                    onDragCardEnd?.();
                  }}
                  onClick={() => onOpenCard(card.id)}
                  className="w-full cursor-grab rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground">#{index + 1}</span>
                    {card.id === station?.current?.id && (
                      <Badge className="text-[10px]">Em andamento</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{card.title}</p>
                  <p className="flex items-baseline gap-1 text-xs">
                    <span className="shrink-0 font-semibold text-foreground">{card.stageLabel}</span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      para {card.clientName || "Sem cliente"}
                    </span>
                  </p>

                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {timeLabel(card.dueDate, card.dueTime)}
                  </p>
                </button>
              ))}
              {station && station.queue.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma demanda na fila.</p>
              )}
            </div>
          </ScrollArea>

          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Fechar fila"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default OfficeQueueSheet;
