// Edge function: return-awaiting-client-cards
// Cron-invoked. For each tenant, moves cards from `aguardando_cliente` back to
// `enviar_cliente` when: (a) wait_hours elapsed, and (b) current local hour
// matches one of the configured return_times (within ±30min window).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AwaitingConfig {
  wait_hours: number;
  return_times: string[]; // ["10:00", "15:00"]
  max_resends: number | null;
  timezone: string; // e.g. "America/Sao_Paulo"
}

const DEFAULT_TZ = "America/Sao_Paulo";
const WINDOW_MIN = 30; // ±30min tolerance

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function localHourMinutes(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return h * 60 + m;
}

function timeMatchesReturnSlot(nowMin: number, times: string[]): boolean {
  for (const t of times) {
    const target = parseHM(t);
    if (target === null) continue;
    if (Math.abs(nowMin - target) <= WINDOW_MIN) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load all tenants' aguardando_cliente flow_functions config
    const { data: fns, error: fnErr } = await supabase
      .from("flow_functions")
      .select("tenant_id, config")
      .eq("function_key", "aguardando_cliente")
      .eq("active", true);

    if (fnErr) throw fnErr;

    const results: any[] = [];

    for (const row of (fns as any[]) || []) {
      const cfg = ((row.config || {}).client_return || {}) as Partial<AwaitingConfig>;
      const returnTimes = Array.isArray(cfg.return_times) ? cfg.return_times : [];
      if (returnTimes.length === 0) {
        results.push({ tenant_id: row.tenant_id, skipped: "no_return_times" });
        continue;
      }
      const waitHours = Math.max(1, Number(cfg.wait_hours) || 24);
      const maxResends = cfg.max_resends == null ? null : Number(cfg.max_resends);
      const tz = cfg.timezone || DEFAULT_TZ;

      const nowMin = localHourMinutes(tz);
      if (!timeMatchesReturnSlot(nowMin, returnTimes)) {
        results.push({ tenant_id: row.tenant_id, skipped: "outside_window", nowMin });
        continue;
      }

      // Threshold: cards whose client_wait_started_at is older than wait_hours
      const threshold = new Date(Date.now() - waitHours * 3600 * 1000).toISOString();

      // Find eligible cards
      let q = supabase
        .from("demands")
        .select("id, assigned_to, client_resend_count, client_last_resend_at, tenant_id")
        .eq("tenant_id", row.tenant_id)
        .eq("current_function_key", "aguardando_cliente")
        .lte("client_wait_started_at", threshold);

      const { data: cards, error: cErr } = await q;
      if (cErr) {
        results.push({ tenant_id: row.tenant_id, error: cErr.message });
        continue;
      }

      const eligible = ((cards as any[]) || []).filter((c) => {
        if (maxResends != null && (c.client_resend_count || 0) >= maxResends) return false;
        // Cooldown: avoid double-return in the same run — require last_resend >= wait_hours ago
        if (c.client_last_resend_at) {
          const last = new Date(c.client_last_resend_at).getTime();
          if (Date.now() - last < waitHours * 3600 * 1000) return false;
        }
        return true;
      });

      const returned: string[] = [];
      for (const c of eligible) {
        const newCount = (c.client_resend_count || 0) + 1;
        const nowIso = new Date().toISOString();

        const { error: upErr } = await supabase
          .from("demands")
          .update({
            current_function_key: "enviar_cliente",
            client_resend_count: newCount,
            client_last_resend_at: nowIso,
            client_wait_started_at: null,
          } as any)
          .eq("id", c.id);
        if (upErr) continue;

        await supabase.from("demand_flow_history").insert({
          tenant_id: row.tenant_id,
          demand_id: c.id,
          action: "auto_return_from_client",
          from_user_id: c.assigned_to,
          to_user_id: c.assigned_to,
          from_function_key: "aguardando_cliente",
          to_function_key: "enviar_cliente",
          metadata: { resend_count: newCount, wait_hours: waitHours },
        } as any);

        returned.push(c.id);
      }

      results.push({
        tenant_id: row.tenant_id,
        eligible: eligible.length,
        returned: returned.length,
        ids: returned,
      });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    console.error("return-awaiting-client-cards error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
