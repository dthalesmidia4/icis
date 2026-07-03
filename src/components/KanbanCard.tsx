import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import DispatchStatusBadge from "@/components/DispatchStatusBadge";

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
  onClick?: () => void;
}

const DEMAND_TYPE_COLORS: Record<string, string> = {
  carrossel: "bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-400",
  post: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
  reel: "bg-pink-500/15 text-pink-600 border-pink-500/30 dark:text-pink-400",
  reels: "bg-pink-500/15 text-pink-600 border-pink-500/30 dark:text-pink-400",
  stories: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400",
  story: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400",
  captação: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  video: "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400",
  vídeo: "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400",
};

const getDemandTypeColor = (type: string): string => {
  const lower = type.toLowerCase();
  for (const [key, value] of Object.entries(DEMAND_TYPE_COLORS)) {
    if (lower.includes(key)) return value;
  }
  return "bg-muted text-muted-foreground border-border";
};

const KanbanCard = ({
  title,
  subtitle,
  demandType,
  dueDate,
  dueTime,
  cardDeliveryDate,
  deliveryTime,
  isDragging = false,
  isOverdue = false,
  cardId,
  statusName,
  statusColor,
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
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {demandType && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 font-medium shrink-0 border", getDemandTypeColor(demandType))}>
              {demandType}
            </Badge>
          )}
          {statusName && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-medium shrink-0 border"
              style={statusColor ? { borderColor: `${statusColor}66`, color: statusColor, backgroundColor: `${statusColor}1a` } : undefined}
            >
              {statusName}
            </Badge>
          )}
        </div>
        <CardTitle className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
          {title}
        </CardTitle>
        {cardId && <DispatchStatusBadge cardId={cardId} className="mt-2" />}
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
                  <span>• {formattedDeliveryTime}</span>
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
