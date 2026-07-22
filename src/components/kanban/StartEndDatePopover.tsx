import { useState, useEffect, useRef, ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StartEndDatesValue {
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
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

interface StartEndDatePopoverProps {
  trigger: ReactNode;
  dueDate?: string | null;
  dueTime?: string | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  onSave: (v: StartEndDatesValue) => Promise<void> | void;
}

/**
 * Popover unificado com dois calendários lado a lado (Início | Término) e
 * inputs de horário com navegação Tab (Início→Término) e Enter para salvar.
 * Usado tanto no card compacto (Visão Geral) quanto no modal de demanda.
 */
export const StartEndDatePopover = ({
  trigger,
  dueDate,
  dueTime,
  deliveryDate,
  deliveryTime,
  disabled,
  align = "start",
  onSave,
}: StartEndDatePopoverProps) => {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | undefined>(parseISO(dueDate));
  const [end, setEnd] = useState<Date | undefined>(parseISO(deliveryDate));
  const [startTime, setStartTime] = useState<string>(dueTime?.slice(0, 5) || "");
  const [endTime, setEndTime] = useState<string>(deliveryTime?.slice(0, 5) || "");
  const [saving, setSaving] = useState(false);
  const endTimeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStart(parseISO(dueDate));
      setEnd(parseISO(deliveryDate));
      setStartTime(dueTime?.slice(0, 5) || "");
      setEndTime(deliveryTime?.slice(0, 5) || "");
    }
  }, [open, dueDate, deliveryDate, dueTime, deliveryTime]);

  const commit = async () => {
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
  };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 pointer-events-auto"
        align={align}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
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
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    endTimeRef.current?.focus();
                  }
                }}
                tabIndex={1}
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
                ref={endTimeRef}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                tabIndex={2}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" disabled={saving} onClick={commit}>
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface SingleDateTimePopoverProps {
  trigger: ReactNode;
  date?: string | null;
  time?: string | null;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  label?: string;
  extraContent?: ReactNode;
  onSave: (v: { date: string | null; time: string | null }) => Promise<void> | void;
}

/**
 * Variante para uma única data (ex.: publicação) com calendário + input de hora,
 * Enter para salvar, mesma estética do StartEndDatePopover.
 */
export const SingleDateTimePopover = ({
  trigger,
  date,
  time,
  disabled,
  align = "start",
  label = "Data",
  extraContent,
  onSave,
}: SingleDateTimePopoverProps) => {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Date | undefined>(parseISO(date));
  const [t, setT] = useState<string>(time?.slice(0, 5) || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setD(parseISO(date));
      setT(time?.slice(0, 5) || "");
    }
  }, [open, date, time]);

  const commit = async () => {
    setSaving(true);
    try {
      await onSave({ date: toISO(d), time: t || null });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 pointer-events-auto"
        align={align}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      >
        <div className="p-3 space-y-2">
          <Label className="text-xs font-semibold text-primary">{label}</Label>
          <Calendar
            mode="single"
            selected={d}
            onSelect={setD}
            initialFocus
            className={cn("p-0 pointer-events-auto")}
          />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-12">Hora</Label>
            <Input
              type="time"
              value={t}
              onChange={(e) => setT(e.target.value)}
              tabIndex={1}
              className="h-8 text-xs"
            />
          </div>
        </div>
        {extraContent && (
          <div className="px-3 pb-3 border-t border-border pt-3">{extraContent}</div>
        )}
        <div className="flex justify-end gap-2 p-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" disabled={saving} onClick={commit}>
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
