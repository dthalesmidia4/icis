import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BookCheck, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string;
  proposed: string;
  loading?: boolean;
  onConfirm: (action: "apply" | "skip", finalRequirements?: string) => void;
}

export default function ContentRequirementsDiffModal({
  open,
  onOpenChange,
  current,
  proposed,
  loading = false,
  onConfirm,
}: Props) {
  const [draft, setDraft] = useState(proposed);

  useEffect(() => {
    setDraft(proposed);
  }, [proposed, open]);

  const additions = useMemo(() => {
    const currentLines = new Set(
      (current || "").split("\n").map(l => l.trim()).filter(Boolean)
    );
    return draft
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !currentLines.has(l));
  }, [draft, current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookCheck className="w-5 h-5 text-primary" />
            Atualizar Exigências de Conteúdo do Cliente
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          A reavaliação aprendeu uma nova restrição. Revise o que será adicionado às
          <strong> Exigências de Conteúdo</strong> do cliente. Estas regras serão aplicadas em
          <strong> todas as próximas gerações de períodos e de conteúdo</strong>.
        </p>

        <ScrollArea className="flex-1 pr-4 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Exigências atuais
                </label>
                <Badge variant="outline" className="text-[10px]">read-only</Badge>
              </div>
              <Textarea
                value={current || "(vazio)"}
                readOnly
                className="min-h-[260px] text-xs font-mono bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Nova proposta (editável)
                </label>
                {additions.length > 0 && (
                  <Badge className="text-[10px] bg-emerald-600">
                    +{additions.length} linha{additions.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="min-h-[260px] text-xs font-mono"
                disabled={loading}
              />
            </div>
          </div>

          {additions.length > 0 && (
            <div className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 uppercase">
                Linhas adicionadas
              </p>
              <ul className="space-y-1">
                {additions.map((a, i) => (
                  <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300 whitespace-pre-wrap">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="ghost"
            onClick={() => onConfirm("skip")}
            disabled={loading}
          >
            Manter atual e salvar reavaliação
          </Button>
          <Button onClick={() => onConfirm("apply", draft)} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Aplicar e salvar reavaliação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
