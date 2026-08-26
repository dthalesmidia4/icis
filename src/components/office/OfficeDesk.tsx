import { memo, useMemo, useState } from "react";
import { AlertTriangle, Clock, Flag, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";
import { useNowTick } from "@/hooks/useNowTick";
import OfficeZoneAnchor from "./OfficeZoneAnchor";
import PaperStack from "./PaperStack";
import DeskObject from "./DeskObject";
import DeskCustomizeDialog from "./DeskCustomizeDialog";
import {
  assignDeskSlots,
  canCustomizeDesk,
  type DeskObjectKey,
  type DeskSlotName,
} from "@/lib/officeDeskObjects";
import { isCoffeeEligible } from "@/lib/officePresence";
import { MONITOR_MIN_HEIGHT_PX } from "@/lib/officeLayout";
import { hasOfficeCardSpan, officeCardSpan } from "@/lib/officeCardTime";


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
  /** id do usuário autenticado — ownership real da mesa (nunca nome/e-mail). */
  viewerUserId?: string | null;
  onSaveDeskObjects?: (objects: DeskObjectKey[]) => void | Promise<unknown>;
  /** Largura relativa (%) do monitor dentro da estação (vem do perfil do mundo). */
  monitorPct?: number;
  /** Registra a pilha desta mesa como origem/destino da animação. */
  registerStackAnchor?: (userId: string, el: HTMLElement | null) => void;
  /** Registra o lugar do personagem (`desk:<userId>`) para a camada de pessoas. */
  registerAnchor?: (key: string, el: HTMLElement | null) => void;
  /** A pessoa está em outra zona (café/planejamento/revisão) ou fora do turno. */
  personAway?: boolean;
  /** Card sendo arrastado no escritório (destaca destinos válidos). */
  draggingCardId?: string | null;
  /** Esta mesa é o alvo sob o cursor no arraste atual. */
  isDropTarget?: boolean;
  /** Inicia o arraste por ponteiro do card no monitor. */
  onPressCard?: (e: React.PointerEvent, card: { id: string; title: string; fromUserId: string }) => void;
  /** Suprime o clique quando o gesto virou arraste. */
  consumeClickSuppression?: () => boolean;
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
  viewerUserId = null,
  onSaveDeskObjects,
  monitorPct = 52,

  registerStackAnchor,
  registerAnchor,
  personAway = false,
  draggingCardId = null,
  isDropTarget = false,
  onPressCard,
  consumeClickSuppression,
}: OfficeDeskProps) {

  const { collaborator, current, next, queueCount, awaitingClientCount, presence } = station;
  const [editing, setEditing] = useState(false);
  const working = presence.state === "working_now" && !!current;
  const onBreak = presence.state === "official_break";
  const offShift = presence.state === "off_shift";
  // Cadeira vazia: a pessoa está em outra zona (resolver espacial) ou fora do
  // expediente. Garante UM personagem por colaborador na cena.
  const away = personAway || isCoffeeEligible(presence.state) || onBreak || offShift;
  const statusLabel = working
    ? "Em andamento"
    : onBreak
      ? "Intervalo"
      : offShift
        ? "Fora do expediente"
        : "Próximo";
  const monitorCard = current || next;
  // INÍCIO (due) + TÉRMINO (delivery) do mesmo card, sem query nova.
  const span = useMemo(
    () =>
      officeCardSpan({
        dueDate: monitorCard?.dueDate,
        dueTime: monitorCard?.dueTime,
        deliveryDate: monitorCard?.deliveryDate,
        deliveryTime: monitorCard?.deliveryTime,
      }),
    [monitorCard?.dueDate, monitorCard?.dueTime, monitorCard?.deliveryDate, monitorCard?.deliveryTime],
  );

  // Cada slot tem posição FÍSICA distinta no tampo (esquerda / pé do monitor /
  // faixa direita) — nunca todos empilhados ao lado da pilha.
  const objectBySlot = useMemo(() => {
    const map: Partial<Record<DeskSlotName, DeskObjectKey>> = {};
    assignDeskSlots(deskObjects).forEach(({ slot, key }) => {
      map[slot] = key;
    });
    return map;
  }, [deskObjects]);

  const now = useNowTick(60_000);
  // A demanda em andamento fica no monitor: a pilha mostra só o restante da fila.
  const monitorId = monitorCard?.id ?? null;
  const queueRest = useMemo(
    () => station.queue.filter((c) => c.id !== monitorId).length,
    [station.queue, monitorId],
  );
  // Destino válido: existe arraste em curso e o card não é desta própria mesa.
  const canReceive = !!draggingCardId && !station.queue.some((c) => c.id === draggingCardId);

  // Barra discreta na base da mesa: SÓ o card atual, progresso temporal real.
  const progress = current ? cardProgress(current.startTs, current.endTs, now) : null;
  // ATRASO VISUAL ÚNICO: borda do monitor e ícone usam o MESMO sinal da barra
  // (prazo estourado), nunca o "início já passou" — senão fica vermelho sem atraso.
  const overdue = progress !== null && progress >= 1;
  // “Personalizar mesa”: só ownership real, nunca estado de demanda/presença.
  const canCustomize = canCustomizeDesk({
    viewerUserId,
    deskOwnerUserId: collaborator.userId,
    canSave: !!onSaveDeskObjects,
  });


  return (
    <div
      data-office-desk-user={collaborator.userId}
      className={cn(
        "group/desk relative w-full select-none rounded-lg transition-shadow",
        canReceive && "ring-2 ring-primary/40",
        isDropTarget &&
          canReceive &&
          "ring-2 ring-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]",
      )}
    >
      {/* ---------- tudo que fica APOIADO/ATRÁS do tampo ----------
          3 zonas estáveis: [personagem + objeto esquerdo] [monitor compacto]
          [objeto direito + fila]. O monitor tem largura com teto (nunca flex-1),
          garantindo faixa lateral útil para a pilha e os acessórios. */}
      <div
        className="relative z-30 -mb-[8px] grid items-end gap-[3px] px-1.5"
        style={{ gridTemplateColumns: `auto minmax(0, ${monitorPct}%) minmax(46px, auto)` }}
      >
        {/* LUGAR do personagem: a cadeira e o anchor vivem aqui, mas o corpo é
            renderizado pela `OfficePeopleLayer` (uma única instância na cena). */}

        <div className="flex shrink-0 items-end gap-[3px]">
          <div
            className="relative flex shrink-0 flex-col items-center justify-end pb-[2px]"
            style={{ width: 58, height: 56 }}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-md",
                away
                  ? "bg-foreground/20 dark:bg-foreground/25"
                  : "bg-foreground/12 dark:bg-foreground/18",
              )}
              style={{ width: away ? 40 : 46, height: 30 }}
            />
            {away && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-1/2 h-1 w-10 -translate-x-1/2 rounded-sm bg-foreground/25"
              />
            )}
            <OfficeZoneAnchor
              anchorKey={`desk:${collaborator.userId}`}
              width={58}
              register={registerAnchor}
            />
          </div>
          {/* slot ESQUERDO: sobre o tampo, entre personagem e monitor */}
          {objectBySlot.left && (
            <div className="pb-[2px]">
              <DeskObject objectKey={objectBySlot.left} size={24} />
            </div>
          )}
        </div>



        {/* monitor */}
        <div className="flex min-w-0 flex-col items-center">
          <button
            type="button"
            onPointerDown={(e) => {
              if (!monitorCard || !onPressCard) return;
              onPressCard(e, {
                id: monitorCard.id,
                title: monitorCard.title,
                fromUserId: collaborator.userId,
              });
            }}
            onClick={() => {
              if (consumeClickSuppression?.()) return;
              if (monitorCard) onOpenCard(monitorCard.id);
            }}
            disabled={!monitorCard}
            aria-label={monitorCard ? `Abrir card ${monitorCard.title}` : "Monitor em standby"}
            className={cn(
              "relative w-full overflow-hidden rounded-[4px] border-[3px] bg-card px-1.5 py-1 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // Semântica única com a barra da mesa: azul normal, vermelho só em atraso.
              working ? "border-primary/60" : "border-foreground/15",
              overdue && "border-destructive/60",
              monitorCard
                ? "hover:border-primary/70 hover:shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]"
                : "cursor-default",
            )}
            style={{ minHeight: MONITOR_MIN_HEIGHT_PX }}

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
                  {overdue && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-destructive" />}
                </div>
                <p className="line-clamp-2 text-[11px] font-semibold leading-tight">{monitorCard.title}</p>
                {/* Etapa PRIMEIRO: nunca some por causa do nome da empresa. */}
                <p className="flex items-baseline gap-1 text-[9px] leading-tight">
                  <span className="shrink-0 font-semibold text-foreground">{monitorCard.stageLabel}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    para {monitorCard.clientName || "Sem cliente"}
                  </span>
                </p>

                {hasOfficeCardSpan(span) && (
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-[1px] text-[8px] leading-tight text-muted-foreground">
                    {span.start && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-2 w-2 shrink-0" />
                        <span className="tabular-nums">Início {span.start}</span>
                      </span>
                    )}
                    {span.end && (
                      <span className="inline-flex items-center gap-0.5">
                        <Flag className="h-2 w-2 shrink-0" />
                        <span className="tabular-nums">Fim {span.end}</span>
                      </span>
                    )}
                  </p>
                )}

              </div>
            ) : (
              <div className="relative flex min-h-[38px] flex-col items-center justify-center gap-1 text-muted-foreground">
                <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-muted-foreground/30" />
                <span className="text-[9px]">Standby</span>
              </div>
            )}
          </button>
          {/* pé do monitor + teclado (com slot CENTER-SIDE ao lado do pé) */}
          <div className="flex items-end gap-[3px]">
            {objectBySlot["center-side"] && (
              <DeskObject objectKey={objectBySlot["center-side"]} size={22} />
            )}
            <span aria-hidden="true" className="h-1.5 w-4 bg-foreground/25" />
          </div>
          <span aria-hidden="true" className="h-[4px] w-14 rounded-sm bg-foreground/35" />
          <span
            aria-hidden="true"
            className="mt-[2px] h-[6px] w-[66%] rounded-[2px] bg-foreground/20 dark:bg-foreground/28"
          />
        </div>

        {/* faixa direita ESTÁVEL: objeto direito + pilha física da fila */}
        <div className="flex shrink-0 items-end justify-end gap-1 pb-[2px]">
          {objectBySlot.right && <DeskObject objectKey={objectBySlot.right} size={24} />}

          <PaperStack
            queueCount={queueRest}
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
          className="h-[12px] rounded-t-[4px] bg-gradient-to-b from-foreground/38 to-foreground/22 dark:from-foreground/42 dark:to-foreground/26"
          style={{ clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0 100%)" }}
        />
        <div className="relative rounded-b-[5px] bg-gradient-to-b from-muted to-muted/55 px-2 pb-1.5 pt-[4px] shadow-[0_10px_14px_-9px_hsl(var(--foreground)/0.8)]">
          {/* plaquinha frontal com o nome + acesso à personalização (só o dono) */}
          <div className="flex items-center justify-center gap-1">
            <p className="max-w-[70%] truncate rounded-[2px] border border-border/70 bg-background/70 px-1.5 text-[9px] font-semibold leading-4">
              {collaborator.fullName}
            </p>
            {onBreak && presence.returnsAt && (
              <span className="shrink-0 text-[8px] leading-4 text-muted-foreground">
                retorna {presence.returnsAt}
              </span>
            )}
            {canCustomize && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Personalizar mesa"
                title="Personalizar mesa"
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1 py-[1px] text-[8px] font-semibold leading-4 transition-colors",
                  "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20",
                )}
              >
                <Settings2 className="h-2.5 w-2.5" />
                <span>Personalizar mesa</span>
              </button>
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
                  // Vermelho SÓ quando o tempo já venceu e o card continua na mesa.
                  progress >= 1 ? "bg-destructive/70" : "bg-primary/70",
                )}
                style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
              />
            </div>
          )}


        </div>
        {/* pernas */}
        <div aria-hidden="true" className="flex justify-between px-3">
          <span className="h-4 w-[4px] bg-foreground/30" />
          <span className="h-4 w-[4px] bg-foreground/30" />
        </div>
        {/* sombra de contato */}
        <div
          aria-hidden="true"
          className="mx-auto h-2 w-[88%] rounded-[50%] bg-foreground/20 blur-[2px] dark:bg-background/60"
        />
      </div>

      {canCustomize && (
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
