import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, AlertCircle, Clock, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type DispatchStatus = "scheduled" | "dispatching" | "published" | "failed";

interface DispatchRow {
  id: string;
  status: DispatchStatus;
  scheduled_at: string;
  error_message: string | null;
}

interface Props {
  cardId: string;
  className?: string;
}

const DispatchStatusBadge = ({ cardId, className }: Props) => {
  const [dispatch, setDispatch] = useState<DispatchRow | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_publication_dispatches")
      .select("id, status, scheduled_at, error_message")
      .eq("card_id", cardId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setDispatch((data as DispatchRow) || null);
  }, [cardId]);

  useEffect(() => {
    fetchLatest();
    const channel = supabase
      .channel(`dispatch-${cardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_publication_dispatches", filter: `card_id=eq.${cardId}` },
        () => fetchLatest()
      )
      .subscribe();
    const interval = setInterval(fetchLatest, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [cardId, fetchLatest]);

  if (!dispatch) return null;

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      const { error: upErr } = await supabase
        .from("scheduled_publication_dispatches")
        .update({
          status: "scheduled",
          scheduled_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", dispatch.id);
      if (upErr) throw upErr;

      await supabase.functions.invoke("run-scheduled-dispatches", { body: {} });
      toast({ title: "Reenviado", description: "Tentando publicar novamente..." });
      await fetchLatest();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Falha ao reagendar", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const now = Date.now();
  const scheduledFuture = new Date(dispatch.scheduled_at).getTime() > now;
  const status = dispatch.status;

  const base = "inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit";

  if (status === "published") {
    return (
      <div className={cn(base, "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", className)}>
        <CheckCircle2 className="h-3 w-3" />
        <span>Publicado</span>
      </div>
    );
  }

  if (status === "dispatching") {
    return (
      <div className={cn(base, "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Publicando...</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <button
        type="button"
        onClick={handleRetry}
        title={dispatch.error_message || "Tentar novamente"}
        className={cn(base, "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer", className)}
      >
        {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertCircle className="h-3 w-3" />}
        <span>Falha</span>
        <span className="opacity-70">•</span>
        <RotateCw className="h-3 w-3" />
        <span>Tentar novamente</span>
      </button>
    );
  }

  // scheduled
  return (
    <div className={cn(base, scheduledFuture ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400" : "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400", className)}>
      {scheduledFuture ? <Clock className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
      <span>{scheduledFuture ? "Agendado" : "Aguardando publicação"}</span>
    </div>
  );
};

export default DispatchStatusBadge;
