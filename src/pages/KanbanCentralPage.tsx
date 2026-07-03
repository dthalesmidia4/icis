import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronRight, 
  Loader2, 
  Filter, 
  Paperclip, 
  LayoutGrid,
  Archive,
  Search,
  Plus,
  Settings2,
  CalendarDays
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import { useColumnPermissions } from "@/hooks/useColumnPermissions";
import TaskCard, { getColumnFromStatus, getStatusFromColumn } from "@/components/TaskCard";
import type { KanbanCardData, Attachment } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import KanbanCard from "@/components/KanbanCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import CreateColumnModal from "@/components/CreateColumnModal";
import ManageColumnsModal from "@/components/ManageColumnsModal";
import { CreateDemandModal } from "@/components/CreateDemandModal";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { syncPeriodPlanSnapshot } from "@/lib/syncPeriodPlanItem";
import { createOrUpdateScheduleDispatch, hasActiveDispatch } from "@/lib/createScheduleDispatch";
import { useCollaborators } from "@/hooks/useCollaborators";

interface PipelineStatus {
  id: string;
  name: string;
  color: string;
  position: number;
  pipeline_id: string;
  is_fixed: boolean;
  parent_status_id: string | null;
}

interface CentralKanbanCard extends KanbanCardData {
  clientName: string;
  clientId: string;
  periodPlanId: string;
  isArchived?: boolean;
  archived_at?: string | null;
  assigned_to?: string | null;
  status_color?: string | null;
}

const FINAL_STATUS_NAMES = ['feito', 'feitos', 'publicado'];

const isCardOverdue = (card: { delivery_date?: string | null; delivery_time?: string | null; status?: string }) => {
  if (!card.delivery_date) return false;
  const statusLower = (card.status || '').toLowerCase();
  if (FINAL_STATUS_NAMES.includes(statusLower)) return false;
  const rawTime = card.delivery_time || '23:59';
  // Normalize time to HH:MM:SS format (handle both HH:MM and HH:MM:SS)
  const time = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  const deadline = new Date(`${card.delivery_date}T${time}`);
  if (isNaN(deadline.getTime())) return false;
  return new Date() >= deadline;
};

const getDisplayDemandType = (
  demandType: string | null | undefined,
  title?: string | null,
  description?: string | null,
  attachments?: Attachment[] | null
) => {
  const explicitType = demandType?.trim();
  if (explicitType) return explicitType;

  const hasSlidePattern = attachments?.some((attachment) => /slide\s*\d+/i.test(attachment.name || ""));
  if (hasSlidePattern) return "Carrossel";

  const searchableText = `${title || ""} ${description || ""}`.toLowerCase();
  if (searchableText.includes("carrossel") || searchableText.includes("carousel")) return "Carrossel";
  if (searchableText.includes("post estático") || searchableText.includes("post estatico") || searchableText.includes("estático") || searchableText.includes("estatico")) return "Post Estático";

  return null;
};

const KanbanCentralPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { isSuperAdmin } = useAgencyRole();
  const [cards, setCards] = useState<CentralKanbanCard[]>([]);
  const [archivedCards, setArchivedCards] = useState<CentralKanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<CentralKanbanCard | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>("active");
  const [periods, setPeriods] = useState<Array<{
    id: string;
    period_title: string;
    operational_status: string;
    period_start: string;
    period_end: string;
    company_id: string;
    companyName?: string;
  }>>([]);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Estado para colunas dinâmicas e modal
  const [columns, setColumns] = useState<PipelineStatus[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [isCreateColumnModalOpen, setIsCreateColumnModalOpen] = useState(false);
  const [isManageColumnsModalOpen, setIsManageColumnsModalOpen] = useState(false);
  const [isCreateDemandModalOpen, setIsCreateDemandModalOpen] = useState(false);

  // Schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [pendingScheduleCard, setPendingScheduleCard] = useState<CentralKanbanCard | null>(null);
  const [pendingScheduleSourceColumn, setPendingScheduleSourceColumn] = useState<string | null>(null);

  // Hook de permissões de colunas
  const { filterColumns, loading: permissionsLoading } = useColumnPermissions();

  // Filtrar colunas baseado nas permissões do usuário
  const visibleColumns = useMemo(() => {
    return filterColumns(columns);
  }, [columns, filterColumns]);

  // Extrair lista única de clientes (dos cards ativos)
  const clients = useMemo(() => {
    const uniqueClients = new Map<string, string>();
    cards.forEach(card => {
      if (card.clientId && card.clientName) {
        uniqueClients.set(card.clientId, card.clientName);
      }
    });
    return Array.from(uniqueClients.entries()).map(([id, name]) => ({
      id,
      name
    }));
  }, [cards]);

  // Filtrar cards por cliente e período
  const filteredCards = useMemo(() => {
    // When "all" periods selected, show both active and archived
    let baseCards = selectedPeriodFilter === "all" ? [...cards, ...archivedCards] : cards;
    
    if (selectedClientFilter !== "all") {
      baseCards = baseCards.filter(card => card.clientId === selectedClientFilter);
    }
    if (selectedPeriodFilter !== "active" && selectedPeriodFilter !== "all") {
      baseCards = baseCards.filter(card => card.periodPlanId === selectedPeriodFilter);
    }
    return baseCards;
  }, [cards, archivedCards, selectedClientFilter, selectedPeriodFilter]);

  // Todos os cards para busca (incluindo arquivados)
  const allSearchableCards = useMemo(() => {
    const archivedWithFlag = archivedCards.map(c => ({ ...c, isArchived: true }));
    return [...cards, ...archivedWithFlag];
  }, [cards, archivedCards]);

  // Handle search result selection
  const handleSearchResultSelect = useCallback((card: CentralKanbanCard) => {
    if (card.isArchived) {
      sonnerToast.info("Card de período concluído", {
        description: `Este card pertence a um período já concluído.`
      });
      return;
    }

    if (selectedClientFilter !== "all" && card.clientId !== selectedClientFilter) {
      setSelectedClientFilter("all");
    }
    
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
  }, [selectedClientFilter]);

  // Unified realtime handler for attachment updates
  const handleRealtimeUpdate = useCallback((itemId: string, attachments: Attachment[]) => {
    setCards(prevCards => 
      prevCards.map(card => 
        card.id === itemId ? { ...card, attachments } : card
      )
    );
    setArchivedCards(prevCards => 
      prevCards.map(card => 
        card.id === itemId ? { ...card, attachments } : card
      )
    );
    setSelectedCard(prev => 
      prev && prev.id === itemId ? { ...prev, attachments } : prev
    );
  }, []);

  const handleDemandFullUpdate = useCallback((demandId: string, payload: Record<string, any>) => {
    const newStatusId = payload.status_id as string;
    const newArchivedAt = payload.archived_at;
    
    // Handle archive: remove from active cards
    if (newArchivedAt) {
      setCards(prev => prev.filter(c => c.id !== demandId));
      return;
    }
    
    // Look up status name from columns state
    setColumns(currentColumns => {
      const statusCol = currentColumns.find(col => col.id === newStatusId);
      const newStatusName = statusCol?.name;
      
      if (newStatusName) {
        setCards(prevCards => 
          prevCards.map(card => {
            if (card.id !== demandId) return card;
            return {
              ...card,
              status: newStatusName,
              title: payload.title ?? card.title,
              demand_type: payload.demand_type ?? card.demand_type,
              publish_date: payload.publish_date ?? card.publish_date,
              publish_time: payload.publish_time ?? card.publish_time,
              delivery_date: payload.delivery_date ?? card.delivery_date,
              delivery_time: payload.delivery_time ?? card.delivery_time,
              due_date: payload.due_date ?? card.due_date,
              due_time: payload.due_time ?? card.due_time,
              objective: payload.objective ?? card.objective,
              observations: payload.observations ?? card.observations,
              instructions: payload.instructions ?? card.instructions,
              description: payload.description ?? card.description,
              post_caption: payload.post_caption ?? card.post_caption,
            };
          })
        );
        setSelectedCard(prev => 
          prev && prev.id === demandId ? { ...prev, status: newStatusName, title: payload.title ?? prev.title } : prev
        );
      }
      
      return currentColumns; // Don't change columns
    });
  }, []);

  // Handle new demands created by other users
  const handleDemandInsert = useCallback(async (demandId: string, payload: Record<string, any>) => {
    if (!tenantId) return;
    // Re-fetch to get full joined data
    try {
      const { data, error } = await supabase
        .from("demands")
        .select(`
          *,
          pipeline_statuses!demands_status_id_fkey (name, color, position),
          tenant_companies!demands_client_id_fkey (id, fantasy_name, name),
          period_plans!demands_period_plan_id_fkey (id, operational_status)
        `)
        .eq("id", demandId)
        .maybeSingle();

      if (error || !data) return;

      const statusName = data.pipeline_statuses?.name || "Planejamento";
      const company = data.tenant_companies;
      const period = data.period_plans;
      
      const newCard: CentralKanbanCard = {
        id: data.id,
        title: data.title,
        description: data.description || null,
        objective: data.objective || null,
        instructions: data.instructions || null,
        observations: data.observations || null,
        post_caption: data.post_caption || null,
        status: statusName,
        due_date: data.due_date || data.publish_date || new Date().toISOString().split('T')[0],
        channel: data.channel || null,
        attachments: (data.attachments as unknown as Attachment[] | null) || [],
        publish_date: data.publish_date || null,
        publish_time: data.publish_time || null,
        tenant_id: data.tenant_id,
        delivery_date: data.delivery_date || null,
        due_time: data.due_time || null,
        delivery_time: data.delivery_time || null,
        period_plan_id: data.period_plan_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        clientName: company?.fantasy_name || company?.name || "Cliente",
        clientId: company?.id || data.client_id || "",
        periodPlanId: period?.id || "",
        isArchived: !!data.archived_at,
        archived_at: data.archived_at,
        source: data.source,
        demand_id: data.id,
        demand_type: data.demand_type,
        additional_publish_dates: Array.isArray(data.additional_publish_dates) ? (data.additional_publish_dates as unknown as string[]) : []
      };

      if (data.archived_at) {
        setArchivedCards(prev => {
          if (prev.some(c => c.id === demandId)) return prev;
          return [...prev, newCard];
        });
      } else {
        setCards(prev => {
          if (prev.some(c => c.id === demandId)) return prev;
          return [...prev, newCard];
        });
      }
    } catch (err) {
      console.error('[Realtime] Error fetching inserted demand:', err);
    }
  }, [tenantId]);

  // Handle demands deleted by other users
  const handleDemandDelete = useCallback((demandId: string) => {
    setCards(prev => prev.filter(c => c.id !== demandId));
    setArchivedCards(prev => prev.filter(c => c.id !== demandId));
    setSelectedCard(prev => {
      if (prev?.id === demandId) {
        setIsTaskCardOpen(false);
        return null;
      }
      return prev;
    });
  }, []);

  useRealtimeAttachments({
    tenantId,
    onAttachmentUpdate: handleRealtimeUpdate,
    onDemandFullUpdate: handleDemandFullUpdate,
    onDemandInsert: handleDemandInsert,
    onDemandDelete: handleDemandDelete,
    enabled: !!tenantId
  });

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      fetchColumns();
      fetchAllCards();
      fetchPeriods();
    }
  }, [tenantId, tenantLoading]);

  // Auto-open card when navigating with ?openCard=true&highlight=<id>
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    const shouldOpenCard = searchParams.get('openCard') === 'true';
    if (highlightId && shouldOpenCard && cards.length > 0) {
      const card = cards.find(c => c.id === highlightId);
      if (card) {
        setSelectedCard(card);
        setIsTaskCardOpen(true);
        // Clean up URL params
        searchParams.delete('highlight');
        searchParams.delete('openCard');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [cards, searchParams]);

  const fetchColumns = async () => {
    if (!tenantId) return;
    try {
      const { data: pipelineData, error: pipelineError } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .maybeSingle();

      if (pipelineError) throw pipelineError;

      if (pipelineData) {
        setPipelineId(pipelineData.id);

        const { data: statusData, error: statusError } = await supabase
          .from("pipeline_statuses")
          .select("id, name, color, position, pipeline_id, is_fixed, parent_status_id")
          .eq("pipeline_id", pipelineData.id)
          .order("position", { ascending: true });

        if (statusError) throw statusError;

        setColumns(statusData || []);
      }
    } catch (error) {
      console.error("Error fetching columns:", error);
    }
  };

  const fetchPeriods = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from("period_plans")
        .select(`
          id,
          period_title,
          operational_status,
          period_start,
          period_end,
          company_id,
          tenant_companies!period_plans_company_id_fkey (
            fantasy_name,
            name
          )
        `)
        .eq("tenant_id", tenantId)
        .order("period_start", { ascending: false });

      if (error) throw error;

      setPeriods((data || []).map((p: any) => ({
        id: p.id,
        period_title: p.period_title,
        operational_status: p.operational_status,
        period_start: p.period_start,
        period_end: p.period_end,
        company_id: p.company_id,
        companyName: p.tenant_companies?.fantasy_name || p.tenant_companies?.name || ""
      })));
    } catch (error) {
      console.error("Error fetching periods:", error);
    }
  };

  const fetchAllCards = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      // Fetch active demands (archived_at IS NULL)
      const { data: activeData, error: activeError } = await supabase
        .from("demands")
        .select(`
          *,
          pipeline_statuses!demands_status_id_fkey (
            name,
            color,
            position
          ),
          tenant_companies!demands_client_id_fkey (
            id,
            fantasy_name,
            name
          ),
          period_plans!demands_period_plan_id_fkey (
            id,
            operational_status
          )
        `)
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (activeError) throw activeError;

      // Fetch archived demands (archived_at IS NOT NULL)
      const { data: archivedData, error: archivedError } = await supabase
        .from("demands")
        .select(`
          *,
          pipeline_statuses!demands_status_id_fkey (
            name,
            color,
            position
          ),
          tenant_companies!demands_client_id_fkey (
            id,
            fantasy_name,
            name
          ),
          period_plans!demands_period_plan_id_fkey (
            id,
            operational_status
          )
        `)
        .eq("tenant_id", tenantId)
        .not("archived_at", "is", null)
        .order("created_at", { ascending: true });

      if (archivedError) throw archivedError;

      const mapDemand = (demand: any, isArchived: boolean): CentralKanbanCard => {
        const statusName = demand.pipeline_statuses?.name || "Planejamento";
        const company = demand.tenant_companies;
        const period = demand.period_plans;
        
        return {
          id: demand.id,
          title: demand.title,
          description: demand.description || null,
          objective: demand.objective || null,
          instructions: demand.instructions || null,
          observations: demand.observations || null,
          post_caption: demand.post_caption || null,
          status: statusName,
          due_date: demand.due_date || demand.publish_date || new Date().toISOString().split('T')[0],
          channel: demand.channel || null,
          attachments: (demand.attachments as unknown as Attachment[] | null) || [],
          publish_date: demand.publish_date || null,
          publish_time: demand.publish_time || null,
          tenant_id: demand.tenant_id,
          delivery_date: demand.delivery_date || null,
          due_time: demand.due_time || null,
          delivery_time: demand.delivery_time || null,
          period_plan_id: demand.period_plan_id,
          created_at: demand.created_at,
          updated_at: demand.updated_at,
          clientName: company?.fantasy_name || company?.name || "Cliente",
          clientId: company?.id || demand.client_id || "",
          periodPlanId: period?.id || "",
          isArchived,
          archived_at: demand.archived_at,
          source: demand.source,
          demand_id: demand.id,
          demand_type: demand.demand_type,
          additional_publish_dates: Array.isArray(demand.additional_publish_dates) ? demand.additional_publish_dates : []
        };
      };

      const activeCards = (activeData || []).map(d => mapDemand(d, false));
      const archived = (archivedData || []).map(d => mapDemand(d, true));

      setCards(activeCards);
      setArchivedCards(archived);
    } catch (error) {
      console.error("Error fetching cards:", error);
      sonnerToast.error("Erro ao carregar demandas");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    // Same column reorder
    if (source.droppableId === destination.droppableId) {
      if (source.index === destination.index) return;

      setCards((prev) => {
        const columnName = source.droppableId;
        // Get cards in this column in current order
        const columnCards = prev.filter((c) => c.status === columnName);
        const otherCards = prev.filter((c) => c.status !== columnName);

        // Reorder within column
        const [movedCard] = columnCards.splice(source.index, 1);
        columnCards.splice(destination.index, 0, movedCard);

        return [...otherCards, ...columnCards];
      });
      return;
    }

    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    const newColumnName = destination.droppableId;

    // Interceptar "Agendar Publicação" → abrir modal de agendamento
    if (newColumnName === "Agendar Publicação") {
      setPendingScheduleCard(card);
      setPendingScheduleSourceColumn(card.status);
      // Mover visualmente para a coluna destino
      setCards((prev) =>
        prev.map((c) =>
          c.id === draggableId ? { ...c, status: newColumnName } : c
        )
      );
      setScheduleModalOpen(true);
      return;
    }

    setCards((prev) => {
      const updated = prev.map((c) =>
        c.id === draggableId ? { ...c, status: newColumnName } : c
      );
      // Move card to correct position in destination column
      const destCards = updated.filter((c) => c.status === newColumnName && c.id !== draggableId);
      const movedCard = updated.find((c) => c.id === draggableId)!;
      destCards.splice(destination.index, 0, movedCard);
      const otherCards = updated.filter((c) => c.status !== newColumnName);
      return [...otherCards, ...destCards];
    });

    try {
      const { data: statusData } = await supabase
        .from("pipeline_statuses")
        .select("id")
        .eq("name", newColumnName)
        .eq("pipeline_id", pipelineId)
        .maybeSingle();
      
      if (!statusData) {
        console.error("Status não encontrado:", newColumnName);
        sonnerToast.error("Status não encontrado");
        fetchAllCards();
        return;
      }
      
      const { error } = await supabase
        .from("demands")
        .update({ 
          status_id: statusData.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", card.id);

      if (error) throw error;

      sonnerToast.success(`Movida para "${newColumnName}"`);
    } catch (error) {
      console.error("Error updating card:", error);
      sonnerToast.error("Erro ao mover tarefa");
      fetchAllCards();
    }
  };

  const handleCardClick = (card: CentralKanbanCard) => {
    setSelectedCard(card);
    setIsTaskCardOpen(true);
  };

  const handleCardChange = (updatedCard: KanbanCardData) => {
    const updatedCentralCard = {
      ...updatedCard,
      demand_type: updatedCard.demand_type ?? selectedCard?.demand_type ?? null,
      clientName: selectedCard?.clientName || "Cliente",
      clientId: selectedCard?.clientId || "",
      periodPlanId: selectedCard?.periodPlanId || ""
    } as CentralKanbanCard;
    setSelectedCard(updatedCentralCard);
  };

  const handleSave = async (field: string, value: string) => {
    if (!selectedCard) return;
    setSaving(true);
    setSavingField(field);
    try {
      let parsedValue: any = value;
      if (field === 'attachments') {
        try {
          parsedValue = JSON.parse(value);
          if (field === 'attachments' && (!Array.isArray(parsedValue) || parsedValue.length === 0)) {
            console.warn('[Attachment] Proteção ativada: tentativa de sobrescrever attachments com valor vazio via handleSave');
            setSaving(false);
            setSavingField(null);
            return;
          }
        } catch {
          parsedValue = value;
        }
      }
      
      // Map card fields to demand fields (unified table)
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
        if (statusData) {
          demandUpdateData.status_id = statusData.id;
        }
      }
      else if (field === 'publish_date') demandUpdateData.publish_date = parsedValue;
      else if (field === 'publish_time') demandUpdateData.publish_time = parsedValue;
      else demandUpdateData[field] = parsedValue;
      
      const { error } = await supabase
        .from("demands")
        .update(demandUpdateData as any)
        .eq("id", selectedCard.id);

      if (error) throw error;

      // Sincronizar snapshot do período (Histórico de Períodos)
      if (['title', 'objective', 'description', 'instructions'].includes(field) && selectedCard.period_plan_id) {
        const merged = {
          title: field === 'title' ? parsedValue : selectedCard.title,
          objective: field === 'objective' ? parsedValue : selectedCard.objective,
          description: field === 'description' ? parsedValue : selectedCard.description,
          instructions: field === 'instructions' ? parsedValue : selectedCard.instructions,
        };
        syncPeriodPlanSnapshot(selectedCard.period_plan_id, merged);
      }

      // Atualizar estado local
      setCards(prev => prev.map(c => {
        if (c.id === selectedCard.id) {
          const updates: Partial<CentralKanbanCard> = { [field]: parsedValue };
          if (field === 'status') {
            updates.status = value;
          }
          return { ...c, ...updates };
        }
        return c;
      }));

      if (field === 'status') {
        setSelectedCard(prev => prev ? { 
          ...prev, 
          status: value
        } : null);
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
      sonnerToast.error("Arquivo muito grande. Limite de 50MB.");
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
      const uploadPromises = files.map(async file => {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 9);
        const storagePath = `${tenantId}/${selectedCard.clientId}/${selectedCard.periodPlanId}/${selectedCard.id}/${timestamp}-${uniqueId}.${fileExt}`;
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
          uploadedBy: {
            id: user.id,
            email: user.email || ''
          },
          cardId: selectedCard.id,
          tenantId: tenantId || '',
          clientId: selectedCard.clientId,
          periodPlanId: selectedCard.periodPlanId || undefined
        };
        return attachment;
      });
      const newAttachments = await Promise.all(uploadPromises);
      const updatedAttachments = [...(selectedCard.attachments || []), ...newAttachments];
      
      const { error: updateError } = await supabase
        .from('demands')
        .update({
          attachments: updatedAttachments as unknown as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCard.id);
      if (updateError) throw updateError;
      setSelectedCard(prev => prev ? {
        ...prev,
        attachments: updatedAttachments
      } : null);
      setCards(prev => prev.map(c => c.id === selectedCard.id ? {
        ...c,
        attachments: updatedAttachments
      } : c));
      sonnerToast.success(`${newAttachments.length} arquivo(s) anexado(s)`);
    } catch (error) {
      console.error("Error uploading file:", error);
      sonnerToast.error("Erro ao fazer upload");
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
        .update({
          attachments: updatedAttachments as unknown as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCard.id);
      if (error) throw error;
      
      setSelectedCard(prev => prev ? {
        ...prev,
        attachments: updatedAttachments
      } : null);
      setCards(prev => prev.map(c => c.id === selectedCard.id ? {
        ...c,
        attachments: updatedAttachments
      } : c));
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
        .update({ 
          attachments: attachments as unknown as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCard.id);

      if (error) throw error;

      setCards(prev => prev.map(c => 
        c.id === selectedCard.id ? { ...c, attachments } : c
      ));
    } catch (error) {
      console.error("Error reordering attachments:", error);
      sonnerToast.error("Erro ao reordenar anexos");
    }
  };

  const handleDelete = async () => {
    if (!selectedCard) return;
    try {
      const { error } = await supabase.from("demands").delete().eq("id", selectedCard.id);
      if (error) throw error;
      
      setCards(prev => prev.filter(c => c.id !== selectedCard.id));
      setIsTaskCardOpen(false);
      setSelectedCard(null);
      sonnerToast.success("Demanda excluída");
    } catch (error) {
      console.error("Error deleting card:", error);
      sonnerToast.error("Erro ao excluir demanda");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString("pt-BR");
  };

  // Função auxiliar para obter a próxima data de publicação
  const getNextPublicationDateTime = (card: CentralKanbanCard): Date | null => {
    if (card.publish_date) {
      return new Date(`${card.publish_date}T${card.publish_time || '09:00'}:00`);
    }
    if (card.due_date) {
      return new Date(card.due_date + 'T09:00:00');
    }
    return null;
  };

  // Função para calcular a prioridade baseada na data de publicação
  const getPublicationPriority = (card: CentralKanbanCard): { label: string; className: string } | null => {
    const pubDateTime = getNextPublicationDateTime(card);
    if (!pubDateTime) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const pubDate = new Date(pubDateTime.getFullYear(), pubDateTime.getMonth(), pubDateTime.getDate());

    if (pubDate.getTime() < today.getTime() || (pubDate.getTime() === today.getTime() && pubDateTime < now)) {
      return { label: "Atrasado", className: "bg-destructive/10 text-destructive border-destructive/30" };
    }
    if (pubDate.getTime() === today.getTime()) {
      return { label: "Hoje", className: "bg-orange-500/10 text-orange-600 border-orange-500/30" };
    }
    if (pubDate.getTime() === tomorrow.getTime()) {
      return { label: "Amanhã", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
    }
    if (pubDate.getTime() < in3Days.getTime()) {
      return { label: "Próximos dias", className: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" };
    }
    return null;
  };

  // Handle new demand created
  const handleDemandCreated = () => {
    fetchAllCards();
  };

  // Handle column created
  const handleColumnCreated = () => {
    fetchColumns();
  };

  if (tenantLoading || loading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header */}
      <div className="flex flex-col items-center mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Kanban Central
          </h2>
          <Badge variant="secondary">
            {filteredCards.length} {filteredCards.length === 1 ? 'demanda' : 'demandas'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsManageColumnsModalOpen(true)}
              >
                <Settings2 className="h-4 w-4 mr-1" />
                Colunas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateColumnModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Nova Coluna
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => setIsCreateDemandModalOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova Demanda
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <SmartSearchBar
            items={allSearchableCards}
            onResultSelect={handleSearchResultSelect}
            placeholder="Pesquisar demandas..."
            maxResults={8}
          />
        </div>

        {clients.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por cliente">
                <SelectValue placeholder="Filtrar por cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {periods.length > 0 && (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedPeriodFilter} onValueChange={setSelectedPeriodFilter}>
              <SelectTrigger className="w-[280px]" aria-label="Filtrar por período">
                <SelectValue placeholder="Filtrar por período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Todos em andamento</SelectItem>
                {periods
                  .filter(period => period.operational_status === 'em_andamento')
                  .map(period => (
                    <SelectItem key={period.id} value={period.id}>
                      <span className="flex items-center gap-2">
                        <span className="truncate max-w-[180px]">
                          {period.companyName ? `${period.companyName} – ` : ""}{period.period_title}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-medium shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/30")}>
                          Em andamento
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {visibleColumns.map((column) => {
            const columnCards = filteredCards.filter(
              (card) => card.status === column.name
            );

            return (
              <Droppable key={column.name} droppableId={column.name}>
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
                    <div className="px-3 py-3 flex flex-col border-b border-border/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: column.color }}
                          />
                          <span className="text-base font-bold text-foreground">
                            {column.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {columnCards.length}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Column Content */}
                    <ScrollArea className="flex-1 p-2 min-h-[200px] max-h-[calc(100vh-280px)]">
                      <div className="space-y-0">
                        {columnCards.map((card, index) => (
                          <Draggable
                            key={card.id}
                            draggableId={card.id}
                            index={index}
                          >
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
                                 <KanbanCard
                                    title={card.title}
                                    subtitle={card.clientName}
                                    demandType={getDisplayDemandType(card.demand_type, card.title, card.description, card.attachments)}
                                    dueDate={card.due_date}
                                    dueTime={card.due_time || undefined}
                                    cardDeliveryDate={card.delivery_date || undefined}
                                    deliveryTime={card.delivery_time || undefined}
                                    isDragging={snapshot.isDragging}
                                    isOverdue={isCardOverdue(card)}
                                    cardId={card.id}
                                    onClick={() => handleCardClick(card)}
                                  />
                              </div>
                            )}
                          </Draggable>
                        ))}
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
            fetchAllCards();
          }
        }}
        card={selectedCard}
        onCardChange={handleCardChange}
        onSave={handleSave}
        onFileUpload={handleFileUpload}
        onRemoveAttachment={handleRemoveAttachment}
        onReorderAttachments={handleReorderAttachments}
        onDelete={handleDelete}
        onArchive={async (archive: boolean) => {
          if (!selectedCard) return;
          try {
            const newArchivedAt = archive ? new Date().toISOString() : null;
            const { error } = await supabase
              .from("demands")
              .update({ archived_at: newArchivedAt })
              .eq("id", selectedCard.id);
            if (error) throw error;
            setIsTaskCardOpen(false);
            setSelectedCard(null);
            fetchAllCards();
            sonnerToast.success(archive ? "Demanda arquivada" : "Demanda desarquivada");
          } catch (error) {
            console.error("Error archiving/unarchiving:", error);
            sonnerToast.error("Erro ao alterar status de arquivo");
          }
        }}
        saving={saving}
        savingField={savingField}
        uploading={uploading}
        pipelineStatuses={columns}
        onScheduleRequest={(card) => {
          setPendingScheduleCard(card as CentralKanbanCard);
          setPendingScheduleSourceColumn(card.status);
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
              sonnerToast.error("Status 'Agendar Publicação' não encontrado");
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
            if (pendingScheduleCard.tenant_id) {
              const existed = await hasActiveDispatch(pendingScheduleCard.id);
              if (existed) {
                const ok = window.confirm("Este card já possui uma publicação agendada. Deseja atualizar o disparo existente?");
                if (!ok) {
                  sonnerToast.info("Disparo anterior mantido. Data e horário do card foram atualizados.");
                  return;
                }
              }
              const result = await createOrUpdateScheduleDispatch({
                cardId: pendingScheduleCard.id,
                tenantId: pendingScheduleCard.tenant_id,
                clientId: pendingScheduleCard.clientId,
                publishDate: date,
                publishTime: time,
                caption: (pendingScheduleCard as any).post_caption || pendingScheduleCard.description,
                attachments: pendingScheduleCard.attachments as any,
                demandType: pendingScheduleCard.demand_type,
                title: pendingScheduleCard.title,
              });
              if (!result.ok) {
                sonnerToast.error(result.error || "Não foi possível criar o disparo de publicação");
              } else {
                sonnerToast.success(`Agendado para ${new Date(date + 'T' + time).toLocaleDateString('pt-BR')} às ${time}`);
              }
            }

            // Update local state
            setCards(prev => prev.map(c =>
              c.id === pendingScheduleCard.id
                ? { ...c, status: "Agendar Publicação", publish_date: date, publish_time: time }
                : c
            ));

            // Update selected card if open
            if (selectedCard?.id === pendingScheduleCard.id) {
              setSelectedCard(prev => prev ? {
                ...prev,
                status: "Agendar Publicação",
                publish_date: date,
                publish_time: time
              } : null);
            }
          } catch (error) {
            console.error("Error scheduling:", error);
            sonnerToast.error("Erro ao agendar publicação");
            // Revert
            if (pendingScheduleSourceColumn) {
              setCards(prev => prev.map(c =>
                c.id === pendingScheduleCard.id
                  ? { ...c, status: pendingScheduleSourceColumn }
                  : c
              ));
            }
          } finally {
            setScheduleModalOpen(false);
            setPendingScheduleCard(null);
            setPendingScheduleSourceColumn(null);
          }
        }}
        onCancel={() => {
          // Revert card to original column
          if (pendingScheduleCard && pendingScheduleSourceColumn) {
            setCards(prev => prev.map(c =>
              c.id === pendingScheduleCard.id
                ? { ...c, status: pendingScheduleSourceColumn }
                : c
            ));
          }
          setScheduleModalOpen(false);
          setPendingScheduleCard(null);
          setPendingScheduleSourceColumn(null);
        }}
      />

      {/* Create Column Modal */}
      <CreateColumnModal
        open={isCreateColumnModalOpen}
        onOpenChange={setIsCreateColumnModalOpen}
        pipelineId={pipelineId}
        onSuccess={handleColumnCreated}
        existingPositions={columns.map(c => c.position)}
      />

      {/* Manage Columns Modal */}
      <ManageColumnsModal
        open={isManageColumnsModalOpen}
        onOpenChange={setIsManageColumnsModalOpen}
        pipelineId={pipelineId}
        columns={columns}
        onSuccess={handleColumnCreated}
      />

      {/* Create Demand Modal */}
      <CreateDemandModal
        open={isCreateDemandModalOpen}
        onOpenChange={setIsCreateDemandModalOpen}
        onDemandCreated={handleDemandCreated}
      />
    </div>
  );
};

export default KanbanCentralPage;