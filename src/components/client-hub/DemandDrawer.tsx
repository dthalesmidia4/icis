import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import TaskCard, { type Attachment, type KanbanCardData, type PipelineStatus } from "@/components/TaskCard";

interface DemandDrawerProps {
  demandId: string | null;
  tenantId: string | null | undefined;
  onClose: () => void;
  /** Chamado após qualquer persistência para recarregar o workspace do hub. */
  onPersisted?: () => void;
}

/**
 * Abre uma demanda do Hub do Cliente em painel lateral direito,
 * reaproveitando o TaskCard completo (presentation="drawer").
 */
export default function DemandDrawer({ demandId, tenantId, onClose, onPersisted }: DemandDrawerProps) {
  const [card, setCard] = useState<KanbanCardData | null>(null);
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCard = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("demands")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      console.error("[DemandDrawer] load error", error);
      setLoading(false);
      setLoadError("Não foi possível abrir esta demanda.");
      toast.error("Não foi possível abrir a demanda.");
      return;
    }
    const d = data as any;

    // Relações auxiliares são opcionais: um registro válido de `demands`
    // deve abrir mesmo que status ou empresa estejam incompletos.
    const [statusRes, companyRes] = await Promise.all([
      d.status_id
        ? supabase.from("pipeline_statuses").select("name, color").eq("id", d.status_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      d.client_id
        ? supabase
            .from("tenant_companies")
            .select("name, fantasy_name")
            .eq("id", d.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    const statusRow = (statusRes as any)?.data as any;
    const companyRow = (companyRes as any)?.data as any;

    setCard({
      id: d.id,
      title: d.title,
      description: d.description || "",
      status: statusRow?.name || "",
      due_date: d.due_date || "",
      publish_date: d.publish_date || "",
      publish_time: d.publish_time || "",
      channel: d.channel || "",
      demand_type: d.demand_type || "",
      demand_type_key: d.demand_type_key ?? null,
      objective: d.objective || "",
      instructions: d.instructions || "",
      observations: d.observations || "",
      post_caption: d.post_caption || "",
      attachments: Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : [],
      additional_publish_dates: Array.isArray(d.additional_publish_dates)
        ? (d.additional_publish_dates as string[])
        : [],
      source: d.source || "manual",
      delivery_date: d.delivery_date || "",
      due_time: d.due_time || "",
      delivery_time: d.delivery_time || "",
      period_plan_id: d.period_plan_id || "",
      tenant_id: d.tenant_id,
      created_at: d.created_at,
      updated_at: d.updated_at,
      assigned_to: d.assigned_to || null,
      additional_assignees: Array.isArray(d.additional_assignees) ? d.additional_assignees : [],
      current_function_key: d.current_function_key ?? null,
      classifications: Array.isArray(d.classifications) ? d.classifications : [],
      ad_plan: (d.ad_plan as Record<string, any> | null) ?? null,
      work_area: d.work_area ?? null,
      origin: d.origin ?? "interno",
      origin_note: d.origin_note ?? null,
      subclient_id: d.subclient_id ?? null,
      subclient_ids: Array.isArray(d.subclient_ids) ? d.subclient_ids : [],
      archived_at: d.archived_at ?? null,
      clientId: d.client_id,
      clientName: companyRow?.fantasy_name || companyRow?.name || "",
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!demandId) {
      setCard(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setCard(null);
    loadCard(demandId);
  }, [demandId, loadCard]);


  useEffect(() => {
    if (!demandId || !tenantId) return;
    (async () => {
      const { data: pipelines } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1);
      if (!pipelines?.length) return;
      const { data: statuses } = await supabase
        .from("pipeline_statuses")
        .select("*")
        .eq("pipeline_id", pipelines[0].id)
        .order("position");
      setPipelineStatuses(((statuses as any[]) || []) as PipelineStatus[]);
    })();
  }, [demandId, tenantId]);

  const persistAttachments = async (attachments: Attachment[]) => {
    if (!card) return;
    const { error } = await supabase
      .from("demands")
      .update({ attachments: attachments as unknown as any, updated_at: new Date().toISOString() })
      .eq("id", card.id);
    if (error) throw error;
    setCard((prev) => (prev ? { ...prev, attachments } : prev));
    onPersisted?.();
  };

  const handleSave = async (field: string, value: string) => {
    if (!card) return;
    try {
      const updateData: Record<string, any> = {};
      if (field === "status") {
        const st = pipelineStatuses.find((s) => s.name === value);
        if (st) updateData.status_id = st.id;
      } else {
        updateData[field] = value || null;
      }
      const { error } = await supabase.from("demands").update(updateData as any).eq("id", card.id);
      if (error) throw error;
      setCard((prev) => (prev ? ({ ...prev, [field]: value } as KanbanCardData) : prev));
      onPersisted?.();
      toast.success("Salvo!");
    } catch (err) {
      console.error("[DemandDrawer] save error", err);
      toast.error("Erro ao salvar");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!card || !event.target.files?.length) return;
    const files = Array.from(event.target.files);
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (files.some((f) => f.size > MAX_FILE_SIZE)) {
      toast.error("Arquivo muito grande. Limite de 50MB.");
      event.target.value = "";
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Usuário não autenticado.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
          const uniqueId = Math.random().toString(36).substring(2, 9);
          const storagePath = `${card.tenant_id}/${card.clientId}/${card.period_plan_id || "sem-periodo"}/${card.id}/${Date.now()}-${uniqueId}.${fileExt}`;
          const { error } = await supabase.storage.from("card-attachments").upload(storagePath, file);
          if (error) throw error;
          const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(storagePath);
          const attachment: Attachment = {
            url: urlData.publicUrl,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            storagePath,
            uploadedAt: new Date().toISOString(),
            uploadedBy: { id: user.id, email: user.email || "" },
            cardId: card.id,
            tenantId: card.tenant_id,
            clientId: card.clientId,
            periodPlanId: card.period_plan_id || undefined,
          };
          return attachment;
        })
      );
      await persistAttachments([...(card.attachments || []), ...uploaded]);
      toast.success(`${uploaded.length} arquivo(s) anexado(s)`);
    } catch (err) {
      console.error("[DemandDrawer] upload error", err);
      toast.error("Erro ao fazer upload");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleRemoveAttachment = async (url: string) => {
    if (!card) return;
    try {
      const attachment = (card.attachments || []).find((a) => a.url === url);
      if (attachment?.storagePath) {
        await supabase.storage.from("card-attachments").remove([attachment.storagePath]);
      }
      await persistAttachments((card.attachments || []).filter((a) => a.url !== url));
      toast.success("Anexo removido");
    } catch (err) {
      console.error("[DemandDrawer] remove attachment error", err);
      toast.error("Erro ao remover anexo");
    }
  };

  if (!demandId || !card) return null;

  return (
    <TaskCard
      presentation="drawer"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      card={card}
      onCardChange={(updated) => setCard((prev) => (prev ? { ...prev, ...updated } : updated))}
      onSave={handleSave}
      onFileUpload={handleFileUpload}
      onRemoveAttachment={handleRemoveAttachment}
      onReorderAttachments={async (attachments) => {
        try {
          await persistAttachments(attachments);
        } catch (err) {
          console.error("[DemandDrawer] reorder error", err);
          toast.error("Erro ao reordenar anexos");
        }
      }}
      onDelete={async () => {
        try {
          await supabase.from("demands").delete().eq("id", card.id);
          toast.success("Demanda excluída");
          onPersisted?.();
          onClose();
        } catch (err) {
          console.error("[DemandDrawer] delete error", err);
          toast.error("Erro ao excluir demanda");
        }
      }}
      uploading={uploading}
      pipelineStatuses={pipelineStatuses}
    />
  );
}
