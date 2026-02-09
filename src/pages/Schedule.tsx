import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import { ArrowLeft, Calendar, Filter, LayoutGrid, Loader2, History, Plus, ChevronRight, Paperclip, Sparkles } from "lucide-react";
import { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { toast as sonnerToast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { LoadingScreen } from "@/components/LoadingScreen";
import TaskCard, { getColumnFromStatus, getStatusFromColumn, LEGACY_STATUS_MAP } from "@/components/TaskCard";
import type { KanbanCardData, Attachment } from "@/components/TaskCard";
import SmartSearchBar from "@/components/SmartSearchBar";
import { CreateDemandModal } from "@/components/CreateDemandModal";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLUMNS = [
  { id: "Planejamento", title: "Planejamento", color: "bg-purple-500" },
  { id: "Produção", title: "Produção", color: "bg-amber-500" },
  { id: "Revisão", title: "Revisão", color: "bg-emerald-500" },
  { id: "Aguardando Cliente", title: "Aguardando Cliente", color: "bg-yellow-500" },
  { id: "Agendar Publicação", title: "Agendar Publicação", color: "bg-cyan-500" },
];

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { isSuperAdmin, isAgencyAdmin, isAgencyManager } = useAgencyRole();
  
  const canCreateDemand = isSuperAdmin || isAgencyAdmin || isAgencyManager;
  
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [referencePeriod, setReferencePeriod] = useState<{ titulo: string; dataInicio: string; dataFim: string } | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [showCreateDemandModal, setShowCreateDemandModal] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleSearchResultSelect = useCallback((card: KanbanCardData) => {
    setHighlightedCardId(card.id);
    setTimeout(() => {
      const cardElement = cardRefs.current.get(card.id);
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    setTimeout(() => {
      setHighlightedCardId(null);
    }, 3000);
  }, []);

  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPeriods, setHistoryPeriods] = useState<{ id: string; period_title: string; period_start: string; period_end: string; status: string; created_at: string; final_plan: Json | null; }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  
  // Schedule Publication Modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [pendingScheduleCard, setPendingScheduleCard] = useState<{
    card: KanbanCardData;
    previousColumn: string;
    previousStatus: string;
  } | null>(null);

  const periodPlanId = useMemo(() => {
    if (activePeriodId) return activePeriodId;
    const stateValue = (location.state as { periodPlanId?: string })?.periodPlanId;
    if (stateValue) return stateValue;
    const fromQuery = searchParams.get("periodPlanId");
    if (fromQuery) return fromQuery;
    return sessionStorage.getItem('selected-period-id');
  }, [activePeriodId, location.state, searchParams]);

  // Realtime handlers
  const handleRealtimeUpdate = useCallback((itemId: string, attachments: Attachment[]) => {
    setCards(prevCards => 
      prevCards.map(card => card.id === itemId ? { ...card, attachments } : card)
    );
    setSelectedCard(prev => 
      prev && prev.id === itemId ? { ...prev, attachments } : prev
    );
  }, []);

  useRealtimeAttachments({
    tenantId,
    periodPlanId,
    onAttachmentUpdate: handleRealtimeUpdate,
    enabled: !!tenantId && !!periodPlanId
  });

  useEffect(() => {
    if (!isInitialized || tenantLoading) return;
    if (periodPlanId && tenantId) {
      fetchPeriodPlanCards();
    } else if (!periodPlanId) {
      setLoading(false);
    }
  }, [periodPlanId, tenantId, isInitialized, tenantLoading]);

  const fetchPeriodPlanCards = async () => {
    if (!periodPlanId) return;
    
    try {
      setLoading(true);
      
      const [demandsResponse, periodPlanResponse] = await Promise.all([
        supabase
          .from("demands")
          .select(`
            *,
            pipeline_statuses!demands_status_id_fkey (
              name,
              color,
              position
            )
          `)
          .eq("period_plan_id", periodPlanId)
          .order("created_at", { ascending: true }),
        supabase
          .from("period_plans")
          .select("period_title, period_start, period_end, tenant_id")
          .eq("id", periodPlanId)
          .single()
      ]);

      if (demandsResponse.error) throw demandsResponse.error;
      if (periodPlanResponse.error) throw periodPlanResponse.error;

      const allItems: KanbanCardData[] = (demandsResponse.data || []).map(demand => {
        const statusName = demand.pipeline_statuses?.name || "Planejamento";
        
        return {
          id: demand.id,
          title: demand.title,
          description: demand.instructions || demand.description || null,
          objective: demand.objective || null,
          instructions: demand.instructions || null,
          observations: demand.observations || null,
          status: statusName,
          due_date: demand.due_date || demand.publish_date || new Date().toISOString().split('T')[0],
          channel: demand.channel || null,
          attachments: (demand.attachments as unknown as Attachment[] | null) || [],
          publish_date: demand.publish_date || null,
          publish_time: demand.publish_time || null,
          tenant_id: demand.tenant_id,
          period_plan_id: demand.period_plan_id,
          created_at: demand.created_at,
          updated_at: demand.updated_at,
          source: demand.source,
          demand_id: demand.id,
          demand_type: demand.demand_type
        };
      });
      
      setCards(allItems);
      
      if (periodPlanResponse.data) {
        setReferencePeriod({
          titulo: periodPlanResponse.data.period_title,
          dataInicio: periodPlanResponse.data.period_start,
          dataFim: periodPlanResponse.data.period_end
        });
      }
    } catch (error) {
      console.error("Error fetching period plan cards:", error);
      toast({
        title: "Erro ao carregar demandas",
        description: "Não foi possível carregar as demandas do período.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async () => {
    if (!cardToDelete) return;
    try {
      setIsDeleting(true);
      const { error } = await supabase.from("demands").delete().eq("id", cardToDelete);
      if (error) throw error;
      sonnerToast.success("Demanda excluída com sucesso!");
      setCardToDelete(null);
      await fetchPeriodPlanCards();
    } catch (error) {
      console.error("Error deleting card:", error);
      sonnerToast.error("Erro ao excluir demanda");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    const newColumnName = destination.droppableId;
    const newStatus = getStatusFromColumn(newColumnName);
    const previousColumn = source.droppableId;
    const previousStatus = card.status;

    // Schedule modal for "Agendar Publicação"
    if (newColumnName === "Agendar Publicação") {
      setPendingScheduleCard({ card, previousColumn, previousStatus });
      setCards((prev) =>
        prev.map((c) => c.id === draggableId ? { ...c, status: newColumnName } : c)
      );
      setShowScheduleModal(true);
      return;
    }

    setCards((prev) =>
      prev.map((c) => c.id === draggableId ? { ...c, status: newColumnName } : c)
    );

    try {
      const { data: statusData } = await supabase
        .from("pipeline_statuses")
        .select("id")
        .eq("name", newColumnName)
        .limit(1)
        .maybeSingle();
      
      const { error } = await supabase
        .from("demands")
        .update({ 
          status_id: statusData?.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", card.id);

      if (error) throw error;

      toast({
        title: "Tarefa movida!",
        description: `Movida para "${newColumnName}"`,
      });
    } catch (error) {
      console.error("Error updating card:", error);
      toast({
        title: "Erro ao mover tarefa",
        description: "Não foi possível atualizar a tarefa.",
        variant: "destructive",
      });
      fetchPeriodPlanCards();
    }
  };

  const handleConfirmSchedule = async (date: string, time: string) => {
    if (!pendingScheduleCard) return;
    const { card } = pendingScheduleCard;
    
    try {
      const publishDateTime = new Date(`${date}T${time}:00`);

      const { data: statusData } = await supabase
        .from("pipeline_statuses")
        .select("id")
        .eq("name", "Agendar Publicação")
        .limit(1)
        .maybeSingle();
      
      const { error } = await supabase
        .from("demands")
        .update({ 
          status_id: statusData?.id,
          publish_date: date,
          publish_time: time,
          updated_at: new Date().toISOString()
        })
        .eq("id", card.id);

      if (error) throw error;
      
      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, publish_date: date, publish_time: time } : c
        )
      );

      const dayOfWeek = format(publishDateTime, "EEEE", { locale: ptBR });
      const dateExtenso = format(publishDateTime, "d 'de' MMMM", { locale: ptBR });
      
      sonnerToast.success(
        <div className="flex flex-col gap-1">
          <span>Conteúdo agendado para {dayOfWeek}, {dateExtenso} às {time}.</span>
          <a 
            href="/scheduled" 
            className="text-primary underline hover:no-underline text-sm font-medium"
            onClick={(e) => {
              e.preventDefault();
              navigate("/scheduled");
            }}
          >
            Ver Agendamentos
          </a>
        </div>,
        { duration: 5000 }
      );

      setShowScheduleModal(false);
      setPendingScheduleCard(null);
      
    } catch (error) {
      console.error("Error scheduling card:", error);
      sonnerToast.error("Erro ao agendar publicação");
      
      if (pendingScheduleCard) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === card.id ? { ...c, status: pendingScheduleCard.previousStatus } : c
          )
        );
      }
      setShowScheduleModal(false);
      setPendingScheduleCard(null);
    }
  };

  const handleCancelSchedule = () => {
    if (!pendingScheduleCard) {
      setShowScheduleModal(false);
      return;
    }
    const { card, previousStatus } = pendingScheduleCard;
    setCards((prev) =>
      prev.map((c) => c.id === card.id ? { ...c, status: previousStatus } : c)
    );
    sonnerToast("O conteúdo não foi agendado corretamente.", { duration: 3500 });
    setShowScheduleModal(false);
    setPendingScheduleCard(null);
  };

  const handleAutoSave = async (field: string, value: string) => {
    if (!selectedCard) return;
    setSaving(true);
    try {
      let parsedValue: any = value;
      if (field === 'attachments') {
        try {
          parsedValue = JSON.parse(value);
          if (field === 'attachments' && (!Array.isArray(parsedValue) || parsedValue.length === 0)) {
            setSaving(false);
            return;
          }
        } catch {
          parsedValue = value;
        }
      }
      
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (field === 'title') updateData.title = parsedValue;
      else if (field === 'description') updateData.instructions = parsedValue;
      else if (field === 'objective') updateData.objective = parsedValue;
      else if (field === 'observations') updateData.observations = parsedValue;
      else if (field === 'attachments') updateData.attachments = parsedValue;
      else if (field === 'status') {
        const { data: statusData } = await supabase
          .from("pipeline_statuses")
          .select("id")
          .eq("name", value)
          .limit(1)
          .maybeSingle();
        if (statusData) updateData.status_id = statusData.id;
      }
      else if (field === 'publish_date') updateData.publish_date = parsedValue;
      else if (field === 'publish_time') updateData.publish_time = parsedValue;
      else updateData[field] = parsedValue;
      
      const { error } = await supabase
        .from("demands")
        .update(updateData)
        .eq("id", selectedCard.id);

      if (error) throw error;

      setCards(prev => prev.map(c => {
        if (c.id === selectedCard.id) {
          const updates: Partial<KanbanCardData> = { [field]: parsedValue };
          if (field === 'status') {
            updates.status = value;
          }
          return { ...c, ...updates };
        }
        return c;
      }));

      if (field === 'status') {
        setSelectedCard(prev => prev ? { ...prev, status: value } : null);
      }

      sonnerToast.success("Salvo automaticamente");
    } catch (error) {
      console.error("Error saving card:", error);
      sonnerToast.error("Erro ao salvar");
    } finally {
      setSaving(false);
      setSavingField(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files || event.target.files.length === 0) return;
    const files = Array.from(event.target.files);
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      sonnerToast.error(`Arquivo muito grande. Limite de 50MB.`);
      event.target.value = '';
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      sonnerToast.error("Usuário não autenticado.");
      return;
    }

    setUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 9);
        const storagePath = [
          tenantId || 'unknown-tenant',
          selectedClient?.id || 'unknown-client',
          periodPlanId || 'unknown-period',
          selectedCard.id,
          `${timestamp}-${uniqueId}.${fileExt}`
        ].join('/');
        
        const { error } = await supabase.storage
          .from('card-attachments')
          .upload(storagePath, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('card-attachments')
          .getPublicUrl(storagePath);

        const attachment: Attachment = {
          url: urlData.publicUrl,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: user.id, email: user.email || '', name: user.user_metadata?.full_name || undefined },
          cardId: selectedCard.id,
          tenantId: tenantId || '',
          clientId: selectedClient?.id,
          periodPlanId: periodPlanId || undefined
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
      setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c));

      sonnerToast.success(`${newAttachments.length} arquivo(s) anexado(s) com sucesso`);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      sonnerToast.error("Erro ao fazer upload do arquivo.");
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveAttachment = async (attachmentUrl: string) => {
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
      setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c));
      sonnerToast.success("Anexo removido");
    } catch (error) {
      console.error("Error removing attachment:", error);
      sonnerToast.error("Erro ao remover anexo");
    }
  };

  const handleReorderAttachments = async (attachments: Attachment[]) => {
    if (!selectedCard) return;
    try {
      const { error } = await supabase
        .from('demands')
        .update({ attachments: attachments as unknown as any, updated_at: new Date().toISOString() })
        .eq('id', selectedCard.id);
      if (error) throw error;
      setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, attachments } : c));
    } catch (error) {
      console.error("Error reordering attachments:", error);
      sonnerToast.error("Erro ao reordenar anexos");
    }
  };

  // Fetch history periods
  const fetchHistoryPeriods = async () => {
    if (!selectedClient?.id || !tenantId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end, status, created_at, final_plan")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistoryPeriods(data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectHistoryPeriod = (periodId: string) => {
    setActivePeriodId(periodId);
    setShowHistoryModal(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString("pt-BR");
  };

  // Get publication info for display
  const getPublicationInfo = (card: KanbanCardData) => {
    if (card.publish_date) {
      const time = card.publish_time || '09:00';
      return { date: card.publish_date, time, hasSchedule: true };
    }
    return { date: card.due_date, time: null, hasSchedule: false };
  };

  // Content types for filter
  const contentTypes = useMemo(() => {
    const types = new Set<string>();
    cards.forEach(card => {
      if (card.demand_type) types.add(card.demand_type);
    });
    return Array.from(types).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (contentTypeFilter === "all") return cards;
    return cards.filter(card => card.demand_type === contentTypeFilter);
  }, [cards, contentTypeFilter]);

  if (tenantLoading || !isInitialized) {
    return <LoadingScreen />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!periodPlanId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <LayoutGrid className="h-16 w-16 mb-4 opacity-30" />
        <h3 className="text-lg font-semibold mb-2 text-foreground">Nenhum período selecionado</h3>
        <p className="text-sm mb-4">Selecione um período no hub do cliente para ver as demandas</p>
        <Button variant="outline" onClick={() => navigate("/client-hub")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Ir para Hub do Cliente
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Demandas
            </h2>
            {referencePeriod && (
              <p className="text-xs text-muted-foreground">
                {referencePeriod.titulo} • {formatDate(referencePeriod.dataInicio)} - {formatDate(referencePeriod.dataFim)}
              </p>
            )}
          </div>
          <Badge variant="secondary">
            {filteredCards.length} {filteredCards.length === 1 ? 'demanda' : 'demandas'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            fetchHistoryPeriods();
            setShowHistoryModal(true);
          }}>
            <History className="h-4 w-4 mr-1" />
            Períodos
          </Button>
          {canCreateDemand && (
            <Button size="sm" onClick={() => setShowCreateDemandModal(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nova Demanda
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <SmartSearchBar
            items={cards}
            onResultSelect={handleSearchResultSelect}
            placeholder="Pesquisar demandas..."
            maxResults={8}
          />
        </div>

        {contentTypes.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de conteúdo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {contentTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => {
            const columnCards = filteredCards.filter(
              (card) => card.status === column.id
            );

            return (
              <Droppable key={column.id} droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-shrink-0 w-[280px] bg-muted/30 rounded-xl border border-border/50 flex flex-col",
                      snapshot.isDraggingOver && "border-primary/50 bg-primary/5"
                    )}
                  >
                    {/* Column Header */}
                    <div className="px-3 py-3 flex items-center justify-between border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-3 w-3 rounded-full flex-shrink-0", column.color)} />
                        <span className="text-sm font-semibold text-foreground">{column.title}</span>
                        <Badge variant="secondary" className="text-xs">{columnCards.length}</Badge>
                      </div>
                    </div>

                    {/* Column Content */}
                    <ScrollArea className="flex-1 p-2 min-h-[200px] max-h-[calc(100vh-280px)]">
                      <div className="space-y-0">
                        {columnCards.map((card, index) => {
                          const pubInfo = getPublicationInfo(card);
                          return (
                            <Draggable key={card.id} draggableId={card.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={(el) => {
                                    provided.innerRef(el);
                                    if (el) cardRefs.current.set(card.id, el);
                                    else cardRefs.current.delete(card.id);
                                  }}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    highlightedCardId === card.id && "ring-2 ring-primary/50 rounded-lg"
                                  )}
                                >
                                  <Card
                                    className={cn(
                                      "mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50",
                                      snapshot.isDragging && "shadow-xl rotate-1 scale-105"
                                    )}
                                    onClick={() => {
                                      setSelectedCard(card);
                                      setIsTaskCardOpen(true);
                                    }}
                                  >
                                    <div className="px-3 pt-3 pb-2">
                                      <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
                                        {card.title}
                                      </h4>
                                    </div>
                                    <div className="px-3 pb-3 pt-0 space-y-2">
                                      <div className="flex flex-wrap gap-1.5">
                                        {card.demand_type && (
                                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                                            {card.demand_type}
                                          </Badge>
                                        )}
                                        {card.channel && (
                                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                                            {card.channel}
                                          </Badge>
                                        )}
                                        {card.attachments && card.attachments.length > 0 && (
                                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                                            <Paperclip className="h-3 w-3 mr-0.5" />
                                            {card.attachments.length}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(pubInfo.date)}
                                        {pubInfo.hasSchedule && pubInfo.time && (
                                          <span className="ml-1">{pubInfo.time}</span>
                                        )}
                                      </div>
                                    </div>
                                  </Card>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* TaskCard Modal */}
      <TaskCard
        open={isTaskCardOpen}
        onOpenChange={(open) => {
          setIsTaskCardOpen(open);
          if (!open) {
            setSelectedCard(null);
          }
        }}
        card={selectedCard}
        onCardChange={(card) => setSelectedCard(card)}
        onSave={handleAutoSave}
        onFileUpload={handleFileUpload}
        onRemoveAttachment={handleRemoveAttachment}
        onReorderAttachments={handleReorderAttachments}
        onDelete={() => {
          if (selectedCard) {
            setCardToDelete(selectedCard.id);
            setIsTaskCardOpen(false);
          }
        }}
        saving={saving}
        savingField={savingField}
        uploading={uploading}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!cardToDelete}
        onClose={() => setCardToDelete(null)}
        onConfirm={handleDeleteCard}
        title="Excluir demanda"
        description="Tem certeza que deseja excluir esta demanda? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        isLoading={isDeleting}
      />

      {/* Schedule Publication Modal */}
      <SchedulePublicationModal
        isOpen={showScheduleModal}
        onClose={handleCancelSchedule}
        onConfirm={handleConfirmSchedule}
        cardTitle={pendingScheduleCard?.card.title || ''}
        initialDate={pendingScheduleCard?.card.publish_date || ''}
        initialTime={pendingScheduleCard?.card.publish_time || '09:00'}
      />

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de Períodos</DialogTitle>
          </DialogHeader>
          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {historyPeriods.map(period => (
                  <div
                    key={period.id}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                      period.id === periodPlanId ? "border-primary bg-primary/5" : "border-border"
                    )}
                    onClick={() => handleSelectHistoryPeriod(period.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{period.period_title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(period.period_start)} - {formatDate(period.period_end)}
                        </p>
                      </div>
                      <Badge variant={period.status === 'generated' ? 'secondary' : 'outline'} className="text-xs">
                        {period.status === 'generated' ? 'Gerado' : period.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {historyPeriods.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Nenhum período encontrado
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Demand Modal */}
      <CreateDemandModal
        open={showCreateDemandModal}
        onOpenChange={setShowCreateDemandModal}
        onDemandCreated={() => fetchPeriodPlanCards()}
        periodPlanId={periodPlanId || undefined}
      />
    </div>
  );
}