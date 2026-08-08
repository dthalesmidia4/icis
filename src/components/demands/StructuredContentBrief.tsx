import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, Megaphone, Pencil, Printer, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface ContentBrief {
  version?: number;
  code?: string;
  format_label?: string;
  territory?: string;
  message_central?: string;
  connection_to_paulo?: string;
  concept_format?: string;
  execution_label?: string;
  strategic_validation?: {
    publish_now?: string;
    perception_need?: string;
    only_paulo_can_say?: string;
    concrete_value?: string;
    campaign_contribution?: string;
  };
  screen_texts?: string[];
  cover_text?: string[];
  capture?: string[];
  production_editing?: string[];
  stories?: string[];
  mandatory_validation?: string[];
  sources?: string[];
  [key: string]: any;
}

const VALIDATION_QUESTIONS: { key: keyof NonNullable<ContentBrief["strategic_validation"]>; label: string }[] = [
  { key: "publish_now", label: "Por que publicar agora?" },
  { key: "perception_need", label: "Que percepção ou necessidade trabalha?" },
  { key: "only_paulo_can_say", label: "O que só Paulo pode dizer?" },
  { key: "concrete_value", label: "Qual valor concreto entrega?" },
  { key: "campaign_contribution", label: "Como contribui para a campanha?" },
];

const LIST_FIELDS: { key: keyof ContentBrief; label: string }[] = [
  { key: "screen_texts", label: "Textos na tela" },
  { key: "cover_text", label: "Texto da capa" },
  { key: "capture", label: "Captação" },
  { key: "production_editing", label: "Produção e edição" },
];

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">{children}</h4>
);

const Field = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value || !value.trim()) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
};

