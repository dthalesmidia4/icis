import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { approvePlanCard, rejectPlanCard } from "@/lib/evaluatePlanCard";
import type { PendingEvaluationCard } from "@/hooks/usePendingEvaluationCards";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: PendingEvaluationCard | null;
  tenantId: string | null;
  onDone?: () => void;
}

export function EvaluatePlanCardModal({ open, onOpenChange, card, tenantId, onDone }: Props) {
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [ctx, setCtx] = useState<{ pipelineId: string; initialStatusId: string } | null>(null);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    (async () => {
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .maybeSingle();
      if (!pipeline) return;
      const { data: st } = await supabase
        .from("pipeline_statuses")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .eq("is_initial", true)
        .maybeSingle();
      if (cancelled) return;
      if (st?.id) setCtx({ pipelineId: pipeline.id, initialStatusId: st.id });
    })();
    return () => { cancelled = true; };
  }, [open, tenantId]);

  if (!card) return null;

  const handleApprove = async () => {
    if (!tenantId || !ctx) return;
    setBusy("approve");
    try {
      await approvePlanCard({
        card: card.card,
        source: card.source,
        tenantId,
        clientId: card.clientId,
        periodId: card.periodId,
        pipelineId: ctx.pipelineId,
        initialStatusId: ctx.initialStatusId,
      });
      toast.success(`"${card.title}" aprovado e enviado ao Kanban!`);
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao aprovar card");
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!tenantId) return;
    setBusy("reject");
    try {
      // Fetch fresh plan state to avoid stale updates
      const { data: period, error } = await supabase
        .from("period_plans")
        .select("default_plan, ultra_plan, rejected_plan")
        .eq("id", card.periodId)
        .single();
      if (error || !period) throw error;
      await rejectPlanCard({
        periodId: card.periodId,
        card: card.card,
        source: card.source,
        indexInPlan: card.indexInPlan,
        currentDefault: Array.isArray(period.default_plan) ? period.default_plan : [],
        currentUltra: Array.isArray(period.ultra_plan) ? period.ultra_plan : [],
        currentRejected: Array.isArray((period as any).rejected_plan) ? (period as any).rejected_plan : [],
      });
      toast.success("Card reprovado e enviado para reavaliação");
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao reprovar card");
    } finally {
      setBusy(null);
    }
  };

  const raw: any = card.card;
  const desc = raw?.conteudo ?? raw?.descricao ?? raw?.description ?? raw?.texto_da_peca ?? "";
  const objetivo = raw?.objetivo ?? raw?.objective ?? "";
  const legenda = raw?.legenda ?? raw?.caption ?? raw?.post_caption ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
              {card.clientName} · {card.periodTitle}
            </span>
            <span className="text-lg">{card.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {card.demandType && <Badge variant="secondary">{card.demandType}</Badge>}
            {card.channel && <Badge variant="outline">{card.channel}</Badge>}
            {card.suggestedDate && (
              <Badge variant="outline">Data sugerida: {card.suggestedDate}</Badge>
            )}
            {card.source === "ultra" && (
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40">
                Ultra
              </Badge>
            )}
          </div>

          {objetivo && (
            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Objetivo</h4>
              <p className="text-sm whitespace-pre-wrap">{objetivo}</p>
            </section>
          )}
          {desc && (
            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Conteúdo</h4>
              <p className="text-sm whitespace-pre-wrap">{desc}</p>
            </section>
          )}
          {legenda && (
            <section>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Legenda sugerida</h4>
              <p className="text-sm whitespace-pre-wrap">{legenda}</p>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={!!busy}
            className="text-destructive hover:text-destructive"
          >
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
            Reprovar
          </Button>
          <Button onClick={handleApprove} disabled={!!busy || !ctx}>
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
            Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
