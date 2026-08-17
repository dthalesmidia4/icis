import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { CheckCircle2, Clock, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  computeProgress,
  countPendingItems,
  type ChangeRequestWithItems,
} from "@/lib/demandChangeRequests";

export interface ChangeRequestPanelProps {
  active: ChangeRequestWithItems | null;
  history: ChangeRequestWithItems[];
  loading?: boolean;
  readOnly?: boolean;
  /** Mapa userId → nome, para exibir quem solicitou / concluiu. */
  userNames?: Record<string, string>;
  onToggleItem: (itemId: string, completed: boolean) => void | Promise<void>;
  onCompleteAll?: () => void | Promise<void>;
  /** Abre o modal de solicitação avulsa (não move o card). */
  onRequestChange?: () => void;
  /** Exclui a solicitação (ativa ou histórica) e seus itens. */
  onDeleteRequest?: (requestId: string) => void | Promise<void>;
  busyItemId?: string | null;
  completingAll?: boolean;
  deletingRequestId?: string | null;
}

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** Aba "Alterações": o que foi solicitado, e ponto de ação para novas solicitações. */
export default function ChangeRequestPanel({
  active,
  history,
  loading = false,
  readOnly = false,
  userNames = {},
  onToggleItem,
  onCompleteAll,
  onRequestChange,
  onDeleteRequest,
  busyItemId = null,
  completingAll = false,
  deletingRequestId = null,
}: ChangeRequestPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const progress = computeProgress(active);
  const pending = countPendingItems(active);

  const canDelete = !readOnly && !!onDeleteRequest;

  const deleteButton = (requestId: string) =>
    canDelete ? (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Excluir solicitação de alteração"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        disabled={deletingRequestId === requestId}
        onClick={() => setConfirmDeleteId(requestId)}
      >
        {deletingRequestId === requestId ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    ) : null;

  const confirmDialog = (
    <AlertDialog open={!!confirmDeleteId} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir solicitação de alteração?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação removerá esta solicitação e seus itens de checklist.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const id = confirmDeleteId;
              setConfirmDeleteId(null);
              if (id && onDeleteRequest) void onDeleteRequest(id);
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const requestButton = !readOnly && onRequestChange ? (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRequestChange}>
      <Plus className="h-3.5 w-3.5" />
      Solicitar alteração
    </Button>
  ) : null;


  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando alterações...
      </div>
    );
  }

  if (!active && history.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Nenhuma alteração solicitada para esta demanda.
        </p>
        {requestButton}
      </div>
    );
  }



  return (
    <div className="space-y-5">
      {confirmDialog}
      {requestButton && <div className="flex justify-end">{requestButton}</div>}

      {active && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
              <RotateCcw className="h-3 w-3" /> Alterações solicitadas
            </Badge>
            {progress.total > 0 && (
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {progress.done} de {progress.total} concluídos
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {fmt(active.created_at)}
              {active.requested_by && userNames[active.requested_by]
                ? ` · ${userNames[active.requested_by]}`
                : ""}
            </span>
            {deleteButton(active.id)}

          </div>

          {active.notes &&
            !(active.items.length === 1 && active.items[0].text.trim() === active.notes.trim()) && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{active.notes}</p>
          )}

          {active.items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Esta solicitação não possui itens de checklist e não conta como pendência. Você pode excluí-la.
            </p>
          )}


          {active.items.length > 0 && (
            <div className="space-y-1.5">
              {active.items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={item.is_completed}
                    disabled={readOnly || busyItemId === item.id || completingAll}
                    onCheckedChange={(v) => onToggleItem(item.id, v === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        item.is_completed
                          ? "block text-sm line-through text-muted-foreground"
                          : "block text-sm"
                      }
                    >
                      {item.text}
                    </span>
                    {item.is_completed && (
                      <span className="block text-[11px] text-muted-foreground">
                        {item.completed_by && userNames[item.completed_by]
                          ? `${userNames[item.completed_by]} · `
                          : ""}
                        {fmt(item.completed_at)}
                      </span>
                    )}
                  </span>
                  {busyItemId === item.id && (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </label>
              ))}
            </div>
          )}

          {!readOnly && pending > 0 && onCompleteAll && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={completingAll}
              onClick={() => onCompleteAll()}
            >
              {completingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Marcar tudo como feito
            </Button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <Separator />
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Histórico de alterações
          </p>
          {history.map((req) => {
            const p = computeProgress(req);
            return (
              <div key={req.id} className="rounded-md border border-border bg-card/40 p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {req.status === "resolved" ? "resolvida" : "substituída"}
                  </Badge>
                  <span>{fmt(req.created_at)}</span>
                  {req.requested_by && userNames[req.requested_by] && (
                    <span>· {userNames[req.requested_by]}</span>
                  )}
                  {p.total > 0 && <span>· {p.done}/{p.total} itens</span>}
                </div>
                {req.notes && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{req.notes}</p>
                )}
                {req.items.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {req.items.map((it) => (
                      <li
                        key={it.id}
                        className={
                          it.is_completed
                            ? "text-xs line-through text-muted-foreground"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        • {it.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
