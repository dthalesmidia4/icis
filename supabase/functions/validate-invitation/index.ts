/**
 * validate-invitation Edge Function
 * 
 * NOVO MODELO: Valida convites usando agency_id
 * Mantém compatibilidade com tenant_id durante transição
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    // Buscar tanto agency_id quanto tenant_id para compatibilidade
    const { data: invitation, error } = await supabase
      .from("invitations")
      .select("id, code, tenant_id, agency_id, role, expires_at")
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

    // NOVO MODELO: Tentar buscar agency primeiro
    if (invitation.agency_id) {
      const { data: agency } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("id", invitation.agency_id)
        .maybeSingle();

      if (agency) {
        // Mapear role para novo modelo
        const mappedRole = invitation.role === 'agency_admin' || invitation.role === 'super_admin' 
          ? 'agency_admin' 
          : 'agency_user';

        return new Response(
          JSON.stringify({
            valid: true,
            agency_id: agency.id,
            // Compatibilidade: ainda retorna tenant_id para código legado
            tenant_id: invitation.tenant_id || agency.id,
            role: mappedRole,
            agency_name: agency.name,
            tenant_name: agency.name, // Compatibilidade
            tenant_type: "agency",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fallback: Buscar tenant (código legado durante transição)
    if (invitation.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, tenant_type")
        .eq("id", invitation.tenant_id)
        .maybeSingle();

      // Tentar encontrar agency correspondente via legacy_tenant_id
      const { data: agency } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("legacy_tenant_id", invitation.tenant_id)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          valid: true,
          tenant_id: invitation.tenant_id,
          agency_id: agency?.id || null,
          role: invitation.role,
          tenant_name: tenant?.name || agency?.name || "Organização",
          agency_name: agency?.name || tenant?.name || "Organização",
          tenant_type: tenant?.tenant_type || "agency",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ valid: false, error: "Convite sem organização associada" }),
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
