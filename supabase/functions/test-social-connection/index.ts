// Validates a Meta Graph access token + Page ID (and optional IG Business Account ID).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function g(path: string, params: Record<string, string>) {
  const u = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString());
  const j = await r.json();
  return { ok: r.ok && !j.error, status: r.status, body: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { account_id } = await req.json();
    if (!account_id) throw new Error("account_id obrigatório");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: acc, error } = await supabase
      .from("client_social_accounts")
      .select("id, platform, access_token, fb_page_id, ig_user_id, token_expires_at")
      .eq("id", account_id)
      .single();
    if (error || !acc) throw new Error("Conta não encontrada");

    // Token expiry check
    if (acc.token_expires_at && new Date(acc.token_expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ status: "token_expired", message: "Token expirado." }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (acc.platform === "facebook") {
      const pageRes = await g(`/${acc.fb_page_id}`, { fields: "id,name", access_token: acc.access_token });
      if (!pageRes.ok) {
        const msg = pageRes.body?.error?.message || "";
        const code = pageRes.body?.error?.code;
        if (code === 190) return new Response(JSON.stringify({ status: "token_error", message: msg }), { headers: { ...cors, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ status: "page_error", message: msg || "Page ID inválido para este token." }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ status: "connected", message: `Conectado: ${pageRes.body.name}` }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Instagram: validate ig_user_id directly
    const igRes = await g(`/${acc.ig_user_id}`, { fields: "id,username", access_token: acc.access_token });
    if (!igRes.ok) {
      const msg = igRes.body?.error?.message || "";
      const code = igRes.body?.error?.code;
      if (code === 190) return new Response(JSON.stringify({ status: "token_error", message: msg }), { headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ status: "instagram_not_linked", message: msg || "IG Business Account ID inválido para este token." }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ status: "connected", message: `Conectado: @${igRes.body.username}` }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ status: "error", message: e instanceof Error ? e.message : String(e) }), {
      headers: { ...cors, "Content-Type": "application/json" }, status: 200,
    });
  }
});
