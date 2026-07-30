import { supabase } from "@/integrations/supabase/client";
import { pickAssigneeForFunction } from "@/lib/proceedDemand";
import type { DemandTypeKey } from "@/lib/proceedDemand";
import { recordFlowHistory } from "@/lib/flowHistory";
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";

export interface CreateCardInput {
  tenantId: string;
  clientId: string;
  /** id da linha em `generated_contents` (usado para dedupe e vínculo). */
  contentId: string;
  /** `generated_contents.content_type` */
  contentType: string;
  prompt?: string | null;
  imageUrls: string[];
}

export interface CreateCardResult {
  success: boolean;
  message: string;
  demandId?: string;
  assignedName?: string;
  duplicated?: boolean;
}

const TYPE_LABEL: Partial<Record<DemandTypeKey, string>> = {
  criativo_estatico: "Post Estático",
  carrossel: "Carrossel",
  video_captado: "Vídeo",
  video_gerado: "Vídeo",
  outro: "Outro",
};

function mapContentTypeToKey(contentType: string): DemandTypeKey | null {
  switch (contentType) {
    case "post":
      return "criativo_estatico";
    case "carousel":
      return "carrossel";
    case "video_scene":
    case "video":
      return "video_gerado";
    default:
      // video_storyboard e outros: bloquear
      return null;
  }
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|#|$)/i.test(url) || url.includes("video-scenes/");
}

