import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search, Loader2, CalendarDays, ChevronRight, ChevronDown, ChevronUp,
  Plus, ArrowLeft, Paperclip, Building2, Settings2
} from "lucide-react";
import PeriodConfigViewerModal from "@/components/PeriodConfigViewerModal";
import BackButton from "@/components/BackButton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import type { SearchableItem } from "@/hooks/useSmartSearch";
import TaskCard, { getColumnFromStatus } from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PipelineStatus } from "@/components/TaskCard";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { syncPeriodPlanSnapshot } from "@/lib/syncPeriodPlanItem";
import { createOrUpdateScheduleDispatch, hasActiveDispatch } from "@/lib/createScheduleDispatch";

// ─── Types ───────────────────────────────────────────────────────

interface SelectedClientLocal {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
}

interface PeriodItem {
  id: string;
  period_title: string;
  period_start: string;
  period_end: string;
  operational_status: string;
  demand_count: number;
}

interface DemandRow {
  id: string;
  title: string;
  publish_date: string | null;
  publish_time: string | null;
  attachments: any;
  status_id: string;
  period_plan_id: string | null;
  channel: string | null;
  objective: string | null;
  description: string | null;
  instructions: string | null;
  observations: string | null;
  post_caption?: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  source: string;
  demand_type: string | null;
  client_id: string;
  due_date: string | null;
  additional_publish_dates?: any;
}

