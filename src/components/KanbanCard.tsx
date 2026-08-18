import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Send, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StartEndDatePopover } from "@/components/kanban/StartEndDatePopover";
import { ClientSendHistoryPopover } from "@/components/kanban/ClientSendHistoryPopover";

export interface CardDatesChange {
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
}

interface KanbanCardProps {
  title: string;
  subtitle?: string;
  demandType?: string | null;
  dueDate?: string;
  dueTime?: string;
  cardDeliveryDate?: string;
  deliveryTime?: string;
  isDragging?: boolean;
  isOverdue?: boolean;
  cardId?: string;
  statusName?: string | null;
  statusColor?: string | null;
  hideDueDate?: boolean;
  emphasizeDelivery?: boolean;
  showStartEndLabels?: boolean;
  emphasizeStart?: boolean;
  isDailyCard?: boolean;
  dailyCompleted?: number;
  dailyTotal?: number | null;
  dailyNextDate?: string | null;
  workArea?: "midia" | "sistemas" | null;
  pausedByCaptar?: { atTime?: string; captarTitle?: string } | null;
  /** Modo "Aguardando cliente": substitui Ini/Fim pelo horário de envio ao cliente. */
  awaitingClient?: boolean;
  awaitingClientSince?: string | null;
  awaitingClientResendCount?: number | null;
  /** Próximo retorno automático ao fluxo (ex.: "amanhã 10:00"). */
  awaitingClientNextReturn?: string | null;
  awaitingClientReturnLimitReached?: boolean;
  awaitingClientActions?: React.ReactNode;

  /** ISO do prazo estourado — habilita o selo "Atrasado · Xd". */
  overdueSince?: string | null;


  /** Modo de seleção múltipla (alocação em massa). Genérico: sem lógica de bulk aqui. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;

  /**
   * Envelopa o chip da etapa (`statusName`) — usado na Visão Geral para trocar
   * a etapa com pressionar-e-segurar sem afetar o clique normal do card.
   */
  stageChipWrapper?: (chip: React.ReactNode) => React.ReactNode;

  onClick?: () => void;
  onDatesChange?: (changes: CardDatesChange) => Promise<void> | void;
}

const toISO = (d?: Date | null): string | null => {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseISO = (s?: string | null): Date | undefined => {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};

const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : null);

const fmtDateTime = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr} ${timeStr}`;
};

/** Monta o ISO do prazo a partir de data + hora de entrega. */
const deadlineISO = (date?: string | null, time?: string | null): string | null => {
  if (!date) return null;
  const raw = (time || "23:59").slice(0, 5);
  const d = new Date(`${date}T${raw}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** "5d" / "3h" / "20min" de atraso, a partir do ISO do prazo. */
