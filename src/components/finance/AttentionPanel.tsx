/**
 * "Precisa da sua atenção" — área compacta de EXCEÇÕES.
 *
 * Um único container com linhas internas (nunca um Card por insight).
 * Detalhe por cartão/campo pertence à view `Cartões e faturas`.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttentionInsight, StatusTone } from "@/lib/financeRowStatus";

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

/** Vermelho SOMENTE para atraso/erro real. Configuração incompleta = neutro. */
const TONE_CLASS: Record<StatusTone, string> = {
  danger: "text-destructive",
  warning: "text-muted-foreground",
  positive: "text-primary",
  neutral: "text-muted-foreground",
};

const MAX_VISIBLE = 3;

export default function AttentionPanel({ insights, onAction }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? insights : insights.slice(0, MAX_VISIBLE);
  const hidden = insights.length - visible.length;

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Precisa da sua atenção</h2>

      <Card className="divide-y">
        {insights.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3 min-h-14">
            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-sm text-foreground">Tudo certo por enquanto</p>
          </div>
        ) : (
          <>
            {visible.map((insight) => {
              const Icon = TONE_ICON[insight.tone];
              return (
                <div
                  key={insight.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 min-h-14"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${TONE_CLASS[insight.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-foreground">{insight.title}</p>
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
                </div>
              );
            })}

            {hidden > 0 && (
              <div className="px-2 py-1">
                <Button variant="ghost" size="sm" className="min-h-10" onClick={() => setShowAll(true)}>
                  Ver mais {hidden} {hidden === 1 ? "alerta" : "alertas"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
