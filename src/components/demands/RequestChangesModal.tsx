import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import { canConfirmChangeRequest, normalizeDraftItems, type ChangeRequestMode } from "@/lib/demandChangeRequests";

export interface RequestChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'regress' = card volta de etapa; 'standalone' = solicitação avulsa pela aba. */
  mode?: ChangeRequestMode;
  /** Nome da etapa de destino (para onde o card vai voltar). */
  targetStageName?: string | null;
  /** Nome de quem vai receber a demanda de volta, quando conhecido. */
  targetUserName?: string | null;
  loading?: boolean;
  /** Executa a ação. `notes`/`items` já normalizados pelo modal. */
  onConfirm: (payload: { notes: string; itemTexts: string[] }) => void | Promise<void>;
}

/**
 * Modal de registro de alterações. Em `regress` acompanha a volta do card
 * (registro opcional); em `standalone` cria a solicitação sem mover o card.
 */
export default function RequestChangesModal({
  open,
  onOpenChange,
  mode = "regress",
  targetStageName,
  targetUserName,
  loading = false,
  onConfirm,
}: RequestChangesModalProps) {
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<string[]>([""]);

  useEffect(() => {
    if (open) {
      setNotes("");
      setItems([""]);
    }
  }, [open]);

  const normalized = normalizeDraftItems(items);
  const canConfirm = canConfirmChangeRequest(mode, notes, items);

  const updateItem = (index: number, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? value : it)));
  };


  return (
    <Dialog open={open} onOpenChange={(v) => (!loading ? onOpenChange(v) : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" />
            Solicitar alterações
          </DialogTitle>
          <DialogDescription>
            {targetStageName
              ? <>A demanda voltará para <strong>{targetStageName}</strong>{targetUserName ? <> ({targetUserName})</> : null}. Descreva exatamente o que precisa ser alterado.</>
              : "Descreva exatamente o que precisa ser alterado."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="change-notes" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              O que precisa ser alterado
            </Label>
            <Textarea
              id="change-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: a arte precisa usar a cor da marca e o texto do slide 2 está confuso."
              rows={4}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Checklist de alterações (opcional)
            </Label>
            <div className="space-y-2">
              {items.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) => updateItem(index, e.target.value)}
                    placeholder={`Item ${index + 1}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setItems((prev) => [...prev, ""]);
                      }
                    }}
                  />
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remover item"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setItems((prev) => [...prev, ""])}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar item
            </Button>
            {normalized.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {normalized.length} item(ns) serão criados como checklist para o executor.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm({ notes, itemTexts: items })}
            disabled={loading || isEmpty}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Voltar demanda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