interface StatusGroup {
  id: string;
  name: string;
  color: string;
  position: number;
  is_final: boolean;
  is_initial: boolean;
  demands: DemandRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────

const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

const getStatusBadge = (status: string) => {
  if (status === "concluido") return { label: "Concluído", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (status === "em_andamento") return { label: "Em andamento", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  return { label: "Em planejamento", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
};

const hasAttachments = (att: any) => {
  if (!att) return false;
  if (Array.isArray(att)) return att.length > 0;
  return false;
};

const getAttachmentCount = (att: any): number => {
  if (!att) return 0;
  if (Array.isArray(att)) return att.length;
  return 0;
};

// Convert DemandRow to KanbanCardData for TaskCard
const demandToCardData = (demand: DemandRow, statusName: string, clientName: string): KanbanCardData => ({
  id: demand.id,
  title: demand.title,
  status: statusName,
  due_date: demand.due_date || "",
  channel: demand.channel,
  objective: demand.objective,
  description: demand.description,
  instructions: demand.instructions,
  observations: demand.observations,
  period_plan_id: demand.period_plan_id,
  tenant_id: demand.tenant_id,
  created_at: demand.created_at,
  updated_at: demand.updated_at,
  attachments: Array.isArray(demand.attachments) ? demand.attachments : [],
  publish_date: demand.publish_date,
  publish_time: demand.publish_time,
  source: demand.source,
  demand_type: demand.demand_type,
  clientId: demand.client_id,
  clientName: clientName,
  additional_publish_dates: Array.isArray(demand.additional_publish_dates) ? demand.additional_publish_dates : [],
});

// ─── Component ───────────────────────────────────────────────────

const PeriodClientList = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const { selectedClient, setSelectedClient } = useSelectedClient();

  // Local navigation state: client → period → detail
  const [selectedClientLocal, setSelectedClientLocal] = useState<SelectedClientLocal | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ em_andamento: true });
  const [configPeriodId, setConfigPeriodId] = useState<string | null>(null);

  // Auto-select client from context (coming from client hub)
  useEffect(() => {
    if (selectedClient && !selectedClientLocal) {
      setSelectedClientLocal({
        id: selectedClient.id,
        name: selectedClient.name,
        fantasy_name: selectedClient.fantasy_name,
        cnpj_cpf: selectedClient.cnpj_cpf,
        email: selectedClient.email,
      });
    }
  }, [selectedClient]);

  // TaskCard modal state
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [pendingScheduleCard, setPendingScheduleCard] = useState<KanbanCardData | null>(null);
  const [pendingScheduleSourceStatus, setPendingScheduleSourceStatus] = useState<string | null>(null);
  // ── Step 1: Fetch clients ──
  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["schedules-clients", tenantId, searchTerm],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase
        .from("tenant_companies")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,fantasy_name.ilike.%${searchTerm}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId && !selectedClientLocal,
  });

  // ── Step 2: Fetch periods for selected client ──
  const { data: periods, isLoading: loadingPeriods } = useQuery({
    queryKey: ["schedules-periods", tenantId, selectedClientLocal?.id],
    queryFn: async () => {
      if (!tenantId || !selectedClientLocal) return [];
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end, operational_status")
        .eq("tenant_id", tenantId)
        .eq("company_id", selectedClientLocal.id)
        .order("period_end", { ascending: false });
      if (error) throw error;

      // Fetch demand counts per period
      const periodIds = (data || []).map(p => p.id);
      let demandCounts: Record<string, number> = {};
      if (periodIds.length > 0) {
        const { data: demands } = await supabase
          .from("demands")
          .select("period_plan_id")
          .eq("tenant_id", tenantId)
          .eq("client_id", selectedClientLocal.id)
          .in("period_plan_id", periodIds);
        if (demands) {
          demands.forEach(d => {
            if (d.period_plan_id) {
              demandCounts[d.period_plan_id] = (demandCounts[d.period_plan_id] || 0) + 1;
            }
          });
        }
      }

      return (data || []).map(p => ({
        ...p,
        demand_count: demandCounts[p.id] || 0,
      })) as PeriodItem[];
    },
    enabled: !!tenantId && !!selectedClientLocal && !selectedPeriodId,
  });

  // ── Step 3: Fetch demands + statuses for selected period ──
  const { data: detailData, isLoading: loadingDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["schedules-detail", tenantId, selectedPeriodId],
    queryFn: async () => {
      if (!tenantId || !selectedPeriodId || !selectedClientLocal) return null;

      // Get pipeline for tenant
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .single();

      if (!pipeline) return null;

      // Fetch statuses
      const { data: statuses } = await supabase
        .from("pipeline_statuses")
        .select("id, name, color, position, is_final, is_initial, pipeline_id, is_fixed, parent_status_id")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true });

      if (!statuses) return null;

      // Fetch demands with ALL fields
      const { data: demands } = await supabase
        .from("demands")
        .select("id, title, publish_date, publish_time, attachments, status_id, period_plan_id, channel, objective, description, instructions, observations, tenant_id, created_at, updated_at, source, demand_type, client_id, due_date, additional_publish_dates")
        .eq("tenant_id", tenantId)
        .eq("client_id", selectedClientLocal.id)
        .eq("period_plan_id", selectedPeriodId);

      const demandsList = (demands || []) as DemandRow[];

      // Group demands by status
      const groups: StatusGroup[] = statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        position: s.position,
        is_final: s.is_final,
        is_initial: s.is_initial,
        demands: demandsList.filter((d) => d.status_id === s.id),
      }));

      return {
        groups,
        pipelineStatuses: statuses as PipelineStatus[],
        pipelineId: pipeline.id,
      };
    },
    enabled: !!tenantId && !!selectedPeriodId && !!selectedClientLocal,
  });

  const statusGroups = detailData?.groups || [];
  const pipelineStatuses = detailData?.pipelineStatuses || [];
  const pipelineId = detailData?.pipelineId || "";

  const selectedPeriod = useMemo(
    () => periods?.find((p) => p.id === selectedPeriodId) || null,
    [periods, selectedPeriodId]
  );

  // Convert periods to SearchableItem for SmartSearchBar
  const searchablePeriods: (SearchableItem & { _period: PeriodItem })[] = useMemo(() => {
    if (!periods) return [];
    return periods.map(p => ({
      id: p.id,
      title: p.period_title,
      description: `${formatDate(p.period_start)} - ${formatDate(p.period_end)} · ${p.demand_count} Demandas`,
      delivery_date: p.period_end,
      _period: p,
    }));
  }, [periods]);

  // ── Handlers ──
  const handleSelectClient = (client: any) => {
    const c: SelectedClientLocal = {
      id: client.id,
      name: client.name,
      fantasy_name: client.fantasy_name,
      cnpj_cpf: client.cnpj_cpf,
      email: client.email,
    };
    setSelectedClientLocal(c);
    setSearchTerm("");
  };

  const handleBack = () => {
    if (selectedPeriodId) {
      setSelectedPeriodId(null);
    } else if (selectedClientLocal) {
      setSelectedClientLocal(null);
      setSearchTerm("");
    }
  };

  // ── TaskCard handlers ──
  const handleDemandClick = (demand: DemandRow) => {
    const statusName = pipelineStatuses.find(s => s.id === demand.status_id)?.name || "";
    const clientName = selectedClientLocal?.fantasy_name || selectedClientLocal?.name || "";
    const cardData = demandToCardData(demand, statusName, clientName);
    setSelectedCard(cardData);
    setIsTaskCardOpen(true);
  };

  const handleCardChange = useCallback((updatedCard: KanbanCardData) => {
    setSelectedCard(updatedCard);
  }, []);

  const handleSave = useCallback(async (field: string, value: string) => {
    if (!selectedCard) return;
    setSaving(true);
    setSavingField(field);
    try {
      let parsedValue: any = value;
      if (field === 'attachments') {
        try {
          parsedValue = JSON.parse(value);
          if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
            setSaving(false);
            setSavingField(null);
            return;
          }
        } catch { parsedValue = value; }
      }

      const demandUpdateData: Record<string, any> = { updated_at: new Date().toISOString() };

      if (field === 'title') demandUpdateData.title = parsedValue;
      else if (field === 'description') demandUpdateData.description = parsedValue;
      else if (field === 'objective') demandUpdateData.objective = parsedValue;
      else if (field === 'observations') demandUpdateData.observations = parsedValue;
      else if (field === 'attachments') demandUpdateData.attachments = parsedValue;
      else if (field === 'status') {
        const { data: statusData } = await supabase
          .from("pipeline_statuses")
          .select("id")
          .eq("name", value)
          .eq("pipeline_id", pipelineId)
          .maybeSingle();
        if (statusData) demandUpdateData.status_id = statusData.id;
      }
      else if (field === 'publish_date') demandUpdateData.publish_date = parsedValue;
      else if (field === 'publish_time') demandUpdateData.publish_time = parsedValue;
      else demandUpdateData[field] = parsedValue;

      const { error } = await supabase
        .from("demands")
        .update(demandUpdateData as any)
        .eq("id", selectedCard.id);

      if (error) throw error;

      if (['title', 'objective', 'description', 'instructions'].includes(field) && selectedCard.period_plan_id) {
        const merged = {
          title: field === 'title' ? parsedValue : selectedCard.title,
          objective: field === 'objective' ? parsedValue : selectedCard.objective,
          description: field === 'description' ? parsedValue : selectedCard.description,
          instructions: field === 'instructions' ? parsedValue : selectedCard.instructions,
        };
        syncPeriodPlanSnapshot(selectedCard.period_plan_id, merged);
      }

      if (field === 'status') {
        setSelectedCard(prev => prev ? { ...prev, status: value } : null);
      }

      toast.success("Salvo automaticamente");
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
      setSavingField(null);
    }
  }, [selectedCard, pipelineId]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files || event.target.files.length === 0) return;
    const files = Array.from(event.target.files);
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    if (files.some(f => f.size > MAX_FILE_SIZE)) {
      toast.error("Arquivo muito grande. Limite de 50MB.");
      event.target.value = '';
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Usuário não autenticado."); return; }

    setUploading(true);
    try {
      const uploadPromises = files.map(async file => {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 9);
        const storagePath = `${tenantId}/${selectedCard.clientId}/${selectedCard.period_plan_id}/${selectedCard.id}/${timestamp}-${uniqueId}.${fileExt}`;
        const { error } = await supabase.storage.from('card-attachments').upload(storagePath, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('card-attachments').getPublicUrl(storagePath);
        const attachment: Attachment = {
          url: urlData.publicUrl,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: user.id, email: user.email || '' },
          cardId: selectedCard.id,
          tenantId: tenantId || '',
          clientId: selectedCard.clientId,
          periodPlanId: selectedCard.period_plan_id || undefined,
        };
        return attachment;
      });

      const newAttachments = await Promise.all(uploadPromises);
      const updatedAttachments = [...(selectedCard.attachments || []), ...newAttachments];

      const { error: updateError } = await supabase
        .from('demands')
        .update({ attachments: updatedAttachments as unknown as any, updated_at: new Date().toISOString() })
        .eq('id', selectedCard.id);
      if (updateError) throw updateError;

      setSelectedCard(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      toast.success(`${newAttachments.length} arquivo(s) anexado(s)`);
    } catch (error) {
      console.error("Error uploading:", error);
      toast.error("Erro ao fazer upload");
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }, [selectedCard, tenantId]);

  const handleRemoveAttachment = useCallback(async (attachmentUrl: string) => {
    if (!selectedCard) return;
    const attachment = (selectedCard.attachments || []).find(a => a.url === attachmentUrl);
    try {
      if (attachment?.storagePath) {
        await supabase.storage.from('card-attachments').remove([attachment.storagePath]);
      }
      const updatedAttachments = (selectedCard.attachments || []).filter(a => a.url !== attachmentUrl);
      const { error } = await supabase
        .from('demands')
        .update({ attachments: updatedAttachments as unknown as any, updated_at: new Date().toISOString() })
        .eq('id', selectedCard.id);
      if (error) throw error;
      setSelectedCard(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      toast.success("Anexo removido");
    } catch (error) {
      console.error("Error removing attachment:", error);
      toast.error("Erro ao remover anexo");
    }
  }, [selectedCard]);

  const handleReorderAttachments = useCallback(async (attachments: Attachment[]) => {
    if (!selectedCard) return;
    try {
      const { error } = await supabase
        .from('demands')
        .update({ attachments: attachments as unknown as any, updated_at: new Date().toISOString() })
        .eq('id', selectedCard.id);
      if (error) throw error;
    } catch (error) {
      console.error("Error reordering:", error);
      toast.error("Erro ao reordenar anexos");
    }
  }, [selectedCard]);

  const handleDelete = useCallback(async () => {
    if (!selectedCard) return;
    try {
      const { error } = await supabase.from("demands").delete().eq("id", selectedCard.id);
      if (error) throw error;
      setIsTaskCardOpen(false);
      setSelectedCard(null);
      refetchDetail();
      toast.success("Demanda excluída");
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Erro ao excluir demanda");
    }
  }, [selectedCard, refetchDetail]);

  // ─── RENDER: Step 3 — Detail (status-grouped demands) ───
  if (selectedPeriodId && selectedClientLocal) {
    const clientDisplay = selectedClientLocal.fantasy_name || selectedClientLocal.name;

    return (
      <div className="pb-8">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
              {selectedPeriod?.period_title || "Cronograma"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {clientDisplay}
              {selectedPeriod && (
                <> · {formatDate(selectedPeriod.period_start)} – {formatDate(selectedPeriod.period_end)}</>
              )}
            </p>
          </div>

          {/* Status groups */}
          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : statusGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum status encontrado</p>
          ) : (
            <div className="flex flex-col gap-6">
              {statusGroups.map((group) => (
                <div key={group.id}>
                  {/* Status header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="text-sm font-semibold text-foreground">{group.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {group.demands.length}
                    </Badge>
                  </div>

                  {/* Demands list */}
                  {group.demands.length === 0 ? (
                    <div className="pl-5 py-3">
                      <p className="text-xs text-muted-foreground italic">Nenhuma demanda neste status</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 pl-5">
                      {group.demands.map((demand) => {
                        const attCount = getAttachmentCount(demand.attachments);
                        return (
                          <div
                            key={demand.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => handleDemandClick(demand)}
                          >
                            <span className="text-sm text-foreground truncate flex-1">
                              {demand.title}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {attCount > 0 && (
                                <div className="flex items-center gap-0.5 text-muted-foreground">
                                  <Paperclip className="h-3.5 w-3.5" />
                                  <span className="text-[11px]">{attCount}</span>
                                </div>
                              )}
                              {demand.publish_date && (
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                  {formatDate(demand.publish_date)}
                                </span>
                              )}
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TaskCard Modal */}
          <TaskCard
          open={isTaskCardOpen}
          onOpenChange={(open) => {
            setIsTaskCardOpen(open);
            if (!open) {
              setSelectedCard(null);
              refetchDetail();
            }
          }}
          card={selectedCard}
          onCardChange={handleCardChange}
          onSave={handleSave}
          onFileUpload={handleFileUpload}
          onRemoveAttachment={handleRemoveAttachment}
          onReorderAttachments={handleReorderAttachments}
          onDelete={handleDelete}
          saving={saving}
          savingField={savingField}
          uploading={uploading}
          pipelineStatuses={pipelineStatuses}
          onScheduleRequest={(card) => {
            setPendingScheduleCard(card);
            setPendingScheduleSourceStatus(card.status);
            setScheduleModalOpen(true);
          }}
        />

        {/* Schedule Publication Modal */}
        <SchedulePublicationModal
          open={scheduleModalOpen}
          onOpenChange={setScheduleModalOpen}
          existingDate={pendingScheduleCard?.publish_date}
          existingTime={pendingScheduleCard?.publish_time}
          onConfirm={async (date, time) => {
            if (!pendingScheduleCard) return;
            try {
              const { data: statusData } = await supabase
                .from("pipeline_statuses")
                .select("id")
                .eq("name", "Agendar Publicação")
                .eq("pipeline_id", pipelineId)
                .maybeSingle();

              if (!statusData) {
                toast.error("Status 'Agendar Publicação' não encontrado");
                return;
              }

              const { error } = await supabase
                .from("demands")
                .update({
                  publish_date: date,
                  publish_time: time,
                  status_id: statusData.id,
                  updated_at: new Date().toISOString()
                })
                .eq("id", pendingScheduleCard.id);

              if (error) throw error;

              // Create or update internal scheduled dispatch
              if (pendingScheduleCard.tenant_id && (pendingScheduleCard as any).client_id) {
                const cardId = pendingScheduleCard.id;
                const existed = await hasActiveDispatch(cardId);
                if (existed) {
                  const ok = window.confirm("Este card já possui uma publicação agendada. Deseja atualizar o disparo existente?");
                  if (!ok) {
                    toast.info("Disparo anterior mantido. Data e horário do card foram atualizados.");
                  } else {
                    const result = await createOrUpdateScheduleDispatch({
                      cardId,
                      tenantId: pendingScheduleCard.tenant_id,
                      clientId: (pendingScheduleCard as any).client_id,
                      publishDate: date,
                      publishTime: time,
                      caption: pendingScheduleCard.description,
                      attachments: pendingScheduleCard.attachments as any,
                      demandType: pendingScheduleCard.demand_type,
                      title: pendingScheduleCard.title,
                    });
                    if (!result.ok) toast.error(result.error || "Não foi possível criar o disparo");
                  }
                } else {
                  const result = await createOrUpdateScheduleDispatch({
                    cardId,
                    tenantId: pendingScheduleCard.tenant_id,
                    clientId: (pendingScheduleCard as any).client_id,
                    publishDate: date,
                    publishTime: time,
                    caption: pendingScheduleCard.description,
                    attachments: pendingScheduleCard.attachments as any,
                    demandType: pendingScheduleCard.demand_type,
                    title: pendingScheduleCard.title,
                  });
                  if (!result.ok) toast.error(result.error || "Não foi possível criar o disparo");
                }
              }

              if (selectedCard?.id === pendingScheduleCard.id) {
                setSelectedCard(prev => prev ? {
                  ...prev,
                  status: "Agendar Publicação",
                  publish_date: date,
                  publish_time: time
                } : null);
              }

              toast.success("Publicação agendada", {
                description: `${date} às ${time}`
              });
              refetchDetail();
            } catch (error) {
              console.error("Error scheduling:", error);
              toast.error("Erro ao agendar publicação");
            } finally {
              setScheduleModalOpen(false);
              setPendingScheduleCard(null);
              setPendingScheduleSourceStatus(null);
            }
          }}
          onCancel={() => {
            setScheduleModalOpen(false);
            setPendingScheduleCard(null);
            setPendingScheduleSourceStatus(null);
          }}
        />
      </div>
    );
  }


  if (selectedClientLocal) {
    const clientDisplay = selectedClientLocal.fantasy_name || selectedClientLocal.name;

    return (
      <div className="pb-8">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Back button */}
           <BackButton to="/client-hub" />

          {/* Header */}
          <div className="flex items-start justify-between mb-6 mt-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  Cronograma
                </h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Selecione um cronograma para visualizar</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setSelectedClient({
                  id: selectedClientLocal.id,
                  name: selectedClientLocal.name,
                  fantasy_name: selectedClientLocal.fantasy_name,
                  cnpj_cpf: selectedClientLocal.cnpj_cpf,
                  email: selectedClientLocal.email,
                });
                navigate("/plan-period");
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Novo Cronograma
            </Button>
          </div>

          {/* Client label */}
          <div className="flex items-center gap-2 mb-5">
            <span className="text-sm text-muted-foreground">Cliente</span>
            <button
              onClick={handleBack}
              className="text-sm font-semibold text-foreground hover:underline"
            >
              {clientDisplay}
            </button>
          </div>

          {/* Smart Search */}
          <div className="mb-8">
            <SmartSearchBar
              items={searchablePeriods}
              onResultSelect={(item) => {
                const periodItem = (item as any)._period as PeriodItem;
                if (periodItem) setSelectedPeriodId(periodItem.id);
              }}
              placeholder="Busca Inteligente"
              maxResults={6}
            />
          </div>

          {/* Separator */}
          <div className="border-t border-border mb-8" />

          {/* Periods grouped by operational status */}
          {loadingPeriods ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !periods || periods.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">Nenhum cronograma cadastrado para este cliente</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {[
                { key: "em_andamento", label: "Em Andamento", color: "bg-amber-500" },
                { key: "analise", label: "Análise", color: "bg-blue-500" },
                { key: "concluido", label: "Arquivados", color: "bg-emerald-500" },
              ].map((section) => {
                const sectionPeriods = periods.filter((p) => p.operational_status === section.key);
                const isExpanded = expandedSections[section.key] ?? false;
                return (
                  <div key={section.key}>
                    <button
                      onClick={() => setExpandedSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                      className="flex items-center gap-2 mb-3 w-full text-left"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className={cn("w-3 h-3 rounded-full shrink-0", section.color)} />
                      <span className="text-sm font-bold text-foreground">{section.label}</span>
                      <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full">
                        {sectionPeriods.length}
                      </Badge>
                    </button>
                    {isExpanded && (
                      sectionPeriods.length === 0 ? (
                        <div className="pl-9 py-3">
                          <p className="text-xs text-muted-foreground italic">Nenhum cronograma neste status</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 pl-2">
                          {sectionPeriods.map((period) => (
                            <div
                              key={period.id}
                              className="flex items-center justify-between gap-4 px-5 py-4 bg-muted/30 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group"
                              onClick={() => setSelectedPeriodId(period.id)}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-semibold text-foreground block truncate mb-1">
                                  {period.period_title}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(period.period_start)} - {formatDate(period.period_end)}
                                  {period.demand_count > 0 && (
                                    <> &nbsp;·&nbsp; {period.demand_count} Demandas</>
                                  )}
                                </span>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0"
                                title="Ver configurações respondidas"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfigPeriodId(period.id);
                                }}
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <PeriodConfigViewerModal
          open={!!configPeriodId}
          onOpenChange={(o) => !o && setConfigPeriodId(null)}
          periodId={configPeriodId}
        />
      </div>
    );
  }

  // ─── RENDER: Step 1 — Client selection (big cards) ───
  return (
    <div className="pb-8">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12 text-center relative">
          <div className="absolute left-0 top-0">
            <BackButton to="/client-hub" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3">
            Cronogramas
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground">
            Selecione um cliente para ver os cronogramas
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou fantasia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Client grid */}
        {loadingClients ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !clients || clients.length === 0 ? (
          <div className="text-center py-12 sm:py-20 px-4">
            <CalendarDays className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <p className="text-base sm:text-lg font-medium mb-2">Nenhum cliente encontrado</p>
            <p className="text-sm text-muted-foreground">
              Cadastre clientes para acessar os cronogramas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {clients.map((client) => (
              <Card
                key={client.id}
                className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 sm:hover:-translate-y-2 border-2 hover:border-primary/50 active:scale-[0.98]"
                onClick={() => handleSelectClient(client)}
              >
                <div className="absolute inset-0 bg-primary opacity-5 group-hover:opacity-10 transition-opacity" />
                <div className="relative p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px]">
                  {client.logo_url ? (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300 bg-muted flex items-center justify-center">
                      <img
                        src={client.logo_url}
                        alt={client.fantasy_name || client.name}
                        className="w-full h-full object-contain"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <CalendarDays className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
                    </div>
                  )}
                  <h3 className="text-base sm:text-xl font-bold text-primary line-clamp-2">
                    {client.fantasy_name || client.name}
                  </h3>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PeriodClientList;
