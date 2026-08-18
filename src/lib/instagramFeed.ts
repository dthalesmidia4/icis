/**
 * Modelo puro da prévia do Feed do Instagram (aba do Hub do Cliente).
 *
 * Regras fechadas:
 *  - a fonte operacional são as demands vivas; snapshots do período só entram
 *    quando ainda não existe demand viva equivalente (dedupe por DF-XXX);
 *  - canal: null/vazio é permitido; preenchido só entra se contiver "instagram";
 *  - Stories-only e tipos da área Sistemas nunca entram;
 *  - `rejected_attachments` NUNCA é mídia.
 */

import { dedupeSnapshotAgainstLive } from "@/lib/demandCode";

export interface FeedAttachment {
  url: string;
  name?: string | null;
  type?: string | null;
  storagePath?: string | null;
}

export type FeedContentKind = "static" | "carousel" | "video";
export type FeedPreviewKind = "image" | "video-file" | "none";

export interface FeedDemandInput {
  id: string;
  title: string;
  demand_type?: string | null;
  demand_type_key?: string | null;
  channel?: string | null;
  publish_date?: string | null;
  publish_time?: string | null;
  attachments?: unknown;
  /** Fallback VISUAL exclusivo do Feed Simulado — nunca fonte canônica. */
  reference_attachments?: unknown;
  post_caption?: string | null;
  current_function_key?: string | null;
  status_id?: string | null;
}


export interface FeedPlanItemInput {
  titulo: string;
  tipo?: string | null;
  canal?: string | null;
  typeKey?: string | null;
  data?: string | null;
}

export interface FeedMediaItem {
  url: string;
  kind: Exclude<FeedPreviewKind, "none">;
  name: string | null;
}

export interface FeedEntry {
  key: string;
  demandId: string | null;
  isDemand: boolean;
  title: string;
  typeLabel: string;
  kind: FeedContentKind;
  date: string;
  time: string | null;
  previewKind: FeedPreviewKind;
  previewUrl: string | null;
  mediaCount: number;
  /** Todas as peças navegáveis da célula, na ordem persistida. media[0] === preview. */
  media: FeedMediaItem[];
  /** Origem da mídia exibida: anexo final, referência (fallback visual) ou nenhuma. */
  mediaSource: FeedMediaSource;
  stageLabel: string;
  caption: string | null;
}


const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

