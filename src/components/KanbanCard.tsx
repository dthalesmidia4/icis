import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  title: string;
  subtitle?: string;
  dueDate?: string;
  cardDeliveryDate?: string;
  isDragging?: boolean;
  isOverdue?: boolean;
  onClick?: () => void;
}

const KanbanCard = ({
  title,
  subtitle,
  dueDate,
  cardDeliveryDate,
  isDragging = false,
  isOverdue = false,
  onClick
}: KanbanCardProps) => {
  const formattedDueDate = dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString("pt-BR") : null;
  const formattedCardDeliveryDate = cardDeliveryDate ? new Date(cardDeliveryDate + 'T00:00:00').toLocaleDateString("pt-BR") : null;

  return (
    <Card
      className={cn(
        "mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50",
        isDragging && "shadow-xl rotate-1 scale-105",
        isOverdue && "bg-red-500/10 border-red-500/30 dark:bg-red-500/15 dark:border-red-500/40"
      )}
      onClick={onClick}
    >
      {/* Title */}
      <CardHeader className="px-3 pt-3 pb-2">
        {subtitle && (
          <p className="text-xs text-muted-foreground mb-1 line-clamp-1">{subtitle}</p>
        )}
        <CardTitle className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      
      {/* Footer: Dates */}
      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {formattedDueDate && (
            <div className={cn(
              "flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md w-fit",
              isOverdue ? "text-red-500 bg-red-500/15" : "text-amber-500 bg-amber-500/10"
            )}>
              <CalendarClock className="h-3 w-3" />
              {formattedDueDate}
            </div>
          )}
          {formattedCardDeliveryDate && (
            <div className={cn(
              "flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md w-fit",
              isOverdue ? "text-red-500 bg-red-500/15" : "text-emerald-500 bg-emerald-500/10"
            )}>
              <Calendar className="h-3 w-3" />
              {formattedCardDeliveryDate}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default KanbanCard;
