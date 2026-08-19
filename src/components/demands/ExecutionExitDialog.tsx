/**
 * AVISO DE SAÍDA DE PASSAGEM (Execução com pendências).
 *
 * Nunca bloqueia: informa e oferece as quatro saídas canônicas —
 * Cancelar · Ver execução · Marcar tudo e continuar · Continuar com pendências.
 * Serve tanto para um card quanto para um lote (uma única confirmação).
 */
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface ExecutionExitDialogEntry {
  cardId: string;
  cardLabel?: string;
  pending: number;
  total: number;
  pendingTexts: string[];
}

interface Props {
  open: boolean;
  busy?: boolean;
  entries: ExecutionExitDialogEntry[];
  /** Rótulo da ação em curso ("Prosseguir", "Transferir", …). */
  actionLabel?: string;
  onCancel: () => void;
  /** Ausente quando não há para onde navegar (ex.: ação em lote). */
  onViewExecution?: () => void;
  onCompleteAll: () => void;
  onKeepPending: () => void;
}

export default function ExecutionExitDialog({
  open,
  busy,
  entries,
  actionLabel,
  onCancel,
  onViewExecution,
  onCompleteAll,
  onKeepPending,
}: Props) {
  const cards = entries.length;
  const pending = entries.reduce((s, e) => s + e.pending, 0);
  const total = entries.reduce((s, e) => s + e.total, 0);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Execução desta etapa com pendências</AlertDialogTitle>
          <AlertDialogDescription>
            {cards > 1
              ? `${cards} cards saem desta etapa com ${pending} tarefa(s) de execução não concluída(s).`
              : `${pending} de ${total} tarefa(s) desta etapa ainda não foram concluídas.`}{" "}
            Você pode continuar mesmo assim — a passagem fica registrada como
            concluída com pendências.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-border/60 p-2">
          {entries.map((e) => (
            <div key={e.cardId}>
              {cards > 1 && (
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">
                  {e.cardLabel || "Card"} · {e.pending}/{e.total}
                </p>
              )}
              <ul className="space-y-0.5">
                {e.pendingTexts.map((t, i) => (
                  <li key={`${e.cardId}-${i}`} className="text-xs text-muted-foreground">
                    • {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          {onViewExecution && (
            <Button variant="ghost" disabled={busy} onClick={onViewExecution}>
              Ver execução
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={onCompleteAll}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Marcar tudo e continuar
          </Button>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onKeepPending();
            }}
          >
            {actionLabel ? `${actionLabel} com pendências` : "Continuar com pendências"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
