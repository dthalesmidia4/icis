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

export type DeliveryKind = "grafica" | "estatico" | "carrossel" | "reel";

export interface ContentBrief {
  version?: number;
  code?: string;
  format_label?: string;
  territory?: string;
  message_central?: string;
  connection_to_paulo?: string;
  concept_format?: string;
  execution_label?: string;
  /** Tipo de entrega: define quais blocos aparecem no modo leitura. */
  delivery_kind?: DeliveryKind;
  strategic_validation?: {
    publish_now?: string;
    perception_need?: string;
    only_paulo_can_say?: string;
    concrete_value?: string;
    campaign_contribution?: string;
  };
  /** Carrossel */
  slides?: string[];
  /** Reel */
  script?: string[];
  screen_texts?: string[];
  cover_text?: string[];
  capture?: string[];
  production_editing?: string[];
  /** Estático */
  art_text?: string[];
  visual_direction?: string[];
  /** Gráfica / digital */
  composition?: string[];
  info_hierarchy?: string[];
  print_specs?: string[];
  /** Amplificação (apenas quando estrategicamente aprovada) */
  amplification_stories?: string[];
  /** Legado — mantido para compatibilidade; não é renderizado como seção padrão. */
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

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];

const stripHtml = (v?: string | null) =>
  (v || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Divide um texto de instruções em slides quando ele usa marcadores "Slide N:". */
function parseSlides(text?: string | null): string[] {
  const clean = stripHtml(text);
  if (!clean) return [];
  const re = /(^|\n)\s*slide\s*\d+\s*[:.\-–]/gi;
  if (!re.test(clean)) return [];
  const parts = clean
    .split(/(?=(?:^|\n)\s*slide\s*\d+\s*[:.\-–])/gi)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts
    .filter((p) => /^slide\s*\d+/i.test(p))
    .map((p) => p.replace(/^slide\s*\d+\s*[:.\-–]\s*/i, "").trim())
    .filter(Boolean);
}

/** Remove os blocos de slides, sobrando apenas as observações gerais. */
function instructionsWithoutSlides(text?: string | null): string {
  const clean = stripHtml(text);
  if (!clean) return "";
  const idx = clean.search(/(^|\n)\s*slide\s*\d+\s*[:.\-–]/i);
  return idx > 0 ? clean.slice(0, idx).trim() : idx === 0 ? "" : clean;
}

export function resolveDeliveryKind(brief: ContentBrief, demandTypeLabel?: string | null): DeliveryKind {
  const explicit = brief.delivery_kind;
  if (explicit === "grafica" || explicit === "estatico" || explicit === "carrossel" || explicit === "reel") {
    return explicit;
  }
  const hay = `${brief.format_label || ""} ${demandTypeLabel || ""}`.toLowerCase();
  if (/santinho|gr[áa]fica|impress/.test(hay)) return "grafica";
  if (/carrossel|carousel/.test(hay)) return "carrossel";
  if (/reel|v[íi]deo|video|stories?\b/.test(hay)) return "reel";
  return "estatico";
}

/** Sinaliza ausência do dado operacional canônico (`content_brief`). */
const MissingCanonical = ({ label }: { label: string }) => (
  <div className="space-y-1">
    <h4 className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</h4>
    <p className="text-[13px] leading-relaxed text-destructive">
      Conteúdo canônico ausente no briefing — preencha na aba Conteúdo.
    </p>
  </div>
);

const SectionTitle = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <h4
    className={cn(
      "text-[11px] font-black uppercase tracking-[0.14em]",
      muted ? "text-muted-foreground/70" : "text-muted-foreground"
    )}
  >
    {children}
  </h4>
);

const Field = ({
  label,
  value,
  emphasis,
}: {
  label: string;
  value?: string | null;
  emphasis?: boolean;
}) => {
  const text = (value || "").trim();
  if (!text) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("whitespace-pre-line leading-relaxed", emphasis ? "text-[15px] font-medium" : "text-sm")}>{text}</p>
    </div>
  );
};

