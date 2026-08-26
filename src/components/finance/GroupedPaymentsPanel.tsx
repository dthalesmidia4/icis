/**
 * `Pagamentos agrupados` — a SAÍDA DE CAIXA quando ela não é 1:1 com a despesa.
 *
 * Um cadastro pode acontecer várias vezes no mês (faxina toda quarta) e ser
 * pago de uma vez (toda sexta, ou dia 5). Cada linha aqui é um LOTE: quitar o
 * lote faz as ocorrências constarem como pagas por derivação — nunca duplica
 * despesa e nunca grava valor no lote.
 */
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFinanceVisibility } from "@/contexts/FinanceVisibilityContext";
import { formatBRL } from "@/lib/financeModel";
import { GroupedPayment, describePaymentRule, rowFactDate } from "@/lib/financePaymentSchedule";

interface Props {
  groups: GroupedPayment[];
  /** Cria (e opcionalmente quita) o lote da saída de caixa. */
  onPay: (group: GroupedPayment) => void;
  /** Desfaz o pagamento de um lote já quitado. */
  onUndo: (group: GroupedPayment) => void;
  busy?: boolean;
}

const dayLabel = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "Sem data definida";

export default function GroupedPaymentsPanel({ groups, onPay, onUndo, busy }: Props) {
  const { maskMoney } = useFinanceVisibility();
  if (groups.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold">Pagamentos agrupados</h2>
        <p className="text-sm text-muted-foreground">
          Vários fatos da despesa, uma única saída de caixa.
        </p>
      </div>

      <Card className="divide-y">
        {groups.map((group) => (
          <div
            key={group.key}
            className="px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
          >
            <span className="text-sm text-muted-foreground sm:w-24 flex-shrink-0 tabular-nums">
              {dayLabel(group.paymentDate)}
            </span>

            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-[15px] sm:text-base font-semibold truncate">
                  {group.itemName}
                </span>
                {group.paid && <Badge variant="secondary">Pago</Badge>}
              </span>
              <span className="block text-sm text-muted-foreground">
                {group.rows.length} {group.rows.length === 1 ? "ocorrência" : "ocorrências"}
                {" · "}
                {describePaymentRule(group.rule)}
              </span>
              <span className="block text-xs text-muted-foreground truncate">
                {group.rows
                  .map((row) => dayLabel(rowFactDate(row)))
                  .join(", ")}
              </span>
            </span>

            <span className="flex items-center gap-3 flex-shrink-0">
              <span className="text-[15px] sm:text-base font-semibold tabular-nums whitespace-nowrap">
                {maskMoney(formatBRL(group.totalBrl))}
              </span>
              {group.paid ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onUndo(group)}>
                  Desfazer
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => onPay(group)}>
                  Pagar
                </Button>
              )}
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}
