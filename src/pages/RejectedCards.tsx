import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Check, Loader2, ThumbsDown, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { coerceDemandTypeKey, normalizeDemandTypeKey } from "@/lib/proceedDemand";
import { bulkRestoreNonDiscarded } from "@/lib/evaluatePlanCard";

import ContentRequirementsDiffModal from "@/components/ContentRequirementsDiffModal";
import { useRealtimePeriodPlans, useRealtimeDemands, useDebouncedCallback } from "@/hooks/realtime";

interface PeriodData {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  default_plan: any[];
  ultra_plan: any[];
  rejected_plan: any[];
}

interface RejectedCardItem {
  _index: number;
  _originalSource: string;
  _rejectedAt?: string;
  _rejectReason?: string;
  _periodId: string;
  _periodTitle?: string;
  _rejectedIndex: number;
  raw: any;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const stripClientPrefix = (title: string, clientName?: string) => {
  if (!title || !clientName) return title;
  const patterns = [
    new RegExp(`^\\s*${clientName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*[–-—:]\\s*`, "i"),
  ];
  for (const re of patterns) {
    if (re.test(title)) return title.replace(re, "").trim();
  }
  return title;
};


const pick = (...vals: any[]): string => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = typeof v === "string" ? v.trim() : v;
    if (s) return String(s);
  }
  return "";
};

const formatRejectedAt = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days <= 0) return "Hoje";
    if (days === 1) return "Ontem";
    if (days < 30) return `${days} dias atrás`;
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
};

