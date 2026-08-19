import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Play, Image as ImageIcon, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import BulkAllocationModal from "@/components/kanban/BulkAllocationModal";
import { canBulkAllocate } from "@/lib/bulkAllocation";
import { cn } from "@/lib/utils";
import { AttachmentPreviewModal, type AttachmentPreviewItem } from "@/components/AttachmentPreviewModal";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { buildInstagramFeed, feedHasMedia, isFeedEntrySelectable, type FeedEntry, type FeedMediaItem } from "@/lib/instagramFeed";
import { Input } from "@/components/ui/input";
import {
  CLASSIFICATION_OPTIONS,
  EMPTY_CONTENT_FILTERS,
  buildClassificationCounts,
  buildTypeCounts,
  countActiveContentFilters,
  matchesContentFilters,
  type ContentClassification,
  type ContentFilterState,
} from "@/lib/contentFilters";
import { useEdgeScroll } from "@/hooks/useEdgeScroll";
import { SingleDateTimePopover } from "@/components/kanban/StartEndDatePopover";
import { publicationNotice, saveDemandPublication } from "@/lib/demandPublication";
import { toast } from "sonner";
import ScrollEdgeButton from "@/components/client-hub/ScrollEdgeButton";

const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const LONG_PRESS_MS = 400;

const dateLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS_SHORT[Number(m) - 1]}`;
};

const KIND_LABEL: Record<FeedEntry["kind"], string> = {
  static: "Estático",
  carousel: "Carrossel",
  video: "Vídeo",
};

/** Nome do arquivo: usa o do anexo; senão deriva da URL (para detectar o tipo no modal). */
const mediaFileName = (item: FeedMediaItem): string => {
  if (item.name) return item.name;
  const path = item.url.split("?")[0];
  const last = path.split("/").pop() || "";
  if (last.includes(".")) return decodeURIComponent(last);
  return item.kind === "video-file" ? "arquivo.mp4" : "arquivo.png";
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
};

interface PreviewState {
  items: AttachmentPreviewItem[];
  initialIndex: number;
  entryKey: string;
  isReference: boolean;
}

interface InstagramFeedTabProps {
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  statusNames: Record<string, { name: string; isFinal: boolean }>;
  stageNames: Record<string, string>;
  onOpenDemand?: (demandId: string) => void;
  /** Recarrega o workspace após uma alocação em massa. */
  onReload?: () => void;
}

export default function InstagramFeedTab({
  planItems,
  demands,
  statusNames,
  stageNames,
  onOpenDemand,
  onReload,
}: InstagramFeedTabProps) {
  const [filter, setFilter] = useState<"all" | "media" | "producao">("all");
  // Filtros compartilhados com a aba Calendário (busca, tipo, classificação).
  const [shared, setShared] = useState<ContentFilterState>(EMPTY_CONTENT_FILTERS);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [slideByEntry, setSlideByEntry] = useState<Record<string, number>>({});
  const [activeCarouselKey, setActiveCarouselKey] = useState<string | null>(null);

  // Mesmo gate da Visão Geral: gestor operacional / super admin.
  const { tenantId } = useTenant();
  const { isSuperAdmin, isAgencyManager } = useAgencyRole();
  const canAllocate = canBulkAllocate({ isSuperAdmin, isAgencyManager });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggleSelect = useCallback((demandId: string) => {
    setSelectedIds((prev) => (prev.includes(demandId) ? prev.filter((x) => x !== demandId) : [...prev, demandId]));
  }, []);
  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const entries = useMemo(
    () => buildInstagramFeed({ demands, planItems, stageNames, statusNames }),
    [demands, planItems, stageNames, statusNames]
  );

  const toFilterable = (e: FeedEntry) => ({
    title: e.title,
    typeLabel: e.typeLabel,
    classifications: e.classifications,
    isDemand: e.isDemand,
  });

  // Filtros compartilhados primeiro: contadores de mídia refletem o recorte atual.
  const sharedFiltered = useMemo(
    () => entries.filter((e) => matchesContentFilters(toFilterable(e), shared)),
    [entries, shared]
  );

  const withMedia = sharedFiltered.filter(feedHasMedia).length;
  const inProduction = sharedFiltered.length - withMedia;

  const visible = useMemo(
    () =>
      sharedFiltered.filter((e) =>
        filter === "all" ? true : filter === "media" ? feedHasMedia(e) : !feedHasMedia(e)
      ),
    [sharedFiltered, filter]
  );

  const filterableAll = useMemo(() => entries.map(toFilterable), [entries]);
  const typeCounts = useMemo(() => buildTypeCounts(filterableAll), [filterableAll]);
  const opCounts = useMemo(() => buildClassificationCounts(filterableAll), [filterableAll]);
  const activeFilterCount =
    countActiveContentFilters(shared) + (filter === "all" ? 0 : 1);

  const clearFilters = useCallback(() => {
    setShared(EMPTY_CONTENT_FILTERS);
    setFilter("all");
  }, []);

  const filters: { value: typeof filter; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: sharedFiltered.length },
    { value: "media", label: "Com mídia", count: withMedia },
    { value: "producao", label: "Em produção", count: inProduction },
  ];

  const setSlide = useCallback((key: string, next: number) => {
    setSlideByEntry((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
  }, []);

  // Teclado: navega o último carrossel cuja seta foi clicada — nunca todos.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const previewOpen = !!preview;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (previewOpen) return; // modal expandido tem prioridade absoluta
      if (isTypingTarget(e.target)) return;
      if (!activeCarouselKey) return;
      const entry = visibleRef.current.find((x) => x.key === activeCarouselKey);
      if (!entry || entry.kind !== "carousel" || entry.media.length <= 1) return;

      const total = entry.media.length;
      const current = Math.min(slideByEntry[entry.key] ?? 0, total - 1);
      const next = e.key === "ArrowLeft" ? current - 1 : current + 1;
      if (next < 0 || next > total - 1) return;
      e.preventDefault();
      setSlide(entry.key, next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeCarouselKey, slideByEntry, previewOpen, setSlide]);

  // Scroll canônico: resolve o <main> do Layout como container real e habilita
  // PageUp/PageDown/Home/End sem exigir clique prévio em um card.
  const { anchorRef, canScroll, action, scrollToEdge } = useEdgeScroll<HTMLDivElement>({
    modalOpen: previewOpen || bulkOpen,
    revalidateKey: `${visible.length}:${filter}:${shared.search}:${shared.type}:${shared.classification}`,
  });

  return (
    <div ref={anchorRef} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">Prévia do Feed Simulado</h2>
          <p className="text-[12px] text-muted-foreground">
            Mais recentes acima · segure o clique para abrir a mídia · setas ← → navegam o carrossel ativo
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {entries.length} publicações · {withMedia} com mídia · {inProduction} em produção
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canAllocate && (
            <Button
              size="sm"
              variant={selectionMode ? "default" : "outline"}
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              className="mr-1 gap-1.5"
            >
              <CheckSquare className="h-4 w-4" />
              {selectionMode ? "Cancelar seleção" : "Selecionar"}
            </Button>
          )}
          {/* Filtros exclusivos do Feed (mídia / produção) — preservados. */}
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label} · {f.count}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros compartilhados com o Calendário: busca, tipo e classificação. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full lg:max-w-xs">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Buscar
          </p>
          <Input
            value={shared.search}
            onChange={(e) => setShared((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="Tema, tipo ou demanda"
            className="h-10 rounded-lg"
          />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => setShared((prev) => ({ ...prev, type: "all" }))}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
              shared.type === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
            )}
          >
            Todos os tipos <span className="tabular-nums opacity-70">{entries.length}</span>
          </button>
          {typeCounts.map(([type, count]) => (
            <button
              key={type}
              type="button"
              onClick={() => setShared((prev) => ({ ...prev, type }))}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                shared.type === type
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              {type} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          ))}
          <span className="mx-1 h-6 w-px self-center bg-border" aria-hidden />
          {CLASSIFICATION_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setShared((prev) => ({
                  ...prev,
                  classification: prev.classification === key ? null : (key as ContentClassification),
                }))
              }
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                shared.classification === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              {label} <span className="tabular-nums opacity-70">{opCounts[key]}</span>
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-dashed px-3 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Limpar filtros · {activeFilterCount}
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma publicação de feed neste período.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
          {visible.map((entry) => (
            <FeedCell
              key={entry.key}
              entry={entry}
              slideIndex={slideByEntry[entry.key] ?? 0}
              onSlideChange={(next) => setSlide(entry.key, next)}
              onActivateCarousel={() => setActiveCarouselKey(entry.key)}
              onOpenDemand={onOpenDemand}
              onPublicationSaved={onReload}
              canEditPublication={!selectionMode}
              selectable={selectionMode && isFeedEntrySelectable(entry)}
              selected={!!entry.demandId && selectedIds.includes(entry.demandId)}
              onToggleSelect={() => entry.demandId && toggleSelect(entry.demandId)}
              onOpenMedia={(items, initialIndex) =>
                setPreview({
                  items: items.map((it) => ({ url: it.url, name: mediaFileName(it) })),
                  initialIndex,
                  entryKey: entry.key,
                  isReference: entry.mediaSource === "reference",
                })
              }
            />
          ))}
        </div>
      )}

      {canAllocate && selectionMode && selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-background/95 px-4 py-2 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold text-foreground">{selectedIds.length} selecionados</span>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              Alocar para colaborador
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Limpar
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelection}>
              Sair da seleção
            </Button>
          </div>
        </div>
      )}

      {canAllocate && (
        <BulkAllocationModal
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          tenantId={tenantId}
          cardIds={selectedIds}
          sourceScreen="feed"
          onApplied={() => {
            exitSelection();
            onReload?.();
          }}
        />
      )}

      <ScrollEdgeButton action={action} visible={canScroll} onClick={scrollToEdge} />

      {preview && (
        <AttachmentPreviewModal
          isOpen
          onClose={() => setPreview(null)}
          fileUrl={preview.items[preview.initialIndex]?.url ?? preview.items[0]?.url ?? ""}
          fileName={preview.items[preview.initialIndex]?.name ?? preview.items[0]?.name ?? ""}
          items={preview.items}
          initialIndex={preview.initialIndex}
          onIndexChange={(idx) => setSlide(preview.entryKey, idx)}
          badgeLabel={preview.isReference ? "Referência" : undefined}
        />
      )}
    </div>
  );
}

function FeedCell({
  entry,
  slideIndex,
  onSlideChange,
  onActivateCarousel,
  onOpenDemand,
  onOpenMedia,
  onPublicationSaved,
  canEditPublication = false,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  entry: FeedEntry;
  slideIndex: number;
  onSlideChange: (next: number) => void;
  onActivateCarousel: () => void;
  onOpenDemand?: (id: string) => void;
  onOpenMedia: (items: FeedMediaItem[], initialIndex: number) => void;
  onPublicationSaved?: () => void;
  canEditPublication?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const clickable = (entry.isDemand && !!entry.demandId && !!onOpenDemand) || selectable;
  const media = entry.media;
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  const index = Math.min(Math.max(slideIndex, 0), Math.max(media.length - 1, 0));
  const current = media[index];
  const hasMedia = !!current;
  const showArrows = entry.kind === "carousel" && media.length > 1;
  // Edição de publicação direto no feed: só demandas reais, fora do modo seleção.
  const editablePublication = canEditPublication && entry.isDemand && !!entry.demandId;
  const [savingPublication, setSavingPublication] = useState(false);

  const savePublication = async (v: { date: string | null; time: string | null }) => {
    if (!entry.demandId) return;
    setSavingPublication(true);
    try {
      const res = await saveDemandPublication({
        demandId: entry.demandId,
        date: v.date,
        time: v.time,
      });
      if (!res.ok) {
        toast.error("Não foi possível salvar a publicação.");
        return;
      }
      const notice = publicationNotice(res);
      if (res.dispatchCancelled && notice) toast.warning(notice);
      else if (notice) toast.info(notice);
      else toast.success("Publicação atualizada.");
      onPublicationSaved?.();
    } finally {
      setSavingPublication(false);
    }
  };

  const publicationText = `${dateLabel(entry.date)}${entry.time ? ` · ${entry.time}` : ""}`;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressing(false);
  };

  useEffect(() => clearTimer, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!hasMedia || e.button === 2) return;
    longFiredRef.current = false;
    setPressing(true);
    timerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      clearTimer();
      onOpenMedia(media, index);
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    if (entry.isDemand && entry.demandId && onOpenDemand) onOpenDemand(entry.demandId);
  };

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/85 text-foreground shadow backdrop-blur transition disabled:opacity-30 group-hover:flex [@media(hover:none)]:flex";

  const content = (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      {current?.kind === "image" && (
        <img
          src={current.url}
          alt={entry.title}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
      )}
      {current?.kind === "video-file" && (
        <video
          src={current.url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      )}

      {entry.previewKind === "none" && (
        <div className="flex h-full w-full flex-col justify-between border border-primary/20 bg-primary/[0.05] p-2 text-left">
          <div className="space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-primary">
              {KIND_LABEL[entry.kind]}
            </span>
            <span className="line-clamp-3 text-[11px] font-bold leading-tight text-foreground">{entry.title}</span>
          </div>
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-primary">
              {entry.stageLabel}
            </span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {dateLabel(entry.date)}
            </span>
          </div>
        </div>
      )}

      {selectable && (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-2 right-2 z-20 flex h-5 w-5 items-center justify-center rounded border text-[11px] font-black",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-white/70 bg-background/85",
          )}
        >
          {selected ? "✓" : ""}
        </span>
      )}

      {entry.mediaSource === "reference" && (
        <span className="absolute left-2 top-2 z-10 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-600 backdrop-blur dark:text-amber-300">
          Referência
        </span>
      )}

      {/* Marcações de formato */}
      {entry.previewKind !== "none" && (
        <>
          {entry.kind === "carousel" && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-[10px] font-bold text-foreground backdrop-blur">
              <Layers className="h-4 w-4" />
              {showArrows ? `${index + 1}/${media.length}` : entry.mediaCount}
            </span>
          )}
          {entry.kind === "video" && (
            <span className="absolute right-2 top-2 rounded bg-background/80 p-1.5 text-foreground backdrop-blur">
              <Play className="h-4 w-4" />
            </span>
          )}
          {entry.kind === "static" && (
            <span className="absolute right-2 top-2 rounded bg-background/70 p-1.5 text-foreground backdrop-blur">
              <ImageIcon className="h-4 w-4" />
            </span>
          )}

          {showArrows && (
            <>
              <button
                type="button"
                aria-label="Slide anterior"
                disabled={index === 0}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivateCarousel();
                  if (index > 0) onSlideChange(index - 1);
                }}
                className={cn(arrowClass, "left-2")}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Próximo slide"
                disabled={index === media.length - 1}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onActivateCarousel();
                  if (index < media.length - 1) onSlideChange(index + 1);
                }}
                className={cn(arrowClass, "right-2")}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 to-transparent p-1.5">
            {editablePublication ? (
              <SingleDateTimePopover
                date={entry.date}
                time={entry.time || null}
                label="Publicação"
                align="start"
                onSave={savePublication}
                trigger={
                  <button
                    type="button"
                    title="Editar data e hora da publicação"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white underline decoration-white/40 decoration-dotted underline-offset-2 transition-colors hover:bg-white/20"
                  >
                    {savingPublication ? "Salvando…" : publicationText}
                  </button>
                }
              />
            ) : (
              <span className="pointer-events-none text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                {publicationText}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );

  const pressClasses = pressing ? "scale-[0.97] brightness-75" : "";

  if (clickable || hasMedia) {
    return (
      <div
        role="button"
        tabIndex={0}
        title={entry.title}
        aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => hasMedia && e.preventDefault()}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          handleClick();
        }}
        className={cn(
          "group relative aspect-[4/5] w-full cursor-pointer overflow-hidden rounded-sm transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          selectable && selected && "ring-2 ring-primary ring-offset-2",
          pressClasses
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      title={entry.title}
      aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
      className="group aspect-[4/5] w-full overflow-hidden rounded-sm"
    >
      {content}
    </div>
  );
}