const ListBlock = ({ label, items, ordered }: { label: string; items: string[]; ordered?: boolean }) => {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-[2px] text-[10px] font-black text-primary">{ordered ? String(i + 1).padStart(2, "0") : "—"}</span>
            <span className="flex-1">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface Props {
  brief: ContentBrief;
  demandTypeLabel?: string | null;
  publishDate?: string | null;
  publishTime?: string | null;
  objective?: string | null;
  description?: string | null;
  instructions?: string | null;
  postCaption?: string | null;
  adPlan?: Record<string, any> | null;
  isAnuncio?: boolean;
  isGrafica?: boolean;
  graficaWarning?: string;
  readOnly?: boolean;
  onOpenAnuncio?: () => void;
  /** Persiste o JSON completo do briefing. */
  onSaveBrief?: (next: ContentBrief) => Promise<void> | void;
  /** Campos canônicos editáveis (instructions / post_caption). */
  onChangeInstructions?: (value: string) => void;
  onBlurInstructions?: () => void;
  onChangePostCaption?: (value: string) => void;
  onBlurPostCaption?: () => void;
}

export default function StructuredContentBrief({
  brief,
  demandTypeLabel,
  publishDate,
  publishTime,
  objective,
  description,
  instructions,
  postCaption,
  adPlan,
  isAnuncio,
  isGrafica,
  graficaWarning,
  readOnly,
  onOpenAnuncio,
  onSaveBrief,
  onChangeInstructions,
  onBlurInstructions,
  onChangePostCaption,
  onBlurPostCaption,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContentBrief>(brief);
  const [saving, setSaving] = useState(false);

  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (brief.code) parts.push(brief.code);
    if (publishDate) {
      try {
        parts.push(format(parseISO(publishDate), "EEE, dd MMM", { locale: ptBR }).toUpperCase().replace(".", ""));
      } catch {
        parts.push(publishDate);
      }
    }
    if (publishTime) parts.push(publishTime.slice(0, 5));
    return parts.join(" • ");
  }, [brief.code, publishDate, publishTime]);

  const validation = brief.strategic_validation || {};
  const answered = VALIDATION_QUESTIONS.filter((q) => (validation as any)[q.key]?.toString().trim()).length;

  const startEdit = () => {
    setDraft(brief);
    setEditing(true);
  };

  const setDraftField = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setDraftList = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value.split("\n").map((l) => l.trim()).filter(Boolean) }));
  const setDraftValidation = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, strategic_validation: { ...(prev.strategic_validation || {}), [key]: value } }));

  const save = async () => {
    if (!onSaveBrief) return;
    setSaving(true);
    try {
      // Preserva chaves desconhecidas: draft parte do JSON original.
      await onSaveBrief({ ...brief, ...draft, version: brief.version ?? 1 });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const editableListFields = [...LIST_FIELDS, { key: "stories" as const, label: "Sequência de Stories" }, { key: "mandatory_validation" as const, label: "Validação obrigatória" }, { key: "sources" as const, label: "Base / fontes" }];

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Editar briefing</SectionTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-1.5 h-8">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 h-8">
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Código</p>
            <Input value={draft.code || ""} onChange={(e) => setDraftField("code", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Formato final</p>
            <Input value={draft.format_label || ""} onChange={(e) => setDraftField("format_label", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Território</p>
            <Input value={draft.territory || ""} onChange={(e) => setDraftField("territory", e.target.value)} />
          </div>
        </div>

        {[
          { key: "message_central", label: "Mensagem central" },
          { key: "connection_to_paulo", label: "Conexão concreta com Paulo" },
          { key: "concept_format", label: "Conceito e formato final" },
          { key: "execution_label", label: "Rótulo da execução" },
        ].map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <Textarea
              value={(draft as any)[key] || ""}
              onChange={(e) => setDraftField(key, e.target.value)}
              className="min-h-[64px] resize-y"
            />
          </div>
        ))}

        <Separator />
        <SectionTitle>Validação estratégica</SectionTitle>
        {VALIDATION_QUESTIONS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <Textarea
              value={(draft.strategic_validation as any)?.[key] || ""}
              onChange={(e) => setDraftValidation(key as string, e.target.value)}
              className="min-h-[60px] resize-y"
            />
          </div>
        ))}

        <Separator />
        {editableListFields.map(({ key, label }) => (
          <div key={key as string} className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              {label} <span className="normal-case font-medium tracking-normal">(um item por linha)</span>
            </p>
            <Textarea
              value={asList((draft as any)[key]).join("\n")}
              onChange={(e) => setDraftList(key as string, e.target.value)}
              className="min-h-[70px] resize-y"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* A) META DO CONTEÚDO */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          {metaLine && <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{metaLine}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            {demandTypeLabel && <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{demandTypeLabel}</Badge>}
            {brief.format_label && <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{brief.format_label}</Badge>}
            {brief.territory && <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{brief.territory}</Badge>}
          </div>
        </div>
        {!readOnly && onSaveBrief && (
          <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5 h-8">
            <Pencil className="h-3.5 w-3.5" /> Editar briefing
          </Button>
        )}
      </div>

      {/* B) RESUMO ESTRATÉGICO */}
      <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
        <SectionTitle>Resumo estratégico</SectionTitle>
        <Field label="Objetivo" value={objective} />
        <Field label="Contexto" value={description?.replace(/<[^>]*>/g, " ").trim()} />
        <Field label="Mensagem central" value={brief.message_central} />
        <Field label="Conexão concreta com Paulo" value={brief.connection_to_paulo} />
        <Field label="Conceito e formato final" value={brief.concept_format} />
      </div>

      {/* C) VALIDAÇÃO ESTRATÉGICA */}
      {answered > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SectionTitle>Por que este conteúdo existe</SectionTitle>
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] font-black",
                answered === 5 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {answered}/5
            </span>
          </div>
          <ol className="space-y-2.5">
            {VALIDATION_QUESTIONS.map((q, i) => {
              const answer = (validation as any)[q.key];
              if (!answer) return null;
              return (
                <li key={q.key} className="border-l-2 border-border pl-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {i + 1}. {q.label}
                  </p>
                  <p className="text-sm leading-relaxed">{answer}</p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* D) EXECUÇÃO */}
      {(instructions || !readOnly) && (
        <div className="space-y-2">
          <SectionTitle>{brief.execution_label || "Execução"}</SectionTitle>
          {readOnly || !onChangeInstructions ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {(instructions || "").replace(/<[^>]*>/g, " ")}
            </div>
          ) : (
            <Textarea
              value={instructions || ""}
              onChange={(e) => onChangeInstructions(e.target.value)}
              onBlur={onBlurInstructions}
              className="min-h-[140px] resize-y text-sm"
              placeholder="Texto da arte, estrutura dos slides ou roteiro de fala."
            />
          )}
        </div>
      )}

      {LIST_FIELDS.map(({ key, label }) => (
        <ListBlock key={key as string} label={label} items={asList((brief as any)[key])} />
      ))}

      {/* E) LEGENDA PRONTA */}
      {(postCaption || !readOnly) && (
        <div className="space-y-2">
          <SectionTitle>Legenda pronta para publicação</SectionTitle>
          {readOnly || !onChangePostCaption ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{postCaption || ""}</div>
          ) : (
            <Textarea
              value={postCaption || ""}
              onChange={(e) => onChangePostCaption(e.target.value)}
              onBlur={onBlurPostCaption}
              className="min-h-[110px] resize-y text-sm"
            />
          )}
        </div>
      )}

      {/* F) STORIES */}
      {asList(brief.stories).length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Sequência de Stories</SectionTitle>
          <div className="space-y-1.5">
            {asList(brief.stories).map((s, i) => (
              <div key={i} className="rounded-md border border-border bg-card/40 px-3 py-2 text-sm leading-relaxed">
                {s}
              </div>
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Apoio à demanda principal — não gera novas demandas.
          </p>
        </div>
      )}

      {/* G) ANÚNCIO */}
      {isAnuncio && (
        <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Anúncio</SectionTitle>
            {onOpenAnuncio && (
              <Button size="sm" variant="ghost" onClick={onOpenAnuncio} className="h-7 gap-1.5 text-xs">
                <Megaphone className="h-3.5 w-3.5" /> Abrir aba Anúncio
              </Button>
            )}
          </div>
          {adPlan && Object.keys(adPlan).length > 0 ? (
            <dl className="grid gap-1.5 sm:grid-cols-2">
              {Object.entries(adPlan)
                .filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== "")
                .map(([k, v]) => (
                  <div key={k} className="text-sm">
                    <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd className="leading-relaxed">{typeof v === "object" ? JSON.stringify(v) : `${v}`}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Plano de anúncio ainda não preenchido.</p>
          )}
        </div>
      )}

      {/* H) GRÁFICA */}
      {isGrafica && (
        <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <Printer className="h-3.5 w-3.5" /> Gráfica
          </p>
          {graficaWarning && <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">{graficaWarning}</p>}
          <p className="text-xs text-muted-foreground">
            Conferir as validações gráficas listadas em “Validação obrigatória” antes do fechamento.
          </p>
        </div>
      )}

      {/* I) VALIDAÇÃO OBRIGATÓRIA */}
      {asList(brief.mandatory_validation).length > 0 && (
        <div className="space-y-2">
          <SectionTitle>Validação obrigatória</SectionTitle>
          <ul className="space-y-1.5">
            {asList(brief.mandatory_validation).map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[3px] border border-muted-foreground/50" />
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* J) BASE */}
      {asList(brief.sources).length > 0 && (
        <div className="space-y-1">
          <SectionTitle>Base</SectionTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{asList(brief.sources).join(" · ")}</p>
        </div>
      )}
    </div>
  );
}
