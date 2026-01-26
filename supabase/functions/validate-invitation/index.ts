/**
 * validate-invitation Edge Function
 * 
 * SCHEMA ATUAL: Usa tenants e tenant_id (tabela invitations)
 * As tabelas agencies/agency_memberships ainda não existem
 * 
 * ROLES VÁLIDAS: agency_admin, agency_manager, agency_user
 * ROLES LEGADAS (deprecated): client_admin, client_user, subclient_user
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Roles válidas para o produto atual
const VALID_AGENCY_ROLES = ['agency_admin', 'agency_manager', 'agency_user'];

// Roles legadas (deprecated)
const LEGACY_ROLES = ['client_admin', 'client_user', 'subclient_user'];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code || typeof code !== "string") {
      return new Response(
        JSON.stringify({ valid: false, error: "Código não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query invitation using service role (bypasses RLS)
    // Usar apenas tenant_id que existe no schema atual
    const { data: invitation, error } = await supabase
      .from("invitations")
      .select("id, code, tenant_id, role, expires_at")
      .eq("code", code.toUpperCase().trim())
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error("Error querying invitation:", error);
      return new Response(
        JSON.stringify({ valid: false, error: "Erro ao validar convite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!invitation) {
      return new Response(
        JSON.stringify({ valid: false, error: "Código inválido ou expirado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!invitation.tenant_id) {
      return new Response(
        JSON.stringify({ valid: false, error: "Convite sem organização associada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar tenant (schema atual)
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, tenant_type")
      .eq("id", invitation.tenant_id)
      .maybeSingle();

    // Determinar se é role legada
    const isLegacyRole = LEGACY_ROLES.includes(invitation.role);
    const isValidRole = VALID_AGENCY_ROLES.includes(invitation.role);

    return new Response(
      JSON.stringify({
        valid: true,
        tenant_id: invitation.tenant_id,
        // Compatibilidade: retornar também como agency_id para código que espera o novo modelo
        agency_id: invitation.tenant_id,
        role: invitation.role,
        tenant_name: tenant?.name || "Organização",
        agency_name: tenant?.name || "Organização",
        tenant_type: tenant?.tenant_type || "agency",
        // Flags para o frontend
        is_legacy_role: isLegacyRole,
        is_valid_role: isValidRole,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
