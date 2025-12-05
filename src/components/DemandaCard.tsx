import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Target, Calendar, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface DemandaItem {
  titulo?: string;
  title?: string;
  descricao?: string;
  description?: string;
  conteudo?: string;
  texto_da_peca?: string;
  descricao_da_tarefa?: string;
  tipo_conteudo?: string;
  tipo?: string;
  type?: string;
  canal?: string;
  channel?: string;
  data_sugerida?: string;
  suggested_date?: string;
  date?: string;
  objetivo?: string;
  objective?: string;
  instrucoes_de_producao?: string;
  cta_recomendado?: string;
}

interface DemandaCardProps {
  demanda: DemandaItem;
  compact?: boolean;
  variant?: 'normal' | 'ultra' | 'default';
}

export const DemandaCard = ({ demanda, compact = false, variant = 'default' }: DemandaCardProps) => {
  const [expanded, setExpanded] = useState(false);

  // Parse fields with fallbacks
  const title = demanda.titulo || demanda.title || 'Sem título';
  const tipo = demanda.tipo || demanda.tipo_conteudo || demanda.type || '';
  const channel = demanda.canal || demanda.channel || '';
  const objetivo = demanda.objetivo || demanda.objective || '';
  const content = demanda.conteudo || demanda.texto_da_peca || demanda.descricao_da_tarefa || demanda.descricao || demanda.description || '';
  const dateStr = demanda.data_sugerida || demanda.suggested_date || demanda.date || '';
  const instrucoes = demanda.instrucoes_de_producao || '';
  const cta = demanda.cta_recomendado || '';

  // Format date
  let formattedDate = '';
  if (dateStr) {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        formattedDate = format(date, "dd MMM", { locale: ptBR });
      }
    } catch {
      formattedDate = dateStr;
    }
  }

  const bgClass = variant === 'ultra' 
    ? 'bg-pink-50 dark:bg-pink-950/20 border-pink-200/50 dark:border-pink-800/30' 
    : variant === 'normal'
    ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-800/30'
    : 'bg-muted/50';

  if (compact) {
    return (
      <div className={`p-3 rounded-lg border ${bgClass}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {tipo && <Badge variant="secondary" className="text-xs">{tipo}</Badge>}
              {channel && <Badge variant="outline" className="text-xs">{channel}</Badge>}
            </div>
            <p className="font-medium text-sm truncate">{title}</p>
          </div>
          {formattedDate && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formattedDate}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={`p-4 border ${bgClass}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {tipo && <Badge variant="secondary">{tipo}</Badge>}
              {channel && <Badge variant="outline">{channel}</Badge>}
              {formattedDate && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formattedDate}
                </Badge>
              )}
            </div>
            <h4 className="font-semibold">{title}</h4>
          </div>
        </div>

        {/* Objetivo */}
        {objetivo && (
          <div className="flex items-start gap-2 text-sm">
            <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-muted-foreground">{objetivo}</p>
          </div>
        )}

        {/* Content preview or full */}
        {content && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>Conteúdo</span>
            </div>
            <div className={`text-sm bg-background/50 rounded-lg p-3 border whitespace-pre-line ${!expanded && content.length > 200 ? 'line-clamp-4' : ''}`}>
              {expanded ? content : content.slice(0, 300) + (content.length > 300 ? '...' : '')}
            </div>
            {content.length > 200 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Ver mais
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Instruções */}
        {(instrucoes || cta) && (
          <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
            {instrucoes && <p>📋 {instrucoes}</p>}
            {cta && <p>🎯 CTA: {cta}</p>}
          </div>
        )}
      </div>
    </Card>
  );
};

export default DemandaCard;
