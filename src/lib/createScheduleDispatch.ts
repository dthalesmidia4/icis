import { supabase } from "@/integrations/supabase/client";

type Attachment = {
  url: string;
  name?: string;
  type?: string;
  storagePath?: string;
  isFinal?: boolean;
};

export type ContentType = "post" | "carrossel" | "video" | "video_capa";

interface Args {
  cardId: string;
  tenantId: string;
  clientId: string;
  publishDate: string; // YYYY-MM-DD
  publishTime: string; // HH:mm
  caption?: string | null;
  attachments?: Attachment[] | null;
  demandType?: string | null;
  title?: string | null;
}

interface Result {
  ok: boolean;
  error?: string;
  dispatchId?: string;
  updated?: boolean;
}

// Infer content_type from demand_type / title
function inferContentType(demandType?: string | null, title?: string | null, attachments: Attachment[] = []): ContentType {
  const t = `${demandType || ""} ${title || ""}`.toLowerCase();
  if (/carrossel|carousel/.test(t)) return "carrossel";
  const videoCount = attachments.filter(a => /video|mp4|mov|webm/i.test(`${a.type || ""} ${a.name || ""} ${a.url}`)).length;
  const imageCount = attachments.filter(a => /image|jpg|jpeg|png|webp/i.test(`${a.type || ""} ${a.name || ""} ${a.url}`)).length;
  if (/v[ií]deo|reels?/.test(t) || videoCount > 0) {
    return videoCount > 0 && imageCount > 0 ? "video_capa" : "video";
  }
  if (imageCount > 1) return "carrossel";
  return "post";
}

const SOCIAL_LIMITS: Record<ContentType, number> = {
  post: 1,
  carrossel: 10,
  video: 1,
  video_capa: 2,
};

export async function createOrUpdateScheduleDispatch(args: Args): Promise<Result> {
  const {
    cardId, tenantId, clientId, publishDate, publishTime, caption,
    attachments = [], demandType, title,
  } = args;

  if (!clientId) return { ok: false, error: "Este card não está vinculado a um cliente." };
  if (!publishDate || !publishTime) return { ok: false, error: "Defina a data e o horário de publicação antes de agendar." };

  // Parse scheduled_at in local tz; treat as America/Sao_Paulo
  const scheduledIso = `${publishDate}T${publishTime.length === 5 ? publishTime : publishTime.slice(0, 5)}:00-03:00`;
  const scheduledAt = new Date(scheduledIso);
  if (isNaN(scheduledAt.getTime())) return { ok: false, error: "Data/horário inválidos." };
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "A data de publicação escolhida já passou. Escolha uma nova data para agendar." };
  }

  const finals = (attachments || []).filter(a => a && a.url);
  const contentType = inferContentType(demandType, title, finals);

  // Validations per content_type
  if (contentType === "post" && finals.length < 1) {
    return { ok: false, error: "Anexe a imagem final antes de agendar o post." };
  }
  if (contentType === "carrossel") {
    if (finals.length < 2) return { ok: false, error: "Este carrossel possui slides sem mídia final. Finalize todos os slides antes de agendar a publicação." };
    if (finals.length > SOCIAL_LIMITS.carrossel) return { ok: false, error: "A quantidade de mídias deste carrossel ultrapassa o limite permitido pela rede social selecionada." };
  }
  if (contentType === "video" && !finals.some(a => /video|mp4|mov|webm/i.test(`${a.type || ""} ${a.name || ""} ${a.url}`))) {
    return { ok: false, error: "Anexe o arquivo de vídeo final antes de agendar." };
  }

  // Check client has any connected social account
  const { data: logins, error: loginsErr } = await supabase
    .from("platform_logins")
    .select("id, name, access_info")
    .eq("tenant_id", tenantId);
  if (loginsErr) {
    console.error("[ScheduleDispatch] platform_logins error", loginsErr);
  }
  const socialAccounts = (logins || []).filter(l =>
    /instagram|facebook|tiktok|linkedin|twitter|x\.com|youtube/i.test(`${l.name || ""}`)
  );
  if (socialAccounts.length === 0) {
    return { ok: false, error: "Este cliente ainda não possui redes sociais conectadas para publicação." };
  }

  const coverFile = contentType === "video_capa"
    ? finals.find(a => /image|jpg|jpeg|png|webp/i.test(`${a.type || ""} ${a.name || ""} ${a.url}`)) || null
    : null;

  const mediaFiles = finals.map((a, idx) => ({
    url: a.url,
    name: a.name || null,
    type: a.type || null,
    order: idx,
  }));

  const { data: { user } } = await supabase.auth.getUser();

  // Check for existing active dispatch
  const { data: existing } = await supabase
    .from("scheduled_publication_dispatches")
    .select("id, status")
    .eq("card_id", cardId)
    .in("status", ["scheduled", "dispatching"])
    .maybeSingle();

  const payload = {
    tenant_id: tenantId,
    client_id: clientId,
    card_id: cardId,
    created_by: user?.id || null,
    content_type: contentType,
    scheduled_at: scheduledAt.toISOString(),
    timezone: "America/Sao_Paulo",
    caption: caption || null,
    media_files: mediaFiles,
    cover_file: coverFile,
    social_accounts: socialAccounts.map(s => ({ id: s.id, name: s.name })),
    status: "scheduled" as const,
    error_message: null,
    attempt_count: 0,
  };

  if (existing) {
    const { error } = await supabase
      .from("scheduled_publication_dispatches")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, dispatchId: existing.id, updated: true };
  }

  const { data, error } = await supabase
    .from("scheduled_publication_dispatches")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, dispatchId: data.id };
}

export async function hasActiveDispatch(cardId: string): Promise<boolean> {
  const { data } = await supabase
    .from("scheduled_publication_dispatches")
    .select("id")
    .eq("card_id", cardId)
    .in("status", ["scheduled", "dispatching"])
    .maybeSingle();
  return !!data;
}
