// Shared auth guard for edge functions that write period_plans.
// Ensures: valid JWT, user has access to tenantId, and periodPlanId belongs
// to that tenant (and its company_id is inside the tenant).
import { createClient } from "npm:@supabase/supabase-js@2";

export type AuthOk = {
  ok: true;
  userId: string;
  admin: ReturnType<typeof createClient>;
};
export type AuthFail = { ok: false; status: number; error: string };
export type AuthResult = AuthOk | AuthFail;

export async function requireTenantAndPlanAccess(
  req: Request,
  tenantId: string,
  periodPlanId: string,
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supaAuth = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supaAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const userId = String(claimsData.claims.sub);

  if (!tenantId || !periodPlanId) {
    return { ok: false, status: 400, error: "tenantId e periodPlanId obrigatórios" };
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Tenant access
  const { data: tenantOk, error: tenantErr } = await admin.rpc(
    "user_has_tenant_access",
    { _user_id: userId, _tenant_id: tenantId },
  );
  if (tenantErr || !tenantOk) {
    return { ok: false, status: 403, error: "Sem acesso ao tenant" };
  }

  // Plan belongs to tenant, and company belongs to tenant
  const { data: plan, error: planErr } = await admin
    .from("period_plans")
    .select("id, tenant_id, company_id")
    .eq("id", periodPlanId)
    .maybeSingle();
  if (planErr || !plan) {
    return { ok: false, status: 404, error: "Plano não encontrado" };
  }
  if ((plan as any).tenant_id !== tenantId) {
    return { ok: false, status: 403, error: "Plano não pertence ao tenant" };
  }
  const companyId = (plan as any).company_id;
  if (companyId) {
    const { data: company, error: cErr } = await admin
      .from("tenant_companies")
      .select("id, tenant_id")
      .eq("id", companyId)
      .maybeSingle();
    if (cErr || !company || (company as any).tenant_id !== tenantId) {
      return { ok: false, status: 403, error: "Cliente do plano não pertence ao tenant" };
    }
  }

  return { ok: true, userId, admin };
}
