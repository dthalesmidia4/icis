/**
 * "O que precisa de atenção" — o sistema interpreta o mês para o usuário.
 * Mostra no máximo 3 avisos; o resto fica atrás de "Ver tudo".
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ALL_CLEAR_MESSAGE,
  ATTENTION_DOMAIN_LABELS,
  AttentionInsight,
  StatusTone,
} from "@/lib/financeRowStatus";


interface Props {
  insights: AttentionInsight[];
  onAction: (insight: AttentionInsight) => void;
}

const TONE_ICON: Record<StatusTone, typeof AlertTriangle> = {
  danger: AlertTriangle,
  warning: Clock,
  positive: CheckCircle2,
  neutral: Info,
};

const TONE_CLASS: Record<StatusTone, string> = {
  danger: "text-destructive",
  warning: "text-foreground",
  positive: "text-primary",
  neutral: "text-muted-foreground",
};

export default function AttentionPanel({ insights, onAction }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? insights : insights.slice(0, 3);
  const hidden = insights.length - visible.length;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">O que precisa de atenção</h2>

      {insights.length === 0 ? (
        <Card className="flex items-center gap-3 p-4">
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground">{ALL_CLEAR_MESSAGE}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((insight) => {
            const Icon = TONE_ICON[insight.tone];
            return (
              <Card
                key={insight.id}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${TONE_CLASS[insight.tone]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  {insight.detail && (
                    <p className="text-sm text-muted-foreground">{insight.detail}</p>
                  )}
                </div>
                {insight.actionLabel && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    onClick={() => onAction(insight)}
                  >
                    {insight.actionLabel}
                  </Button>
                )}
              </Card>
            );
          })}

          {hidden > 0 && (
            <Button variant="ghost" size="sm" className="min-h-10" onClick={() => setShowAll(true)}>
              Ver tudo ({insights.length})
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
