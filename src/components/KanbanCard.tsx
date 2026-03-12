import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  title: string;
  subtitle?: string;
  dueDate?: string;
  dueTime?: string;
  cardDeliveryDate?: string;
  deliveryTime?: string;
  isDragging?: boolean;
  isOverdue?: boolean;
  onClick?: () => void;
}

const KanbanCard = ({
  title,
  subtitle,
  dueDate,
  dueTime,
  cardDeliveryDate,
  deliveryTime,
  isDragging = false,
  isOverdue = false,
  onClick
}: KanbanCardProps) => {
  const formattedDueDate = dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString("pt-BR") : null;
  const formattedCardDeliveryDate = cardDeliveryDate ? new Date(cardDeliveryDate + 'T00:00:00').toLocaleDateString("pt-BR") : null;
  const formattedDueTime = dueTime ? dueTime.slice(0, 5) : null;
  const formattedDeliveryTime = deliveryTime ? deliveryTime.slice(0, 5) : null;

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
      {(formattedDueDate || formattedCardDeliveryDate) && (
        <CardContent className="px-3 pb-3 pt-0">
          <div className="flex flex-col gap-1.5">
            {formattedDueDate && (
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md w-fit",
                isOverdue ? "text-red-500 bg-red-500/15" : "text-amber-500 bg-amber-500/10"
              )}>
                <CalendarClock className="h-3.5 w-3.5" />
                <span>{formattedDueDate}</span>
                {formattedDueTime && (
                  <span>• {formattedDueTime}</span>
                )}
              </div>
            )}
            {formattedCardDeliveryDate && (
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md w-fit",
                isOverdue ? "text-red-500 bg-red-500/15" : "text-emerald-500 bg-emerald-500/10"
              )}>
                <Calendar className="h-3.5 w-3.5" />
                <span>{formattedCardDeliveryDate}</span>
                {formattedDeliveryTime && (
                  <span className="opacity-70">• {formattedDeliveryTime}</span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default KanbanCard;
