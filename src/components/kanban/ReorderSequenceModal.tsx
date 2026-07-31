import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2, AlertTriangle, ArrowRight, Filter, Pencil, RotateCcw, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { computeReorder, fmtMinutes, hasPublishDateCandidates, reorderTier, type ReorderCardInput, type ReorderProposal, type ReorderManualOverride, type StageDurationOverrides, type AreaScheduleMap } from "@/lib/reorderSequence";
import { loadReorderPriority, DEFAULT_REORDER_PRIORITY, type ReorderPriorityConfig } from "@/lib/reorderPriority";

import { loadDurationsByArea } from "@/lib/flowDurations";
import { useWorkHoursConfig } from "@/hooks/useWorkHoursConfig";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columnName: string;
  cards: ReorderCardInput[];
  tenantId?: string | null;
  assigneeId?: string | null;
  hasActiveFilters?: boolean;
  scheduledPublishIds?: Set<string>;
  onApplied?: () => void;

}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function toMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

export default function ReorderSequenceModal({ open, onOpenChange, columnName, cards, tenantId, assigneeId, hasActiveFilters, scheduledPublishIds, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposals, setProposals] = useState<ReorderProposal[]>([]);
  const { config: workHours } = useWorkHoursConfig(tenantId ?? null);
  const [durations, setDurations] = useState<StageDurationOverrides>({});
  const [areaSchedule, setAreaSchedule] = useState<AreaScheduleMap | undefined>(undefined);
  const [manualOverrides, setManualOverrides] = useState<Record<string, ReorderManualOverride>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    date: string;
    time: string;
    duration: string;
    endDate: string;
    endTime: string;
    /** "auto": duração derivada do motor; "manual": valor digitado pelo usuário. */
    durMode: "auto" | "manual";
    /** true quando o usuário editou o término — nesse caso a duração é derivada do intervalo. */
    endEdited: boolean;
  }>({ date: "", time: "", duration: "", endDate: "", endTime: "", durMode: "auto", endEdited: false });
  // Instante-base congelado por abertura do modal: evita que a proposta "ande" sozinha
  // a cada re-render do Kanban (realtime / tick de relógio).
  const [startFrom, setStartFrom] = useState<Date | null>(null);
  // Entrada de cada card na etapa atual (histórico de fluxo): base do cálculo de atraso.
  const [stageStarts, setStageStarts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setStartFrom((prev) => prev ?? new Date());
    else setStartFrom(null);
  }, [open]);


  // Assinatura estável dos cards: só recalcula quando algo relevante muda de fato.
  const cardsSignature = useMemo(
    () =>
      JSON.stringify(
        cards.map((c) => [
          c.id,
          c.due_date,
          c.due_time,
          c.delivery_date,
          c.delivery_time,
          c.current_function_key,
          c.work_area,
          c.publish_date,
          c.publish_time,
          c.is_daily_card,
        ])
      ),
    [cards]
  );
  const publishIdsSignature = useMemo(
    () => Array.from(scheduledPublishIds || []).sort().join(","),
    [scheduledPublishIds]
  );
  const durationsSignature = useMemo(() => JSON.stringify(durations), [durations]);
  const areaSignature = useMemo(() => JSON.stringify(areaSchedule ?? null), [areaSchedule]);
  const workHoursSignature = useMemo(() => JSON.stringify(workHours), [workHours]);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    loadDurationsByArea(tenantId).then((d) => {
      if (!cancelled) setDurations(d);
    });
    return () => { cancelled = true; };
  }, [open, tenantId]);

  // Busca a entrada na etapa atual de cada card (histórico de fluxo).
  useEffect(() => {
    if (!open || cards.length === 0) {
      setStageStarts({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("demand_flow_history")
        .select("demand_id, to_function_key, created_at")
        .in("demand_id", cards.map((c) => c.id))
        .order("created_at", { ascending: true });
      if (cancelled || error || !data) return;
      const byCard: Record<string, string> = {};
      const stageOf = new Map(cards.map((c) => [c.id, (c.current_function_key || "").trim()]));
      for (const row of data as Array<{ demand_id: string; to_function_key: string | null; created_at: string }>) {
        const stage = stageOf.get(row.demand_id);
        if (!stage || (row.to_function_key || "").trim() !== stage) continue;
        byCard[row.demand_id] = row.created_at; // último registro vence (ordem crescente)
      }
      setStageStarts(byCard);
    })();
    return () => { cancelled = true; };
  }, [open, cardsSignature]);


  // Carrega alocação por área do colaborador da coluna
  useEffect(() => {
    if (!open || !tenantId || !assigneeId) {
      setAreaSchedule(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_area_schedules")
        .select("work_area, weekday, start_time, end_time")
        .eq("tenant_id", tenantId)
        .eq("user_id", assigneeId);
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setAreaSchedule(undefined);
        return;
      }
      const map: AreaScheduleMap = { midia: {}, sistemas: {} };
      for (const row of data as any[]) {
        const area = row.work_area === "sistemas" ? "sistemas" : "midia";
        const w = Number(row.weekday);
        const s = toMinutes(row.start_time);
        const e = toMinutes(row.end_time);
        if (!Number.isFinite(w) || e <= s) continue;
        if (!map[area][w]) map[area][w] = [];
        map[area][w].push({ s, e });
      }
      for (const area of ["midia", "sistemas"] as const) {
        for (const k of Object.keys(map[area])) {
          map[area][+k].sort((a, b) => a.s - b.s);
        }
      }
      setAreaSchedule(map);
    })();
    return () => { cancelled = true; };
  }, [open, tenantId, assigneeId]);


  const showPublishToggle = hasPublishDateCandidates(cards);
  const storageKey = `reorder-priority-mode:${tenantId || "default"}`;
  const [prioritizeByPublish, setPrioritizeByPublish] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, prioritizeByPublish ? "1" : "0");
    }
  }, [prioritizeByPublish, storageKey]);

  const stageStartsSignature = useMemo(() => JSON.stringify(stageStarts), [stageStarts]);

  useEffect(() => {
    if (!open || !startFrom) return;
    let cancelled = false;
    setLoading(true);
    const enriched = cards.map((c) => ({ ...c, stage_started_at: stageStarts[c.id] ?? null }));
    computeReorder(enriched, { startFrom, workHours, durations, areaSchedule, scheduledPublishIds, manualOverrides, prioritizePublishDate: showPublishToggle && prioritizeByPublish })
      .then((r) => {
        if (!cancelled) setProposals(r);
      })
      .catch((e) => {
        console.error("[reorder] compute error", e);
        if (!cancelled) toast.error("Não foi possível calcular a nova sequência.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startFrom, cardsSignature, stageStartsSignature, workHoursSignature, durationsSignature, areaSignature, publishIdsSignature, prioritizeByPublish, showPublishToggle, manualOverrides]);


  // Limpa ajustes manuais ao fechar o modal
  useEffect(() => {
    if (!open) {
      setManualOverrides({});
      setEditingId(null);
    }
  }, [open]);

  // Mantém o rascunho do "Ajustar" coerente com a proposta recalculada:
  // ao mudar início/término a duração automática acompanha o motor.
  useEffect(() => {
    if (!editingId || manualOverrides[editingId]) return;
    const p = proposals.find((x) => x.id === editingId);
    if (!p) return;
    setDraft((d) => {
      const duration = d.durMode === "manual" ? d.duration : String(p.durationMin);
      const endDate = d.endEdited ? d.endDate : p.endISO;
      const endTime = d.endEdited ? d.endTime : p.endTime;
      if (
        d.date === p.startISO &&
        d.time === p.startTime &&
        d.endDate === endDate &&
        d.endTime === endTime &&
        d.duration === duration
      ) {
        return d;
      }
      return {
        ...d,
        date: p.startISO,
        time: p.startTime,
        endDate,
        endTime,
        duration,
      };
    });
  }, [editingId, proposals, manualOverrides]);




  const changedCount = proposals.filter((p) => p.changed && !p.skipped).length;
  const warningCount = proposals.filter((p) => p.warning).length;

  const cardById = new Map(cards.map((c) => [c.id, c]));

  async function handleApply() {
    const toUpdate = proposals.filter((p) => p.changed && !p.skipped);
    if (toUpdate.length === 0) {
      toast.info("Nada para reorganizar — a sequência já está otimizada.");
      onOpenChange(false);
      return;
    }
    setApplying(true);

    // Snapshot pré-aplicação para "Desfazer"
    const snapshots: Array<{ id: string; due_date: string | null; due_time: string | null; delivery_date: string | null; delivery_time: string | null; }> = [];
    for (const p of toUpdate) {
      const orig = cardById.get(p.id);
      if (orig) {
        snapshots.push({
          id: p.id,
          due_date: orig.due_date ?? null,
          due_time: orig.due_time ?? null,
          delivery_date: orig.delivery_date ?? null,
          delivery_time: orig.delivery_time ?? null,
        });
      }
    }

    // Buscar updated_at atual para lock otimista (evita sobrescrever edições concorrentes)
    const ids = toUpdate.map((p) => p.id);
    const { data: currentRows, error: fetchErr } = await supabase
      .from("demands")
      .select("id, updated_at")
      .in("id", ids);
    if (fetchErr) {
      console.error("[reorder] pre-fetch error", fetchErr);
      toast.error("Não foi possível verificar o estado atual dos cards.");
      setApplying(false);
      return;
    }
    const currentMap = new Map<string, string>();
    (currentRows || []).forEach((r: any) => currentMap.set(r.id, r.updated_at));

    const results = await Promise.all(
      toUpdate.map(async (p) => {
        const orig = cardById.get(p.id);
        const originalUpdatedAt = orig?.updated_at || currentMap.get(p.id);
        const liveUpdatedAt = currentMap.get(p.id);

        if (originalUpdatedAt && liveUpdatedAt && originalUpdatedAt !== liveUpdatedAt) {
          return { id: p.id, status: "conflict" as const };
        }

        let q = supabase
          .from("demands")
          .update({
            due_date: p.startISO,
            due_time: p.startTime,
            delivery_date: p.endISO,
            delivery_time: p.endTime,
            reorder_meta: p.pausedByCaptar
              ? { pausedByCaptar: p.pausedByCaptar, updatedAt: new Date().toISOString() }
              : null,
          } as any)
          .eq("id", p.id);
        if (liveUpdatedAt) q = q.eq("updated_at", liveUpdatedAt);
        const { error, data } = await q.select("id");
        if (error) {
          console.error("[reorder] update error", p.id, error);
          return { id: p.id, status: "error" as const };
        }
        if (!data || data.length === 0) return { id: p.id, status: "conflict" as const };
        return { id: p.id, status: "ok" as const };
      })
    );

    const ok = results.filter((r) => r.status === "ok").length;
    const conflicts = results.filter((r) => r.status === "conflict").length;
    const fail = results.filter((r) => r.status === "error").length;

    setApplying(false);

    if (ok > 0 && conflicts === 0 && fail === 0) {
      toast.success(`${ok} card${ok === 1 ? "" : "s"} reorganizado${ok === 1 ? "" : "s"}.`, {
        action: {
          label: "Desfazer",
          onClick: async () => {
            const undoResults = await Promise.all(
              snapshots.map((s) =>
                supabase
                  .from("demands")
                  .update({
                    due_date: s.due_date,
                    due_time: s.due_time,
                    delivery_date: s.delivery_date,
                    delivery_time: s.delivery_time,
                  })
                  .eq("id", s.id)
              )
            );
            const failed = undoResults.filter((r) => r.error).length;
            if (failed === 0) toast.success("Reorganização desfeita.");
            else toast.warning(`Desfeito parcial (${failed} falharam).`);
            onApplied?.();
          },
        },
        duration: 10000,
      });
    } else {
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} atualizados`);
      if (conflicts > 0) parts.push(`${conflicts} conflitos (cards editados durante análise)`);
      if (fail > 0) parts.push(`${fail} falharam`);
      toast.warning(parts.join(" · ") || "Nenhuma alteração aplicada.");
    }

    onApplied?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Reorganizar sequência — {columnName}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground -mt-2 mb-2">
          Duração estimada por tipo × etapa do fluxo (ex.: Carrossel em <b>Criar arte</b> 40min, em <b>Revisar</b> 10min).
          Janela {workHours.start}–{workHours.end}, almoço {workHours.lunchStart}–{workHours.lunchEnd} ({workHours.tz.replace("America/", "")}).
          Pula finais de semana/feriados. Cards em <b>Aguardando cliente</b>, <b>Captar</b> e <b>diários</b> não são reagendados.
        </div>

        {hasActiveFilters && (
          <div className="mb-3 p-2.5 rounded-md border border-amber-500/50 bg-amber-500/10 flex items-start gap-2">
            <Filter className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800 dark:text-amber-200">
              <div className="font-medium">Filtros ativos ignorados</div>
              <div className="mt-0.5 opacity-90">
                A sequência considera <b>todos os cards ativos</b> desta coluna (independente de filtros de cliente, período, status ou área) para evitar colisões silenciosas com cards ocultos.
              </div>
            </div>
          </div>
        )}

        {showPublishToggle && (
          <div className="flex items-start gap-3 mb-3 p-2.5 rounded-md border border-border/60 bg-muted/30">
            <Switch
              id="prioritize-publish"
              checked={prioritizeByPublish}
              onCheckedChange={setPrioritizeByPublish}
              disabled={loading || applying}
            />
            <div className="flex-1 min-w-0">
              <Label htmlFor="prioritize-publish" className="text-sm font-medium cursor-pointer">
                Priorizar cards com data de publicação
              </Label>
              <div className="text-xs text-muted-foreground mt-0.5">
                {prioritizeByPublish
                  ? "Reordena a sequência para publicar antes o que tem prazo mais próximo."
                  : "Preserva a sequência atual da coluna (data de início configurada)."}
                {" "}O card em execução no topo é sempre preservado.
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="secondary">Total: {proposals.length}</Badge>
          <Badge variant="secondary">Reagendados: {changedCount}</Badge>
          {warningCount > 0 && (
            <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 mr-1" /> {warningCount} com aviso
            </Badge>
          )}
          {startFrom && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 ml-auto text-xs text-muted-foreground"
              disabled={loading || applying}
              onClick={() => setStartFrom(new Date())}
              title="Recalcular usando o horário atual"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
               base {startFrom.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: workHours.tz })} · recalcular
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[55vh] pr-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculando nova sequência...
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum card elegível nessa coluna.
            </div>
          ) : (
            <div className="space-y-2">
              {proposals.map((p, i) => {
                const orig = cardById.get(p.id);
                const origStart = orig?.due_date ? `${fmtDate(orig.due_date)} ${(orig.due_time || "").slice(0, 5)}` : "—";
                const origEnd = orig?.delivery_date ? `${fmtDate(orig.delivery_date)} ${(orig.delivery_time || "").slice(0, 5)}` : "—";
                const newStart = p.startISO ? `${fmtDate(p.startISO)} ${p.startTime}` : "—";
                const newEnd = p.endISO ? `${fmtDate(p.endISO)} ${p.endTime}` : "—";
                const isEditing = editingId === p.id;
                return (
                  <div
                    key={p.id}
                    className={
                      "border rounded-lg p-3 " +
                      (p.skipped
                        ? "border-muted-foreground/30 bg-muted/30 opacity-80"
                        : p.warning
                          ? "border-amber-500/50 bg-amber-500/5"
                          : p.changed
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/60")
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-6">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {(() => {
                            const tier = orig ? reorderTier(orig) : 0;
                            const meta = tier === 2
                              ? { label: "Avaliar", cls: "border-purple-500/60 text-purple-600 dark:text-purple-400" }
                              : tier === 1
                                ? { label: "Revisão", cls: "border-amber-500/60 text-amber-600 dark:text-amber-400" }
                                : { label: "Produção", cls: "border-primary/60 text-primary" };
                            return (
                              <Badge variant="outline" className={"text-[10px] shrink-0 " + meta.cls}>
                                {meta.label}
                              </Badge>
                            );
                          })()}
                          <div className="text-sm font-medium truncate">{p.title}</div>
                          {!p.skipped && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 ml-auto shrink-0 text-xs text-muted-foreground"
                              disabled={applying || loading}
                              onClick={() => {
                                if (isEditing) { setEditingId(null); return; }
                                setEditingId(p.id);
                                setDraft({
                                  date: p.startISO,
                                  time: p.startTime,
                                  duration: String(p.durationMin),
                                  endDate: p.endISO,
                                  endTime: p.endTime,
                                  durMode: "auto",
                                  endEdited: false,
                                });
                              }}
                            >
                              <Pencil className="h-3 w-3 mr-1" /> Ajustar
                            </Button>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {p.skipped ? (
                            <span className="text-muted-foreground">{origStart}</span>
                          ) : p.keepStart ? (
                            <>
                              <span className="text-muted-foreground">Em execução desde:</span>
                              <span className="text-foreground">{newStart}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Novo término:</span>
                              <span className="text-muted-foreground line-through">{origEnd}</span>
                              <span className="font-semibold text-foreground">{newEnd}</span>
                              <Badge variant="outline" className="text-[10px]">
                                +{fmtDuration(p.extensionMin || p.durationMin)}
                              </Badge>
                              {p.pinned && (
                                <Badge variant="outline" className="text-[10px] border-primary/60 text-primary">
                                  <Pin className="h-3 w-3 mr-1" /> {p.pinnedKind === "both" ? "início e término ajustados" : p.pinnedKind === "end" ? "término ajustado" : "início ajustado"}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-muted-foreground">Anterior:</span>
                              <span className="text-muted-foreground line-through">{origStart} → {origEnd}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Proposto:</span>
                              <span className="font-semibold text-foreground">{newStart}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-semibold text-foreground">{newEnd}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {fmtDuration(p.durationMin)}
                              </Badge>
                              {p.pinned && (
                                <Badge variant="outline" className="text-[10px] border-primary/60 text-primary">
                                  <Pin className="h-3 w-3 mr-1" /> {p.pinnedKind === "both" ? "início e término ajustados" : p.pinnedKind === "end" ? "término ajustado" : "início ajustado"}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        {p.keepStart && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Na etapa atual desde {p.stageStartISO && p.stageStartTime ? `${fmtDate(p.stageStartISO)} ${p.stageStartTime}` : "—"}
                            {p.stagePlannedMin ? ` · tempo planejado na etapa ${fmtDuration(p.stagePlannedMin)} · extensão de 30% = ${fmtDuration(p.extensionMin || 0)}` : ""}
                          </div>
                        )}

                        {isEditing && (
                          <div className="mt-2 p-2 rounded-md border border-border/60 bg-muted/30">
                            <div className="flex flex-wrap items-end gap-2">
                              {p.keepStart ? (
                                <>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">Novo término (data)</Label>
                                    <Input
                                      type="date"
                                      className="h-8 w-[9.5rem] text-xs"
                                      value={draft.endDate}
                                      onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">Hora</Label>
                                    <Input
                                      type="time"
                                      className="h-8 w-[6.5rem] text-xs"
                                      value={draft.endTime}
                                      onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
                                    />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">Início</Label>
                                    <Input
                                      type="date"
                                      className="h-8 w-[9.5rem] text-xs"
                                      value={draft.date}
                                      onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">Hora</Label>
                                    <Input
                                      type="time"
                                      className="h-8 w-[6.5rem] text-xs"
                                      value={draft.time}
                                      onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">Término</Label>
                                    <Input
                                      type="date"
                                      className="h-8 w-[9.5rem] text-xs"
                                      value={draft.endDate}
                                      onChange={(e) =>
                                        setDraft((d) => ({ ...d, endDate: e.target.value, endEdited: true, durMode: "auto" }))
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">Hora</Label>
                                    <Input
                                      type="time"
                                      className="h-8 w-[6.5rem] text-xs"
                                      value={draft.endTime}
                                      onChange={(e) =>
                                        setDraft((d) => ({ ...d, endTime: e.target.value, endEdited: true, durMode: "auto" }))
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-[10px] text-muted-foreground">
                                      {draft.durMode === "manual"
                                        ? "Duração (min) — manual"
                                        : draft.endEdited
                                          ? "Duração — derivada do término"
                                          : "Duração — ajustada ao expediente e à área"}
                                    </Label>
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min={5}
                                        step={5}
                                        disabled={draft.durMode === "auto"}
                                        className="h-8 w-[6.5rem] text-xs"
                                        value={draft.duration}
                                        onChange={(e) =>
                                          setDraft((d) => ({
                                            ...d,
                                            duration: e.target.value,
                                            durMode: "manual",
                                            endEdited: false,
                                          }))
                                        }
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2 text-[10px] text-muted-foreground"
                                        onClick={() =>
                                          setDraft((d) => ({
                                            ...d,
                                            durMode: d.durMode === "auto" ? "manual" : "auto",
                                            duration: d.durMode === "manual" ? String(p.durationMin) : d.duration,
                                            endEdited: d.durMode === "auto" ? false : d.endEdited,
                                          }))
                                        }
                                      >
                                        {draft.durMode === "auto" ? "digitar" : "voltar para automática"}
                                      </Button>
                                    </div>
                                  </div>
                                </>
                              )}
                              <Button
                                size="sm"
                                className="h-8"
                                onClick={() => {
                                  const base = startFrom ?? new Date();
                                  if (p.keepStart) {
                                    if (!draft.endDate || !draft.endTime) {
                                      toast.error("Informe a data e a hora do novo término.");
                                      return;
                                    }
                                    const [hh, mm] = draft.endTime.split(":").map((x) => parseInt(x, 10) || 0);
                                    const [y, mo, dd] = draft.endDate.split("-").map((x) => parseInt(x, 10) || 0);
                                    const endLocal = new Date(y, (mo || 1) - 1, dd || 1, hh, mm, 0, 0);
                                    if (endLocal.getTime() <= base.getTime()) {
                                      toast.error("O novo término precisa ser posterior ao horário atual.");
                                      return;
                                    }
                                    setManualOverrides((prev) => ({
                                      ...prev,
                                      [p.id]: { endISO: draft.endDate, endTime: draft.endTime },
                                    }));
                                    setEditingId(null);
                                    return;
                                  }
                                  const dur = parseInt(draft.duration, 10);
                                  if (!draft.date || !draft.time) {
                                    toast.error("Informe data e hora de início.");
                                    return;
                                  }
                                  if (draft.durMode === "manual" && (!Number.isFinite(dur) || dur < 5)) {
                                    toast.error("Duração manual mínima de 5 min.");
                                    return;
                                  }
                                  const parseLocal = (dISO: string, t: string) => {
                                    const [hh, mm] = t.split(":").map((x) => parseInt(x, 10) || 0);
                                    const [y, mo, dd] = dISO.split("-").map((x) => parseInt(x, 10) || 0);
                                    return new Date(y, (mo || 1) - 1, dd || 1, hh, mm, 0, 0);
                                  };
                                  const pinEnd = draft.durMode === "auto" && draft.endEdited;
                                  if (pinEnd) {
                                    if (!draft.endDate || !draft.endTime) {
                                      toast.error("Informe a data e a hora do término.");
                                      return;
                                    }
                                    const endLocal = parseLocal(draft.endDate, draft.endTime);
                                    if (endLocal.getTime() <= parseLocal(draft.date, draft.time).getTime()) {
                                      toast.error("O término precisa ser posterior ao início.");
                                      return;
                                    }
                                    if (endLocal.getTime() <= base.getTime()) {
                                      toast.error("O término precisa ser posterior ao horário atual.");
                                      return;
                                    }
                                  }
                                  setManualOverrides((prev) => ({
                                    ...prev,
                                    [p.id]: {
                                      startISO: draft.date,
                                      startTime: draft.time,
                                      ...(draft.durMode === "manual" ? { durationMin: dur } : {}),
                                      ...(pinEnd ? { endISO: draft.endDate, endTime: draft.endTime } : {}),
                                    },
                                  }));
                                  setEditingId(null);
                                }}
                              >
                                Aplicar ajuste
                              </Button>

                              {manualOverrides[p.id] && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-muted-foreground"
                                  onClick={() => {
                                    setManualOverrides((prev) => {
                                      const next = { ...prev };
                                      delete next[p.id];
                                      return next;
                                    });
                                    setEditingId(null);
                                  }}
                                >
                                  Remover ajuste
                                </Button>
                              )}
                            </div>
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                              {p.keepStart
                                ? "Card em execução: o início histórico é preservado; apenas o término é recalculado."
                                : "Edite início e/ou término — a duração é derivada do intervalo útil (expediente da área). Ou digite a duração para que o término seja calculado."}
                            </p>
                          </div>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {p.riskStatus === "risk" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-red-500/60 text-red-600 dark:text-red-400"
                              title={`Prazo em ${fmtMinutes(Math.max(p.slackMin ?? 0, 0))} · ciclo restante ${fmtMinutes(p.remainingCycleMin || 0)}`}
                            >
                              ⚠ risco de atraso
                            </Badge>
                          )}
                          {p.riskStatus === "recent" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-slate-400/60 text-muted-foreground"
                              title="Entrou na coluna há pouco tempo e sem risco de atraso — alocado por último."
                            >
                              recém-chegado
                            </Badge>
                          )}
                          {p.remainingCycleMin ? (
                            <span className="text-muted-foreground">
                              ciclo rest. {fmtMinutes(p.remainingCycleMin)}
                              {p.slackMin != null ? ` · folga ${fmtMinutes(p.slackMin)}` : ""}
                            </span>
                          ) : null}

                          {p.spansDays && p.spansDays > 1 && (
                            <Badge variant="outline" className="text-[10px] border-blue-500/60 text-blue-600 dark:text-blue-400">
                              {p.spansDays} dias
                            </Badge>
                          )}

                          {p.slackApplied && (
                            <Badge variant="outline" className="text-[10px] border-orange-500/60 text-orange-600 dark:text-orange-400">
                              +folga
                            </Badge>
                          )}
                          {p.pausedByCaptar && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300"
                              title={`Pausado para captação: ${p.pausedByCaptar.captarTitle}`}
                            >
                              ⏸ Pausado {p.pausedByCaptar.atTime} · captação
                            </Badge>
                          )}
                          {orig?.publish_date && (
                            <span className="text-muted-foreground">
                              📢 pub {fmtDate(orig.publish_date)}
                              {orig.publish_time ? ` ${orig.publish_time.slice(0, 5)}` : ""}
                            </span>
                          )}
                        </div>
                        {p.warning && (
                          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {p.warning}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          {Object.keys(manualOverrides).length > 0 && (
            <Button
              variant="outline"
              className="mr-auto"
              disabled={applying || loading}
              onClick={() => { setManualOverrides({}); setEditingId(null); }}
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Restaurar sugestão
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={loading || applying || changedCount === 0}>
            {applying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Aplicar reorganização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
