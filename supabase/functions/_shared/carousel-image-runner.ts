// Shared runner for carousel slide image generation.
// Single source of truth for: prompt construction (via buildCarouselSlidePrompt),
// Gemini call, response parsing, Storage upload. Used by both the standalone
// (generate-carousel-images) and period (auto-generate-carousel) flows so they
// stay in lock-step.

import { buildCarouselSlidePrompt } from "./image-prompts.ts";
import type { InlineImage } from "./fetch-image.ts";
import type { VisualIdentity } from "./visual-identity.ts";
import { generateImageWithModel } from "./image-generation.ts";
import type { ImageAiModel } from "./models.ts";

export type CarouselSlideInput = { text: string; label?: string };

export type SlideAttachmentMeta = {
  url: string;
  storagePath: string;
  mimeType: string;
  ext: string;
  bytesLength: number;
};

export type SlideRunResult =
  | {
      ok: true;
      slideIndex: number;       // index inside the batch
      slideNumber: number;      // global slide number (1-based)
      imageUrl: string;
      attachment: SlideAttachmentMeta;
    }
  | {
      ok: false;
      slideIndex: number;
      slideNumber: number;
      error: string;
      status?: number;
      rateLimited?: boolean;
    };

export type RunCarouselSlidesOptions = {
  supabase: any;
  googleApiKey: string;
  openaiApiKey?: string;
  aiModel?: ImageAiModel | null;
  vi: VisualIdentity;
  basePrompt?: string;
  strategySnippet?: string;
  slides: CarouselSlideInput[];        // batch
  allSlides: CarouselSlideInput[];     // full carousel for context line
  batchOffset?: number;                // global offset of batch[0]
  aspectLabel?: string;
  mascotInline: InlineImage[];
  logoInline: InlineImage | null;
  storageBucket?: string;              // default: "card-attachments"
  storagePathBuilder: (slideNumber: number, ext: string) => string;
  onSlideDone?: (result: SlideRunResult) => Promise<void> | void;
};

export type RunCarouselSlidesOutput = {
  results: SlideRunResult[];
  images: Array<{ slideIndex: number; imageUrl: string }>; // successes only, batch-local index
  failures: SlideRunResult[];
  anyRateLimited: boolean;
};

export async function generateCarouselSlideImages(
  opts: RunCarouselSlidesOptions,
): Promise<RunCarouselSlidesOutput> {
  const {
    supabase, googleApiKey, openaiApiKey, aiModel, vi, basePrompt, strategySnippet,
    slides, allSlides, mascotInline, logoInline,
    storagePathBuilder, onSlideDone,
  } = opts;
  const batchOffset = opts.batchOffset ?? 0;
  const aspectLabel = opts.aspectLabel || "1:1 (1024x1024)";
  const bucket = opts.storageBucket || "card-attachments";

  const totalSlides = allSlides.length;
  const slideContextLine = allSlides
    .map((s, idx) => `S${idx + 1}: "${s.text}"`)
    .join(" | ");

  const tasks = slides.map((slide, i) => async (): Promise<SlideRunResult> => {
    const slideNumber = batchOffset + i + 1;
    const slideIndex = i;

    const imagePrompt = buildCarouselSlidePrompt({
      vi,
      basePrompt,
      strategySnippet,
      slideNumber,
      totalSlides,
      slideText: slide.text,
      slideLabel: slide.label,
      slideContextLine,
      hasMascotReference: mascotInline.length > 0,
      aspectLabel,
    });

    try {
      const result = await generateImageWithModel({
        aiModel,
        prompt: imagePrompt,
        mascotInline,
        logoInline,
        aspectLabel,
        googleApiKey,
        openaiApiKey,
      });

      if (!result.ok) {
        console.error(`Slide ${slideNumber} error:`, result.error);
        return {
          ok: false, slideIndex, slideNumber,
          error: result.error,
          status: result.status,
          rateLimited: result.rateLimited,
        };
      }

      const storagePath = storagePathBuilder(slideNumber, result.ext);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, result.imageBytes, { contentType: result.mimeType, upsert: false });
      if (uploadError) {
        console.error(`Upload error slide ${slideNumber}:`, uploadError);
        return { ok: false, slideIndex, slideNumber, error: uploadError.message || "upload_failed" };
      }

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);

      console.log(`  ✅ Slide ${slideNumber} generated`);
      return {
        ok: true,
        slideIndex,
        slideNumber,
        imageUrl: publicUrlData.publicUrl,
        attachment: {
          url: publicUrlData.publicUrl,
          storagePath,
          mimeType: result.mimeType,
          ext: result.ext,
          bytesLength: result.imageBytes.length,
        },
      };
    } catch (e) {
      console.error(`Exception on slide ${slideNumber}:`, e);
      return {
        ok: false, slideIndex, slideNumber,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  // Parallel execution; settle all so one slide failure never blocks the rest.
  const settled = await Promise.allSettled(tasks.map((fn) => fn()));
  const results: SlideRunResult[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          ok: false,
          slideIndex: i,
          slideNumber: batchOffset + i + 1,
          error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        },
  );

  if (onSlideDone) {
    for (const r of results) {
      try { await onSlideDone(r); } catch (e) { console.error("onSlideDone hook error:", e); }
    }
  }

  const images = results
    .filter((r): r is Extract<SlideRunResult, { ok: true }> => r.ok)
    .map((r) => ({ slideIndex: r.slideIndex, imageUrl: r.imageUrl }));
  const failures = results.filter((r) => !r.ok);
  const anyRateLimited = failures.some((f) => !f.ok && (f as any).rateLimited);

  return { results, images, failures, anyRateLimited };
}