const RejectedCards = () => {
  const navigate = useNavigate();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodData[]>([]);
  const [cards, setCards] = useState<RejectedCardItem[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [initialStatusId, setInitialStatusId] = useState<string | null>(null);
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [reevaluatingIndex, setReevaluatingIndex] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [backfilledPeriods, setBackfilledPeriods] = useState<Set<string>>(new Set());


  // Prompt for missing reason
  const [reasonPromptIndex, setReasonPromptIndex] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");

  // Diff modal state
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffSaving, setDiffSaving] = useState(false);
  const [diffCurrent, setDiffCurrent] = useState("");
  const [diffProposed, setDiffProposed] = useState("");
  const [diffMode, setDiffMode] = useState<"meaningful" | "ambiguous">("meaningful");
  const [diffReasoning, setDiffReasoning] = useState("");
  const [pendingReeval, setPendingReeval] = useState<
    | { rejectedIndex: number; periodId: string; source: "default" | "ultra"; updatedCard: any }
    | null
  >(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!selectedClient) {
      toast.error("Nenhum cliente selecionado");
      navigate("/home");
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  const debouncedRefetch = useDebouncedCallback(() => {
    fetchData();
  }, 250);

  useRealtimePeriodPlans({
    tenantId,
    clientId: selectedClient?.id ?? null,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId && !!selectedClient?.id,
  });
  useRealtimeDemands({
    tenantId,
    clientId: selectedClient?.id ?? null,
    onChange: () => debouncedRefetch(),
    enabled: !!tenantId && !!selectedClient?.id,
  });

  const fetchData = async () => {
    if (!selectedClient || !tenantId) return;
    setLoading(true);
    try {
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .single();

      if (pipeline) {
        setPipelineId(pipeline.id);
        const { data: status } = await supabase
          .from("pipeline_statuses")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .eq("is_initial", true)
          .single();
        if (status) setInitialStatusId(status.id);
      }

      const { data: periodsData, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end, default_plan, ultra_plan, rejected_plan")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const normalized: PeriodData[] = (periodsData || []).map((p: any) => ({
        ...p,
        default_plan: Array.isArray(p.default_plan) ? p.default_plan : [],
        ultra_plan: Array.isArray(p.ultra_plan) ? p.ultra_plan : [],
        rejected_plan: Array.isArray(p.rejected_plan) ? p.rejected_plan : [],
      }));

      setPeriods(normalized);

      // Backfill one-shot: cards reprovados sem `_discarded` são legados de um
      // fluxo anterior sem opção de descarte — devolvê-los para avaliação.
      const toBackfill = normalized.filter(
        (p) =>
          !backfilledPeriods.has(p.id) &&
          p.rejected_plan.some((it: any) => !it?._discarded),
      );
      if (toBackfill.length > 0) {
        let totalMoved = 0;
        for (const p of toBackfill) {
          try {
            const moved = await bulkRestoreNonDiscarded({
              periodId: p.id,
              currentDefault: p.default_plan,
              currentUltra: p.ultra_plan,
              currentRejected: p.rejected_plan,
            });
            totalMoved += moved;
          } catch (e) {
            console.warn("[RejectedCards] backfill failed for period", p.id, e);
          }
        }
        setBackfilledPeriods((prev) => {
          const next = new Set(prev);
          toBackfill.forEach((p) => next.add(p.id));
          return next;
        });
        if (totalMoved > 0) {
          toast.success(
            `${totalMoved} card(s) devolvido(s) para avaliação — só descartes explícitos permanecem aqui.`,
          );
          // Refetch limpo após o backfill.
          const { data: refreshed } = await supabase
            .from("period_plans")
            .select("id, period_title, period_start, period_end, default_plan, ultra_plan, rejected_plan")
            .eq("company_id", selectedClient.id)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
          if (refreshed) {
            const renorm: PeriodData[] = refreshed.map((p: any) => ({
              ...p,
              default_plan: Array.isArray(p.default_plan) ? p.default_plan : [],
              ultra_plan: Array.isArray(p.ultra_plan) ? p.ultra_plan : [],
              rejected_plan: Array.isArray(p.rejected_plan) ? p.rejected_plan : [],
            }));
            setPeriods(renorm);
            normalized.length = 0;
            renorm.forEach((r) => normalized.push(r));
          }
        }
      }

      // Mostra apenas descartes intencionais + respeita janela de 30 dias.
      const now = Date.now();
      const collected: RejectedCardItem[] = [];
      let globalIdx = 0;
      for (const p of normalized) {
        p.rejected_plan.forEach((item: any, i: number) => {
          if (!item?._discarded) return;
          const rejectedAt = item?._rejectedAt ? new Date(item._rejectedAt).getTime() : null;
          if (rejectedAt && now - rejectedAt > THIRTY_DAYS_MS) return;
          collected.push({
            _index: globalIdx++,
            _originalSource: item?._originalSource || "default",
            _rejectedAt: item?._rejectedAt,
            _rejectReason: item?._rejectReason,
            _periodId: p.id,
            _periodTitle: p.period_title,
            _rejectedIndex: i,
            raw: item,
          });
        });
      }
      collected.sort((a, b) => {
        const ta = a._rejectedAt ? new Date(a._rejectedAt).getTime() : 0;
        const tb = b._rejectedAt ? new Date(b._rejectedAt).getTime() : 0;
        return tb - ta;
      });
      setCards(collected);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar reprovados");
    } finally {
      setLoading(false);
    }
  };



  // Move a rejected card back into the active plan, but with a revised body from AI.
  const applyReevaluatedToActivePlan = async (
    periodId: string,
    rejectedIndex: number,
    updatedCard: any,
  ) => {
    const { data: period, error } = await supabase
      .from("period_plans")
      .select("default_plan, ultra_plan, rejected_plan")
      .eq("id", periodId)
      .single();
    if (error || !period) throw error ?? new Error("Período não encontrado");
    const rejected = Array.isArray((period as any).rejected_plan) ? [...(period as any).rejected_plan] : [];
    if (rejectedIndex < 0 || rejectedIndex >= rejected.length) {
      throw new Error("Card reprovado não encontrado");
    }
    const [removed] = rejected.splice(rejectedIndex, 1);
    const source: "default" | "ultra" = removed?._originalSource === "ultra" ? "ultra" : "default";
    const targetPlan =
      source === "ultra"
        ? [...(Array.isArray(period.ultra_plan) ? period.ultra_plan : [])]
        : [...(Array.isArray(period.default_plan) ? period.default_plan : [])];
    const { _rejectedAt, _rejectReason, _originalSource, _reevaluatedAt, ...prevClean } = removed || {};
    targetPlan.push({
      ...prevClean,
      ...updatedCard,
      _reevaluatedAt: new Date().toISOString(),
      _reevaluatedFromReject: true,
    });
    const planKey = source === "ultra" ? "ultra_plan" : "default_plan";
    const { error: upErr } = await supabase
      .from("period_plans")
      .update({
        [planKey]: targetPlan as unknown as null,
        rejected_plan: rejected as unknown as null,
      } as any)
      .eq("id", periodId);
    if (upErr) throw upErr;
  };

  const persistRequirements = async (finalRequirements: string) => {
    if (!selectedClient) return;
    const { error } = await supabase
      .from("tenant_companies")
      .update({ content_requirements: finalRequirements } as any)
      .eq("id", selectedClient.id);
    if (error) throw error;
  };

  const runReevaluate = async (index: number, reason: string) => {
    const item = cards[index];
    if (!item || !tenantId || !selectedClient) return;
    setReevaluatingIndex(index);
    try {
      const { data, error } = await supabase.functions.invoke("reevaluate-card", {
        body: {
          card: item.raw,
          reason: reason.trim(),
          clientId: selectedClient.id,
          tenantId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const payload = data as {
        updatedCard: any;
        learningStatus: "meaningful" | "none" | "ambiguous";
        learningReasoning?: string;
        requirementsProposal?: { current: string; proposed: string; additions: string };
      };
      if (!payload.updatedCard) throw new Error("A IA não retornou uma nova versão do card.");

      const source: "default" | "ultra" = item._originalSource === "ultra" ? "ultra" : "default";
      const proposal = payload.requirementsProposal || { current: "", proposed: "", additions: "" };
      const status = payload.learningStatus;

      if (status === "meaningful" || status === "ambiguous") {
        setPendingReeval({
          rejectedIndex: item._rejectedIndex,
          periodId: item._periodId,
          source,
          updatedCard: payload.updatedCard,
        });
        setDiffReasoning(payload.learningReasoning || "");
        setDiffCurrent(proposal.current || "");
        setDiffProposed(status === "meaningful" ? proposal.proposed || proposal.current || "" : proposal.current || "");
        setDiffMode(status);
        setDiffOpen(true);
      } else {
        // no learning — finalize immediately
        await applyReevaluatedToActivePlan(item._periodId, item._rejectedIndex, payload.updatedCard);
        toast.success("Nova versão gerada e enviada para avaliação");
        await fetchData();
      }
    } catch (err: any) {
      console.error("[RejectedCards] reevaluate error:", err);
      const raw = err?.context?.responseText || err?.message || "";
      const msg = /OPENAI_API_KEY|api key/i.test(raw)
        ? "Chave OpenAI ausente. Configure OPENAI_API_KEY em Dev → APIs."
        : err?.message || "Erro ao reavaliar";
      toast.error(msg);
    } finally {
      setReevaluatingIndex(null);
    }
  };

  const handleReevaluateClick = (index: number) => {
    const item = cards[index];
    if (!item) return;
    const existing = (item._rejectReason || "").trim();
    if (existing) {
      runReevaluate(index, existing);
    } else {
      setReasonDraft("");
      setReasonPromptIndex(index);
    }
  };

  const handleDiffConfirm = async (action: "apply" | "skip", finalRequirements?: string) => {
    if (!pendingReeval) return;
    setDiffSaving(true);
    try {
      if (action === "apply") {
        await persistRequirements((finalRequirements ?? "").trim());
      }
      await applyReevaluatedToActivePlan(
        pendingReeval.periodId,
        pendingReeval.rejectedIndex,
        pendingReeval.updatedCard,
      );
      toast.success(
        action === "apply"
          ? "Nova versão gerada e exigências atualizadas"
          : "Nova versão gerada e enviada para avaliação",
      );
      setDiffOpen(false);
      setPendingReeval(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao finalizar reavaliação");
    } finally {
      setDiffSaving(false);
    }
  };

  const triggerAutoGenerate = (demandTitle: string, demandType: string | null, demandId: string) => {
    const tipo = (demandType || "").toLowerCase();
    const isStaticPost = tipo.includes("post");
    const isCarousel = tipo.includes("carrossel") || tipo.includes("carousel");
    if (!isStaticPost && !isCarousel) return;
    const functionName = isCarousel ? "auto-generate-carousel" : "auto-generate-post";
    supabase.functions
      .invoke(functionName, { body: { demandId, source: "planned", minimalText: true, aiModel: "gpt2" } })
      .catch((err) => console.warn(`[RejectedCards] autoGen (${functionName}) failed`, err));
  };

  const handleApproveCard = async (index: number) => {
    if (!selectedClient || !tenantId || !pipelineId || !initialStatusId) return;
    const item = cards[index];
    if (!item) return;
    const period = periods.find((p) => p.id === item._periodId);
    if (!period) return;

    setApprovingIndex(index);
    try {
      const c = item.raw;
      const title = pick(c.titulo, c.title) || "Sem título";
      const tipo = pick(c.tipo, c.tipo_conteudo, c.type) || null;
      const channel = pick(c.canal, c.channel) || null;
      const objetivo = pick(c.objetivo, c.objective) || null;
      const conteudo = pick(c.conteudo, c.descricao, c.description) || null;
      const instrucoes = pick(c.instrucoes_de_producao) || null;
      const cta = pick(c.cta_recomendado) || null;
      const dateStr = pick(c.data_sugerida, c.suggested_date, c.date) || null;

      const instructionParts = [instrucoes, cta ? `CTA: ${cta}` : ""].filter(Boolean);
      const explicitKey = coerceDemandTypeKey((c as any).demand_type_key || (c as any).type_key);
      const demandTypeKey = explicitKey ?? normalizeDemandTypeKey(tipo);

      const { data: insertedData, error: insertError } = await supabase
        .from("demands")
        .insert({
          tenant_id: tenantId,
          client_id: selectedClient.id,
          pipeline_id: pipelineId,
          status_id: initialStatusId,
          period_plan_id: period.id,
          title,
          objective: objetivo,
          description: conteudo || null,
          instructions: instructionParts.join("\n\n") || null,
          publish_date: dateStr || null,
          channel,
          demand_type: tipo,
          demand_type_key: demandTypeKey,
          source: "card",
          observations: null,
        } as any)
        .select("id")
        .single();

      if (insertError) throw insertError;

      const updatedRejected = [...(period.rejected_plan || [])];
      updatedRejected.splice(item._rejectedIndex, 1);
      const { error: updateError } = await supabase
        .from("period_plans")
        .update({ rejected_plan: updatedRejected as unknown as null })
        .eq("id", period.id);
      if (updateError) throw updateError;

      toast.success(`"${title}" aprovado e enviado ao Kanban!`);
      if (insertedData?.id) triggerAutoGenerate(title, tipo, insertedData.id);
      await fetchData();
    } catch (error) {
      console.error("Error approving card:", error);
      toast.error("Erro ao aprovar card");
    } finally {
      setApprovingIndex(null);
    }
  };

  if (!isInitialized || !selectedClient) return null;

  const displayName = selectedClient.fantasy_name || selectedClient.name;

  return (
    <div className="container max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-12">
      {/* Título alinhado ao padrão Visão Geral (header/breadcrumb vêm do Layout) */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Reprovados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arquivo de {displayName} — últimos 30 dias. Cards descartados na avaliação ficam
            aqui caso você queira resgatar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card className="p-10 text-center mt-6">
          <ThumbsDown className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold mb-1">Nenhum card reprovado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Quando você reprovar um card e escolher <strong>Descartar</strong>, ele aparece
            aqui para eventual resgate.
          </p>
          <Button variant="outline" onClick={() => navigate("/client-hub")}>
            Voltar ao hub do cliente
          </Button>
        </Card>
      ) : (
        <div className="mt-5 space-y-3">
          {cards.map((item, idx) => {
            const c = item.raw;
            const rawTitle = pick(c.titulo, c.title) || "Sem título";
            const title = stripClientPrefix(rawTitle, displayName);
            const tipo = pick(c.tipo, c.tipo_conteudo, c.type);
            const channel = pick(c.canal, c.channel);
            const date = pick(c.data_sugerida, c.suggested_date, c.date);
            const objetivo = pick(c.objetivo, c.objective);
            const conteudo = pick(c.conteudo, c.descricao, c.description);
            const instrucoes = pick(c.instrucoes_de_producao);
            const cta = pick(c.cta_recomendado);
            const isUltra = item._originalSource === "ultra";
            const busy = approvingIndex === idx || reevaluatingIndex === idx;
            const isExpanded = expandedIdx.has(idx);
            const hasBody = !!(objetivo || conteudo || instrucoes || cta);
            const toggleExpand = () => {
              setExpandedIdx((prev) => {
                const next = new Set(prev);
                if (next.has(idx)) next.delete(idx);
                else next.add(idx);
                return next;
              });
            };
            return (
              <Card
                key={idx}
                className={cn(
                  "p-4 sm:p-5 border-l-4 transition-colors",
                  isUltra ? "border-l-amber-500/70" : "border-l-muted-foreground/30",
                )}
              >
                <div className="flex flex-col gap-3">
                  {/* Cabeçalho: cliente + metadados */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className="font-medium">
                      {displayName}
                    </Badge>
                    {isUltra && (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40">
                        Ultra
                      </Badge>
                    )}
                    {tipo && <Badge variant="outline">{tipo}</Badge>}
                    {channel && <Badge variant="outline">{channel}</Badge>}
                    {date && <Badge variant="outline">Data: {date}</Badge>}
                    {item._periodTitle && (
                      <span className="text-muted-foreground">· {item._periodTitle}</span>
                    )}
                    {item._rejectedAt && (
                      <span className="text-muted-foreground ml-auto">
                        Descartado {formatRejectedAt(item._rejectedAt)}
                      </span>
                    )}
                  </div>

                  {/* Título (sem prefixo repetido do cliente) */}
                  <h3 className="text-base sm:text-lg font-semibold leading-snug">
                    {title}
                  </h3>

                  {/* Motivo da reprovação */}
                  {item._rejectReason && (
                    <div className="rounded-md bg-muted/60 border border-border/60 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                        Motivo da reprovação
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{item._rejectReason}</p>
                    </div>
                  )}

                  {/* Conteúdo planejado (colapsável) */}
                  {hasBody && (
                    <div className="rounded-md border border-border/60">
                      <button
                        type="button"
                        onClick={toggleExpand}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
                      >
                        <span>Ver conteúdo planejado</span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="px-3 py-3 border-t border-border/60 space-y-3 text-sm">
                          {objetivo && (
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Objetivo</div>
                              <p className="whitespace-pre-wrap">{objetivo}</p>
                            </div>
                          )}
                          {conteudo && (
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Conteúdo</div>
                              <p className="whitespace-pre-wrap">{conteudo}</p>
                            </div>
                          )}
                          {instrucoes && (
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Instruções de produção</div>
                              <p className="whitespace-pre-wrap">{instrucoes}</p>
                            </div>
                          )}
                          {cta && (
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">CTA</div>
                              <p className="whitespace-pre-wrap">{cta}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                    <Button
                      size="sm"
                      onClick={() => handleReevaluateClick(idx)}
                      disabled={busy}
                      className="gap-1.5"
                    >
                      {reevaluatingIndex === idx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Reavaliar com IA
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApproveCard(idx)}
                      disabled={busy || !pipelineId || !initialStatusId || (hasBody && !isExpanded)}
                      className="gap-1.5"
                      title={hasBody && !isExpanded ? "Abra 'Ver conteúdo planejado' para revisar antes de aprovar" : undefined}
                    >
                      {approvingIndex === idx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Aprovar e enviar ao Kanban
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

      )}

      {/* Prompt to collect a reason when the archived card doesn't have one */}
      <Dialog
        open={reasonPromptIndex !== null}
        onOpenChange={(o) => {
          if (!o && reevaluatingIndex === null) setReasonPromptIndex(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Reavaliar com IA
            </DialogTitle>
            <DialogDescription>
              Este card não tem um motivo de reprovação registrado. Descreva o que você quer
              que a IA corrija — o sistema também aprende com essa observação para as próximas
              gerações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo / feedback</Label>
            <Textarea
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              rows={4}
              placeholder="Ex: fugiu do tom da marca, ideia repetida, prazo inviável…"
              disabled={reevaluatingIndex !== null}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setReasonPromptIndex(null)}
              disabled={reevaluatingIndex !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!reasonDraft.trim() || reasonPromptIndex === null) return;
                const idx = reasonPromptIndex;
                const reason = reasonDraft.trim();
                setReasonPromptIndex(null);
                await runReevaluate(idx, reason);
              }}
              disabled={!reasonDraft.trim() || reevaluatingIndex !== null}
              className="gap-1.5"
            >
              {reevaluatingIndex !== null ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Gerar nova versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContentRequirementsDiffModal
        open={diffOpen}
        onOpenChange={(o) => {
          if (!o && !diffSaving) {
            setDiffOpen(false);
            setPendingReeval(null);
          }
        }}
        current={diffCurrent}
        proposed={diffProposed}
        mode={diffMode}
        reasoning={diffReasoning}
        loading={diffSaving}
        onConfirm={handleDiffConfirm}
      />
    </div>
  );
};

export default RejectedCards;
