import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

interface KanbanCardProps {
  title: string;
  deliveryDate: string;
  isDragging?: boolean;
  onClick?: () => void;
}

const KanbanCard = ({
  title,
  deliveryDate,
  isDragging = false,
  onClick
}: KanbanCardProps) => {
  const formattedDate = new Date(deliveryDate + 'T00:00:00').toLocaleDateString("pt-BR");

  return (
    <Card
      className={`mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50 ${
        isDragging ? "shadow-xl rotate-1 scale-105" : ""
      }`}
      onClick={onClick}
    >
      {/* Title */}
      <CardHeader className="px-3 pt-3 pb-2">
        <CardTitle className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      
      {/* Footer: Platform Badges + Date */}
      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
          <Calendar className="h-3 w-3" />
          {formattedDate}
        </div>
      </CardContent>
    </Card>
  );
};

export default KanbanCard;
