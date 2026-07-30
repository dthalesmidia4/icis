import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { proceedDemand, getPipelineSequence, recordStageDeliveries } from "@/lib/proceedDemand";
import { recordFlowHistory } from "@/lib/flowHistory";
import { createOrUpdateScheduleDispatch } from "@/lib/createScheduleDispatch";
import { cn } from "@/lib/utils";

interface Props {
  demandId: string;
  tenantId: string;
  demandTypeKey?: string | null;
  currentFunctionKey?: string | null;
  /** Área e origem definem quais etapas existem no fluxo do card. */
  workArea?: string | null;
  origin?: string | null;
  /** Dados usados para agendar direto quando o card já está pronto. */
  clientId?: string | null;
  publishDate?: string | null;
  publishTime?: string | null;
  caption?: string | null;
  attachments?: any[] | null;
  demandType?: string | null;
  title?: string | null;
  onDone?: () => void;
}

// Cache em módulo: evita uma query por card na coluna.
const sequenceCache = new Map<string, Promise<{ function_key: string; name: string }[]>>();

function loadSequence(
  tenantId: string,
  demandTypeKey?: string | null,
  workArea?: string | null,
  origin?: string | null,
) {
  const area = workArea === "sistemas" ? "sistemas" : "midia";
  const org = origin || "interno";
  const key = `${tenantId}::${demandTypeKey || "__none__"}::${area}::${org}`;
  let p = sequenceCache.get(key);
  if (!p) {
    p = getPipelineSequence(tenantId, (demandTypeKey as any) ?? null, {
      workArea: area,
      origin: org,
    }).catch(() => []);
    sequenceCache.set(key, p);
  }
  return p;
}


