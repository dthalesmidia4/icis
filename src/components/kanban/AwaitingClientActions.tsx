import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { proceedDemand } from "@/lib/proceedDemand";
import { cn } from "@/lib/utils";

interface Props {
  demandId: string;
  tenantId: string;
  demandTypeKey?: string | null;
  currentFunctionKey?: string | null;
  onDone?: () => void;
}

/**
 * Ações rápidas para cards em "Aguardando cliente":
 * permite marcar como aprovado pelo cliente sem abrir o card.
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

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1 px-1 text-[10px]">
      <button
        type="button"
        onClick={handleApprove}
        onMouseLeave={() => setConfirming(false)}
        disabled={loading}
        className={cn(
          "ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors font-semibold",
          confirming
            ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            : "border-border/60 text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-500/10",
        )}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {confirming ? "Confirmar?" : "Cliente aprovou"}
      </button>
    </div>
  );
}
