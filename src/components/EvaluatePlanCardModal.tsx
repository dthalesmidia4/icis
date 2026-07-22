import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ThumbsUp, ThumbsDown, Pencil, ExternalLink, Save, X, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { approvePlanCard, rejectPlanCard, replacePlanCard, updatePlanCard } from "@/lib/evaluatePlanCard";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import ContentRequirementsDiffModal from "@/components/ContentRequirementsDiffModal";
import type { PendingEvaluationCard } from "@/hooks/usePendingEvaluationCards";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card: PendingEvaluationCard | null;
  tenantId: string | null;
  onDone?: () => void;
}

type Mode = "view" | "edit" | "confirm-reject";

export function EvaluatePlanCardModal({ open, onOpenChange, card, tenantId, onDone }: Props) {
  const navigate = useNavigate();
  const { setSelectedClient } = useSelectedClient();
  const [busy, setBusy] = useState<null | "approve" | "reject" | "save" | "open">(null);
  const [ctx, setCtx] = useState<{ pipelineId: string; initialStatusId: string } | null>(null);
  const [mode, setMode] = useState<Mode>("view");

  // Local snapshot of the current card payload so edits reflect immediately.
  const [localCard, setLocalCard] = useState<any>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editObjective, setEditObjective] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDate, setEditDate] = useState("");

  // Reject form
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("view");
    setRejectReason("");
    setLocalCard(card?.card ?? null);
  }, [open, card]);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    (async () => {
      const { data: pipeline } = await supabase
        .from("pipelines").select("id").eq("tenant_id", tenantId).eq("is_default", true).maybeSingle();
      if (!pipeline) return;
      const { data: st } = await supabase
        .from("pipeline_statuses").select("id").eq("pipeline_id", pipeline.id).eq("is_initial", true).maybeSingle();
      if (cancelled) return;
      if (st?.id) setCtx({ pipelineId: pipeline.id, initialStatusId: st.id });
    })();
    return () => { cancelled = true; };
  }, [open, tenantId]);

  const raw: any = localCard ?? {};
  const fields = useMemo(() => {
    const pick = (...vals: any[]) => {
      for (const v of vals) {
        if (v === null || v === undefined) continue;
        const s = typeof v === "string" ? v.trim() : v;
        if (s !== "" && s !== null && s !== undefined) return s as string;
      }
      return "";
    };
    return {
      title: pick(raw.titulo, raw.title) || (card?.title ?? ""),
      tipo: pick(raw.tipo, raw.tipo_conteudo, raw.type, raw.formato),
      channel: pick(raw.canal, raw.channel, raw.plataforma),
      date: pick(raw.data_sugerida, raw.suggested_date, raw.date, raw.publish_date, raw.data_publicacao),
      objetivo: pick(raw.objetivo, raw.objective, raw.goal),
      conteudo: pick(raw.conteudo, raw.texto_da_peca, raw.descricao_da_tarefa, raw.descricao, raw.description, raw.content, raw.copy, raw.copy_sugerida),
      instrucoes: pick(raw.instrucoes_de_producao, raw.instrucoes, raw.instructions, raw.production_instructions, raw.briefing),
      cta: pick(raw.cta_recomendado, raw.cta, raw.call_to_action),
      hook: pick(raw.hook, raw.gancho),
      tomDeVoz: pick(raw.tom_de_voz, raw.tone_of_voice),
      racional: pick(raw.racional_estrategico, raw.rationale, raw.strategic_rationale, raw.racional),
      conceitoUltra: pick(raw.conceito_ultra, raw.ultra_concept, raw.conceito),
      legenda: pick(raw.legenda, raw.caption, raw.post_caption),
      observacoes: pick(raw.observacoes, raw.observations, raw.notas, raw.notes),
    };
  }, [raw, card]);

  if (!card) return null;

  const openEdit = () => {
    setEditTitle(fields.title);
    setEditType(fields.tipo);
    setEditChannel(fields.channel);
    setEditObjective(fields.objetivo);
    setEditContent(fields.conteudo);
    setEditDate(fields.date);
    setMode("edit");
  };

  const handleSaveEdit = async () => {
    setBusy("save");
    try {
      const { data: period, error } = await supabase
        .from("period_plans").select("default_plan, ultra_plan").eq("id", card.periodId).single();
      if (error || !period) throw error;
      const updated = await updatePlanCard({
        periodId: card.periodId,
        source: card.source,
        indexInPlan: card.indexInPlan,
        currentDefault: Array.isArray(period.default_plan) ? period.default_plan : [],
        currentUltra: Array.isArray(period.ultra_plan) ? period.ultra_plan : [],
        patch: {
          titulo: editTitle,
          tipo: editType,
          canal: editChannel,
          objetivo: editObjective,
          conteudo: editContent,
          data_sugerida: editDate,
        },
      });
      if (updated) setLocalCard(updated);
      toast.success("Card atualizado");
      setMode("view");
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar edição");
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    if (!tenantId || !ctx) return;
    setBusy("approve");
    try {
      // Guarda anti-duplicação: se já existe demand com esse título no período, aborta.
      const currentTitle = fields.title;
      const { data: existing } = await supabase
        .from("demands")
        .select("id")
        .eq("period_plan_id", card.periodId)
        .eq("title", currentTitle)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.info("Este card já foi materializado como demand");
        onDone?.();
        onOpenChange(false);
        return;
      }
      await approvePlanCard({
        card: localCard ?? card.card,
        source: card.source,
        tenantId,
        clientId: card.clientId,
        periodId: card.periodId,
        pipelineId: ctx.pipelineId,
        initialStatusId: ctx.initialStatusId,
      });
      toast.success(`"${currentTitle}" aprovado e enviado ao Kanban!`);
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao aprovar card");
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!tenantId) return;
    setBusy("reject");
    try {
      const { data: period, error } = await supabase
        .from("period_plans")
        .select("default_plan, ultra_plan, rejected_plan")
        .eq("id", card.periodId)
        .single();
      if (error || !period) throw error;
      await rejectPlanCard({
        periodId: card.periodId,
        card: localCard ?? card.card,
        source: card.source,
        indexInPlan: card.indexInPlan,
        currentDefault: Array.isArray(period.default_plan) ? period.default_plan : [],
        currentUltra: Array.isArray(period.ultra_plan) ? period.ultra_plan : [],
        currentRejected: Array.isArray((period as any).rejected_plan) ? (period as any).rejected_plan : [],
        reason: rejectReason,
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

  const handleOpenFullScreen = async () => {
    setBusy("open");
    try {
      const { data: company, error } = await supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name, cnpj_cpf, email, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, mascot_url, tenant_id")
        .eq("id", card.clientId)
        .maybeSingle();
      if (error || !company) throw error ?? new Error("Cliente não encontrado");
      setSelectedClient(company as any);
      onOpenChange(false);
      navigate("/approve-cards");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível abrir a tela de aprovação");
    } finally {
      setBusy(null);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">{title}</h4>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
              {card.clientName} · {card.periodTitle}
            </span>
            <span className="text-lg break-words">{fields.title}</span>
          </DialogTitle>
        </DialogHeader>

        {mode === "view" && (
          <>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {fields.tipo && <Badge variant="secondary">{fields.tipo}</Badge>}
                {fields.channel && <Badge variant="outline">{fields.channel}</Badge>}
                {fields.date && <Badge variant="outline">Data sugerida: {fields.date}</Badge>}
                {card.source === "ultra" && (
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40">Ultra</Badge>
                )}
              </div>

              {fields.objetivo && <Section title="Objetivo">{fields.objetivo}</Section>}
              {fields.conteudo && <Section title="Conteúdo">{fields.conteudo}</Section>}
              {fields.instrucoes && <Section title="Instruções de produção">{fields.instrucoes}</Section>}
              {fields.cta && <Section title="CTA">{fields.cta}</Section>}
              {fields.hook && <Section title="Hook">{fields.hook}</Section>}
              {fields.tomDeVoz && <Section title="Tom de voz">{fields.tomDeVoz}</Section>}
              {fields.racional && <Section title="Racional estratégico">{fields.racional}</Section>}
              {fields.conceitoUltra && <Section title="Conceito ultra">{fields.conceitoUltra}</Section>}
              {fields.legenda && <Section title="Legenda sugerida">{fields.legenda}</Section>}
              {fields.observacoes && <Section title="Observações">{fields.observacoes}</Section>}
            </div>

            <DialogFooter className="gap-2 flex-wrap sm:justify-between">
              <div className="flex gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={handleOpenFullScreen} disabled={!!busy}>
                  {busy === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Abrir na tela completa
                </Button>
                <Button variant="outline" size="sm" onClick={openEdit} disabled={!!busy}>
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setMode("confirm-reject")}
                  disabled={!!busy}
                  className="text-destructive hover:text-destructive"
                >
                  <ThumbsDown className="h-4 w-4" />
                  Reprovar
                </Button>
                <Button onClick={handleApprove} disabled={!!busy || !ctx}>
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                  Aprovar
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {mode === "edit" && (
          <>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Input value={editType} onChange={(e) => setEditType(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Canal</Label>
                  <Input value={editChannel} onChange={(e) => setEditChannel(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Data sugerida</Label>
                <Input value={editDate} onChange={(e) => setEditDate(e.target.value)} placeholder="AAAA-MM-DD" />
              </div>
              <div className="space-y-1.5">
                <Label>Objetivo</Label>
                <Textarea value={editObjective} onChange={(e) => setEditObjective(e.target.value)} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Conteúdo</Label>
                <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={6} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setMode("view")} disabled={!!busy}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={!!busy}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </>
        )}

        {mode === "confirm-reject" && (
          <>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Isso remove o card do plano atual e o guarda em <strong>Cards Reprovados</strong> com o motivo informado.
                Nada é regenerado automaticamente — o sistema apenas aprende com o motivo.
                Para pedir uma nova versão, use a tela <strong>Cards Reprovados</strong> depois; para descartar
                de vez, basta deixar o card lá sem pedir reavaliação.
              </p>
              <div className="space-y-1.5">
                <Label>Motivo (opcional)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Ex: fugiu do tom da marca, ideia repetida, prazo inviável…"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setMode("view")} disabled={!!busy}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={handleConfirmReject}
                disabled={!!busy}
                className="text-destructive hover:text-destructive"
              >
                {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
                Confirmar reprovação
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
