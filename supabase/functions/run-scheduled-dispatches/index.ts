// Cron-driven worker that executes due scheduled_publication_dispatches.
// Triggered every minute by pg_cron via net.http_post.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Dispatch {
  id: string;
  card_id: string;
  client_id: string;
  tenant_id: string;
  content_type: string;
  scheduled_at: string;
  caption: string | null;
  media_files: Array<{ url: string; name?: string; type?: string; order: number }>;
  cover_file: { url: string } | null;
  social_accounts: Array<{ id: string; name: string }>;
  attempt_count: number;
}

async function publishDispatch(d: Dispatch): Promise<{ ok: boolean; error?: string; externalIds?: any }> {
  // Placeholder: a real implementation would call Meta Graph API / TikTok / etc.
  // For now, since per-network OAuth tokens are not yet stored in a structured way,
  // we record a clear failure so the operator can see it in the card and configure it.
  console.log(`[dispatch ${d.id}] content_type=${d.content_type} media=${d.media_files.length} accounts=${d.social_accounts.map(s => s.name).join(",")}`);

  if (!d.social_accounts || d.social_accounts.length === 0) {
    return { ok: false, error: "Nenhuma rede social conectada para o cliente." };
  }
  if (!d.media_files || d.media_files.length === 0) {
    return { ok: false, error: "Disparo sem mídias finais." };
  }
  return {
    ok: false,
    error: "Integração com a rede social ainda não configurada. Configure os tokens da rede do cliente em Logins de Plataforma para habilitar publicações automáticas.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Pick due dispatches (limit batch)
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
    // Lock by transitioning to 'dispatching'; if another worker already grabbed it, skip
    const { data: locked, error: lockErr } = await supabase
      .from("scheduled_publication_dispatches")
      .update({
        status: "dispatching",
        dispatched_at: new Date().toISOString(),
        attempt_count: raw.attempt_count + 1,
      })
      .eq("id", raw.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (lockErr || !locked) {
      console.log(`[dispatch ${raw.id}] skipped (already locked)`);
      continue;
    }

    const result = await publishDispatch(raw);

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

      // Move card to 'Publicado'
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
