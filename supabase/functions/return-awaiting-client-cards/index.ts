// Edge function: return-awaiting-client-cards
// Cron-invoked. For each tenant, moves cards from `aguardando_cliente` back to
// `enviar_cliente` (Mídia) / `entregar_cliente` (Sistemas) when:
// (a) wait_hours elapsed, and (b) current local hour matches one of the
// configured return_times (within ±30min window).
//
// Resiliência: se a config `client_return` nunca foi salva, usa os padrões
// (10:00 / 24h) em vez de ignorar o tenant. Se o responsável atual não tem a
// função de retorno atribuída na área, resolve um responsável habilitado
// (preferindo quem já executou essa etapa no card) para não travar no trigger.

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
const DEFAULT_RETURN_TIMES = ["10:00"];
const DEFAULT_WAIT_HOURS = 24;
const WINDOW_MIN = 30; // ±30min tolerance

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
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

    // Load all tenants' aguardando_cliente flow_functions config, POR ÁREA
    // (a chave existe em Mídia e em Sistemas, com configs de retorno distintas).
    const { data: fns, error: fnErr } = await supabase
      .from("flow_functions")
      .select("tenant_id, config, work_area")
      .eq("function_key", "aguardando_cliente")
      .eq("active", true);


    if (fnErr) throw fnErr;

    const results: any[] = [];

    for (const row of (fns as any[]) || []) {
      const cfg = ((row.config || {}).client_return || {}) as Partial<AwaitingConfig>;
      const configured = Array.isArray(cfg.return_times)
        ? cfg.return_times.filter((t: any) => parseHM(String(t)) !== null)
        : [];
      // Sem config salva o retorno usava a ficar parado para sempre: aplica o padrão.
      const returnTimes = configured.length > 0 ? configured : DEFAULT_RETURN_TIMES;
      const usedDefaults = configured.length === 0;
      const waitHours = Math.max(1, Number(cfg.wait_hours) || DEFAULT_WAIT_HOURS);
      const maxResends = cfg.max_resends == null ? null : Number(cfg.max_resends);
      const tz = cfg.timezone || DEFAULT_TZ;

      const nowMin = localHourMinutes(tz);
      if (!timeMatchesReturnSlot(nowMin, returnTimes)) {
        results.push({ tenant_id: row.tenant_id, work_area: row.work_area, skipped: "outside_window", nowMin });
        continue;
      }

      // Threshold: cards whose client_wait_started_at is older than wait_hours
      const threshold = new Date(Date.now() - waitHours * 3600 * 1000).toISOString();

      // Find eligible cards — restritos à área desta config de fluxo.
      const area = row.work_area === "sistemas" ? "sistemas" : "midia";
      // Etapa de retorno depende da área: Mídia reenvia, Sistemas reentrega.
      const returnKey = area === "sistemas" ? "entregar_cliente" : "enviar_cliente";
      const q = supabase
        .from("demands")
        .select("id, assigned_to, client_resend_count, client_last_resend_at, tenant_id")
        .eq("tenant_id", row.tenant_id)
        .eq("work_area", area)
        .eq("current_function_key", "aguardando_cliente")
        .lte("client_wait_started_at", threshold);


      const { data: cards, error: cErr } = await q;
      if (cErr) {
        results.push({ tenant_id: row.tenant_id, work_area: area, error: cErr.message });
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

      // Quem pode assumir a etapa de retorno nesta área (trigger de banco exige).
      const { data: allowedRows } = await supabase
        .from("collaborator_function_assignments")
        .select("user_id")
        .eq("tenant_id", row.tenant_id)
        .eq("work_area", area)
        .eq("function_key", returnKey)
        .eq("allowed", true);
      const allowedUsers = new Set(((allowedRows as any[]) || []).map((r) => r.user_id));

      // Carga atual de cada colaborador habilitado: o fallback escolhe o MENOS
      // ocupado (antes pegava um qualquer da lista).
      const loadByUser = new Map<string, number>();
      if (allowedUsers.size > 0) {
        const { data: openDemands } = await supabase
          .from("demands")
          .select("assigned_to")
          .eq("tenant_id", row.tenant_id)
          .is("archived_at", null)
          .in("assigned_to", [...allowedUsers]);
        ((openDemands as any[]) || []).forEach((d) => {
          if (d.assigned_to) loadByUser.set(d.assigned_to, (loadByUser.get(d.assigned_to) || 0) + 1);
        });
      }
      const leastBusyAllowed = (): string | null =>
        [...allowedUsers].sort(
          (a, b) => (loadByUser.get(a as string) || 0) - (loadByUser.get(b as string) || 0),
        )[0] as string | null;


      const returned: string[] = [];
      const failures: any[] = [];

      for (const c of eligible) {
        const newCount = (c.client_resend_count || 0) + 1;
        const nowIso = new Date().toISOString();

        // Resolve responsável válido para a etapa de retorno.
        let assignee: string | null = c.assigned_to || null;
        let reassignedFrom: string | null = null;
        if (!assignee || !allowedUsers.has(assignee)) {
          reassignedFrom = assignee;
          let resolved: string | null = null;
          // 1) Quem já passou por essa etapa neste card.
          const { data: hist } = await supabase
            .from("demand_flow_history")
            .select("to_user_id, from_user_id, to_function_key, from_function_key, created_at")
            .eq("demand_id", c.id)
            .order("created_at", { ascending: false })
            .limit(50);
          for (const h of ((hist as any[]) || [])) {
            const cand =
              h.to_function_key === returnKey ? h.to_user_id
              : h.from_function_key === returnKey ? h.from_user_id
              : null;
            if (cand && allowedUsers.has(cand)) { resolved = cand; break; }
          }
          // 2) Qualquer colaborador habilitado na etapa/área.
          if (!resolved && allowedUsers.size > 0) resolved = leastBusyAllowed();
          assignee = resolved;
        }

        if (!assignee) {
          failures.push({ id: c.id, reason: "no_allowed_assignee", function_key: returnKey });
          continue;
        }

        const { error: upErr } = await supabase
          .from("demands")
          .update({
            current_function_key: returnKey,
            assigned_to: assignee,
            client_resend_count: newCount,
            client_last_resend_at: nowIso,
            client_wait_started_at: null,
          } as any)
          .eq("id", c.id);
        if (upErr) {
          console.error("[return-awaiting] update failed", c.id, upErr.message);
          failures.push({ id: c.id, reason: upErr.message });
          continue;
        }

        await supabase.from("demand_flow_history").insert({
          tenant_id: row.tenant_id,
          demand_id: c.id,
          action: "auto_return_from_client",
          from_user_id: c.assigned_to,
          to_user_id: assignee,
          from_function_key: "aguardando_cliente",
          to_function_key: returnKey,
          metadata: {
            resend_count: newCount,
            wait_hours: waitHours,
            work_area: area,
            used_default_config: usedDefaults,
            ...(reassignedFrom !== undefined && reassignedFrom !== assignee
              ? { reassigned_from: reassignedFrom, reassign_reason: "assignee_without_function" }
              : {}),
          },
        } as any);


        returned.push(c.id);
      }

      results.push({
        tenant_id: row.tenant_id,
        work_area: area,
        used_default_config: usedDefaults,
        eligible: eligible.length,
        returned: returned.length,
        ids: returned,
        failures,
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
