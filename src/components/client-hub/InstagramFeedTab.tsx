import { useMemo, useState } from "react";
import { Layers, Play, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { buildInstagramFeed, feedHasMedia, type FeedEntry } from "@/lib/instagramFeed";

const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const dateLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS_SHORT[Number(m) - 1]}`;
};

const KIND_LABEL: Record<FeedEntry["kind"], string> = {
  static: "Estático",
  carousel: "Carrossel",
  video: "Vídeo",
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
          <p className="text-[12px] text-muted-foreground">Mais recentes acima</p>
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
            <FeedCell key={entry.key} entry={entry} onOpenDemand={onOpenDemand} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCell({ entry, onOpenDemand }: { entry: FeedEntry; onOpenDemand?: (id: string) => void }) {
  const clickable = entry.isDemand && !!entry.demandId && !!onOpenDemand;

  const content = (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      {entry.previewKind === "image" && entry.previewUrl && (
        <img
          src={entry.previewUrl}
          alt={entry.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}
      {entry.previewKind === "video-file" && entry.previewUrl && (
        <video
          src={entry.previewUrl}
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
            <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-foreground backdrop-blur">
              <Layers className="h-3 w-3" />
              {entry.mediaCount}
            </span>
          )}
          {entry.kind === "video" && (
            <span className="absolute right-1.5 top-1.5 rounded bg-background/80 p-1 text-foreground backdrop-blur">
              <Play className="h-3 w-3" />
            </span>
          )}
          {entry.kind === "static" && (
            <span className="absolute right-1.5 top-1.5 rounded bg-background/70 p-1 text-foreground backdrop-blur">
              <ImageIcon className="h-3 w-3" />
            </span>
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

  if (clickable) {
    return (
      <button
        type="button"
        title={entry.title}
        aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
        onClick={() => onOpenDemand!(entry.demandId!)}
        className="aspect-[4/5] w-full overflow-hidden rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      title={entry.title}
      aria-label={`${KIND_LABEL[entry.kind]}: ${entry.title}`}
      className="aspect-[4/5] w-full overflow-hidden rounded-sm"
    >
      {content}
    </div>
  );
}
