/**
 * ABA "EXECUÇÃO" do card.
 *
 * Mostra o que o RESPONSÁVEL DA ETAPA ATUAL precisa executar agora (checklist
 * da passagem atual) e o histórico das passagens anteriores. Não é retrabalho:
 * retrabalho continua na aba "Alterações".
 *
 * O checklist NUNCA bloqueia o fluxo — ele apenas orienta e avisa.
 */
import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  computeExecutionProgress,
  countPendingExecutionItems,
  passLabel,
  type ExecutionRunWithItems,
} from "@/lib/demandExecutionRules";

export interface ExecutionPanelProps {
  active: ExecutionRunWithItems | null;
  history: ExecutionRunWithItems[];
  loading?: boolean;
  readOnly?: boolean;
  /** Rótulo legível da etapa atual (ex.: "Editar"). */
  stageLabel?: string;
  /** Rótulo legível do tipo de atividade atual. */
  typeLabel?: string;
  userNames?: Record<string, string>;
  stageLabels?: Record<string, string>;
  /** Aviso de contexto (ex.: checklist de rascunho ainda não salvo). */
  notice?: string;
  onAddItem: (text: string) => void | Promise<void>;
  onToggleItem: (itemId: string, completed: boolean) => void | Promise<void>;
  onDeleteItem: (itemId: string) => void | Promise<void>;
  onCompleteAll?: () => void | Promise<void>;
  busyItemId?: string | null;
  adding?: boolean;
  completingAll?: boolean;
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

const humanize = (key?: string | null) => (key ? key.replace(/_/g, " ") : "sem etapa");

export default function ExecutionPanel({
  active,
  history,
  loading = false,
  readOnly = false,
  stageLabel,
  typeLabel,
  userNames = {},
  stageLabels = {},
  notice,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onCompleteAll,
  busyItemId = null,
  adding = false,
  completingAll = false,
}: ExecutionPanelProps) {
  const [draft, setDraft] = useState("");

  const progress = computeExecutionProgress(active);
  const pending = countPendingExecutionItems(active);

  const labelFor = (key?: string | null) =>
    (key && (stageLabels[key] || humanize(key))) || "sem etapa";

  const submit = async () => {
    const text = draft.trim();
    if (!text || adding) return;
    setDraft("");
    await onAddItem(text);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando execução...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          {notice}
        </p>
      )}
      <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
            <Workflow className="h-3 w-3" />
            Execução · {stageLabel || labelFor(active?.function_key)}
          </Badge>
          {typeLabel && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {typeLabel}
            </span>
          )}
          {active && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {passLabel(active.pass_number)}
            </span>
          )}
          {progress.total > 0 && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {progress.done} de {progress.total} concluídos
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {active ? fmt(active.created_at) : "—"}
            {active?.assigned_to && userNames[active.assigned_to]
              ? ` · ${userNames[active.assigned_to]}`
              : ""}
          </span>
        </div>

        {(!active || active.items.length === 0) && (
          <p className="text-xs text-muted-foreground">
            Nenhuma tarefa registrada nesta passagem. O checklist orienta a execução, mas nunca
            bloqueia a passagem do card.
          </p>
        )}

        {active && active.items.length > 0 && (
          <div className="space-y-1.5">
            {[...active.items]
              .sort((a, b) => a.position - b.position)
              .map((item) => (
                <div
                  key={item.id}
                  className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60"
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
                          ? "block text-sm text-muted-foreground line-through"
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
                  {busyItemId === item.id ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    !readOnly && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover tarefa"
                        className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() => void onDeleteItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )
                  )}
                </div>
              ))}
          </div>
        )}

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              placeholder="O que precisa ser feito nesta etapa?"
              className="h-8 text-sm"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={adding || !draft.trim()}
              onClick={() => void submit()}
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Adicionar
            </Button>
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

      {history.length > 0 && (
        <div className="space-y-2">
          <Separator />
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            Passagens anteriores
          </p>
          {history.map((run) => {
            const p = computeExecutionProgress(run);
            return (
              <div key={run.id} className="rounded-lg border border-border/60 p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-bold uppercase tracking-wide text-foreground">
                    {labelFor(run.function_key)}
                  </span>
                  <span>{passLabel(run.pass_number)}</span>
                  {run.assigned_to && userNames[run.assigned_to] && (
                    <span>· {userNames[run.assigned_to]}</span>
                  )}
                  {p.total > 0 && (
                    <span>
                      · {p.done} de {p.total} concluídos
                    </span>
                  )}
                  {run.status === "completed_with_pending" && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
                    >
                      passou com pendências
                    </Badge>
                  )}
                  <span className="ml-auto">{fmt(run.completed_at || run.created_at)}</span>
                </div>
                {run.items.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {[...run.items]
                      .sort((a, b) => a.position - b.position)
                      .map((i) => (
                        <li
                          key={i.id}
                          className={
                            i.is_completed
                              ? "text-xs text-muted-foreground line-through"
                              : "text-xs text-amber-700 dark:text-amber-400"
                          }
                        >
                          {i.text}
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
