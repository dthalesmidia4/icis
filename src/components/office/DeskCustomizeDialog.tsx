import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import DeskObject from "./DeskObject";
import {
  DESK_OBJECT_KEYS,
  DESK_OBJECT_LABELS,
  MAX_DESK_OBJECTS,
  sanitizeDeskObjects,
  toggleDeskObject,
  type DeskObjectKey,
} from "@/lib/officeDeskObjects";

interface DeskCustomizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DeskObjectKey[];
  /** Deve retornar `{ error }` quando o banco recusar (RLS/rede). */
  onSave: (objects: DeskObjectKey[]) => void | Promise<unknown>;
}

/** Catálogo padrão de objetos da PRÓPRIA mesa (até 3, slots decididos pelo sistema). */
export default function DeskCustomizeDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: DeskCustomizeDialogProps) {
  const [selected, setSelected] = useState<DeskObjectKey[]>(() => sanitizeDeskObjects(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(sanitizeDeskObjects(value));
  }, [open, value]);

  const handleSave = async () => {
    setSaving(true);
    // Nunca fechar como "salvo" se o banco recusou: o hook devolve { error }.
    const result = (await onSave(selected)) as { error?: unknown } | void;
    setSaving(false);
    if (result && typeof result === "object" && "error" in result && result.error) {
      toast.error("Não foi possível salvar a personalização da mesa");
      return;
    }
    toast.success("Mesa personalizada");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar mesa</DialogTitle>
          <DialogDescription>
            Escolha até {MAX_DESK_OBJECTS} objetos. Eles aparecem sobre o seu tampo para todo o time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DESK_OBJECT_KEYS.map((key) => {
            const active = selected.includes(key);
            const blocked = !active && selected.length >= MAX_DESK_OBJECTS;
            return (
              <button
                key={key}
                type="button"
                disabled={blocked}
                onClick={() => setSelected((cur) => toggleDeskObject(cur, key))}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors",
                  active ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                  blocked && "opacity-40",
                )}
              >
                <span className="flex h-9 items-end">
                  <DeskObject objectKey={key} size={22} />
                </span>
                <span className="text-[10px] font-medium leading-tight">{DESK_OBJECT_LABELS[key]}</span>
                {active && (
                  <Check className="absolute right-1 top-1 h-3 w-3 text-primary" />
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {selected.length}/{MAX_DESK_OBJECTS} selecionados
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
