import { memo } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";
import OfficeCharacter from "./OfficeCharacter";
import PaperStack from "./PaperStack";

const timeLabel = (date?: string | null, time?: string | null) => {
  if (!date) return null;
  const [, m, d] = date.split("-");
  return `${d}/${m}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

interface OfficeDeskProps {
  station: OfficeStationData;
  onOpenCard: (cardId: string) => void;
  onOpenQueue: (userId: string) => void;
}

/**
 * Estação física: personagem sentado, mesa em leve perspectiva, monitor
 * proporcional com o card atual e pilha de papéis com a fila.
 */
export const OfficeDesk = memo(function OfficeDesk({
  station,
  onOpenCard,
  onOpenQueue,
}: OfficeDeskProps) {
  const { collaborator, current, next, queueCount, awaitingClientCount, loadRatio } = station;
  const working = !!current;
  const monitorCard = current || next;

  return (
    <div className="relative w-full select-none">
      {/* personagem atrás da mesa */}
      <div className="relative z-0 flex justify-center pb-1">
        <OfficeCharacter
          name={collaborator.fullName}
          avatarUrl={collaborator.avatarUrl}
          working={working}
        />
      </div>

      {/* objetos sobre o tampo */}
      <div className="relative z-20 -mb-1 flex items-end justify-between gap-1 px-3">
        {/* monitor */}
        <div className="ml-1 flex min-w-0 flex-col items-center" style={{ width: "58%" }}>
          <button
            type="button"
            onClick={() => monitorCard && onOpenCard(monitorCard.id)}
            disabled={!monitorCard}
            aria-label={monitorCard ? `Abrir card ${monitorCard.title}` : "Monitor em standby"}
            className={cn(
              "relative w-full overflow-hidden rounded-[4px] border-[3px] bg-card px-1.5 py-1 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              working ? "border-foreground/30" : "border-foreground/15",
              current?.isLate && "border-destructive/60",
              monitorCard ? "hover:border-primary/70 hover:shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]" : "cursor-default",
            )}
            style={{ minHeight: 60 }}
          >
            {working && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 animate-office-screen-glow bg-gradient-to-br from-primary/15 via-transparent to-transparent motion-reduce:animate-none"
              />
            )}

            {monitorCard ? (
              <div className="relative space-y-0.5">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-[2px] px-1 py-[1px] text-[8px] font-bold uppercase tracking-wide",
                      current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {current ? "Em andamento" : "Próximo"}
                    {current && <span className="animate-office-caret motion-reduce:animate-none">▌</span>}
                  </span>
                  {current?.isLate && (
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-destructive" />
                  )}
                </div>
                <p className="line-clamp-2 text-[11px] font-semibold leading-tight">{monitorCard.title}</p>
                <p className="truncate text-[9px] leading-tight text-muted-foreground">
                  {monitorCard.clientName || "Sem cliente"} · {monitorCard.stageLabel}
                </p>
                {timeLabel(monitorCard.dueDate, monitorCard.dueTime) && (
                  <p className="flex items-center gap-0.5 text-[8px] leading-tight text-muted-foreground">
                    <Clock className="h-2 w-2" />
                    {timeLabel(monitorCard.dueDate, monitorCard.dueTime)}
                  </p>
                )}
              </div>
            ) : (
              <div className="relative flex min-h-[52px] flex-col items-center justify-center gap-1 text-muted-foreground">
                <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-muted-foreground/30" />
                <span className="text-[9px]">Standby</span>
              </div>
            )}
          </button>
          {/* pé do monitor + teclado */}
          <span aria-hidden="true" className="h-1.5 w-4 bg-foreground/25" />
          <span aria-hidden="true" className="h-[3px] w-10 rounded-sm bg-foreground/30" />
          <span aria-hidden="true" className="mt-[3px] h-[5px] w-[52%] rounded-[2px] bg-foreground/15 dark:bg-foreground/25" />
        </div>

        {/* pilha física da fila */}
        <PaperStack
          queueCount={queueCount}
          awaitingClientCount={awaitingClientCount}
          collaboratorName={collaborator.fullName}
          onOpenQueue={() => onOpenQueue(collaborator.userId)}
        />
      </div>

      {/* mesa */}
      <div className="relative z-10">
        <div
          aria-hidden="true"
          className="h-[9px] rounded-t-[4px] bg-gradient-to-b from-foreground/30 to-foreground/18 dark:from-foreground/35 dark:to-foreground/22"
          style={{ clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)" }}
        />
        <div className="relative rounded-b-[5px] bg-gradient-to-b from-muted to-muted/50 px-2 pb-1 pt-1 shadow-[0_6px_10px_-8px_hsl(var(--foreground)/0.6)]">
          <p className="truncate text-center text-[10px] font-semibold leading-tight">
            {collaborator.fullName}
          </p>
          {/* carga relativa: detalhe mínimo no rodapé da mesa */}
          <span aria-hidden="true" className="mt-0.5 block h-[2px] w-full rounded-full bg-foreground/10">
            <span
              className={cn("block h-full rounded-full", queueCount > 15 ? "bg-destructive/60" : "bg-primary/60")}
              style={{ width: `${Math.round(loadRatio * 100)}%` }}
            />
          </span>
        </div>
        {/* pernas */}
        <div aria-hidden="true" className="flex justify-between px-3">
          <span className="h-3 w-[3px] bg-foreground/25" />
          <span className="h-3 w-[3px] bg-foreground/25" />
        </div>
        {/* sombra de contato */}
        <div
          aria-hidden="true"
          className="mx-auto h-1.5 w-[85%] rounded-[50%] bg-foreground/15 blur-[2px] dark:bg-background/60"
        />
      </div>
    </div>
  );
});

export default OfficeDesk;