const formatOverdueAmount = (iso?: string | null): string | null => {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return null;
  if (diffMin < 60) return `${diffMin}min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};



const SentToClientPill = ({
  since,
  resendCount,
  demandId,
  nextReturnLabel,
  returnLimitReached,
}: {
  since?: string | null;
  resendCount?: number | null;
  demandId?: string | null;
  nextReturnLabel?: string | null;
  returnLimitReached?: boolean;
}) => {
  const at = fmtDateTime(since);
  const sendNumber = Math.max(1, (Number(resendCount) || 0) + 1);
  return (
    <div className="flex items-start gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium leading-tight min-w-0 w-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
      <Send className="h-3 w-3 shrink-0 mt-0.5" />
      <span className="min-w-0 flex-1 whitespace-normal break-words">
        <span>Enviado pela {sendNumber}ª vez ao cliente</span>
        {at && <span className="block font-semibold">em {at}</span>}
        {returnLimitReached ? (
          <span className="block opacity-80">Limite de reenvios atingido · sem retorno automático</span>
        ) : nextReturnLabel ? (
          <span className="block opacity-80">Retorna ao fluxo {nextReturnLabel}</span>
        ) : null}
      </span>
      <ClientSendHistoryPopover
        demandId={demandId}
        fallbackSince={since}
        fallbackResendCount={resendCount}
        className="mt-0.5 text-blue-700 dark:text-blue-300"
      />
    </div>
  );

};



interface InlineDatesProps {
  dueDate?: string;
  dueTime?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  isOverdue?: boolean;
  editable: boolean;
  onSave?: (c: CardDatesChange) => Promise<void> | void;
}

const InlineDates = ({ dueDate, dueTime, deliveryDate, deliveryTime, isOverdue, editable, onSave }: InlineDatesProps) => {
  const dStart = fmtDate(dueDate);
  const dEnd = fmtDate(deliveryDate);
  const tStart = fmtTime(dueTime);
  const tEnd = fmtTime(deliveryTime);

  const label = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium leading-tight min-w-0 w-full text-left",
        "bg-muted/60 text-foreground",
        editable && "hover:bg-muted cursor-pointer transition-colors",
      )}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <CalendarIcon className="h-3 w-3 shrink-0 text-amber-500" />
        <span className="text-muted-foreground shrink-0">Ini:</span>
        {dStart ? (
          <span className="font-semibold truncate">
            {dStart}
            {tStart && ` ${tStart}`}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
        <CalendarIcon className={cn("h-3 w-3 shrink-0", isOverdue ? "text-red-500" : "text-emerald-500")} />
        <span className="text-muted-foreground shrink-0">Fim:</span>
        {dEnd ? (
          <span className={cn("font-semibold truncate", isOverdue && "text-red-600 dark:text-red-400")}>
            {dEnd}
            {tEnd && ` ${tEnd}`}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );

  if (!editable || !onSave) return label;

  return (
    <StartEndDatePopover
      trigger={
        <button type="button" className="w-full text-left" onClick={(e) => e.stopPropagation()}>
          {label}
        </button>
      }
      dueDate={dueDate}
      dueTime={dueTime}
      deliveryDate={deliveryDate}
      deliveryTime={deliveryTime}
      onSave={onSave}
    />
  );
};

const KanbanCard = ({

  title,
  subtitle,
  demandType: _demandType,
  dueDate,
  dueTime,
  cardDeliveryDate,
  deliveryTime,
  isDragging = false,
  isOverdue = false,
  cardId: _cardId,
  statusName: _statusName,
  statusColor: _statusColor,
  hideDueDate = false,
  emphasizeDelivery: _emphasizeDelivery = false,
  showStartEndLabels = false,
  emphasizeStart: _emphasizeStart = false,
  isDailyCard = false,
  dailyCompleted = 0,
  dailyTotal = null,
  dailyNextDate = null,
  workArea = null,
  pausedByCaptar = null,
  awaitingClient = false,
  awaitingClientSince = null,
  awaitingClientResendCount = 0,
  awaitingClientNextReturn = null,
  awaitingClientReturnLimitReached = false,
  awaitingClientActions,

  overdueSince = null,

  selectable = false,
  selected = false,
  onToggleSelect,

  stageChipWrapper,

  onClick,
  onDatesChange,
}: KanbanCardProps) => {
  const formattedNextDaily = dailyNextDate
    ? new Date(dailyNextDate + "T00:00:00").toLocaleDateString("pt-BR")
    : null;

  const hasAnyDate = !!(dueDate || cardDeliveryDate);
  const showInline = showStartEndLabels || hasAnyDate;
  const isSistemas = workArea === "sistemas";
  const overdue = isOverdue && !awaitingClient;
  const overdueLabel = overdue ? formatOverdueAmount(overdueSince ?? deadlineISO(cardDeliveryDate, deliveryTime)) : null;


  return (
    <Card
      className={cn(
        "mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50",
        isDragging && "shadow-xl rotate-1 scale-105",
        overdue &&
          "border-l-4 border-l-red-500 border-red-500/30 dark:border-red-500/40 bg-gradient-to-b from-transparent to-red-500/10 dark:to-red-500/15",
        isDailyCard && !overdue && "border-l-4 border-l-amber-500",
        awaitingClient && "border-l-4 border-l-blue-500",
        isSistemas && !overdue && "bg-slate-500/5 dark:bg-slate-400/5 border-slate-500/25",
        selectable && "relative",
        selectable && selected && "ring-2 ring-primary ring-offset-1",
      )}
      onClick={selectable ? onToggleSelect : onClick}
      role={selectable ? "checkbox" : undefined}
      aria-checked={selectable ? selected : undefined}
    >
      {selectable && (
        <span
          aria-hidden
          className={cn(
            "absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded border text-[10px] font-black",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/90",
          )}
        >
          {selected ? "✓" : ""}
        </span>
      )}
      <CardHeader className="px-2.5 pt-2.5 pb-1.5 space-y-1">
        {((subtitle || _statusName) && !awaitingClient) || overdue ? (
          <div className="flex items-start gap-1.5 min-w-0">
            <div
              className="flex-1 min-w-0 text-xs font-semibold leading-snug line-clamp-2 break-words"
              title={[subtitle, _statusName].filter(Boolean).join(" · ")}
            >
              {subtitle && !awaitingClient && <span className="text-foreground/80">{subtitle}</span>}
              {subtitle && _statusName && !awaitingClient && (
                <span className="text-muted-foreground/60"> · </span>
              )}
              {_statusName && !awaitingClient
                ? (() => {
                    const chip = <span className="text-muted-foreground">{_statusName}</span>;
                    return stageChipWrapper ? stageChipWrapper(chip) : chip;
                  })()
                : null}
              
            </div>
            {overdue && (
              <span
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400"
                title="Prazo de entrega estourado"
              >
                <AlertTriangle className="h-3 w-3" />
                {overdueLabel ? `Atrasado · ${overdueLabel}` : "Atrasado"}
              </span>
            )}
          </div>
        ) : null}
        {awaitingClient && subtitle && (
          <div className="text-xs font-semibold leading-snug line-clamp-2 break-words text-foreground/80">
            {subtitle}
          </div>
        )}
        {isDailyCard && (
          <div className="flex flex-wrap gap-1">
            <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
              Card Diário
            </Badge>
            {dailyTotal != null && (
              <Badge variant="outline" className="text-[10px]">
                Ocorrência {Math.min(dailyCompleted + 1, dailyTotal)} de {dailyTotal}
              </Badge>
            )}
            {formattedNextDaily && (
              <Badge variant="outline" className="text-[10px]">
                Próx: {formattedNextDaily}
              </Badge>
            )}
          </div>
        )}
        <CardTitle className="text-sm font-semibold leading-snug line-clamp-2 break-words text-foreground">
          {title}
        </CardTitle>
        {pausedByCaptar && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 gap-1 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 self-start"
            title={pausedByCaptar.captarTitle ? `Pausado para captação: ${pausedByCaptar.captarTitle}` : "Pausado para captação"}
          >
            ⏸ Pausado {pausedByCaptar.atTime || ""} · captação
          </Badge>
        )}
      </CardHeader>

      {awaitingClient ? (
        <CardContent className="px-2.5 pb-2.5 pt-0 space-y-1">
          <SentToClientPill
            since={awaitingClientSince}
            resendCount={awaitingClientResendCount}
            demandId={_cardId}
            nextReturnLabel={awaitingClientNextReturn}
            returnLimitReached={awaitingClientReturnLimitReached}
          />

          {awaitingClientActions && (
            <div className="w-full">{awaitingClientActions}</div>

          )}
        </CardContent>
      ) : (
        <>
          {showInline && !hideDueDate && (
            <CardContent className="px-2.5 pb-2.5 pt-0">
              <InlineDates
                dueDate={dueDate}
                dueTime={dueTime}
                deliveryDate={cardDeliveryDate}
                deliveryTime={deliveryTime}
                isOverdue={overdue}
                editable={!!onDatesChange}
                onSave={onDatesChange}
              />
            </CardContent>
          )}
          {showInline && hideDueDate && cardDeliveryDate && (
            <CardContent className="px-2.5 pb-2.5 pt-0">
              <InlineDates
                dueDate={undefined}
                dueTime={undefined}
                deliveryDate={cardDeliveryDate}
                deliveryTime={deliveryTime}
                isOverdue={overdue}
                editable={!!onDatesChange}
                onSave={onDatesChange}
              />
            </CardContent>
          )}
        </>
      )}

    </Card>
  );
};

export default KanbanCard;
