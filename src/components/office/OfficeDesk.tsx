import { memo, useState } from "react";
import { AlertTriangle, Clock, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";
import OfficeCharacter from "./OfficeCharacter";
import PaperStack from "./PaperStack";
import DeskObject from "./DeskObject";
import DeskCustomizeDialog from "./DeskCustomizeDialog";
import { assignDeskSlots, type DeskObjectKey } from "@/lib/officeDeskObjects";

const timeLabel = (date?: string | null, time?: string | null) => {
  if (!date) return null;
  const [, m, d] = date.split("-");
  return `${d}/${m}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

interface OfficeDeskProps {
  station: OfficeStationData;
  onOpenCard: (cardId: string) => void;
  onOpenQueue: (userId: string) => void;
  /** Objetos pessoais salvos desta mesa. */
  deskObjects?: DeskObjectKey[];
  /** É a mesa do usuário logado (única que pode ser personalizada). */
  isSelf?: boolean;
  onSaveDeskObjects?: (objects: DeskObjectKey[]) => void | Promise<unknown>;
}

/**
 * Estação física: cadeira + personagem atrás, tampo cobrindo parte do torso e
 * monitor/pilha/objetos pessoais apoiados sobre a mesa (2.5D por z-index).
 */
export const OfficeDesk = memo(function OfficeDesk({
  station,
  onOpenCard,
  onOpenQueue,
  deskObjects = [],
  isSelf = false,
  onSaveDeskObjects,
}: OfficeDeskProps) {
  const { collaborator, current, next, queueCount, awaitingClientCount, presence } = station;
  const [editing, setEditing] = useState(false);
  const working = presence.state === "working_now" && !!current;
  const away = presence.state === "micro_break";
  const monitorCard = current || next;
  const slots = assignDeskSlots(deskObjects);
  const objectAt = (slot: string) => slots.find((s) => s.slot === slot)?.key;

  return (
    <div className="group/desk relative w-full select-none">
      {/* ---------- cadeira + personagem (camada de trás) ---------- */}
      <div className="relative z-10 flex justify-center" style={{ marginBottom: -30 }}>
        {away ? (
          // cadeira vazia: a pessoa está na cafeteria
          <span aria-hidden="true" className="flex flex-col items-center opacity-70">
            <span className="h-7 w-11 rounded-t-md bg-foreground/20 dark:bg-foreground/25" />
            <span className="h-1 w-12 rounded-sm bg-foreground/25" />
          </span>
        ) : (
          <OfficeCharacter
            name={collaborator.fullName}
            avatarUrl={collaborator.avatarUrl}
            working={working}
            size={56}
          />
        )}
      </div>

      {/* ---------- objetos sobre o tampo (camada da frente) ---------- */}
      <div className="relative z-30 -mb-[7px] flex items-end justify-between gap-1 px-3">
        <span className="flex items-end pb-[2px]">
          {objectAt("left") && <DeskObject objectKey={objectAt("left")!} size={13} />}
        </span>

        {/* monitor */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <button
            type="button"
            onClick={() => monitorCard && onOpenCard(monitorCard.id)}
            disabled={!monitorCard}
            aria-label={monitorCard ? `Abrir card ${monitorCard.title}` : "Monitor em standby"}
            className={cn(
              "relative w-full overflow-hidden rounded-[4px] border-[3px] bg-card px-1.5 py-1 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              working ? "border-foreground/30" : "border-foreground/15",
              current?.isLate && "border-destructive/60",
              monitorCard
                ? "hover:border-primary/70 hover:shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]"
                : "cursor-default",
            )}
            style={{ minHeight: 54 }}
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
                      working ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {working ? "Em andamento" : "Próximo"}
                    {working && <span className="animate-office-caret motion-reduce:animate-none">▌</span>}
                  </span>
                  {current?.isLate && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-destructive" />}
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
              <div className="relative flex min-h-[46px] flex-col items-center justify-center gap-1 text-muted-foreground">
                <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-muted-foreground/30" />
                <span className="text-[9px]">Standby</span>
              </div>
            )}
          </button>
          {/* pé do monitor + teclado */}
          <span aria-hidden="true" className="h-1.5 w-4 bg-foreground/25" />
          <span aria-hidden="true" className="h-[3px] w-10 rounded-sm bg-foreground/30" />
          <span
            aria-hidden="true"
            className="mt-[2px] h-[5px] w-[58%] rounded-[2px] bg-foreground/15 dark:bg-foreground/25"
          />
        </div>

        <span className="flex items-end pb-[2px]">
          {objectAt("center-side") && <DeskObject objectKey={objectAt("center-side")!} size={13} />}
        </span>

        {/* pilha física da fila */}
        <PaperStack
          queueCount={queueCount}
          awaitingClientCount={awaitingClientCount}
          collaboratorName={collaborator.fullName}
          onOpenQueue={() => onOpenQueue(collaborator.userId)}
        />

        <span className="flex items-end pb-[2px]">
          {objectAt("right") && <DeskObject objectKey={objectAt("right")!} size={13} />}
        </span>
      </div>

      {/* ---------- mesa (cobre parte do torso) ---------- */}
      <div className="relative z-20">
        <div
          aria-hidden="true"
          className="h-[9px] rounded-t-[4px] bg-gradient-to-b from-foreground/30 to-foreground/18 dark:from-foreground/35 dark:to-foreground/22"
          style={{ clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)" }}
        />
        <div className="relative rounded-b-[5px] bg-gradient-to-b from-muted to-muted/50 px-2 pb-1 pt-[3px] shadow-[0_6px_10px_-8px_hsl(var(--foreground)/0.6)]">
          {/* plaquinha frontal com o nome */}
          <p className="mx-auto w-fit max-w-full truncate rounded-[2px] border border-border/70 bg-background/70 px-1.5 text-[9px] font-semibold leading-4">
            {collaborator.fullName}
          </p>

          {isSelf && onSaveDeskObjects && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Personalizar mesa"
              title="Personalizar mesa"
              className="absolute right-1 top-1 rounded-full border border-border bg-background/85 p-[3px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/desk:opacity-100"
            >
              <Settings2 className="h-2.5 w-2.5" />
            </button>
          )}
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

      {isSelf && onSaveDeskObjects && (
        <DeskCustomizeDialog
          open={editing}
          onOpenChange={setEditing}
          value={deskObjects}
          onSave={onSaveDeskObjects}
        />
      )}
    </div>
  );
});

export default OfficeDesk;
