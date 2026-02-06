import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvitationEmailRequest {
  email: string;
  invitationCode: string;
  agencyName: string;
  role: string;
  inviterName?: string;
}

const roleLabels: Record<string, string> = {
  agency_admin: "Administrador da Agência",
  agency_manager: "Gestor Operacional",
  agency_user: "Colaborador",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);

    const { email, invitationCode, agencyName, role, inviterName }: InvitationEmailRequest = await req.json();

    // Validate required fields
    if (!email || !invitationCode || !agencyName) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, invitationCode, or agencyName" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const roleLabel = roleLabels[role] || role;
    const inviterText = inviterName ? `${inviterName} convidou você` : "Você foi convidado(a)";

    const emailResponse = await resend.emails.send({
      from: "Convites <onboarding@resend.dev>",
      to: [email],
      subject: `Convite para ${agencyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Você foi convidado!</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              ${inviterText} para fazer parte da equipe da <strong>${agencyName}</strong> como <strong>${roleLabel}</strong>.
            </p>
            
            <div style="background: white; border: 2px dashed #8b5cf6; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Seu código de convite:</p>
              <p style="font-size: 32px; font-weight: bold; color: #8b5cf6; margin: 0; letter-spacing: 4px;">${invitationCode}</p>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; margin-bottom: 25px;">
              Para aceitar o convite, crie sua conta e insira o código acima durante o cadastro.
            </p>
            
            <div style="text-align: center;">
              <a href="https://nurture-plan-forge.lovable.app/auth" 
                 style="display: inline-block; background: #8b5cf6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Criar Conta
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              Este convite expira em 7 dias. Se você não solicitou este convite, pode ignorar este email.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Invitation email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error sending invitation email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
