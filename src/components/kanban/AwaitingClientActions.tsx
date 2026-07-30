import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { proceedDemand, getPipelineSequence } from "@/lib/proceedDemand";
import { cn } from "@/lib/utils";

interface Props {
  demandId: string;
  tenantId: string;
  demandTypeKey?: string | null;
  currentFunctionKey?: string | null;
  onDone?: () => void;
}

// Cache em módulo: evita uma query por card na coluna.
const sequenceCache = new Map<string, Promise<{ function_key: string; name: string }[]>>();

function loadSequence(tenantId: string, demandTypeKey?: string | null) {
  const key = `${tenantId}::${demandTypeKey || "__none__"}`;
  let p = sequenceCache.get(key);
  if (!p) {
    p = getPipelineSequence(tenantId, (demandTypeKey as any) ?? null).catch(() => []);
    sequenceCache.set(key, p);
  }
  return p;
}

/**
 * Ações rápidas para cards em "Aguardando cliente":
 * permite marcar como aprovado pelo cliente sem abrir o card,
 * indicando para qual etapa o card seguirá.
 */
export default function AwaitingClientActions({
  demandId,
  tenantId,
  demandTypeKey,
  currentFunctionKey,
  onDone,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nextStageName, setNextStageName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!tenantId) return;
    loadSequence(tenantId, demandTypeKey).then((seq) => {
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
  }, [tenantId, demandTypeKey, currentFunctionKey]);

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    try {
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
    } catch (err) {
      console.error("[awaitingClient] approve error", err);
      toast.error("Erro ao prosseguir a demanda.");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  const label = confirming
    ? nextStageName
      ? `Confirmar envio para ${nextStageName}?`
      : "Confirmar aprovação?"
    : nextStageName
      ? `Cliente aprovou · Enviar para ${nextStageName}`
      : "Cliente aprovou · Prosseguir";

  return (
    <button
      type="button"
      onClick={handleApprove}
      onMouseLeave={() => setConfirming(false)}
      disabled={loading}
      className={cn(
        "w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border transition-colors font-semibold text-[11px] leading-tight",
        confirming
          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
          : "border-border/60 text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-500/10",
      )}
      title={confirming ? "Confirmar aprovação" : "Cliente aprovou"}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
      {!loading && !confirming && <ArrowRight className="h-3 w-3 shrink-0" />}
    </button>
  );
}
