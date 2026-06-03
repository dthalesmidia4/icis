// Cron-driven worker that executes due scheduled_publication_dispatches.
// Publishes to Instagram and Facebook using the Meta Graph API with tokens
// stored per client in client_social_accounts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

interface MediaFile { url: string; name?: string; type?: string; order: number }
interface SocialRef { id: string; platform: string }
interface Dispatch {
  id: string;
  card_id: string;
  client_id: string;
  tenant_id: string;
  content_type: "post" | "carrossel" | "video" | "video_capa";
  scheduled_at: string;
  caption: string | null;
  media_files: MediaFile[];
  cover_file: { url: string } | null;
  social_accounts: SocialRef[];
  attempt_count: number;
}
interface AccountRow {
  id: string;
  platform: "instagram" | "facebook";
  access_token: string;
  ig_user_id: string | null;
  fb_page_id: string | null;
}

function isVideo(m: MediaFile): boolean {
  return /video|mp4|mov|webm/i.test(`${m.type || ""} ${m.name || ""} ${m.url}`);
}

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<any> {
  const url = new URL(`${GRAPH}${path}`);
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url.toString());
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || `Graph ${path} falhou (${r.status})`);
    return j;
  }
  const body = new URLSearchParams(params);
  const r = await fetch(url.toString(), { method: "POST", body });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || `Graph ${path} falhou (${r.status})`);
  return j;
}

async function waitContainerReady(igUserId: string, containerId: string, token: string, maxSecs = 90): Promise<void> {
  const deadline = Date.now() + maxSecs * 1000;
  while (Date.now() < deadline) {
    const r = await graph(`/${containerId}`, { fields: "status_code", access_token: token }, "GET");
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error(`Mídia rejeitada pelo Instagram (${r.status_code}).`);
    await new Promise(res => setTimeout(res, 3000));
  }
  throw new Error("Tempo esgotado aguardando o Instagram processar a mídia.");
}

async function publishInstagram(acc: AccountRow, d: Dispatch): Promise<string> {
  const igId = acc.ig_user_id;
  const token = acc.access_token;
  if (!igId) throw new Error("Instagram Business ID não configurado.");
  const caption = d.caption || "";

  if (d.content_type === "post") {
    const img = d.media_files.find(m => !isVideo(m));
    if (!img) throw new Error("Post sem imagem.");
    const created = await graph(`/${igId}/media`, { image_url: img.url, caption, access_token: token });
    await waitContainerReady(igId, created.id, token);
    const published = await graph(`/${igId}/media_publish`, { creation_id: created.id, access_token: token });
    return published.id;
  }

  if (d.content_type === "carrossel") {
    const sorted = [...d.media_files].sort((a, b) => a.order - b.order);
    const childIds: string[] = [];
    for (const m of sorted) {
      const params: Record<string, string> = { is_carousel_item: "true", access_token: token };
      if (isVideo(m)) { params.media_type = "VIDEO"; params.video_url = m.url; }
      else { params.image_url = m.url; }
      const c = await graph(`/${igId}/media`, params);
      await waitContainerReady(igId, c.id, token);
      childIds.push(c.id);
    }
    const carousel = await graph(`/${igId}/media`, {
      media_type: "CAROUSEL", children: childIds.join(","), caption, access_token: token,
    });
    await waitContainerReady(igId, carousel.id, token);
    const published = await graph(`/${igId}/media_publish`, { creation_id: carousel.id, access_token: token });
    return published.id;
  }

  // video or video_capa
  const video = d.media_files.find(isVideo);
  if (!video) throw new Error("Vídeo não encontrado.");
  const params: Record<string, string> = {
    media_type: "REELS", video_url: video.url, caption, access_token: token,
  };
  const cover = d.cover_file?.url || d.media_files.find(m => !isVideo(m))?.url;
  if (cover) params.cover_url = cover;
  const created = await graph(`/${igId}/media`, params);
  await waitContainerReady(igId, created.id, token, 180);
  const published = await graph(`/${igId}/media_publish`, { creation_id: created.id, access_token: token });
  return published.id;
}

