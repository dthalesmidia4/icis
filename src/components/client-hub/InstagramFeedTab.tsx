import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Play, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { buildInstagramFeed, feedHasMedia, type FeedEntry, type FeedMediaItem } from "@/lib/instagramFeed";

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

interface InstagramFeedTabProps {
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  statusNames: Record<string, { name: string; isFinal: boolean }>;
  stageNames: Record<string, string>;
  onOpenDemand?: (demandId: string) => void;
}

export default function InstagramFeedTab({
  planItems,
  demands,
  statusNames,
  stageNames,
  onOpenDemand,
}: InstagramFeedTabProps) {
  const [filter, setFilter] = useState<"all" | "media" | "producao">("all");
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const entries = useMemo(
    () => buildInstagramFeed({ demands, planItems, stageNames, statusNames }),
    [demands, planItems, stageNames, statusNames]
  );

  const withMedia = entries.filter(feedHasMedia).length;
  const inProduction = entries.length - withMedia;

  const visible = entries.filter((e) =>
    filter === "all" ? true : filter === "media" ? feedHasMedia(e) : !feedHasMedia(e)
  );

  const filters: { value: typeof filter; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: entries.length },
    { value: "media", label: "Com mídia", count: withMedia },
    { value: "producao", label: "Em produção", count: inProduction },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">Prévia do Feed Simulado</h2>
          <p className="text-[12px] text-muted-foreground">
            Mais recentes acima · segure o clique para abrir a mídia
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {entries.length} publicações · {withMedia} com mídia · {inProduction} em produção
          </p>
        </div>
        <div className="flex items-center gap-1.5">
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
              onOpenDemand={onOpenDemand}
              onOpenMedia={(item) => setPreview({ url: item.url, name: mediaFileName(item) })}
            />
          ))}
        </div>
      )}

      {preview && (
        <AttachmentPreviewModal
          isOpen
          onClose={() => setPreview(null)}
          fileUrl={preview.url}
          fileName={preview.name}
        />
      )}
    </div>
  );
}

function FeedCell({
  entry,
  onOpenDemand,
  onOpenMedia,
}: {
  entry: FeedEntry;
  onOpenDemand?: (id: string) => void;
  onOpenMedia: (item: FeedMediaItem) => void;
}) {
  const clickable = entry.isDemand && !!entry.demandId && !!onOpenDemand;
  const media = entry.media;
  const [slide, setSlide] = useState(0);
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  const index = Math.min(slide, Math.max(media.length - 1, 0));
  const current = media[index];
  const hasMedia = !!current;
  const showArrows = entry.kind === "carousel" && media.length > 1;

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
      onOpenMedia(current!);
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    if (clickable) onOpenDemand!(entry.demandId!);
  };

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
                  setSlide((s) => Math.max(0, Math.min(s, media.length - 1) - 1));
                }}
                className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/85 p-1 text-foreground shadow backdrop-blur transition disabled:opacity-30 group-hover:block"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Próximo slide"
                disabled={index === media.length - 1}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setSlide((s) => Math.min(media.length - 1, Math.min(s, media.length - 1) + 1));
                }}
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/85 p-1 text-foreground shadow backdrop-blur transition disabled:opacity-30 group-hover:block"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-white">
              {dateLabel(entry.date)}
              {entry.time ? ` · ${entry.time}` : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );

  const pressClasses = pressing ? "scale-[0.97] brightness-75" : "";

  if (clickable || hasMedia) {
    return (
      <button
        type="button"
        title={entry.title}
        aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => hasMedia && e.preventDefault()}
        onClick={handleClick}
        className={cn(
          "group relative aspect-[4/5] w-full overflow-hidden rounded-sm transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          pressClasses
        )}
      >
        {content}
      </button>
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
