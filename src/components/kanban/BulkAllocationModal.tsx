import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCollaborators } from "@/hooks/useCollaborators";
import { fmtMinutes } from "@/lib/reorderSequence";
import {
  applyBulkAllocation,
  collaboratorMayReceive,
  loadCollaboratorAreaFunctions,
  planBulkAllocation,
  type BulkAllocationPlan,
  type BulkSourceScreen,
} from "@/lib/bulkAllocation";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId?: string | null;
  cardIds: string[];
  sourceScreen: BulkSourceScreen;
  /** Áreas (midia/sistemas) dos cards selecionados — filtro grosseiro do seletor. */
  selectedAreas?: string[];
  activeDispatchIds?: Set<string>;
  onApplied?: () => void;
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

const stageLabel = (key?: string | null) => (key ? key.replace(/_/g, " ") : "sem etapa");

export default function BulkAllocationModal({
  open,
  onOpenChange,
  tenantId,
  cardIds,
  sourceScreen,
  selectedAreas,
  activeDispatchIds,
  onApplied,
}: Props) {
  const { collaborators, loading: loadingCollabs } = useCollaborators(tenantId ?? null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<BulkAllocationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [areasByUser, setAreasByUser] = useState<Record<string, Set<string>>>({});

  const areaSet = useMemo(() => new Set(selectedAreas || []), [selectedAreas]);
  const idsKey = useMemo(() => [...cardIds].sort().join(","), [cardIds]);

  useEffect(() => {
    if (!open) {
      setPlan(null);
      setTargetUserId(null);
      setLoading(false);
      setApplying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    loadCollaboratorAreaFunctions(tenantId)
      .then((m) => {
        if (!cancelled) setAreasByUser(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, tenantId]);

  const compute = useCallback(
    async (userId: string) => {
      if (!tenantId) return;
      setLoading(true);
      setPlan(null);
      try {
        const next = await planBulkAllocation({
          tenantId,
          cardIds,
          targetUserId: userId,
          sourceScreen,
          activeDispatchIds,
        });
        setPlan(next);
      } catch (err) {
        console.error("[bulkAllocation] plan error", err);
        toast.error("Não foi possível calcular a prévia da alocação.");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, idsKey, sourceScreen, activeDispatchIds],
  );

  useEffect(() => {
    if (open && targetUserId) void compute(targetUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetUserId, idsKey]);

  const canApply = !!plan && !loading && !applying && plan.assignments.length > 0;

  async function handleApply() {
    if (!plan) return;
    setApplying(true);
    const res = await applyBulkAllocation(plan);
    setApplying(false);

    if (res.status === "applied") {
      toast.success(res.message);
      onApplied?.();
      onOpenChange(false);
      return;
    }
    if (res.status === "stale") {
      toast.warning(res.message);
      if (targetUserId) void compute(targetUserId);
      return;
    }
    if (res.status === "partial") {
      toast.warning(res.message);
      onApplied?.();
      if (targetUserId) void compute(targetUserId);
      return;
    }
    if (res.status === "nothing") {
      toast.info(res.message);
      onOpenChange(false);
      return;
    }
    toast.error(res.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Users className="h-5 w-5 text-primary" />
            Alocar para colaborador
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {cardIds.length} card{cardIds.length === 1 ? "" : "s"} selecionado{cardIds.length === 1 ? "" : "s"} · escolha o colaborador
            </p>
            <div className="flex flex-wrap gap-2">
              {loadingCollabs && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {collaborators.map((c) => {
                const compatible = collaboratorMayReceive(areasByUser, c.userId, areaSet);
                return (
                  <button
                    key={c.userId}
                    type="button"
                    disabled={!compatible || applying}
                    onClick={() => setTargetUserId(c.userId)}
                    title={compatible ? c.roleLabel : "Sem função habilitada na área dos cards selecionados"}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      targetUserId === c.userId
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:border-primary",
                    )}
                  >
                    {c.fullName}
                    <span className="ml-1.5 opacity-70">{c.demandCount}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!targetUserId && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Escolha um colaborador para ver a fila proposta.
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando a fila real do colaborador…
            </div>
          )}

          {plan && !loading && (
            <ScrollArea className="max-h-[52vh] pr-3">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                  <Badge variant="secondary">{plan.summary.eligible} alocáveis</Badge>
                  {plan.summary.rejected > 0 && (
                    <Badge variant="destructive">{plan.summary.rejected} bloqueados</Badge>
                  )}
                  {plan.summary.rescheduledExisting > 0 && (
                    <Badge variant="outline">{plan.summary.rescheduledExisting} reagendados</Badge>
                  )}
                </div>

                <section className="space-y-1.5">
                  {plan.assignments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum card selecionado pode ser alocado para {plan.targetUserName}.
                    </p>
                  )}
                  {plan.assignments.map((a) => (
                    <div key={a.cardId} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          {a.clientName && (
                            <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-primary">
                              {a.clientName}
                            </span>
                          )}
                          <span className="text-sm font-bold text-foreground">{a.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold">
                          {a.direction === "forward" && <Badge variant="secondary">avançou etapa</Badge>}
                          {a.direction === "backward" && <Badge variant="destructive">voltou etapa</Badge>}
                          {a.fixed && <Badge variant="outline">horário fixo</Badge>}
                          {a.untimed && <Badge variant="outline">sem agenda</Badge>}
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {a.fromUserName || "Sem responsável"} <ArrowRight className="h-3 w-3" /> {plan.targetUserName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {stageLabel(a.originalFunctionKey)} <ArrowRight className="h-3 w-3" /> {stageLabel(a.resolvedFunctionKey)}
                        </span>
                        {a.durationMin != null && <span>{fmtMinutes(a.durationMin)}</span>}
                        {a.publishDate && (
                          <span>
                            publica {fmtDate(a.publishDate)}
                            {a.publishTime ? ` ${a.publishTime}` : ""}
                          </span>
                        )}
                        <span className="font-bold text-foreground">
                          {fmtDate(a.dueDate)} {a.dueTime || "--:--"} → {fmtDate(a.deliveryDate)} {a.deliveryTime || "--:--"}
                        </span>
                      </div>

                      {a.warnings.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {a.warnings.map((w, i) => (
                            <p key={i} className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </section>

                {plan.queueReschedules.length > 0 && (
                  <section>
                    <h4 className="mb-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                      Também serão reagendados
                    </h4>
                    <div className="space-y-1">
                      {plan.queueReschedules.map((q) => (
                        <div
                          key={q.cardId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px]"
                        >
                          <span className="font-bold text-foreground">{q.title}</span>
                          <span className="text-muted-foreground">
                            {fmtDate(q.fromDueDate)} {q.fromDueTime || "--:--"} → {fmtDate(q.dueDate)} {q.dueTime}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {plan.rejected.length > 0 && (
                  <section>
                    <h4 className="mb-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-destructive">
                      Não podem ser alocados
                    </h4>
                    <div className="space-y-1">
                      {plan.rejected.map((r) => (
                        <div
                          key={r.cardId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px]"
                        >
                          <span className="font-bold text-foreground">{r.title}</span>
                          <span className="text-destructive">{r.reason}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={!targetUserId || loading || applying}
            onClick={() => targetUserId && compute(targetUserId)}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" /> Recalcular
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {applying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar alocação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