async function publishFacebook(acc: AccountRow, d: Dispatch): Promise<string> {
  const pageId = acc.fb_page_id;
  const token = acc.access_token;
  if (!pageId) throw new Error("Facebook Page ID não configurado.");
  const caption = d.caption || "";

  if (d.content_type === "video" || d.content_type === "video_capa") {
    const v = d.media_files.find(isVideo);
    if (!v) throw new Error("Vídeo não encontrado.");
    const r = await graph(`/${pageId}/videos`, { file_url: v.url, description: caption, access_token: token });
    return r.id || r.post_id || "";
  }

  if (d.content_type === "carrossel") {
    // Upload each as unpublished photo, then create a feed post with attached_media
    const sorted = [...d.media_files].sort((a, b) => a.order - b.order).filter(m => !isVideo(m));
    const ids: string[] = [];
    for (const m of sorted) {
      const up = await graph(`/${pageId}/photos`, { url: m.url, published: "false", access_token: token });
      ids.push(up.id);
    }
    const attached = ids.map(id => ({ media_fbid: id }));
    const post = await graph(`/${pageId}/feed`, {
      message: caption,
      attached_media: JSON.stringify(attached),
      access_token: token,
    });
    return post.id;
  }

  // single image post
  const img = d.media_files.find(m => !isVideo(m));
  if (!img) throw new Error("Imagem não encontrada.");
  const r = await graph(`/${pageId}/photos`, { url: img.url, caption, access_token: token });
  return r.post_id || r.id || "";
}

async function publishDispatch(
  supabase: any,
  d: Dispatch,
): Promise<{ ok: boolean; error?: string; externalIds?: Record<string, string> }> {
  console.log(`[dispatch ${d.id}] content=${d.content_type} accounts=${d.social_accounts?.length}`);

  if (!d.social_accounts?.length) return { ok: false, error: "Nenhuma rede social configurada." };
  if (!d.media_files?.length) return { ok: false, error: "Disparo sem mídias finais." };

  const ids = d.social_accounts.map(s => s.id);
  const { data: accounts, error } = await supabase
    .from("client_social_accounts")
    .select("id, platform, access_token, ig_user_id, fb_page_id, is_active")
    .in("id", ids)
    .eq("is_active", true);
  if (error) return { ok: false, error: `Falha ao carregar contas: ${error.message}` };
  if (!accounts?.length) return { ok: false, error: "Contas sociais não encontradas ou inativas." };

  const externalIds: Record<string, string> = {};
  for (const acc of accounts as AccountRow[]) {
    try {
      const id = acc.platform === "instagram"
        ? await publishInstagram(acc, d)
        : acc.platform === "facebook"
        ? await publishFacebook(acc, d)
        : (() => { throw new Error(`Plataforma '${acc.platform}' não suportada.`); })();
      externalIds[`${acc.platform}:${acc.id}`] = id;
      console.log(`[dispatch ${d.id}] ${acc.platform} OK -> ${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[dispatch ${d.id}] ${acc.platform} ERRO: ${msg}`);
      return { ok: false, error: `${acc.platform}: ${msg}` };
    }
  }

  return { ok: true, externalIds };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: due, error: pickErr } = await supabase
    .from("scheduled_publication_dispatches")
    .select("id, card_id, client_id, tenant_id, content_type, scheduled_at, caption, media_files, cover_file, social_accounts, attempt_count")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (pickErr) {
    console.error("[run-scheduled-dispatches] pick error", pickErr);
    return new Response(JSON.stringify({ error: pickErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const processed: any[] = [];

  for (const raw of (due || []) as Dispatch[]) {
    const { data: locked } = await supabase
      .from("scheduled_publication_dispatches")
      .update({
        status: "dispatching",
        dispatched_at: new Date().toISOString(),
        attempt_count: (raw.attempt_count || 0) + 1,
      })
      .eq("id", raw.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (!locked) { console.log(`[dispatch ${raw.id}] skipped (already locked)`); continue; }

    const result = await publishDispatch(supabase, raw);

    if (result.ok) {
      await supabase
        .from("scheduled_publication_dispatches")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          external_post_ids: result.externalIds ?? null,
          error_message: null,
        })
        .eq("id", raw.id);

      const { data: pubStatus } = await supabase
        .from("pipeline_statuses")
        .select("id")
        .eq("name", "Publicado")
        .limit(1)
        .maybeSingle();
      if (pubStatus) {
        await supabase
          .from("demands")
          .update({ status_id: pubStatus.id, updated_at: new Date().toISOString() })
          .eq("id", raw.card_id);
      }
      processed.push({ id: raw.id, status: "published" });
    } else {
      await supabase
        .from("scheduled_publication_dispatches")
        .update({
          status: "failed",
          error_message: result.error || "Falha desconhecida",
        })
        .eq("id", raw.id);
      processed.push({ id: raw.id, status: "failed", error: result.error });
    }
  }

  return new Response(JSON.stringify({ processed, count: processed.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
