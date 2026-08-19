import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock, Loader2, RotateCcw, Timer, Users } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCollaborators } from "@/hooks/useCollaborators";
import { fmtMinutes } from "@/lib/reorderSequence";
import { formatDuration, normalizeDurationInput } from "@/lib/durationOverrides";
import { commonValidStages, type StageOption } from "@/lib/stageOptions";
import {
  applyBulkAllocation,
  collaboratorMayReceive,
  loadCollaboratorAreaFunctions,
  planBulkAllocation,
  type BulkAllocationPlan,
  type BulkSourceScreen,
} from "@/lib/bulkAllocation";
import { useExecutionExitGuard } from "@/hooks/useExecutionExitGuard";

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

const todayISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Hoje às 17:25" / "19/08 às 09:00" */
const fmtNextAvailable = (next: { date: string; time: string } | null): string | null => {
  if (!next) return null;
  const isToday = next.date === todayISO(new Date());
  return `${isToday ? "Hoje" : fmtDate(next.date)} às ${next.time}`;
};

const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 text-[11px] font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50";

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
  /** Escolhas explícitas do gestor ANTES da transferência. */
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({});
  const [durationOverrides, setDurationOverrides] = useState<Record<string, number>>({});
  /** Texto em edição dos campos de duração (permite apagar e digitar). */
  const [durationDraft, setDurationDraft] = useState<Record<string, string>>({});
  /** Transferir/mudar etapa em lote também abandona passagens de execução. */
  const { requestBulkExit, dialog: executionExitDialog } = useExecutionExitGuard();
  const [bulkDuration, setBulkDuration] = useState("");

  const areaSet = useMemo(() => new Set(selectedAreas || []), [selectedAreas]);
  const idsKey = useMemo(() => [...cardIds].sort().join(","), [cardIds]);

  useEffect(() => {
    if (!open) {
      setPlan(null);
      setTargetUserId(null);
      setLoading(false);
      setApplying(false);
      setStageOverrides({});
      setDurationOverrides({});
      setDurationDraft({});
      setBulkDuration("");
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
    async (
      userId: string,
      overrides?: { stageOverrides?: Record<string, string>; durationOverrides?: Record<string, number> },
    ) => {
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
          stageOverrides: overrides?.stageOverrides ?? stageOverrides,
          durationOverrides: overrides?.durationOverrides ?? durationOverrides,
        });
        setPlan(next);
        // O planner devolve a duração efetiva (inclusive as já gravadas): usar
        // como valor inicial dos campos evita mostrar caixa vazia.
        setDurationDraft((prev) => {
          const merged = { ...prev };
          for (const a of next.assignments) {
            if (merged[a.cardId] === undefined && a.durationMin != null) {
              merged[a.cardId] = String(a.durationMin);
            }
          }
          return merged;
        });
      } catch (err) {
        console.error("[bulkAllocation] plan error", err);
        toast.error("Não foi possível calcular a prévia da alocação.");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, idsKey, sourceScreen, activeDispatchIds, stageOverrides, durationOverrides],
  );

  useEffect(() => {
    if (open && targetUserId) void compute(targetUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetUserId, idsKey]);

  /** Etapas válidas em TODOS os cards — base do "aplicar etapa a todos". */
  const sharedStages = useMemo(
    () => (plan ? commonValidStages(plan.assignments.map((a) => a.stageOptions)) : []),
    [plan],
  );

  const applyStage = (cardId: string, functionKey: string) => {
    const next = { ...stageOverrides };
    if (!functionKey) delete next[cardId];
    else next[cardId] = functionKey;
    setStageOverrides(next);
    if (targetUserId) void compute(targetUserId, { stageOverrides: next });
  };

  const applyStageToAll = (functionKey: string) => {
    if (!plan) return;
    const next: Record<string, string> = { ...stageOverrides };
    for (const a of plan.assignments) {
      if (!functionKey) delete next[a.cardId];
      else if (a.stageOptions.some((o) => o.functionKey === functionKey && o.valid)) next[a.cardId] = functionKey;
    }
    setStageOverrides(next);
    if (targetUserId) void compute(targetUserId, { stageOverrides: next });
  };

  const commitDuration = (cardId: string, raw: string) => {
    const next = { ...durationOverrides };
    const parsed = raw.trim() === "" ? null : normalizeDurationInput(raw);
    if (parsed) next[cardId] = parsed;
    else delete next[cardId];
    setDurationDraft((prev) => ({ ...prev, [cardId]: parsed ? String(parsed) : "" }));
    setDurationOverrides(next);
    if (targetUserId) void compute(targetUserId, { durationOverrides: next });
  };

  const applyDurationToAll = () => {
    if (!plan) return;
    const parsed = bulkDuration.trim() === "" ? null : normalizeDurationInput(bulkDuration);
    const next: Record<string, number> = { ...durationOverrides };
    const drafts: Record<string, string> = { ...durationDraft };
    for (const a of plan.assignments) {
      if (a.untimed) continue;
      if (parsed) {
        next[a.cardId] = parsed;
        drafts[a.cardId] = String(parsed);
      } else {
        delete next[a.cardId];
        drafts[a.cardId] = "";
      }
    }
    setDurationDraft(drafts);
    setDurationOverrides(next);
    if (targetUserId) void compute(targetUserId, { durationOverrides: next });
  };

  const resetChoices = () => {
    setStageOverrides({});
    setDurationOverrides({});
    setDurationDraft({});
    setBulkDuration("");
    if (targetUserId) void compute(targetUserId, { stageOverrides: {}, durationOverrides: {} });
  };

  const canApply = !!plan && !loading && !applying && plan.assignments.length > 0;

  async function handleApply() {
    if (!plan) return;
    setApplying(true);
    // Uma única confirmação para o lote; cada run é fechado só se o card moveu.
    const exiting = plan.assignments
      .filter((a) => !a.sameAssignee)
      .map((a) => ({ id: a.cardId, label: plan.cards[a.cardId]?.title || undefined }));
    let res: Awaited<ReturnType<typeof applyBulkAllocation>> = {
      status: "nothing",
      message: "Nada para alocar.",
      appliedIds: [],
      failed: [],
    };
    const guard = await requestBulkExit({
      cards: exiting,
      reason: "bulk_allocation",
      actionLabel: "Alocar",
      perform: async () => {
        res = await applyBulkAllocation(plan);
        const moved = new Set(exiting.map((c) => c.id));
        return { appliedIds: res.appliedIds.filter((id) => moved.has(id)) };
      },
    });
    setApplying(false);
    if (guard.cancelled) return;

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

  const renderStageSelect = (cardId: string, options: StageOption[], value: string | null) => (
    <select
      className={selectClass}
      value={value || ""}
      disabled={applying || loading || options.length === 0}
      onChange={(e) => applyStage(cardId, e.target.value)}
      aria-label="Etapa de destino"
    >
      {options.length === 0 && <option value="">etapa automática</option>}
      {options.map((o) => (
        <option key={o.functionKey} value={o.functionKey} disabled={!o.valid}>
          {stageLabel(o.functionKey)}
          {o.valid ? "" : ` — ${o.reasonLabel}`}
        </option>
      ))}
    </select>
  );

  return (
    <>
      {executionExitDialog}
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
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-primary">
                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                    {plan.nextAvailable
                      ? `Próximo horário operacional de ${plan.targetUserName}: ${fmtNextAvailable(plan.nextAvailable)}`
                      : `Nenhum horário operacional novo será usado para ${plan.targetUserName}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                  <Badge variant="secondary">
                    {plan.summary.eligible} de {plan.summary.eligible + plan.summary.rejected} alocáveis
                  </Badge>
                  {plan.summary.rejected > 0 && (
                    <Badge variant="destructive">{plan.summary.rejected} bloqueados</Badge>
                  )}
                  {plan.summary.rescheduledExisting > 0 && (
                    <Badge variant="outline">{plan.summary.rescheduledExisting} reagendados</Badge>
                  )}
                  <Badge variant="outline">
                    <Timer className="mr-1 h-3 w-3" />
                    total {formatDuration(plan.summary.totalOperationalMin)}
                  </Badge>
                  {plan.summary.stageChanged > 0 && (
                    <Badge variant="secondary">{plan.summary.stageChanged} com etapa alterada</Badge>
                  )}
                  {plan.summary.durationCustomized > 0 && (
                    <Badge variant="secondary">{plan.summary.durationCustomized} com tempo ajustado</Badge>
                  )}
                </div>

                {/* Controles em massa: etapa e tempo ANTES da transferência. */}
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                      Etapa para todos
                    </span>
                    <select
                      className={selectClass}
                      defaultValue=""
                      disabled={applying || sharedStages.length === 0}
                      onChange={(e) => applyStageToAll(e.target.value)}
                      aria-label="Aplicar etapa a todos os cards"
                    >
                      <option value="">
                        {sharedStages.length === 0 ? "nenhuma etapa comum" : "manter etapa sugerida"}
                      </option>
                      {sharedStages.map((s) => (
                        <option key={s.functionKey} value={s.functionKey}>
                          {stageLabel(s.functionKey)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                      Tempo para todos (min)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        value={bulkDuration}
                        disabled={applying}
                        onChange={(e) => setBulkDuration(e.target.value)}
                        className="h-8 w-24 text-[11px] font-bold"
                        placeholder="padrão"
                      />
                      <Button size="sm" variant="outline" className="h-8" disabled={applying} onClick={applyDurationToAll}>
                        Aplicar
                      </Button>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={applying}
                    onClick={resetChoices}
                    title="Voltar para etapa sugerida e tempo padrão"
                  >
                    Limpar ajustes
                  </Button>
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
                          {a.stageSource === "manual" && <Badge variant="secondary">etapa definida</Badge>}
                          {a.direction === "forward" && <Badge variant="secondary">avançou etapa</Badge>}
                          {a.direction === "backward" && <Badge variant="destructive">voltou etapa</Badge>}
                          {a.fixed && <Badge variant="outline">horário fixo</Badge>}
                          {a.untimed && (
                            <Badge variant="outline">
                              {a.untimedReason === "awaiting_client" ? "aguardando cliente" : "publicação agendada"}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Controle explícito de etapa e tempo deste card. */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {renderStageSelect(a.cardId, a.stageOptions, a.resolvedFunctionKey)}
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={5}
                            step={5}
                            disabled={applying || a.untimed}
                            value={durationDraft[a.cardId] ?? (a.durationMin != null ? String(a.durationMin) : "")}
                            onChange={(e) =>
                              setDurationDraft((prev) => ({ ...prev, [a.cardId]: e.target.value }))
                            }
                            onBlur={(e) => commitDuration(a.cardId, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitDuration(a.cardId, (e.target as HTMLInputElement).value);
                            }}
                            className="h-8 w-20 text-[11px] font-bold"
                            placeholder="min"
                            aria-label="Tempo operacional em minutos"
                          />
                          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                            min
                            {a.defaultDurationMin != null && a.durationSource === "manual"
                              ? ` · padrão ${formatDuration(a.defaultDurationMin)}`
                              : ""}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {a.fromUserName || "Sem responsável"} <ArrowRight className="h-3 w-3" /> {plan.targetUserName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {stageLabel(a.originalFunctionKey)} <ArrowRight className="h-3 w-3" /> {stageLabel(a.resolvedFunctionKey)}
                        </span>
                        {!a.untimed && a.durationMin != null && <span>{fmtMinutes(a.durationMin)}</span>}
                        {a.publishDate && (
                          <span>
                            publica {fmtDate(a.publishDate)}
                            {a.publishTime ? ` ${a.publishTime}` : ""}
                          </span>
                        )}
                        {a.untimed ? (
                          <span className="font-bold text-foreground">
                            Sem agenda operacional
                            {a.untimedReason === "awaiting_client" ? " — aguardando cliente" : ""}
                          </span>
                        ) : a.dueDate ? (
                          <span className="font-bold text-foreground">
                            {fmtDate(a.dueDate)} {a.dueTime || "--:--"} → {fmtDate(a.deliveryDate)}{" "}
                            {a.deliveryTime || "--:--"}
                            {a.fixed ? " (horário fixo)" : ""}
                          </span>
                        ) : (
                          <span className="font-bold text-foreground">Horário não alterado</span>
                        )}
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
    </>
  );
}
