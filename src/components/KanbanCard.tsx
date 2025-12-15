import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, Clock, User, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, parseISO, isValid, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface KanbanCardProps {
  id: string;
  title: string;
  status: string;
  columnName: string | null;
  deliveryDate: string;
  createdAt: string;
  updatedAt: string;
  isDragging?: boolean;
  onClick?: () => void;
  onDeliveryDateChange?: (date: Date) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  "Planejamento Automatizado": { 
    label: "Planejado", 
    color: "text-purple-700 dark:text-purple-300", 
    bgColor: "bg-purple-100 dark:bg-purple-900/40",
    borderColor: "border-purple-200 dark:border-purple-800"
  },
  "A Fazer": { 
    label: "A Fazer", 
    color: "text-blue-700 dark:text-blue-300", 
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
    borderColor: "border-blue-200 dark:border-blue-800"
  },
  "Em Andamento": { 
    label: "Em Andamento", 
    color: "text-amber-700 dark:text-amber-300", 
    bgColor: "bg-amber-100 dark:bg-amber-900/40",
    borderColor: "border-amber-200 dark:border-amber-800"
  },
  "Concluído": { 
    label: "Concluído", 
    color: "text-emerald-700 dark:text-emerald-300", 
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40",
    borderColor: "border-emerald-200 dark:border-emerald-800"
  },
};

export function KanbanCard({
  id,
  title,
  status,
  columnName,
  deliveryDate,
  createdAt,
  updatedAt,
  isDragging = false,
  onClick,
  onDeliveryDateChange,
}: KanbanCardProps) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState("12:00");
  
  const statusKey = columnName || status || "Planejamento Automatizado";
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG["Planejamento Automatizado"];
  
  // Parse dates
  const deliveryDateParsed = parseISO(deliveryDate + 'T00:00:00');
  const createdAtParsed = parseISO(createdAt);
  const updatedAtParsed = parseISO(updatedAt);
  
  // Check if delivery is overdue or approaching
  const isOverdue = isValid(deliveryDateParsed) && isBefore(deliveryDateParsed, new Date());
  const isApproaching = isValid(deliveryDateParsed) && !isOverdue && isBefore(deliveryDateParsed, addDays(new Date(), 3));
  
  // Activity time (time since last update)
  const activityTime = isValid(updatedAtParsed) 
    ? formatDistanceToNow(updatedAtParsed, { locale: ptBR, addSuffix: false })
    : "-";

  const handleDateSelect = (date: Date | undefined) => {
    if (date && onDeliveryDateChange) {
      onDeliveryDateChange(date);
      setIsDatePickerOpen(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on date picker
    if ((e.target as HTMLElement).closest('[data-date-picker]')) {
      return;
    }
    onClick?.();
  };

  return (
    <Card
      className={cn(
        "mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50 bg-card",
        isDragging && "shadow-xl rotate-1 scale-105"
      )}
      onClick={handleCardClick}
    >
      {/* Header: Status Badge */}
      <div className="px-3 pt-3 pb-2">
        <Badge 
          variant="outline"
          className={cn(
            "text-[10px] font-semibold px-2 py-0.5 border",
            statusConfig.color,
            statusConfig.bgColor,
            statusConfig.borderColor
          )}
        >
          {statusConfig.label}
        </Badge>
      </div>

      {/* Title */}
      <div className="px-3 pb-2">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
          {title}
        </h3>
      </div>

      {/* Metadata Row - ClickUp Style */}
      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
          {/* Delivery Date with Picker */}
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                data-date-picker
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors hover:bg-muted/80",
                  isOverdue && "text-destructive bg-destructive/10 hover:bg-destructive/20",
                  isApproaching && !isOverdue && "text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <CalendarIcon className="h-3 w-3" />
                <span className="font-medium">
                  {isValid(deliveryDateParsed) 
                    ? format(deliveryDateParsed, "dd/MM", { locale: ptBR })
                    : "Sem data"
                  }
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-0 z-50" 
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <Calendar
                mode="single"
                selected={deliveryDateParsed}
                onSelect={handleDateSelect}
                initialFocus
                className="pointer-events-auto"
              />
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="h-8 w-[100px] text-xs"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Separator */}
          <div className="h-3 w-px bg-border hidden sm:block" />

          {/* Responsible Person - Placeholder Avatar */}
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors hover:bg-muted/80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-3 w-3 text-primary" />
            </div>
            <span className="font-medium hidden sm:inline">Atribuir</span>
          </button>

          {/* Separator */}
          <div className="h-3 w-px bg-border hidden sm:block" />

          {/* Activity Time */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40">
            <Activity className="h-3 w-3" />
            <span className="font-medium">{activityTime}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
