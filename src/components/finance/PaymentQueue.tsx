/**
 * `Próximos pagamentos` — principal superfície operacional da overview.
 *
 * Une contas diretas (qualquer `kind` pagável) e faturas de cartão. Cobranças
 * feitas no cartão NÃO aparecem aqui: elas são pagas pela fatura.
 *
 * A lista mostra no máximo 5 itens e expande INLINE (sem rota nova).
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/financeModel";
import { PaymentQueueEntry, queueDateLabel } from "@/lib/financeRowStatus";
import { describePaymentRule } from "@/lib/financePaymentSchedule";

interface Props {
  entries: PaymentQueueEntry[];
  today: string;
  onSelect: (entry: PaymentQueueEntry) => void;
}

const PAYMENT_QUEUE_PREVIEW = 5;

/** Contexto textual leve — substitui a pill pesada. */
function entryContextLabel(entry: PaymentQueueEntry): string {
  if (entry.type === "statement") return "Fatura do cartão";
  if (entry.type === "grouped" && entry.group) {
    const count = entry.group.rows.length;
    return `${count} ocorrências · ${describePaymentRule(entry.group.rule)}`;
  }
  return "Conta direta";
}


export default function PaymentQueue({ entries, today, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, PAYMENT_QUEUE_PREVIEW);
  const hasMore = entries.length > PAYMENT_QUEUE_PREVIEW;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Próximos pagamentos</h2>

      {entries.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Nenhum pagamento previsto para os próximos dias.
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {visible.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full text-left px-4 sm:px-5 py-3 sm:py-4 min-h-16 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="text-sm text-muted-foreground sm:w-20 flex-shrink-0 tabular-nums">
                {queueDateLabel(entry.dueDate, today)}
              </span>

              <span className="flex-1 min-w-0">
                <span className="block text-[15px] sm:text-base font-semibold text-foreground truncate">
                  {entry.name}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {entryContextLabel(entry)}
                </span>
              </span>

              <span className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <span className="text-[15px] sm:text-base font-semibold tabular-nums whitespace-nowrap">
                  {formatBRL(entry.amount)}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </span>
            </button>
          ))}

          {hasMore && (
            <div className="px-2 py-1">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-10"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Mostrar menos" : "Ver mais pagamentos"}
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
