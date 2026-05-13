import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Settings2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  periodId: string | null;
}

interface PeriodConfig {
  period_title: string;
  period_start: string;
  period_end: string;
  priority_channel: string | null;
  budget: string | null;
  observations: string | null;
  production_line: any;
}

function parseBlocks(text: string): { title: string; lines: { key: string; value: string }[] }[] {
  if (!text) return [];
  // Splits by "=== BLOCO N — TITLE ===" or "=== TITLE ==="
  const parts = text.split(/^===\s*/m).map(p => p.trim()).filter(Boolean);
  const blocks: { title: string; lines: { key: string; value: string }[] }[] = [];
  for (const part of parts) {
    const titleMatch = part.match(/^(.*?)\s*===\s*$/m) || part.match(/^(.+)$/m);
    const title = (titleMatch?.[1] || "Seção").trim();
    const body = part.replace(/^.*?===\s*\n?/, "").trim();
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const idx = l.indexOf(":");
      if (idx > 0 && idx < 80) {
        return { key: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim() };
      }
      return { key: "", value: l };
    });
    blocks.push({ title, lines });
  }
  return blocks;
}

export default function PeriodConfigViewerModal({ open, onOpenChange, periodId }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PeriodConfig | null>(null);

  useEffect(() => {
    if (!open || !periodId) return;
    setLoading(true);
    supabase
      .from("period_plans")
      .select("period_title, period_start, period_end, priority_channel, budget, observations, production_line")
      .eq("id", periodId)
      .maybeSingle()
      .then(({ data }) => {
        setData(data as any);
        setLoading(false);
      });
  }, [open, periodId]);

  const blocks = data?.observations ? parseBlocks(data.observations) : [];
  const productionLine = Array.isArray(data?.production_line) ? data!.production_line : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Configurações do Período
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nada para exibir.</p>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-5">
              {/* Header */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <h3 className="font-semibold text-base">{data.period_title}</h3>
                <div className="text-sm text-muted-foreground">
                  {data.period_start} — {data.period_end}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {data.priority_channel && (
                    <Badge variant="secondary">Canal: {data.priority_channel}</Badge>
                  )}
                  {data.budget && <Badge variant="secondary">Orçamento: {data.budget}</Badge>}
                </div>
                {productionLine.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Linha de produção</p>
                    <div className="flex flex-wrap gap-2">
                      {productionLine.map((p: any, i: number) => (
                        <Badge key={i} variant="outline">
                          {p.type}: {p.quantity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Blocks parsed from observations */}
              {blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nenhuma resposta detalhada armazenada para este período.
                </p>
              ) : (
                blocks.map((b, i) => (
                  <div key={i} className="rounded-lg border border-border p-4">
                    <h4 className="font-semibold text-sm text-primary mb-3 uppercase tracking-wide">
                      {b.title}
                    </h4>
                    <div className="space-y-2">
                      {b.lines.map((l, j) => (
                        <div key={j} className="text-sm">
                          {l.key ? (
                            <>
                              <span className="font-medium text-foreground">{l.key}:</span>{" "}
                              <span className="text-muted-foreground whitespace-pre-wrap">{l.value}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground whitespace-pre-wrap">{l.value}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