const fmtSchedule = (date?: string | null, time?: string | null): string | null => {
  if (!date || !time) return null;
  const hm = time.slice(0, 5);
  const d = new Date(`${date}T${hm}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hm}`;
};

/** Data/horário de publicação existem e ainda são futuros. */
const isFutureSchedule = (date?: string | null, time?: string | null): boolean => {
  if (!date || !time) return false;
  const d = new Date(`${date}T${time.slice(0, 5)}:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > Date.now() - 60_000;
};

/**
 * Ações rápidas para cards em "Aguardando cliente".
 *
 * Quando o card já tem tudo para publicar (data/horário futuros e mídia anexada),
 * a aprovação do cliente agenda o post diretamente: cria o disparo, move o card
 * para "Agendar Publicação" e desaloca o responsável.
 * Caso contrário, mantém o fluxo normal para a próxima etapa.
 */
export default function AwaitingClientActions({
  demandId,
  tenantId,
  demandTypeKey,
  currentFunctionKey,
  workArea,
  origin,
  clientId,
  publishDate,
  publishTime,
  caption,
  attachments,
  demandType,
  title,
  onDone,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nextStageName, setNextStageName] = useState<string | null>(null);

  const scheduleLabel = fmtSchedule(publishDate, publishTime);
  const canSchedule = useMemo(() => {
    if (!clientId || !tenantId) return false;
    if (!isFutureSchedule(publishDate, publishTime)) return false;
    const files = (attachments || []).filter((a: any) => a && a.url);
    return files.length > 0;
  }, [clientId, tenantId, publishDate, publishTime, attachments]);

  useEffect(() => {
    let alive = true;
    if (!tenantId || canSchedule) return;
    loadSequence(tenantId, demandTypeKey, workArea, origin).then((seq) => {
      if (!alive || !seq?.length) return;
      const currentKey = (currentFunctionKey || "aguardando_cliente").toLowerCase();
      let idx = seq.findIndex((f) => f.function_key === currentKey);
      // "aguardando_cliente" pode não constar na sequência exigida: usa "enviar_cliente" como âncora.
      if (idx < 0) idx = seq.findIndex((f) => f.function_key === "enviar_cliente");
      const next = idx >= 0 ? seq[idx + 1] : null;
      if (next) setNextStageName(next.name);
    });
    return () => {
      alive = false;
    };
  }, [tenantId, demandTypeKey, currentFunctionKey, canSchedule, workArea, origin]);


  const handleSchedule = async () => {
    const result = await createOrUpdateScheduleDispatch({
      cardId: demandId,
      tenantId,
      clientId: clientId as string,
      publishDate: publishDate as string,
      publishTime: publishTime as string,
      caption: caption || null,
      attachments: (attachments as any) || [],
      demandType: demandType || null,
      title: title || null,
    });

    if (!result.ok) {
      toast.error(result.error || "Não foi possível agendar a publicação.");
      return;
    }

    // Resolve o status "Agendar Publicação" dentro do pipeline do próprio card.
    let scheduleStatusId: string | null = null;
    try {
      const { data: demand } = await supabase
        .from("demands")
        .select("pipeline_id, assigned_to")
        .eq("id", demandId)
        .maybeSingle();
      const pipelineId = (demand as any)?.pipeline_id;
      if (pipelineId) {
        const { data: st } = await supabase
          .from("pipeline_statuses")
          .select("id")
          .eq("pipeline_id", pipelineId)
          .eq("name", "Agendar Publicação")
          .maybeSingle();
        scheduleStatusId = (st as any)?.id || null;
      }

      const previousAssignee = (demand as any)?.assigned_to || null;

      const payload: any = {
        current_function_key: "publicar",
        assigned_to: null,
        client_wait_started_at: null,
        client_resend_count: 0,
        client_last_resend_at: null,
        updated_at: new Date().toISOString(),
      };
      if (scheduleStatusId) payload.status_id = scheduleStatusId;

      const { error } = await supabase.from("demands").update(payload).eq("id", demandId);
      if (error) {
        console.error("[awaitingClient] schedule demand update error", error);
        toast.error("Publicação agendada, mas houve erro ao atualizar o card.");
        onDone?.();
        return;
      }

      await recordStageDeliveries(tenantId, demandId, currentFunctionKey || null, [previousAssignee]);
      await recordFlowHistory({
        tenantId,
        demandId,
        action: "proceeded",
        fromUserId: previousAssignee,
        toUserId: null,
        fromFunctionKey: currentFunctionKey || null,
        toFunctionKey: "publicar",
        metadata: { scheduled_at: `${publishDate} ${publishTime}`, via: "cliente_aprovou_agendar" },
      } as any);
    } catch (e) {
      console.error("[awaitingClient] schedule post-update error", e);
    }

    toast.success(`Publicação agendada para ${scheduleLabel}.`);
    onDone?.();
  };

  const handleProceed = async () => {
    const res = await proceedDemand({
      demandId,
      tenantId,
      demandTypeKey: demandTypeKey ?? null,
      currentFunctionKey: currentFunctionKey ?? null,
    });
    if (res.success) {
      toast.success(res.message || "Aprovado pelo cliente. Demanda seguiu no fluxo.");
      onDone?.();
    } else {
      toast.error(res.message || "Não foi possível prosseguir a demanda.");
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    try {
      if (canSchedule) await handleSchedule();
      else await handleProceed();
    } catch (err) {
      console.error("[awaitingClient] approve error", err);
      toast.error("Erro ao prosseguir a demanda.");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  // Duas linhas curtas: evita truncar dentro da largura da coluna.
  const actionLine = canSchedule
    ? `Agendar post · ${scheduleLabel}`
    : nextStageName
      ? `Enviar para ${nextStageName}`
      : "Prosseguir no fluxo";

  const topLine = confirming ? "Confirmar?" : "Cliente aprovou";
  const Icon = canSchedule ? CalendarClock : Check;

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseLeave={() => setConfirming(false)}
      disabled={loading}
      className={cn(
        "w-full min-w-0 flex items-start gap-1.5 px-2 py-1.5 rounded-md border transition-colors text-[11px] leading-tight text-left",
        confirming
          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
          : "border-border/60 text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-500/10",
      )}
      title={`Cliente aprovou · ${actionLine}`}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0 mt-0.5" />
      ) : (
        <Icon className="h-3 w-3 shrink-0 mt-0.5" />
      )}
      <span className="min-w-0 flex-1 whitespace-normal break-words">
        <span className="font-semibold">{topLine}</span>
        <span className="block opacity-90">{actionLine}</span>
      </span>
      {!loading && <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" />}
    </button>
  );
}

