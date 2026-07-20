import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | undefined>(parseISO(dueDate));
  const [end, setEnd] = useState<Date | undefined>(parseISO(deliveryDate));
  const [startTime, setStartTime] = useState<string>(dueTime?.slice(0, 5) || "");
  const [endTime, setEndTime] = useState<string>(deliveryTime?.slice(0, 5) || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStart(parseISO(dueDate));
      setEnd(parseISO(deliveryDate));
      setStartTime(dueTime?.slice(0, 5) || "");
      setEndTime(deliveryTime?.slice(0, 5) || "");
    }
  }, [open, dueDate, deliveryDate, dueTime, deliveryTime]);

  const dStart = fmtDate(dueDate);
  const dEnd = fmtDate(deliveryDate);
  const tStart = fmtTime(dueTime);
  const tEnd = fmtTime(deliveryTime);

  const label = (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium leading-tight",
        isOverdue ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted/60 text-foreground",
        editable && "hover:bg-muted cursor-pointer transition-colors",
      )}
    >
      <div className="flex items-center gap-1 min-w-0">
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
      <div className="flex items-center gap-1 min-w-0">
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

  if (!editable) return label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full text-left"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 pointer-events-auto"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="p-3 space-y-2">
            <Label className="text-xs font-semibold text-amber-600 dark:text-amber-400">Início</Label>
            <Calendar
              mode="single"
              selected={start}
              onSelect={setStart}
              initialFocus
              className={cn("p-0 pointer-events-auto")}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-12">Hora</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="p-3 space-y-2">
            <Label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Término</Label>
            <Calendar
              mode="single"
              selected={end}
              onSelect={setEnd}
              className={cn("p-0 pointer-events-auto")}
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-12">Hora</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              if (!onSave) {
                setOpen(false);
                return;
              }
              setSaving(true);
              try {
                await onSave({
                  due_date: toISO(start),
                  due_time: startTime || null,
                  delivery_date: toISO(end),
                  delivery_time: endTime || null,
                });
                setOpen(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  onClick,
  onDatesChange,
}: KanbanCardProps) => {
  const formattedNextDaily = dailyNextDate
    ? new Date(dailyNextDate + "T00:00:00").toLocaleDateString("pt-BR")
    : null;

  const hasAnyDate = !!(dueDate || cardDeliveryDate);
  const showInline = showStartEndLabels || hasAnyDate;

  return (
    <Card
      className={cn(
        "mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50",
        isDragging && "shadow-xl rotate-1 scale-105",
        isOverdue && "bg-red-500/10 border-red-500/30 dark:bg-red-500/15 dark:border-red-500/40",
        isDailyCard && "border-l-4 border-l-amber-500",
      )}
      onClick={onClick}
    >
      <CardHeader className="px-2.5 pt-2.5 pb-1.5 space-y-1">
        {subtitle && (
          <div
            className="text-xs font-semibold text-foreground/80 leading-snug line-clamp-2 break-words"
            title={subtitle}
          >
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
      </CardHeader>

      {showInline && !hideDueDate && (
        <CardContent className="px-3 pb-3 pt-0">
          <InlineDates
            dueDate={dueDate}
            dueTime={dueTime}
            deliveryDate={cardDeliveryDate}
            deliveryTime={deliveryTime}
            isOverdue={isOverdue}
            editable={!!onDatesChange}
            onSave={onDatesChange}
          />
        </CardContent>
      )}
      {showInline && hideDueDate && cardDeliveryDate && (
        <CardContent className="px-3 pb-3 pt-0">
          <InlineDates
            dueDate={undefined}
            dueTime={undefined}
            deliveryDate={cardDeliveryDate}
            deliveryTime={deliveryTime}
            isOverdue={isOverdue}
            editable={!!onDatesChange}
            onSave={onDatesChange}
          />
        </CardContent>
      )}
    </Card>
  );
};

export default KanbanCard;
