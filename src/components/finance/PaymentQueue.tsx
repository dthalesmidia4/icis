/**
 * `Próximos pagamentos` — a fila de obrigações de caixa do mês.
 *
 * Une contas diretas (qualquer `kind` pagável) e faturas de cartão. Cobranças
 * feitas no cartão NÃO aparecem aqui: elas são pagas pela fatura.
 */
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/financeModel";
import { PaymentQueueEntry, formatDayMonth } from "@/lib/financeRowStatus";

interface Props {
  entries: PaymentQueueEntry[];
  onSelect: (entry: PaymentQueueEntry) => void;
  onSeeAll: () => void;
}

export default function PaymentQueue({ entries, onSelect, onSeeAll }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Próximos pagamentos</h2>

      {entries.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Nenhum pagamento previsto para os próximos dias.
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full text-left px-4 py-3 min-h-14 flex items-center gap-3 hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm text-muted-foreground w-16 flex-shrink-0 tabular-nums">
                {formatDayMonth(entry.dueDate)}
              </span>
              <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">
                {entry.name}
              </span>
              <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                {formatBRL(entry.amount)}
              </span>
              <Badge variant="outline" className="text-xs flex-shrink-0 hidden sm:inline-flex">
                {entry.label}
              </Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </Card>
      )}

      <Button variant="ghost" size="sm" className="min-h-10" onClick={onSeeAll}>
        Ver todos os pagamentos
      </Button>
    </section>
  );
}
