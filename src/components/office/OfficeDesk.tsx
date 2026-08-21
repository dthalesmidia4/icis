import { memo, useState } from "react";
import { AlertTriangle, Clock, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";
import { useNowTick } from "@/hooks/useNowTick";
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

/** Progresso temporal do card atual (0..1) — nunca reflete volume de fila. */
const cardProgress = (start: number | null, end: number | null, now: number): number | null => {
  if (!start || !end || end <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
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
  /** Registra a pilha desta mesa como origem/destino da animação. */
  registerStackAnchor?: (userId: string, el: HTMLElement | null) => void;
}

/**
 * Estação física: personagem AO LADO do monitor (sempre visível, com braços
 * animados), monitor no centro, objetos pessoais e pilha de papéis à direita.
 * O contador da fila fica na base da mesa, ligado à pilha.
 */
export const OfficeDesk = memo(function OfficeDesk({
  station,
  onOpenCard,
  onOpenQueue,
  deskObjects = [],
  isSelf = false,
  onSaveDeskObjects,
  registerStackAnchor,
}: OfficeDeskProps) {

  const { collaborator, current, next, queueCount, awaitingClientCount, presence } = station;
  const [editing, setEditing] = useState(false);
  const working = presence.state === "working_now" && !!current;
  const onBreak = presence.state === "official_break";
  const offShift = presence.state === "off_shift";
  // Cadeira vazia: micro-pausa (café), intervalo oficial e fora do expediente.
  const away = presence.state === "micro_break" || onBreak || offShift;
  const statusLabel = working
    ? "Em andamento"
    : onBreak
      ? "Intervalo"
      : offShift
        ? "Fora do expediente"
        : "Próximo";
  const monitorCard = current || next;
  const slots = assignDeskSlots(deskObjects);
  const now = useNowTick(60_000);
  // Barra discreta na base da mesa: SÓ o card atual, progresso temporal real.
  const progress = current ? cardProgress(current.startTs, current.endTs, now) : null;


  return (
    <div className="group/desk relative w-full select-none">
      {/* ---------- tudo que fica APOIADO/ATRÁS do tampo ---------- */}
      <div className="relative z-30 -mb-[8px] flex items-end justify-between gap-1 px-2">
        {/* personagem ao lado do monitor (com cadeira discreta atrás) */}
        <div className="relative flex shrink-0 flex-col items-center pb-[2px]">
          {away ? (
            <span aria-hidden="true" className="flex flex-col items-center opacity-70">
              <span className="h-8 w-9 rounded-t-md bg-foreground/20 dark:bg-foreground/25" />
              <span className="h-1 w-10 rounded-sm bg-foreground/25" />
            </span>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-md bg-foreground/12 dark:bg-foreground/18"
                style={{ width: 40, height: 26 }}
              />
              <OfficeCharacter
                name={collaborator.fullName}
                avatarUrl={collaborator.avatarUrl}
                working={working}
                size={50}
              />
            </>
          )}
        </div>

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
                    {statusLabel}
                    {working && <span className="animate-office-caret motion-reduce:animate-none">▌</span>}
                  </span>
                  {current?.isLate && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-destructive" />}
                </div>
                <p className="line-clamp-2 text-[11px] font-semibold leading-tight">{monitorCard.title}</p>
                {/* Etapa PRIMEIRO: nunca some por causa do nome da empresa. */}
                <p className="flex items-baseline gap-1 text-[9px] leading-tight">
                  <span className="shrink-0 font-semibold text-foreground">{monitorCard.stageLabel}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    para {monitorCard.clientName || "Sem cliente"}
                  </span>
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

        {/* objetos pessoais + pilha física da fila */}
        <div className="flex shrink-0 items-end gap-1 pb-[2px]">
          {slots.map(({ slot, key }) => (
            <DeskObject key={slot} objectKey={key} size={22} />
          ))}
          <PaperStack
            queueCount={queueCount}
            awaitingClientCount={awaitingClientCount}
            collaboratorName={collaborator.fullName}
            onOpenQueue={() => onOpenQueue(collaborator.userId)}
            anchorRef={
              registerStackAnchor
                ? (el) => registerStackAnchor(collaborator.userId, el)
                : undefined
            }
          />

        </div>
      </div>

      {/* ---------- mesa ---------- */}
      <div className="relative z-20">
        <div
          aria-hidden="true"
          className="h-[9px] rounded-t-[4px] bg-gradient-to-b from-foreground/30 to-foreground/18 dark:from-foreground/35 dark:to-foreground/22"
          style={{ clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)" }}
        />
        <div className="relative rounded-b-[5px] bg-gradient-to-b from-muted to-muted/50 px-2 pb-1 pt-[3px] shadow-[0_6px_10px_-8px_hsl(var(--foreground)/0.6)]">
          {/* plaquinha frontal apenas com o nome (contador vive na pilha) */}
          <div className="flex items-center justify-center gap-1">
            <p className="max-w-[80%] truncate rounded-[2px] border border-border/70 bg-background/70 px-1.5 text-[9px] font-semibold leading-4">
              {collaborator.fullName}
            </p>
            {onBreak && presence.returnsAt && (
              <span className="shrink-0 text-[8px] leading-4 text-muted-foreground">
                retorna {presence.returnsAt}
              </span>
            )}
          </div>

          {progress !== null && (
            <div
              className="mx-auto mt-[3px] h-[3px] w-[72%] overflow-hidden rounded-full bg-foreground/12 dark:bg-foreground/20"
              role="progressbar"
              aria-label={`Progresso da demanda atual de ${collaborator.fullName}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-500",
                  current?.isLate ? "bg-destructive/70" : "bg-primary/70",
                )}
                style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
              />
            </div>
          )}


          {isSelf && onSaveDeskObjects && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Personalizar mesa"
              title="Personalizar mesa"
              className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1 py-[2px] text-[8px] font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Settings2 className="h-2.5 w-2.5" />
              {deskObjects.length === 0 && <span className="hidden sm:inline">Personalizar</span>}
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