const ListBlock = ({
  label,
  items,
  ordered,
}: {
  label: string;
  items: string[];
  ordered?: boolean;
}) => {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-[2px] text-[10px] font-black text-primary">
              {ordered ? String(i + 1).padStart(2, "0") : "—"}
            </span>
            <span className="flex-1 whitespace-pre-line">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const TextBlock = ({ label, value }: { label: string; value?: string | null }) => {
  const text = stripHtml(value);
  if (!text) return null;
  return (
    <div className="space-y-2">
      <SectionTitle>{label}</SectionTitle>
      <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
    </div>
  );
};

interface Props {
  brief: ContentBrief;
  title?: string | null;
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
  title,
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

  const kind = resolveDeliveryKind(brief, demandTypeLabel);

  /**
   * Demanda "estruturada" = já possui `content_brief` canônico (delivery_kind
   * explícito ou algum campo de entrega preenchido). Nesse caso NÃO usamos
   * `instructions` silenciosamente como entrega principal: se o dado canônico
   * está ausente, a UI deve mostrar essa ausência em vez de parecer correta.
   */
  const isStructured = useMemo(
    () =>
      !!brief.delivery_kind ||
      asList(brief.slides).length > 0 ||
      asList(brief.script).length > 0 ||
      asList(brief.art_text).length > 0 ||
      asList(brief.composition).length > 0,
    [brief]
  );


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

  // Conteúdo da entrega principal. `content_brief` é canônico; `instructions`
  // só entra como fallback em cards LEGADOS (sem briefing estruturado).
  const slides = useMemo(() => {
    const explicit = asList(brief.slides);
    if (explicit.length) return explicit;
    return isStructured ? [] : parseSlides(instructions);
  }, [brief.slides, instructions, isStructured]);

  const generalNotes = useMemo(() => {
    if (kind === "carrossel" && slides.length) return instructionsWithoutSlides(instructions);
    return "";
  }, [kind, slides.length, instructions]);

  const scriptText = useMemo(() => {
    const explicit = asList(brief.script);
    if (explicit.length) return explicit.join("\n\n");
    return kind === "reel" && !isStructured ? stripHtml(instructions) : "";
  }, [brief.script, kind, instructions, isStructured]);

  const artText = useMemo(() => {
    const explicit = asList(brief.art_text);
    // Estático = uma peça: fragmentos legados são unidos por parágrafo.
    if (explicit.length) return explicit.join("\n\n");
    return kind === "estatico" && !isStructured ? stripHtml(instructions) : "";
  }, [brief.art_text, kind, instructions, isStructured]);

  const visualDirection = useMemo(() => {
    const explicit = asList(brief.visual_direction);
    if (explicit.length) return explicit;
    if (kind === "estatico" || kind === "grafica") {
      return [...asList(brief.capture), ...asList(brief.production_editing)];
    }
    return [];
  }, [brief.visual_direction, brief.capture, brief.production_editing, kind]);

  const composition = useMemo(() => {
    const explicit = asList(brief.composition);
    if (explicit.length) return explicit;
    return kind === "grafica" && instructions && !isStructured ? [stripHtml(instructions)] : [];
  }, [brief.composition, kind, instructions, isStructured]);


  const amplification = asList(brief.amplification_stories);

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
      await onSaveBrief({ ...brief, ...draft, version: brief.version ?? 1 });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------ MODO EDIÇÃO ------------------------------ */
  if (editing) {
    const draftKind = resolveDeliveryKind(draft, demandTypeLabel);
    const kindListFields: { key: string; label: string }[] =
      draftKind === "carrossel"
        ? [{ key: "slides", label: "Slides (um slide por linha)" }]
        : draftKind === "reel"
        ? [
            { key: "script", label: "Roteiro (um bloco por linha)" },
            { key: "screen_texts", label: "Textos na tela" },
            { key: "cover_text", label: "Capa" },
            { key: "capture", label: "Captação" },
            { key: "production_editing", label: "Edição" },
          ]
        : draftKind === "grafica"
        ? [
            { key: "composition", label: "Composição da peça" },
            { key: "info_hierarchy", label: "Hierarquia de informações" },
            { key: "visual_direction", label: "Direção visual" },
            { key: "print_specs", label: "Especificações de gráfica/digital" },
          ]
        : [
            { key: "art_text", label: "Texto da arte" },
            { key: "visual_direction", label: "Direção visual" },
          ];

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

        <div className="grid gap-3 sm:grid-cols-4">
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
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Tipo de entrega</p>
            <select
              value={draftKind}
              onChange={(e) => setDraftField("delivery_kind", e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="estatico">Estático</option>
              <option value="carrossel">Carrossel</option>
              <option value="reel">Reel</option>
              <option value="grafica">Gráfica / digital</option>
            </select>
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
        <SectionTitle>Entrega principal</SectionTitle>
        {kindListFields.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              {label} <span className="normal-case font-medium tracking-normal">(um item por linha)</span>
            </p>
            <Textarea
              value={asList((draft as any)[key]).join("\n")}
              onChange={(e) => setDraftList(key, e.target.value)}
              className="min-h-[90px] resize-y"
            />
          </div>
        ))}

        {onChangeInstructions && (
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Execução (campo de produção)
            </p>
            <Textarea
              value={instructions || ""}
              onChange={(e) => onChangeInstructions(e.target.value)}
              onBlur={onBlurInstructions}
              className="min-h-[140px] resize-y text-sm"
            />
          </div>
        )}

        {onChangePostCaption && (
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Legenda</p>
            <Textarea
              value={postCaption || ""}
              onChange={(e) => onChangePostCaption(e.target.value)}
              onBlur={onBlurPostCaption}
              className="min-h-[110px] resize-y text-sm"
            />
          </div>
        )}

        <Separator />
        {[
          { key: "amplification_stories", label: "Amplificação — Stories de apoio" },
          { key: "mandatory_validation", label: "Validação obrigatória" },
          { key: "sources", label: "Base / fontes" },
        ].map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              {label} <span className="normal-case font-medium tracking-normal">(um item por linha)</span>
            </p>
            <Textarea
              value={asList((draft as any)[key]).join("\n")}
              onChange={(e) => setDraftList(key, e.target.value)}
              className="min-h-[80px] resize-y"
            />
          </div>
        ))}
      </div>
    );
  }

  /* ------------------------------ MODO LEITURA ------------------------------ */
  return (
    <div className="space-y-7">
      {/* 1. CABEÇALHO EDITORIAL */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          {metaLine && <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{metaLine}</p>}
          {title && <h3 className="text-lg font-black leading-tight sm:text-xl">{title}</h3>}
          <div className="flex flex-wrap items-center gap-1.5">
            {demandTypeLabel && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {demandTypeLabel}
              </Badge>
            )}
            {brief.format_label && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {brief.format_label}
              </Badge>
            )}
            {brief.territory && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {brief.territory}
              </Badge>
            )}
          </div>
        </div>
        {!readOnly && onSaveBrief && (
          <Button size="sm" variant="outline" onClick={startEdit} className="h-8 gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Editar briefing
          </Button>
        )}
      </header>

      {/* 2. RESUMO ESTRATÉGICO EM DESTAQUE */}
      <section className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary/[0.06] p-4 sm:p-5">
        <SectionTitle>Resumo estratégico</SectionTitle>
        <Field label="Objetivo" value={objective} emphasis />
        <Field label="Mensagem central" value={brief.message_central} emphasis />
        <Field label="Conceito e formato final" value={brief.concept_format} emphasis />
      </section>

      {/* 3. CONTEXTO E CONEXÃO (secundários) */}
      {(stripHtml(description) || brief.connection_to_paulo) && (
        <section className="space-y-2 border-l-2 border-border pl-3">
          <SectionTitle muted>Contexto e conexão</SectionTitle>
          {stripHtml(description) && (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
              {stripHtml(description)}
            </p>
          )}
          {brief.connection_to_paulo && (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
              {brief.connection_to_paulo}
            </p>
          )}
        </section>
      )}

      {/* 4. POR QUE ESTE CONTEÚDO EXISTE */}
      {answered > 0 && (
        <section className="space-y-3">
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
          <div className="grid gap-2 sm:grid-cols-2">
            {VALIDATION_QUESTIONS.map((q, i) => {
              const answer = (validation as any)[q.key];
              if (!answer) return null;
              return (
                <div key={q.key} className="rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-black text-primary">
                      {i + 1}
                    </span>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{q.label}</p>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed">{answer}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. ENTREGA PRINCIPAL POR FORMATO */}
      <section className="space-y-4">
        {kind === "carrossel" && slides.length > 0 && (
          <div className="space-y-2">
            <SectionTitle>Slides do carrossel</SectionTitle>
            <ol className="space-y-2">
              {slides.map((s, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-border bg-card/50 p-3">
                  <span className="text-[11px] font-black text-primary">{String(i + 1).padStart(2, "0")}</span>
                  <p className="flex-1 whitespace-pre-line text-sm leading-relaxed">{s}</p>
                </li>
              ))}
            </ol>
            {generalNotes && (
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{generalNotes}</p>
            )}
          </div>
        )}

        {kind === "carrossel" && slides.length === 0 && !isStructured && (
          <TextBlock label="Estrutura dos slides" value={instructions} />
        )}
        {kind === "carrossel" && slides.length === 0 && isStructured && (
          <MissingCanonical label="Slides do carrossel" />
        )}

        {kind === "reel" && (
          <>
            {scriptText ? (
              <TextBlock label="Roteiro" value={scriptText} />
            ) : (
              <div className="space-y-1">
                <SectionTitle>Roteiro</SectionTitle>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Roteiro propositalmente aberto / captação documental.
                </p>
              </div>
            )}
            <ListBlock label="Textos na tela" items={asList(brief.screen_texts)} />
            <ListBlock label="Capa" items={asList(brief.cover_text)} />
            <ListBlock label="Captação" items={asList(brief.capture)} />
            <ListBlock label="Edição" items={asList(brief.production_editing)} />
          </>
        )}

        {kind === "estatico" && (
          <>
            {artText ? <TextBlock label="Texto da arte" value={artText} /> : <MissingCanonical label="Texto da arte" />}
            <ListBlock label="Direção visual" items={visualDirection} />
          </>
        )}


        {kind === "grafica" && (
          <>
            <ListBlock label="Composição da peça" items={composition} />
            <ListBlock label="Hierarquia de informações" items={asList(brief.info_hierarchy)} ordered />
            <ListBlock label="Direção visual" items={visualDirection} />
            <ListBlock label="Especificações de gráfica/digital" items={asList(brief.print_specs)} />
          </>
        )}
      </section>

      {/* 6. LEGENDA PRONTA */}
      {(postCaption || "").trim() && (
        <section className="space-y-2">
          <SectionTitle>Legenda pronta para publicação</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed">{postCaption}</p>
        </section>
      )}

      {/* 7. AMPLIFICAÇÃO — STORIES DE APOIO */}
      {amplification.length > 0 && (
        <section className="space-y-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-3">
          <SectionTitle muted>Amplificação — Stories de apoio</SectionTitle>
          <ul className="space-y-1">
            {amplification.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
                <span className="text-[10px] font-black">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">{s}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
            Apoio à publicação principal — não gera novas demandas.
          </p>
        </section>
      )}

      {/* 8. ANÚNCIO / GRÁFICA */}
      {isAnuncio && (
        <section className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
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
        </section>
      )}

      {isGrafica && (
        <section className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <Printer className="h-3.5 w-3.5" /> Gráfica
          </p>
          {graficaWarning && (
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">{graficaWarning}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Conferir as validações gráficas listadas em “Validação obrigatória” antes do fechamento.
          </p>
        </section>
      )}

      {/* 9. VALIDAÇÃO OBRIGATÓRIA */}
      {asList(brief.mandatory_validation).length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Validação obrigatória</SectionTitle>
          <ul className="space-y-1.5">
            {asList(brief.mandatory_validation).map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[3px] border border-muted-foreground/50" />
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 10. BASE / FONTES */}
      {asList(brief.sources).length > 0 && (
        <section className="space-y-1">
          <SectionTitle>Base</SectionTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{asList(brief.sources).join(" · ")}</p>
        </section>
      )}
    </div>
  );
}
