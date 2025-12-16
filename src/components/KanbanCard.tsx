import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Target, Paperclip, Image, FileText } from "lucide-react";

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

interface KanbanCardProps {
  title: string;
  platforms: string[];
  deliveryDate: string;
  status?: string;
  objetivo?: string | null;
  attachments?: Attachment[] | null;
  isDragging?: boolean;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  "Planejamento Automatizado": { 
    label: "Planejado", 
    className: "bg-purple-500/20 text-purple-400 border-purple-500/30" 
  },
  "A Fazer": { 
    label: "A Fazer", 
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30" 
  },
  "Em Andamento": { 
    label: "Em Andamento", 
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30" 
  },
  "Concluído": { 
    label: "Concluído", 
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
  },
};

const KanbanCard = ({
  title,
  platforms,
  deliveryDate,
  status = "Planejamento Automatizado",
  objetivo,
  attachments,
  isDragging = false,
  onClick
}: KanbanCardProps) => {
  const formattedDate = new Date(deliveryDate + 'T00:00:00').toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short"
  });

  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG["Planejamento Automatizado"];
  const hasAttachments = attachments && attachments.length > 0;
  const imageAttachments = attachments?.filter(a => a.type.startsWith('image/')) || [];

  return (
    <Card
      className={`mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50 overflow-hidden ${
        isDragging ? "shadow-xl rotate-1 scale-105" : ""
      }`}
      onClick={onClick}
    >
      {/* ========== HEADER - Controles Operacionais ========== */}
      <div className="px-3 pt-3 pb-2 border-b border-border/30">
        <div className="flex items-center justify-between gap-2">
          {/* Status Badge */}
          <Badge 
            variant="outline" 
            className={`text-[10px] px-2 py-0.5 font-semibold border ${statusConfig.className}`}
          >
            {statusConfig.label}
          </Badge>

          {/* Date Info */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span className="font-medium">{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* ========== BODY - Conteúdo de Execução ========== */}
      <div className="px-3 py-3 space-y-2.5">
        {/* Title */}
        <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
          {title}
        </h4>

        {/* Objetivo Preview */}
        {objetivo && (
          <div className="flex items-start gap-1.5">
            <Target className="h-3 w-3 text-primary/60 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {objetivo}
            </p>
          </div>
        )}

        {/* Footer: Platforms + Attachments Indicator */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Platform Badges */}
          <div className="flex flex-wrap gap-1">
            {platforms.slice(0, 2).map((platform) => (
              <Badge 
                key={platform} 
                variant="secondary" 
                className="text-[9px] px-1.5 py-0 font-medium bg-muted/80 text-muted-foreground"
              >
                {platform}
              </Badge>
            ))}
            {platforms.length > 2 && (
              <Badge 
                variant="secondary" 
                className="text-[9px] px-1.5 py-0 font-medium bg-muted/80 text-muted-foreground"
              >
                +{platforms.length - 2}
              </Badge>
            )}
          </div>

          {/* Attachments Indicator */}
          {hasAttachments && (
            <div className="flex items-center gap-1 text-muted-foreground">
              {imageAttachments.length > 0 ? (
                <div className="flex items-center gap-0.5">
                  <Image className="h-3 w-3" />
                  <span className="text-[10px] font-medium">{imageAttachments.length}</span>
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  <Paperclip className="h-3 w-3" />
                  <span className="text-[10px] font-medium">{attachments?.length}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default KanbanCard;