function inferMimeType(url: string): string {
  if (/\.mp4(\?|#|$)/i.test(url)) return "video/mp4";
  if (/\.mov(\?|#|$)/i.test(url)) return "video/quicktime";
  if (/\.webm(\?|#|$)/i.test(url)) return "video/webm";
  if (/\.jpe?g(\?|#|$)/i.test(url)) return "image/jpeg";
  if (/\.webp(\?|#|$)/i.test(url)) return "image/webp";
  return "image/png";
}

/** Extrai o storagePath (após `.../object/public/<bucket>/`) quando possível. */
function extractStoragePath(url: string): string {
  const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+?)(\?|#|$)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function buildTitle(typeKey: DemandTypeKey, prompt?: string | null): string {
  const label = TYPE_LABEL[typeKey];
  const p = (prompt || "").trim();
  if (p) {
    const short = p.length > 60 ? `${p.slice(0, 60).trim()}…` : p;
    return `${label} — ${short}`;
  }
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${label} avulso — ${dd}/${mm} ${hh}:${mi}`;
}

function buildAttachmentName(typeKey: DemandTypeKey, index: number, url: string): string {
  const isVideo = isVideoUrl(url);
  const ext = isVideo ? "mp4" : "png";
  if (typeKey === "carrossel") return `Slide ${index + 1}.${ext}`;
  if (typeKey === "video_gerado") return `cena-${index + 1}.${ext}`;
  return `post-${index + 1}.${ext}`;
}

export async function createCardFromContent(input: CreateCardInput): Promise<CreateCardResult> {
  const { tenantId, clientId, contentId, contentType, prompt, imageUrls } = input;

  // 1. Validar mídia
  const typeKey = mapContentTypeToKey(contentType);
  if (!typeKey) {
    return {
      success: false,
      message: "Este tipo de conteúdo não pode virar card (sem mídia final).",
    };
  }
  if (!imageUrls || imageUrls.length === 0) {
    return { success: false, message: "Este conteúdo ainda não tem mídia gerada." };
  }

  // 2. Usuário logado
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { success: false, message: "Sessão expirada. Faça login novamente." };

  // 3. Dedupe: existe card ativo com este sourceContentId?
  {
    const { data: existing } = await supabase
      .from("demands")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .contains("attachments", [{ sourceContentId: contentId }] as any)
      .limit(1);
    if (existing && existing.length > 0) {
      return {
        success: false,
        duplicated: true,
        demandId: existing[0].id,
        message: "Esse conteúdo já possui um card criado.",
      };
    }
  }

  // 4. Pipeline default + status inicial
  const { data: pipelines, error: pErr } = await supabase
    .from("pipelines")
    .select("id, is_default, position")
    .eq("tenant_id", tenantId)
    .order("position");
  if (pErr) return { success: false, message: "Erro ao carregar pipeline." };
  const pipeline = (pipelines || []).find((p: any) => p.is_default) || (pipelines || [])[0];
  if (!pipeline) return { success: false, message: "Nenhum pipeline configurado para este tenant." };

  const { data: statuses, error: sErr } = await supabase
    .from("pipeline_statuses")
    .select("id, is_initial, position")
    .eq("pipeline_id", pipeline.id)
    .order("position");
  if (sErr) return { success: false, message: "Erro ao carregar status." };
  const status = (statuses || []).find((s: any) => s.is_initial) || (statuses || [])[0];
  if (!status) return { success: false, message: "Nenhum status configurado para o pipeline." };

  // 5. Colaborador para "revisar"
  const picked = await pickAssigneeForFunction(tenantId, "revisar", "Revisar");
  if (!picked.success || !picked.userId) {
    return {
      success: false,
      message: picked.message || "Nenhum colaborador tem a função Revisar atribuída.",
    };
  }

  // 6. Anexos
  const uploaderName =
    (user.user_metadata as any)?.full_name || (user.email as string) || "Usuário";
  const uploadedAt = new Date().toISOString();
  const attachments = imageUrls.filter(Boolean).map((url, idx) => {
    const storagePath = extractStoragePath(url);
    return {
      id: (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${idx}`,
      name: buildAttachmentName(typeKey, idx, url),
      url,
      type: inferMimeType(url),
      size: 0,
      storagePath,
      uploadedAt,
      uploadedBy: {
        id: user.id,
        email: user.email || "",
        name: uploaderName,
      },
      cardId: "", // preenchido pelo próprio TaskCard futuramente; ausência não quebra preview
      tenantId,
      clientId,
      sourceContentId: contentId,
    };
  });

  // 7. Title, description
  const title = buildTitle(typeKey, prompt);
  const description = (prompt || "").trim() || null;

  // 8. Resolver etapa apropriada ao responsável (caso o usuário escolhido
  // via pickAssigneeForFunction("revisar") tenha múltiplas funções, respeitamos
  // a sequência do tipo).
  let functionKey: string = "revisar";
  if (picked.userId) {
    try {
      const resolved = await resolveFunctionForAssignee(
        tenantId,
        picked.userId,
        typeKey,
        "revisar",
      );
      if (resolved) functionKey = resolved;
    } catch { /* mantém revisar */ }
  }

  // Área de trabalho — default do perfil do criador (fallback 'midia').
  let workArea: "midia" | "sistemas" = "midia";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("default_work_area")
      .eq("id", user.id)
      .maybeSingle();
    const v = (prof as any)?.default_work_area;
    if (v === "sistemas" || v === "midia") workArea = v;
  } catch { /* mantém midia */ }

  // 9. INSERT
  const { data: inserted, error: insErr } = await supabase
    .from("demands")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      pipeline_id: pipeline.id,
      status_id: status.id,
      title,
      description,
      instructions: null,
      demand_type: TYPE_LABEL[typeKey] || "Outro",
      demand_type_key: typeKey,
      source: "standalone_content",
      attachments: attachments as any,
      assigned_to: picked.userId,
      current_function_key: functionKey,
      created_by: user.id,
      work_area: workArea,
    } as any)
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[createCardFromContent] insert error:", insErr);
    return { success: false, message: "Erro ao criar o card." };
  }

  await recordFlowHistory({
    tenantId,
    demandId: inserted.id,
    action: "created",
    fromUserId: null,
    toUserId: picked.userId ?? null,
    fromFunctionKey: null,
    toFunctionKey: functionKey,
  });

  return {
    success: true,
    demandId: inserted.id,
    assignedName: picked.name,
    message: picked.name
      ? `Card criado e enviado para revisão de ${picked.name}.`
      : "Card criado e enviado para revisão.",
  };
}
