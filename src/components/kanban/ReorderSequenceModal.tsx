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
import { computeReorder, type ReorderCardInput, type ReorderProposal } from "@/lib/reorderSequence";
import { useWorkHoursConfig } from "@/hooks/useWorkHoursConfig";

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    computeReorder(cards, { workHours })
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
  }, [open, cards, workHours]);

  const changedCount = proposals.filter((p) => p.changed && !p.skipped).length;
  const warningCount = proposals.filter((p) => p.warning).length;

  const cardById = new Map(cards.map((c) => [c.id, c]));

  async function handleApply() {
    const toUpdate = proposals.filter((p) => p.changed);
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
          A IA estima duração por tipo (Estático 20min, Carrossel 40min, Vídeo curto 2h, Vídeo longo 3h), respeita
          janela 09:00–18:00 e pula finais de semana/feriados. Cards com data de publicação vêm primeiro.
        </div>

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
                          <Badge variant="outline" className="text-[10px]">
                            {p.durationMin}min
                          </Badge>
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
