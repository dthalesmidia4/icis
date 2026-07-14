// SHIM (backwards compatibility).
//
// The heavy lifting moved to two dedicated functions:
//   - generate-normal-demands  → default_plan
//   - generate-ultra-demands   → ultra_plan
//
// This entry point still exists so any legacy caller (or a browser tab still
// running an old bundle) keeps working. It just forwards the request body to
// the correct new function based on `planType` and streams the response back.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const planType: "default" | "ultra" = body?.planType === "ultra" ? "ultra" : "default";
    const target = planType === "ultra" ? "generate-ultra-demands" : "generate-normal-demands";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url = `${supabaseUrl}/functions/v1/${target}`;

    // Forward original Authorization if present; otherwise use service role.
    const auth = req.headers.get("Authorization") || `Bearer ${serviceKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": auth,
        "apikey": Deno.env.get("SUPABASE_ANON_KEY") || serviceKey,
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("=== GENERATE-PERIOD-PLANS SHIM ERROR ===", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
