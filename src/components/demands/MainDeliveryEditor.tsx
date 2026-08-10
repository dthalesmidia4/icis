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
 *
 * Semântica por formato:
 *  - `slides`   → carrossel: UM item por slide (cada item = uma imagem).
 *  - `script`   → vídeo/reel: UM item por fala.
 *  - `art_text` → estático: UMA peça = UMA imagem. Todo o texto da arte vive
 *                 em UM único item; nunca é fragmentado em "blocos".
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
    itemLabel: () => "Texto da arte",
    hint: "Uma peça = uma imagem. Todo o texto abaixo é renderizado na MESMA arte, sem reescrita por IA.",
  },
  script: {
    title: "Roteiro",
    itemLabel: (i) => `Fala ${i + 1}`,
    hint: "Roteiro final para captação/edição do vídeo.",
  },
};

const toList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item: any) => (typeof item === "string" ? item : String(item?.text ?? item?.texto ?? "")))
        .filter((t) => typeof t === "string")
    : [];

export const resolveDeliveryField = (brief: Record<string, any> | null): DeliveryField | null => {
  if (!brief) return null;
  const kind = String(brief.delivery_kind || "").toLowerCase();
  if (kind === "carrossel") return "slides";
  if (kind === "reel" || kind === "video" || kind === "video_captado" || kind === "video_gerado") return "script";
  if (kind === "estatico" || kind === "grafica") return "art_text";
  if (Array.isArray(brief.slides) && brief.slides.length > 0) return "slides";
  if (Array.isArray(brief.script) && brief.script.length > 0) return "script";
  if (Array.isArray(brief.art_text) && brief.art_text.length > 0) return "art_text";
  return null;
};

interface MainDeliveryEditorProps {
  brief: Record<string, any>;
  field: DeliveryField;
  readOnly?: boolean;
  onSaveBrief: (next: Record<string, any>) => void;
}

export function MainDeliveryEditor({ brief, field, readOnly, onSaveBrief }: MainDeliveryEditorProps) {
  const meta = FIELD_LABELS[field];

  if (field === "art_text") {
    return <SingleArtTextEditor brief={brief} readOnly={readOnly} onSaveBrief={onSaveBrief} />;
  }

  return <ListDeliveryEditor brief={brief} field={field} readOnly={readOnly} onSaveBrief={onSaveBrief} meta={meta} />;
}

/** Estático/gráfica: UMA peça, UMA área de texto. */
function SingleArtTextEditor({
  brief,
  readOnly,
  onSaveBrief,
}: {
  brief: Record<string, any>;
  readOnly?: boolean;
  onSaveBrief: (next: Record<string, any>) => void;
}) {
  const meta = FIELD_LABELS.art_text;
  // Dados legados com múltiplos fragmentos são unidos visualmente por parágrafo.
  const initial = useMemo(
    () =>
      toList(brief.art_text)
        .map((t) => t.trim())
        .filter(Boolean)
        .join("\n\n"),
    [brief.art_text]
  );
  const [text, setText] = useState(initial);

  const commit = () => {
    const cleaned = text.replace(/\r\n/g, "\n").trim();
    if (cleaned === initial.trim()) return;
    onSaveBrief({ ...brief, art_text: cleaned ? [cleaned] : [] });
  };

  if (readOnly) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.title}</p>
        {initial ? (
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <span className="whitespace-pre-line text-sm text-foreground">{initial}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Texto da arte ainda não definido no briefing.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.title}</p>
        <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
      </div>
      <div className="rounded-lg border border-border bg-background/60 p-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          placeholder="Todo o texto que deve aparecer nesta arte"
          className="min-h-[140px] resize-y border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

/** Carrossel (um item por slide) e vídeo (um item por fala). */
function ListDeliveryEditor({
  brief,
  field,
  readOnly,
  onSaveBrief,
  meta,
}: {
  brief: Record<string, any>;
  field: "slides" | "script";
  readOnly?: boolean;
  onSaveBrief: (next: Record<string, any>) => void;
  meta: { title: string; itemLabel: (i: number) => string; hint: string };
}) {
  const initial = useMemo(() => toList(brief[field]).filter((t) => t.trim().length > 0), [brief, field]);
  const [items, setItems] = useState<string[]>(initial);

  const commit = (next: string[]) => {
    const cleaned = next.map((t) => t.trim()).filter((t) => t.length > 0);
    // Nunca persistir placeholder/vazio: roteiros deliberadamente abertos ficam vazios.
    if (cleaned.length === 0 && initial.length === 0) return;
    if (JSON.stringify(cleaned) === JSON.stringify(initial)) return;
    onSaveBrief({ ...brief, [field]: cleaned });
  };

  const capture = toList(brief.capture).filter(Boolean);

  const emptyState = (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {field === "script" ? "Roteiro propositalmente aberto / captação documental" : "Nenhum slide definido"}
      </p>
      {field === "script" && capture.length > 0 && (
        <ul className="mt-2 space-y-1">
          {capture.map((c, i) => (
            <li key={i} className="text-[12px] leading-relaxed text-muted-foreground">
              • {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (readOnly) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{meta.title}</p>
        {initial.length === 0 ? (
          emptyState
        ) : (
          <ol className="space-y-2">
            {initial.map((text, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/60 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {meta.itemLabel(i)}
                </span>
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

      {items.length === 0 ? (
        emptyState
      ) : (
        <div className="space-y-2">
          {items.map((text, i) => (
            <div key={i} className="rounded-lg border border-border bg-background/60 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {meta.itemLabel(i)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const next = items.filter((_, idx) => idx !== i);
                    setItems(next);
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
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, ""])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar {field === "slides" ? "slide" : "fala"}
      </Button>
    </div>
  );
}
