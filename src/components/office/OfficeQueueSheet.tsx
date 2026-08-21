import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";

interface OfficeQueueSheetProps {
  station: OfficeStationData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCard: (cardId: string) => void;
}

const timeLabel = (date?: string | null, time?: string | null) => {
  if (!date) return "sem início";
  const [, m, d] = date.split("-");
  return `${d}/${m}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

/** Painel lateral read-only com a fila de execução de um colaborador. */
export function OfficeQueueSheet({ station, open, onOpenChange, onOpenCard }: OfficeQueueSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{station?.collaborator.fullName || "Fila"}</SheetTitle>
          <SheetDescription>
            {station
              ? `${station.queueCount} na fila${
                  station.awaitingClientCount > 0 ? ` · ${station.awaitingClientCount} aguardando cliente` : ""
                }`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-8rem)] pr-3">
          <div className="space-y-2">
            {(station?.queue || []).map((card, index) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpenCard(card.id)}
                className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">#{index + 1}</span>
                  {card.id === station?.current?.id && (
                    <Badge className="text-[10px]">Em andamento</Badge>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{card.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {card.clientName || "Sem cliente"} · {card.stageLabel}
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
      </SheetContent>
    </Sheet>
  );
}

export default OfficeQueueSheet;
