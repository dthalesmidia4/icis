import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

interface KanbanCardProps {
  title: string;
  platforms: string[];
  deliveryDate: string;
  isDragging?: boolean;
  onClick?: () => void;
}

const KanbanCard = ({
  title,
  platforms,
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {platforms.slice(0, 3).map((platform) => (
              <Badge 
                key={platform} 
                variant="outline" 
                className="text-[10px] px-2 py-0.5 font-medium border-border/60 text-muted-foreground"
              >
                {platform}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md shrink-0">
            <Calendar className="h-3 w-3" />
            {formattedDate}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KanbanCard;
