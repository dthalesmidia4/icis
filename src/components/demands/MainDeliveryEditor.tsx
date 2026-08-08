import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Editor da ENTREGA PRINCIPAL do card.
 *
 * `content_brief` é a FONTE CANÔNICA do conteúdo final que vai para os
 * geradores de IA (slides do carrossel, texto da arte, roteiro do vídeo).
 * A coluna `description` permanece como contexto estratégico/legenda.
 */

type DeliveryField = "slides" | "art_text" | "script";

const FIELD_LABELS: Record<DeliveryField, { title: string; itemLabel: (i: number) => string; hint: string }> = {
  slides: {
    title: "Slides do carrossel",
    itemLabel: (i) => `Slide ${i + 1}`,
    hint: "Os textos abaixo são usados EXATAMENTE como estão pelos geradores de imagem.",
  },
  art_text: {
    title: "Texto da arte",
    itemLabel: (i) => `Bloco ${i + 1}`,
    hint: "Texto que deve ser renderizado na peça, sem reescrita por IA.",
  },
  script: {
    title: "Roteiro",
    itemLabel: (i) => `Fala ${i + 1}`,
    hint: "Roteiro final para captação/edição do vídeo.",
  },
};

const toList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item: any) => (typeof item === "string" ? item : String(item?.text ?? item?.texto ?? ""))).filter((t) => t !== undefined)
    : [];

export const resolveDeliveryField = (brief: Record<string, any> | null): DeliveryField | null => {
  if (!brief) return null;
  const kind = String(brief.delivery_kind || "").toLowerCase();
  if (Array.isArray(brief.slides) && brief.slides.length > 0) return "slides";
  if (Array.isArray(brief.script) && brief.script.length > 0) return "script";
  if (Array.isArray(brief.art_text) && brief.art_text.length > 0) return "art_text";
  if (kind === "carrossel") return "slides";
  if (kind === "reel" || kind === "video" || kind === "video_captado") return "script";
  if (kind === "estatico" || kind === "grafica") return "art_text";
  return null;
};

interface MainDeliveryEditorProps {
  brief: Record<string, any>;
  field: DeliveryField;
  readOnly?: boolean;
  onSaveBrief: (next: Record<string, any>) => void;
}

export function MainDeliveryEditor({ brief, field, readOnly, onSaveBrief }: MainDeliveryEditorProps) {
  const initial = useMemo(() => toList(brief[field]), [brief, field]);
  const [items, setItems] = useState<string[]>(initial.length > 0 ? initial : [""]);
  const meta = FIELD_LABELS[field];

  const commit = (next: string[]) => {
    const cleaned = next.map((t) => t.trim()).filter((t) => t.length > 0);
    onSaveBrief({ ...brief, [field]: cleaned });
  };

  if (readOnly) {
    const list = initial.filter((t) => t.trim().length > 0);
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.title}</p>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Entrega principal ainda não definida no briefing.</p>
        ) : (
          <ol className="space-y-2">
            {list.map((text, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/60 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{meta.itemLabel(i)}</span>
                <span className="mt-1 block whitespace-pre-line text-sm text-foreground">{text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.title}</p>
        <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
      </div>

      <div className="space-y-2">
        {items.map((text, i) => (
          <div key={i} className="rounded-lg border border-border bg-background/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{meta.itemLabel(i)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const next = items.filter((_, idx) => idx !== i);
                  setItems(next.length > 0 ? next : [""]);
                  commit(next);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setItems(items.map((t, idx) => (idx === i ? e.target.value : t)))}
              onBlur={() => commit(items)}
              placeholder={`Conteúdo de ${meta.itemLabel(i).toLowerCase()}`}
              className="min-h-[70px] resize-y border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, ""])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar {field === "slides" ? "slide" : field === "script" ? "fala" : "bloco"}
      </Button>
    </div>
  );
}
