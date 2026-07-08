import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Target, Calendar, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  className?: string;
}


// Helper to parse all fields
function parseDemanda(demanda: DemandaItem) {
  const title = demanda.titulo || demanda.title || 'Sem título';
  const tipo = demanda.tipo || demanda.tipo_conteudo || demanda.type || '';
  const channel = demanda.canal || demanda.channel || '';
  const objetivo = demanda.objetivo || demanda.objective || '';
  const content = demanda.conteudo || demanda.texto_da_peca || demanda.descricao_da_tarefa || demanda.descricao || demanda.description || '';
  const dateStr = demanda.data_sugerida || demanda.suggested_date || demanda.date || '';
  const instrucoes = demanda.instrucoes_de_producao || '';
  const cta = demanda.cta_recomendado || '';

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

  return { title, tipo, channel, objetivo, content, dateStr, formattedDate, instrucoes, cta };
}

export const DemandaCard = ({ demanda, compact = false, variant = 'default', className }: DemandaCardProps) => {

  const [detailOpen, setDetailOpen] = useState(false);
  const { title, tipo, channel, objetivo, content, formattedDate, instrucoes, cta } = parseDemanda(demanda);

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
            </div>
            <p className="font-medium text-sm truncate">{title}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card
        className={cn("p-4 border cursor-pointer", bgClass, className)}
        onClick={() => setDetailOpen(true)}
      >

        <div className="flex items-center gap-3 flex-wrap">
          {tipo && <Badge variant="secondary" className="shrink-0">{tipo}</Badge>}
          <h4 className="text-lg font-semibold flex-1 min-w-0">{title}</h4>
        </div>
      </Card>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {tipo && <Badge variant="secondary">{tipo}</Badge>}
              {channel && <Badge variant="outline">{channel}</Badge>}
              {formattedDate && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formattedDate}
                </Badge>
              )}
            </div>

            {/* Objective */}
            {objetivo && (
              <div className="flex items-start gap-2 text-sm">
                <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">{objetivo}</p>
              </div>
            )}

            {/* Content */}
            {content && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>Conteúdo</span>
                </div>
                <div className="text-sm bg-muted/50 rounded-lg p-3 border whitespace-pre-line">
                  {content}
                </div>
              </div>
            )}

            {/* Instructions */}
            {instrucoes && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Instruções de Produção</p>
                <div className="text-sm bg-muted/50 rounded-lg p-3 border whitespace-pre-line">
                  {instrucoes}
                </div>
              </div>
            )}

            {/* CTA */}
            {cta && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">CTA Recomendado</p>
                <p className="text-sm">{cta}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DemandaCard;
