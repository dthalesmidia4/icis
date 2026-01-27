import { useState, useEffect, useMemo } from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface SchedulePublicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingDate?: string | null; // YYYY-MM-DD format
  existingTime?: string | null; // HH:MM format
  onConfirm: (date: string, time: string) => void;
  onCancel: () => void;
}

// Generate time options from 08:00 to 20:00 in 15-minute intervals
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 20 && minute > 0) break; // Stop at 20:00
      const h = hour.toString().padStart(2, "0");
      const m = minute.toString().padStart(2, "0");
      options.push(`${h}:${m}`);
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Format day of week in Portuguese
const formatDayOfWeek = (date: Date): string => {
  return format(date, "EEEE", { locale: ptBR });
};

// Format date in extenso (e.g., "27 de janeiro")
const formatDateExtenso = (date: Date): string => {
  return format(date, "d 'de' MMMM", { locale: ptBR });
};

export function SchedulePublicationModal({
  open,
  onOpenChange,
  existingDate,
  existingTime,
  onConfirm,
  onCancel,
}: SchedulePublicationModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      // If existing date, parse it
      if (existingDate) {
        try {
          const parsedDate = parse(existingDate, "yyyy-MM-dd", new Date());
          setSelectedDate(parsedDate);
        } catch {
          setSelectedDate(undefined);
        }
      } else {
        setSelectedDate(undefined);
      }

      // If existing time, use it
      if (existingTime && TIME_OPTIONS.includes(existingTime)) {
        setSelectedTime(existingTime);
      } else {
        setSelectedTime("09:00"); // Default time
      }
    }
  }, [open, existingDate, existingTime]);

  // Dynamic description text
  const descriptionText = useMemo(() => {
    if (!selectedDate || !selectedTime) {
      return "Selecione uma data e horário para agendar a publicação.";
    }

    const dayOfWeek = formatDayOfWeek(selectedDate);
    const dateExtenso = formatDateExtenso(selectedDate);

    return `O conteúdo será agendado para ${dayOfWeek}, ${dateExtenso} às ${selectedTime}.`;
  }, [selectedDate, selectedTime]);

  const handleConfirm = () => {
    if (!selectedDate || !selectedTime) return;

    const formattedDate = format(selectedDate, "yyyy-MM-dd");
    onConfirm(formattedDate, selectedTime);
  };

  const handleCancel = () => {
    onCancel();
  };

  const isValid = !!selectedDate && !!selectedTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Data de Publicação</DialogTitle>
          <DialogDescription className="sr-only">
            Selecione a data e horário para agendar a publicação do conteúdo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Date Picker */}
          <div className="grid gap-2">
            <Label htmlFor="date">Data</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, "PPP", { locale: ptBR })
                  ) : (
                    <span>Selecione uma data</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }}
                  initialFocus
                  className="pointer-events-auto"
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Picker */}
          <div className="grid gap-2">
            <Label htmlFor="time">Horário</Label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger id="time" className="w-full">
                <SelectValue placeholder="Selecione um horário" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Description */}
          <p className="text-sm text-muted-foreground mt-2">{descriptionText}</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Confirmar agendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
