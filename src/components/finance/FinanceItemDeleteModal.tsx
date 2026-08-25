/**
 * EXCLUIR x INATIVAR um cadastro financeiro.
 *
 * O modal não decide nada por conta própria: pergunta ao banco
 * (`finance_item_delete_decision`) e oferece exatamente a ação permitida.
 * Cadastro nunca usado pode desaparecer; cadastro com histórico só é inativado,
 * porque apagá-lo levaria as ocorrências junto (FK em cascata) e destruiria
 * meses já fechados.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FinanceItem } from "@/lib/financeModel";
import { ITEM_DECISION_HINTS, ItemDeleteDecision } from "@/lib/financeDeletePolicy";
import {
  deleteFinanceItemSafe,
  fetchItemDeleteDecision,
  inactivateFinanceItemSafe,
} from "@/lib/financeSafeDelete";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FinanceItem;
  /** Chamado após sucesso — dono da tela recarrega e fecha o formulário. */
  onDone: () => void;
}

export default function FinanceItemDeleteModal({ open, onOpenChange, item, onDone }: Props) {
  const [decision, setDecision] = useState<ItemDeleteDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchItemDeleteDecision(item.id);
    setDecision(result);
    setLoading(false);
  }, [item.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const run = async () => {
    if (!decision) return;
    setRunning(true);
    const result =
      decision.action === "delete"
        ? await deleteFinanceItemSafe(item.id)
        : await inactivateFinanceItemSafe(item.id);
    setRunning(false);
    if (!result.ok) {
      toast.error(result.message ?? "Não foi possível concluir");
      return;
    }
    toast.success(decision.action === "delete" ? "Cadastro excluído" : "Cadastro inativado");
    onOpenChange(false);
    onDone();
  };

  const actionable = decision?.action === "delete" || decision?.action === "inactivate";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            O histórico financeiro é imutável: nada que já foi pago pode ser apagado.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !decision ? (
          <p className="text-sm text-destructive">
            Não foi possível verificar o histórico deste cadastro. Tente novamente.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{ITEM_DECISION_HINTS[decision.action]}</p>
            {decision.occurrence_count > 0 && (
              <p className="text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <span>
                  {decision.occurrence_count === 1
                    ? "1 lançamento registrado"
                    : `${decision.occurrence_count} lançamentos registrados`}{" "}
                  serão preservados.
                </span>
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          {actionable && (
            <Button
              variant={decision?.action === "delete" ? "destructive" : "default"}
              onClick={run}
              disabled={running}
            >
              {running
                ? "Processando..."
                : decision?.action === "delete"
                  ? "Excluir definitivamente"
                  : "Inativar cadastro"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
