import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { StartEndDatePopover } from "@/components/kanban/StartEndDatePopover";

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

const fmtSince = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return "agora há pouco";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
};

const SentToClientPill = ({ since }: { since?: string | null }) => {
  const at = fmtDateTime(since);
  const rel = fmtSince(since);
  return (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium leading-tight min-w-0 w-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
      <Send className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {at ? `Enviado ao cliente em ${at}` : "Enviado ao cliente"}
      </span>
      {rel && <span className="ml-auto shrink-0 opacity-70">{rel}</span>}
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
        isOverdue ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted/60 text-foreground",
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


  return (
    <Card
      className={cn(
        "mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50",
        isDragging && "shadow-xl rotate-1 scale-105",
        overdue && "bg-red-500/10 border-red-500/30 dark:bg-red-500/15 dark:border-red-500/40",
        isDailyCard && "border-l-4 border-l-amber-500",
        awaitingClient && "border-l-4 border-l-blue-500",
        isSistemas && !overdue && "bg-slate-500/5 dark:bg-slate-400/5 border-slate-500/25",
      )}
      onClick={onClick}
    >
      <CardHeader className="px-2.5 pt-2.5 pb-1.5 space-y-1">
        {(subtitle || _statusName) && !awaitingClient && (
          <div
            className="text-xs font-semibold leading-snug line-clamp-2 break-words"
            title={[subtitle, _statusName].filter(Boolean).join(" · ")}
          >
            {subtitle && <span className="text-foreground/80">{subtitle}</span>}
            {subtitle && _statusName && (
              <span className="text-muted-foreground/60"> · </span>
            )}
            {_statusName && <span className="text-muted-foreground">{_statusName}</span>}
          </div>
        )}
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
        <CardContent className="px-2.5 pb-2.5 pt-0">
          <SentToClientPill since={awaitingClientSince} />
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