export const isImageAttachment = (a: FeedAttachment): boolean => {
  const type = String(a?.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (type.startsWith("video/")) return false;
  return IMAGE_EXT.test(String(a?.name || "")) || IMAGE_EXT.test(String(a?.url || ""));
};

export const isVideoAttachment = (a: FeedAttachment): boolean => {
  const type = String(a?.type || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  if (type.startsWith("image/")) return false;
  return VIDEO_EXT.test(String(a?.name || "")) || VIDEO_EXT.test(String(a?.url || ""));
};

/** Normaliza o jsonb de attachments preservando a ordem persistida. */
export const normalizeAttachments = (raw: unknown): FeedAttachment[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => {
      if (typeof item === "string") return { url: item } as FeedAttachment;
      if (!item || typeof item !== "object") return null;
      const url = item.url || item.publicUrl || item.public_url || item.href || "";
      if (!url) return null;
      return {
        url: String(url),
        name: item.name ?? item.file_name ?? null,
        type: item.type ?? item.mime_type ?? item.mimeType ?? null,
        storagePath: item.storagePath ?? item.storage_path ?? item.path ?? null,
      } as FeedAttachment;
    })
    .filter(Boolean) as FeedAttachment[];
};

/** Canal: null/vazio permitido; preenchido precisa conter "instagram". */
export const channelAllowsInstagram = (channel?: string | null): boolean => {
  const c = String(channel || "").trim();
  if (!c) return true;
  return c.toLowerCase().includes("instagram");
};

const isStoriesOnly = (text: string): boolean => {
  const l = text.toLowerCase();
  if (!/stor(y|ies)/.test(l)) return false;
  return !/(feed|reel|reels|post principal|carrossel|carousel|est[aá]tic)/.test(l);
};

/**
 * Tipo de conteúdo para o feed. `null` = não entra no feed.
 * Aceita legado (sem demand_type_key) via fallback textual estrito.
 */
export const resolveFeedKind = (params: {
  typeKey?: string | null;
  typeLabel?: string | null;
}): FeedContentKind | null => {
  const key = String(params.typeKey || "").trim();
  const label = String(params.typeLabel || "").trim();
  if (isStoriesOnly(`${key} ${label}`)) return null;

  if (key === "carrossel") return "carousel";
  if (key === "criativo_estatico") return "static";
  if (key === "video_captado" || key === "video_gerado") return "video";
  if (key && key !== "outro") {
    // Qualquer outra key oficial (ex.: tipos de Sistemas) não entra no feed.
    return null;
  }

  // Fallback textual estrito para legado (mesma semântica de
  // `normalizeDemandTypeKey` em proceedDemand.ts, sem acoplar o helper puro ao
  // cliente Supabase). Compostos usam a parte primária antes do "+".
  const l = (label.includes("+") ? label.split("+")[0] : label).trim().toLowerCase();
  if (!l) return null;
  if (/carrossel|carousel/.test(l)) return "carousel";
  if (/(v[ií]deo|reels?)/.test(l)) return "video";
  if (/(criativo est[aá]tico|post est[aá]tico|est[aá]tic|post feed|feed)/.test(l)) return "static";
  return null;
};

const timeValue = (time?: string | null) => String(time || "00:00").slice(0, 5);

const toMedia = (list: FeedAttachment[], kind: Exclude<FeedPreviewKind, "none">): FeedMediaItem[] =>
  list.map((a) => ({ url: a.url, kind, name: a.name ?? null }));

export interface ResolvedFeedMedia {
  previewKind: FeedPreviewKind;
  previewUrl: string | null;
  mediaCount: number;
  media: FeedMediaItem[];
  mediaSource: FeedMediaSource;
}

const EMPTY_MEDIA: ResolvedFeedMedia = {
  previewKind: "none",
  previewUrl: null,
  mediaCount: 0,
  media: [],
  mediaSource: null,
};

/** Seleção de mídia de UMA fonte, com as regras por formato do feed. */
const selectFromSource = (
  kind: FeedContentKind,
  raw: unknown,
  source: Exclude<FeedMediaSource, null>
): ResolvedFeedMedia => {
  const attachments = normalizeAttachments(raw);
  const images = attachments.filter(isImageAttachment);
  const videos = attachments.filter(isVideoAttachment);

  if (kind === "carousel") {
    if (images.length) {
      return {
        previewKind: "image",
        previewUrl: images[0].url,
        mediaCount: images.length,
        media: toMedia(images, "image"),
        mediaSource: source,
      };
    }
    if (videos.length) {
      return {
        previewKind: "video-file",
        previewUrl: videos[0].url,
        mediaCount: videos.length,
        media: toMedia(videos, "video-file"),
        mediaSource: source,
      };
    }
    return EMPTY_MEDIA;
  }

  // Vídeo e estático: uma única peça (imagem vence o mp4 como capa).
  if (images.length) {
    return {
      previewKind: "image",
      previewUrl: images[0].url,
      mediaCount: 1,
      media: toMedia(images.slice(0, 1), "image"),
      mediaSource: source,
    };
  }
  if (videos.length) {
    return {
      previewKind: "video-file",
      previewUrl: videos[0].url,
      mediaCount: 1,
      media: toMedia(videos.slice(0, 1), "video-file"),
      mediaSource: source,
    };
  }
  return EMPTY_MEDIA;
};

/**
 * Prioridade determinística: `attachments` > `reference_attachments` > sem mídia.
 * Referências são apenas fallback VISUAL do Feed Simulado.
 */
export function resolveFeedMedia(params: {
  kind: FeedContentKind;
  attachments?: unknown;
  referenceAttachments?: unknown;
}): ResolvedFeedMedia {
  const primary = selectFromSource(params.kind, params.attachments, "attachment");
  if (primary.mediaSource) return primary;
  const fallback = selectFromSource(params.kind, params.referenceAttachments, "reference");
  if (fallback.mediaSource) return fallback;
  return EMPTY_MEDIA;
}

interface BuildFeedParams {
  demands: FeedDemandInput[];
  planItems: FeedPlanItemInput[];
  stageNames?: Record<string, string>;
  statusNames?: Record<string, { name: string; isFinal: boolean }>;
}



export function buildInstagramFeed({
  demands,
  planItems,
  stageNames = {},
  statusNames = {},
}: BuildFeedParams): FeedEntry[] {
  const entries: FeedEntry[] = [];

  demands.forEach((d) => {
    if (!d.publish_date) return;
    if (!channelAllowsInstagram(d.channel)) return;
    const kind = resolveFeedKind({ typeKey: d.demand_type_key, typeLabel: d.demand_type });
    if (!kind) return;

    const resolved = resolveFeedMedia({
      kind,
      attachments: d.attachments,
      referenceAttachments: d.reference_attachments,
    });

    const stageLabel =
      (d.current_function_key ? stageNames[d.current_function_key] : undefined) ||
      (d.status_id ? statusNames[d.status_id]?.name : undefined) ||
      "Em andamento";

    entries.push({
      key: `demand-${d.id}`,
      demandId: d.id,
      isDemand: true,
      title: d.title,
      typeLabel: d.demand_type || "",
      kind,
      date: d.publish_date,
      time: d.publish_time ? d.publish_time.slice(0, 5) : null,
      previewKind: resolved.previewKind,
      previewUrl: resolved.previewUrl,
      mediaCount: resolved.mediaCount,
      media: resolved.media,
      mediaSource: resolved.mediaSource,
      stageLabel,
      caption: d.post_caption ?? null,
    });
  });


  // Snapshot histórico entra somente sem demand viva equivalente.
  dedupeSnapshotAgainstLive(
    planItems,
    demands.map((d) => d.title)
  ).forEach((item, index) => {
    if (!item.data) return;
    if (!channelAllowsInstagram(item.canal)) return;
    const kind = resolveFeedKind({ typeKey: item.typeKey, typeLabel: item.tipo });
    if (!kind) return;
    entries.push({
      key: `plan-${index}-${item.titulo}`,
      demandId: null,
      isDemand: false,
      title: item.titulo,
      typeLabel: item.tipo || "",
      kind,
      date: item.data,
      time: null,
      previewKind: "none",
      previewUrl: null,
      mediaCount: 0,
      media: [],
      stageLabel: "Planejado · produção não iniciada",
      caption: null,
    });
  });

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = timeValue(a.time);
    const tb = timeValue(b.time);
    if (ta !== tb) return ta < tb ? 1 : -1;
    if (a.isDemand !== b.isDemand) return a.isDemand ? -1 : 1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });
}

export const feedHasMedia = (e: FeedEntry): boolean => e.previewKind !== "none";
