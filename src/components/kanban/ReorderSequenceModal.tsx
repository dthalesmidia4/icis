import { useEffect, useState } from "react";
import { Loader2, Wand2, AlertTriangle, ArrowRight } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { computeReorder, hasPublishDateCandidates, type ReorderCardInput, type ReorderProposal, type StageDurationOverrides } from "@/lib/reorderSequence";
import { loadDurationsForTenant } from "@/lib/flowDurations";
import { useWorkHoursConfig } from "@/hooks/useWorkHoursConfig";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columnName: string;
  cards: ReorderCardInput[];
  tenantId?: string | null;
  onApplied?: () => void;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function ReorderSequenceModal({ open, onOpenChange, columnName, cards, tenantId, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposals, setProposals] = useState<ReorderProposal[]>([]);
  const { config: workHours } = useWorkHoursConfig(tenantId ?? null);
  const [durations, setDurations] = useState<StageDurationOverrides>({});

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    loadDurationsForTenant(tenantId).then((d) => {
      if (!cancelled) setDurations(d);
    });
    return () => { cancelled = true; };
  }, [open, tenantId]);


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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    computeReorder(cards, { workHours, durations, prioritizePublishDate: showPublishToggle && prioritizeByPublish })
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
  }, [open, cards, workHours, prioritizeByPublish, showPublishToggle]);

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
    let ok = 0;
    let fail = 0;
    for (const p of toUpdate) {
      const { error } = await supabase
        .from("demands")
        .update({
          due_date: p.startISO,
          due_time: p.startTime,
          delivery_date: p.endISO,
          delivery_time: p.endTime,
        })
        .eq("id", p.id);
      if (error) {
        console.error("[reorder] update error", p.id, error);
        fail += 1;
      } else {
        ok += 1;
      }
    }
    setApplying(false);
    if (fail === 0) {
      toast.success(`${ok} card${ok === 1 ? "" : "s"} reorganizado${ok === 1 ? "" : "s"}.`);
    } else {
      toast.warning(`${ok} atualizados · ${fail} falharam.`);
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
          Pula finais de semana/feriados. Cards em <b>Aguardando cliente</b> não são reagendados.
        </div>

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
                const newStart = `${fmtDate(p.startISO)} ${p.startTime}`;
                const newEnd = `${fmtDate(p.endISO)} ${p.endTime}`;
                return (
                  <div
                    key={p.id}
                    className={
                      "border rounded-lg p-3 " +
                      (p.warning
                        ? "border-amber-500/50 bg-amber-500/5"
                        : p.changed
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/60")
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-6">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground line-through">{origStart}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold text-foreground">{newStart}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-semibold text-foreground">{newEnd}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {p.durationMin}min
                          </Badge>
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
