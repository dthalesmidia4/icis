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
  CalendarDays,
  ChevronDown,
  X,
  History
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import { useRealtimeDemandFlowHistory, useRealtimeFlowConfig } from "@/hooks/realtime";
import { useColumnPermissions } from "@/hooks/useColumnPermissions";
import TaskCard, { getColumnFromStatus, getStatusFromColumn } from "@/components/TaskCard";
import type { KanbanCardData, Attachment } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { isDailyCardVisibleNow } from "@/lib/dailyCards";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import KanbanCard from "@/components/KanbanCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import CreateColumnModal from "@/components/CreateColumnModal";
import ManageColumnsModal from "@/components/ManageColumnsModal";

import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { syncPeriodPlanSnapshot } from "@/lib/syncPeriodPlanItem";
import { createOrUpdateScheduleDispatch, hasActiveDispatch } from "@/lib/createScheduleDispatch";
import { useCollaborators } from "@/hooks/useCollaborators";
import { recordFlowHistory } from "@/lib/flowHistory";

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
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Set<string>>(new Set());
  const toggleDateGroup = useCallback((key: string) => {
    setCollapsedDateGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [collapsedAwaiting, setCollapsedAwaiting] = useState<Set<string>>(new Set());
  const toggleAwaiting = useCallback((columnId: string) => {
    setCollapsedAwaiting((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }, []);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<CentralKanbanCard | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>("active");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [dateGroupBy, setDateGroupBy] = useState<"start" | "delivery">("start");
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const { collaborators } = useCollaborators(tenantId);
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
  
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [draftClients, setDraftClients] = useState<{ id: string; name: string }[]>([]);

  // Modo "Registro de Cards" — mostra cards que já passaram por cada colaborador
  const [viewMode, setViewMode] = useState<"active" | "history">("active");
  const [historyRange, setHistoryRange] = useState<string>("7"); // "today" | "1" | "7" | ...

  // Map<toUserId, Array<{ demandId, lastSeenAt }>>
  const [historyByUser, setHistoryByUser] = useState<Map<string, Array<{ demandId: string; lastSeenAt: string }>>>(new Map());
  const [historyLoading, setHistoryLoading] = useState(false);



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

  // Filtrar cards por cliente, período e status
  const filteredCards = useMemo(() => {
    let baseCards = selectedPeriodFilter === "all" ? [...cards, ...archivedCards] : cards;

    if (selectedClientFilter !== "all") {
      baseCards = baseCards.filter(card => card.clientId === selectedClientFilter);
    }
    if (selectedPeriodFilter !== "active" && selectedPeriodFilter !== "all") {
      baseCards = baseCards.filter(card => card.periodPlanId === selectedPeriodFilter);
    }
    if (selectedStatusFilter !== "all") {
      baseCards = baseCards.filter(card => card.status === selectedStatusFilter);
    }
    // Ocultar cards diários cuja próxima ocorrência ainda não chegou
    baseCards = baseCards.filter(card => isDailyCardVisibleNow(card as any));
    return baseCards;
  }, [cards, archivedCards, selectedClientFilter, selectedPeriodFilter, selectedStatusFilter]);

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
              demand_type_key: payload.demand_type_key ?? card.demand_type_key,
              assigned_to: payload.assigned_to !== undefined ? payload.assigned_to : card.assigned_to,
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
        setSelectedCard(prev => {
          if (prev && prev.id === demandId) {
            sonnerToast.info("Este card foi atualizado por outro usuário.", { id: `rt-updated-${demandId}` });
            return { ...prev, status: newStatusName, title: payload.title ?? prev.title };
          }
          return prev;
        });
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
      if ((data as any).is_draft) return; // don't surface drafts in realtime


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
        demand_type_key: data.demand_type_key ?? null,
        current_function_key: (data as any).current_function_key ?? null,
        assigned_to: data.assigned_to || null,
        status_color: data.pipeline_statuses?.color || null,
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
        .eq("is_draft", false)

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
        .eq("is_draft", false)

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
          demand_type_key: demand.demand_type_key ?? null,
          current_function_key: demand.current_function_key ?? null,
          assigned_to: demand.assigned_to || null,
          status_color: demand.pipeline_statuses?.color || null,
          additional_publish_dates: Array.isArray(demand.additional_publish_dates) ? demand.additional_publish_dates : [],
          is_daily_card: !!demand.is_daily_card,
          daily_start_date: demand.daily_start_date ?? null,
          daily_end_date: demand.daily_end_date ?? null,
          daily_time: demand.daily_time ?? null,
          daily_exclude_weekends: demand.daily_exclude_weekends ?? true,
          daily_exclude_holidays: demand.daily_exclude_holidays ?? true,
          daily_next_date: demand.daily_next_date ?? null,
          daily_total_occurrences: demand.daily_total_occurrences ?? null,
          daily_completed_occurrences: demand.daily_completed_occurrences ?? 0,
          daily_completed_dates: Array.isArray(demand.daily_completed_dates) ? demand.daily_completed_dates : [],
        } as any;
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

  // Buscar histórico agrupado por colaborador quando o modo "Registro de Cards" está ativo
  const fetchHistory = useCallback(async () => {
    if (!tenantId) return;
    setHistoryLoading(true);
    try {
      let gte: string;
      let lte: string | null = null;
      if (historyRange === "today") {
        // Dia calendário no timezone America/Sao_Paulo (UTC-3, sem DST atualmente)
        const TZ_OFFSET_MIN = -180; // America/Sao_Paulo
        const now = new Date();
        // hora "local SP" = UTC + (-offset). Descobre YYYY-MM-DD em SP.
        const spNow = new Date(now.getTime() + (now.getTimezoneOffset() - TZ_OFFSET_MIN) * 60000);
        const y = spNow.getUTCFullYear();
        const m = String(spNow.getUTCMonth() + 1).padStart(2, "0");
        const d = String(spNow.getUTCDate()).padStart(2, "0");
        gte = `${y}-${m}-${d}T00:00:00-03:00`;
        lte = `${y}-${m}-${d}T23:59:59.999-03:00`;
      } else {
        const days = Number(historyRange) || 7;
        gte = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      }
      let q = supabase
        .from("demand_flow_history" as any)
        .select("demand_id, to_user_id, created_at")
        .eq("tenant_id", tenantId)
        .not("to_user_id", "is", null)
        .gte("created_at", gte);
      if (lte) q = q.lte("created_at", lte);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, Map<string, string>>(); // userId -> (demandId -> lastSeenAt)
      (data || []).forEach((row: any) => {
        const uid = row.to_user_id as string;
        const did = row.demand_id as string;
        const at = row.created_at as string;
        if (!map.has(uid)) map.set(uid, new Map());
        const inner = map.get(uid)!;
        if (!inner.has(did)) inner.set(did, at); // primeira ocorrência = mais recente (ordenado desc)
      });
      const result = new Map<string, Array<{ demandId: string; lastSeenAt: string }>>();
      map.forEach((inner, uid) => {
        result.set(uid, Array.from(inner.entries()).map(([demandId, lastSeenAt]) => ({ demandId, lastSeenAt })));
      });
      setHistoryByUser(result);
    } catch (err) {
      console.error("[flowHistory] fetch error:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [tenantId, historyRange]);


  useEffect(() => {
    if (viewMode === "history") fetchHistory();
  }, [viewMode, fetchHistory]);

  useRealtimeDemandFlowHistory({
    tenantId,
    enabled: !!tenantId && viewMode === "history",
    onInsert: () => fetchHistory(),
  });

  useRealtimeFlowConfig({
    tenantId,
    enabled: !!tenantId,
    onChange: () => fetchColumns(),
  });

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    // Column ids: collaborator user_id or "__unassigned__"
    const destColId = destination.droppableId as string;
    const newAssignedTo = destColId === "__unassigned__" ? null : destColId;
    const previousAssignedTo = card.assigned_to ?? null;

    // Optimistic update
    setCards((prev) => prev.map((c) =>
      c.id === draggableId ? { ...c, assigned_to: newAssignedTo } : c
    ));

    if (previousAssignedTo === newAssignedTo) return;

    try {
      const { error } = await supabase
        .from("demands")
        .update({
          assigned_to: newAssignedTo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", card.id);

      if (error) throw error;

      if (tenantId) {
        await recordFlowHistory({
          tenantId,
          demandId: card.id,
          action: "manual_assignment",
          fromUserId: previousAssignedTo,
          toUserId: newAssignedTo,
          fromFunctionKey: card.current_function_key ?? null,
          toFunctionKey: card.current_function_key ?? null,
          metadata: { source: "kanban_drag" },
        });
      }

      const collabName = newAssignedTo
        ? collaborators.find((c) => c.userId === newAssignedTo)?.fullName || "colaborador"
        : "Sem responsável";
      sonnerToast.success(`Atribuída a ${collabName}`);
    } catch (error) {
      console.error("Error updating assigned_to:", error);
      sonnerToast.error("Erro ao atribuir demanda");
      // Revert
      setCards((prev) => prev.map((c) =>
        c.id === draggableId ? { ...c, assigned_to: previousAssignedTo } : c
      ));
    }
  };

  const handleCardClick = (card: CentralKanbanCard) => {
    setSelectedCard(card);
    setIsTaskCardOpen(true);
  };

  const handleCardChange = (updatedCard: KanbanCardData) => {
    const nowArchived = !!(updatedCard as any).archived_at;
    const updatedCentralCard = {
      ...updatedCard,
      demand_type: updatedCard.demand_type ?? selectedCard?.demand_type ?? null,
      demand_type_key: updatedCard.demand_type_key ?? selectedCard?.demand_type_key ?? null,
      current_function_key: (updatedCard as any).current_function_key ?? (selectedCard as any)?.current_function_key ?? null,
      clientName: selectedCard?.clientName || "Cliente",
      clientId: selectedCard?.clientId || "",
      periodPlanId: selectedCard?.periodPlanId || "",
      isArchived: nowArchived || selectedCard?.isArchived || false,
    } as CentralKanbanCard;
    setSelectedCard(updatedCentralCard);
    if (nowArchived) {
      // Entregar: some da coluna do colaborador e vai para Demandas Completas.
      setCards(prev => prev.filter(c => c.id !== updatedCentralCard.id));
      setArchivedCards(prev => {
        const exists = prev.some(c => c.id === updatedCentralCard.id);
        return exists
          ? prev.map(c => c.id === updatedCentralCard.id ? { ...c, ...updatedCentralCard } : c)
          : [...prev, updatedCentralCard];
      });
    } else {
      setCards(prev => prev.map(c => c.id === updatedCentralCard.id ? { ...c, ...updatedCentralCard } : c));
      setArchivedCards(prev => prev.map(c => c.id === updatedCentralCard.id ? { ...c, ...updatedCentralCard } : c));
    }
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

  // Handle new demand created (legacy path)
  const handleDemandCreated = () => {
    fetchAllCards();
  };

  // Open TaskCard directly in draft mode with a blank in-memory card. No DB row created yet.
  const handleOpenDraft = async () => {
    if (!tenantId) return;
    // Fetch full client list for the inline selector
    try {
      const { data } = await supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", tenantId)
        .order("name");
      setDraftClients((data || []).map((c: any) => ({ id: c.id, name: c.fantasy_name || c.name })));
    } catch (err) {
      console.error("Error loading clients for draft:", err);
      setDraftClients([]);
    }

    const nowIso = new Date().toISOString();
    // Default: hoje + próximo slot de 30 em 30 (:00 ou :30, sempre arredondando para cima)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const rounded = new Date(now);
    const mins = rounded.getMinutes();
    if (mins === 0 || mins === 30) {
      // já está exato — avança para o próximo slot
      rounded.setMinutes(mins + 30);
    } else if (mins < 30) {
      rounded.setMinutes(30);
    } else {
      rounded.setHours(rounded.getHours() + 1);
      rounded.setMinutes(0);
    }
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    const defaultStartTime = `${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`;
    const blank: CentralKanbanCard = {
      id: "draft",
      title: "",
      description: null,
      objective: null,
      instructions: null,
      observations: null,
      post_caption: null,
      status: "Planejamento",
      due_date: todayStr,
      channel: null,
      attachments: [],
      publish_date: null,
      publish_time: null,
      tenant_id: tenantId,
      // Entrega padrão = início + 1h (rola para o próximo dia se passar de 23:xx)
      delivery_date: (() => {
        const [h, mi] = defaultStartTime.split(':').map(n => parseInt(n, 10));
        const dt = new Date(rounded); dt.setHours(h + 1, mi, 0, 0);
        return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      })(),
      due_time: defaultStartTime,

      delivery_time: (() => {
        const [h, mi] = defaultStartTime.split(':').map(n => parseInt(n, 10));
        const dt = new Date(rounded); dt.setHours(h + 1, mi, 0, 0);
        return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      })(),
      period_plan_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      archived_at: null,
      additional_publish_dates: [],
      source: 'demand',
      demand_id: "draft",
      demand_type: null,
      demand_type_key: null,
      assigned_to: null,
      current_function_key: null,
      clientId: "",
      clientName: ""
    } as CentralKanbanCard;

    setIsDraftMode(true);
    setSelectedCard(blank);
    setIsTaskCardOpen(true);
  };

  // Called by TaskCard when user picks a client inline (draft mode).
  const handleDraftClientChange = (clientId: string, clientName: string) => {
    setSelectedCard((prev) => (prev ? { ...prev, clientId, clientName } as CentralKanbanCard : prev));
  };

  const handleDraftSave = async () => {
    if (!selectedCard) return;
    if (!selectedCard.clientId) {
      sonnerToast.error("Selecione uma empresa");
      return;
    }
    if (!selectedCard.demand_type_key) {
      sonnerToast.error("Defina o tipo da demanda");
      return;
    }
    if (!selectedCard.due_date) {
      sonnerToast.error("Defina a data de início de produção");
      return;
    }
    if (!selectedCard.title?.trim()) {
      sonnerToast.error("Informe um título");
      return;
    }
    try {
      const chosenLabel = selectedCard.demand_type || selectedCard.demand_type_key;
      const { data, error } = await supabase.rpc("create_demand_from_template", {
        p_client_id: selectedCard.clientId,
        p_template_id: null,
        p_pipeline_id: null,
        p_status_id: null,
        p_title: selectedCard.title,
        p_description: selectedCard.description || null,
        p_demand_type: chosenLabel,
        p_channel: selectedCard.channel || null,
        p_publish_date: selectedCard.publish_date || null,
        p_due_date: selectedCard.due_date || null,
        p_period_plan_id: selectedCard.period_plan_id || null
      });
      if (error) throw error;
      const result = data as { success?: boolean; demand_id?: string; error?: string } | null;
      if (!result?.success || !result.demand_id) {
        sonnerToast.error(result?.error || "Erro ao criar demanda");
        return;
      }

      // Persist the fields the RPC doesn't accept
      const extra: Record<string, any> = {
        demand_type_key: selectedCard.demand_type_key,
      };
      if (selectedCard.delivery_date) extra.delivery_date = selectedCard.delivery_date;
      if (selectedCard.due_time) extra.due_time = selectedCard.due_time;
      if (selectedCard.delivery_time) extra.delivery_time = selectedCard.delivery_time;
      if (selectedCard.publish_time) extra.publish_time = selectedCard.publish_time;
      if (selectedCard.objective) extra.objective = selectedCard.objective;
      if (selectedCard.instructions) extra.instructions = selectedCard.instructions;
      if (selectedCard.observations) extra.observations = selectedCard.observations;
      if (selectedCard.post_caption) extra.post_caption = selectedCard.post_caption;
      if (selectedCard.assigned_to) extra.assigned_to = selectedCard.assigned_to;
      if (selectedCard.additional_publish_dates?.length) extra.additional_publish_dates = selectedCard.additional_publish_dates;
      if ((selectedCard as any).is_daily_card) {
        extra.is_daily_card = true;
        extra.daily_start_date = (selectedCard as any).daily_start_date ?? null;
        extra.daily_end_date = (selectedCard as any).daily_end_date ?? null;
        extra.daily_time = (selectedCard as any).daily_time ?? null;
        extra.daily_exclude_weekends = (selectedCard as any).daily_exclude_weekends ?? true;
        extra.daily_exclude_holidays = (selectedCard as any).daily_exclude_holidays ?? true;
        extra.daily_next_date = (selectedCard as any).daily_next_date ?? null;
        extra.daily_total_occurrences = (selectedCard as any).daily_total_occurrences ?? null;
        extra.daily_completed_occurrences = 0;
        extra.daily_completed_dates = [];
      }

      await supabase.from("demands").update(extra).eq("id", result.demand_id);

      if (tenantId) {
        await recordFlowHistory({
          tenantId,
          demandId: result.demand_id,
          action: "created",
          fromUserId: null,
          toUserId: selectedCard.assigned_to ?? null,
          fromFunctionKey: null,
          toFunctionKey: (selectedCard as any).current_function_key ?? null,
          metadata: { source: "manual" },
        });
      }

      sonnerToast.success("Demanda criada!");
      setIsDraftMode(false);
      setIsTaskCardOpen(false);
      setSelectedCard(null);
      fetchAllCards();
    } catch (err: any) {
      console.error("Error saving draft demand:", err);
      sonnerToast.error(err?.message || "Erro ao salvar demanda");
    }
  };

  const handleDraftDiscard = () => {
    setIsDraftMode(false);
    setIsTaskCardOpen(false);
    setSelectedCard(null);
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
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Visão geral das Tarefas
          </h2>
          <Badge variant="secondary">
            {filteredCards.length} {filteredCards.length === 1 ? 'demanda' : 'demandas'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode((v) => (v === "history" ? "active" : "history"))}
            title="Ver os cards que já passaram por cada colaborador"
          >
            <History className="h-4 w-4 mr-1" />
            {viewMode === "history" ? "Modo ativo" : "Registro de Cards"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateColumnModalOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Novo Status
          </Button>
          <Button
            size="sm"
            onClick={handleOpenDraft}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova Demanda
          </Button>
        </div>
      </div>

      {/* Search + Filters button */}
      {(() => {
        const activeCount =
          (selectedClientFilter !== "all" ? 1 : 0) +
          (selectedPeriodFilter !== "active" ? 1 : 0) +
          (selectedStatusFilter !== "all" ? 1 : 0) +
          (dateGroupBy !== "start" ? 1 : 0);
        const clientLabel = clients.find((c) => c.id === selectedClientFilter)?.name;
        const periodLabel =
          selectedPeriodFilter === "active"
            ? null
            : selectedPeriodFilter === "all"
              ? "Todos os períodos"
              : periods.find((p) => p.id === selectedPeriodFilter)?.period_title || "Período";
        return (
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <SmartSearchBar
                  items={allSearchableCards}
                  onResultSelect={handleSearchResultSelect}
                  placeholder="Pesquisar demandas..."
                  maxResults={8}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFiltersModalOpen(true)}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                Filtros
                {activeCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </div>

            {activeCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {clientLabel && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Cliente: {clientLabel}
                    <button
                      type="button"
                      onClick={() => setSelectedClientFilter("all")}
                      className="ml-1 hover:bg-background/40 rounded p-0.5"
                      aria-label="Limpar filtro de cliente"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {periodLabel && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Período: {periodLabel}
                    <button
                      type="button"
                      onClick={() => setSelectedPeriodFilter("active")}
                      className="ml-1 hover:bg-background/40 rounded p-0.5"
                      aria-label="Limpar filtro de período"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedStatusFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Status: {selectedStatusFilter}
                    <button
                      type="button"
                      onClick={() => setSelectedStatusFilter("all")}
                      className="ml-1 hover:bg-background/40 rounded p-0.5"
                      aria-label="Limpar filtro de status"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {dateGroupBy !== "start" && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Visualizar por: Data de término
                    <button
                      type="button"
                      onClick={() => setDateGroupBy("start")}
                      className="ml-1 hover:bg-background/40 rounded p-0.5"
                      aria-label="Voltar para data de início"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setSelectedClientFilter("all");
                    setSelectedPeriodFilter("active");
                    setSelectedStatusFilter("all");
                    setDateGroupBy("start");
                  }}
                >
                  Limpar todos
                </Button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Filters Modal */}
      <Dialog open={isFiltersModalOpen} onOpenChange={setIsFiltersModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Visualizar por
              </label>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDateGroupBy("start")}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors",
                    dateGroupBy === "start" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-accent/40"
                  )}
                >
                  Data de início
                </button>
                <button
                  type="button"
                  onClick={() => setDateGroupBy("delivery")}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors",
                    dateGroupBy === "delivery" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-accent/40"
                  )}
                >
                  Data de término
                </button>
              </div>
            </div>

            {clients.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Cliente</label>
                <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar por cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os clientes</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {periods.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Período</label>
                <Select value={selectedPeriodFilter} onValueChange={setSelectedPeriodFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar por período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Todos em andamento</SelectItem>
                    {periods
                      .filter((period) => period.operational_status === "em_andamento")
                      .map((period) => (
                        <SelectItem key={period.id} value={period.id}>
                          <span className="flex items-center gap-2">
                            <span className="truncate max-w-[220px]">
                              {period.companyName ? `${period.companyName} – ` : ""}
                              {period.period_title}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0 font-medium shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/30"
                              )}
                            >
                              Em andamento
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {columns.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {columns.map((status) => (
                      <SelectItem key={status.id} value={status.name}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: status.color }}
                          />
                          {status.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedClientFilter("all");
                setSelectedPeriodFilter("active");
                setSelectedStatusFilter("all");
                setDateGroupBy("start");
              }}
            >
              Limpar filtros
            </Button>
            <Button onClick={() => setIsFiltersModalOpen(false)}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kanban Board (columns = collaborators) */}
      {viewMode === "history" && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          <History className="h-4 w-4" />
          <span className="flex-1 min-w-0">
            Modo <strong>Registro de Cards</strong>: {historyRange === "today" ? "cards movimentados hoje por cada colaborador" : `cards que passaram por cada colaborador nos últimos ${historyRange} ${historyRange === "1" ? "dia" : "dias"}`}.
            {historyLoading && " Carregando..."}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs">Período:</span>
            <Select value={historyRange} onValueChange={setHistoryRange}>
              <SelectTrigger className="h-8 w-[160px] bg-background text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="1">Último 1 dia</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[
            ...collaborators.map((c) => ({
              id: c.userId,
              name: c.fullName,
              color: "hsl(var(--primary))",
            })),
            { id: "__unassigned__", name: "Sem responsável", color: "hsl(var(--muted-foreground))" },
          ].map((column) => {
            // Cards ATIVOS deste colaborador (modo normal)
            const activeColumnCards = filteredCards.filter((card) => {
              if (column.id === "__unassigned__") return !card.assigned_to;
              return card.assigned_to === column.id;
            });

            // Cards HISTÓRICOS: todos que já passaram por esse colaborador
            let historyColumnCards: Array<CentralKanbanCard & { _historyAt?: string }> = [];
            if (viewMode === "history") {
              const rows = historyByUser.get(column.id) || [];
              const cardIndex = new Map<string, CentralKanbanCard>();
              [...cards, ...archivedCards].forEach((c) => cardIndex.set(c.id, c));
              historyColumnCards = rows
                .map((r) => {
                  const c = cardIndex.get(r.demandId);
                  if (!c) return null;
                  return { ...c, _historyAt: r.lastSeenAt } as CentralKanbanCard & { _historyAt?: string };
                })
                .filter((x): x is CentralKanbanCard & { _historyAt?: string } => !!x);
            }

            const allColumnCards = viewMode === "history" ? historyColumnCards : activeColumnCards;

            // Aguardando Clientes = cards na função operacional aguardando_cliente (apenas modo ativo)
            const awaitingCards = viewMode === "active"
              ? allColumnCards.filter((c) => c.current_function_key === 'aguardando_cliente')
              : [];
            const columnCards = viewMode === "active"
              ? allColumnCards.filter((c) => c.current_function_key !== 'aguardando_cliente')
              : allColumnCards;

            const isAwaitingCollapsed = collapsedAwaiting.has(column.id);

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
                    <div className="px-3 py-3 flex flex-col border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: column.color }}
                        />
                        <span className="text-base font-bold text-foreground truncate">
                          {column.name}
                        </span>
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {allColumnCards.length}
                        </Badge>
                      </div>
                      {viewMode === "history" && (
                        <span className="text-[11px] text-muted-foreground mt-1">
                          {allColumnCards.length === 1 ? "1 card passou por aqui" : `${allColumnCards.length} cards passaram por aqui`}
                        </span>
                      )}
                    </div>

                    {/* Column Content */}
                    <ScrollArea className="flex-1 p-2 min-h-[200px] max-h-[calc(100vh-280px)]">
                      <div className="space-y-2">
                        {(() => {
                          // Group cards by chosen date
                          const groups = new Map<string, CentralKanbanCard[]>();
                          for (const c of columnCards) {
                            const key = (dateGroupBy === "start" ? c.due_date : c.delivery_date) || "__no_date__";
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key)!.push(c);
                          }
                          const entries = Array.from(groups.entries()).map(([date, items]) => {
                            const sorted = [...items].sort((a, b) => {
                              const ta = (dateGroupBy === "start" ? a.due_time : a.delivery_time) || "99:99";
                              const tb = (dateGroupBy === "start" ? b.due_time : b.delivery_time) || "99:99";
                              return ta.localeCompare(tb);
                            });
                            return { date, items: sorted };
                          });
                          entries.sort((a, b) => {
                            if (a.date === "__no_date__") return 1;
                            if (b.date === "__no_date__") return -1;
                            return a.date.localeCompare(b.date);
                          });

                          let runningIndex = -1;
                          const formatHeader = (date: string) => {
                            if (date === "__no_date__") {
                              return dateGroupBy === "start" ? "Sem data de início" : "Sem data de término";
                            }
                            const [y, m, d] = date.split("-");
                            return `${d}/${m}/${y}`;
                          };

                          return entries.map(({ date, items }) => {
                            const groupKey = `${column.id}::${date}`;
                            const isCollapsed = collapsedDateGroups.has(groupKey);
                            return (
                            <div key={date} className="space-y-1">
                              <button
                                type="button"
                                onClick={() => toggleDateGroup(groupKey)}
                                className="w-full flex items-center gap-2 px-1 pt-1 pb-1 border-b border-border/40 hover:bg-muted/40 rounded-sm transition-colors"
                                aria-expanded={!isCollapsed}
                                aria-label={isCollapsed ? "Expandir grupo" : "Recolher grupo"}
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                                <span className="text-xs font-bold text-foreground">
                                  {formatHeader(date)}
                                </span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                                  {items.length}
                                </Badge>
                              </button>
                              <div className={cn(isCollapsed && "hidden")}>
                              {items.map((card) => {
                                runningIndex += 1;
                                const index = runningIndex;
                                return (
                                  <Draggable
                                    key={card.id}
                                    draggableId={card.id}
                                    index={index}
                                  >
                                    {(provided, snapshot) => {
                                      const isHistory = viewMode === "history";
                                      const currentOwnerName = isHistory
                                        ? (collaborators.find((c) => c.userId === card.assigned_to)?.fullName || (card.assigned_to ? "Outro" : "Sem responsável"))
                                        : null;
                                      const historyAt = (card as any)._historyAt as string | undefined;
                                      return (
                                      <div
                                        ref={(el) => {
                                          provided.innerRef(el);
                                          if (el) cardRefs.current.set(card.id, el);
                                          else cardRefs.current.delete(card.id);
                                        }}
                                        {...provided.draggableProps}
                                        {...(isHistory ? {} : provided.dragHandleProps)}
                                        className={cn(
                                          highlightedCardId === card.id && "ring-2 ring-primary/50 rounded-lg",
                                          isHistory && "opacity-80"
                                        )}
                                      >
                                        {isHistory && (
                                          <div className="flex flex-wrap items-center gap-1 mb-1 px-1">
                                            {historyAt && (
                                              <span className="text-[9px] text-muted-foreground">
                                                {new Date(historyAt).toLocaleDateString("pt-BR")}
                                              </span>
                                            )}
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto">
                                              Hoje: {currentOwnerName}
                                            </Badge>
                                          </div>
                                        )}

                                        <div className={cn(isHistory && "border border-dashed border-primary/40 rounded-lg")}>
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
                                            statusName={card.status}
                                            statusColor={card.status_color}
                                            isDailyCard={(card as any).is_daily_card}
                                            dailyCompleted={(card as any).daily_completed_occurrences}
                                            dailyTotal={(card as any).daily_total_occurrences}
                                            dailyNextDate={(card as any).daily_next_date}
                                            onClick={() => handleCardClick(card)}
                                          />
                                        </div>
                                      </div>
                                      );
                                    }}
                                  </Draggable>
                                );
                              })}
                              </div>
                            </div>
                            );
                          });
                        })()}
                        {provided.placeholder}

                        {/* Aguardando clientes — cards em `aguardando_cliente` ficam agrupados aqui */}
                        {awaitingCards.length > 0 && (
                          <div className="mt-3 pt-2 border-t-2 border-blue-500/60">
                            <button
                              type="button"
                              onClick={() => toggleAwaiting(column.id)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 transition-colors border border-blue-500/40"
                              aria-expanded={!isAwaitingCollapsed}
                            >
                              {isAwaitingCollapsed ? (
                                <ChevronRight className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                              )}
                              <span className="text-sm font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                                Aguardando clientes
                              </span>

                              <Badge variant="secondary" className="text-xs px-2 py-0.5 h-5 ml-auto bg-blue-500/25 text-blue-700 dark:text-blue-300 border-blue-500/40 font-bold">
                                {awaitingCards.length}
                              </Badge>
                            </button>

                            {!isAwaitingCollapsed && (
                              <div className="mt-1 space-y-1">
                                {awaitingCards.map((card) => (
                                  <div
                                    key={card.id}
                                    ref={(el) => {
                                      if (el) cardRefs.current.set(card.id, el);
                                      else cardRefs.current.delete(card.id);
                                    }}
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
                                      isOverdue={isCardOverdue(card)}
                                      cardId={card.id}
                                      statusName={card.status}
                                      statusColor={(card as any).status_color}
                                      isDailyCard={(card as any).is_daily_card}
                                      dailyCompleted={(card as any).daily_completed_occurrences}
                                      dailyTotal={(card as any).daily_total_occurrences}
                                      dailyNextDate={(card as any).daily_next_date}
                                      onClick={() => handleCardClick(card)}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
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
          if (!open && isDraftMode) {
            handleDraftDiscard();
            return;
          }
          setIsTaskCardOpen(open);
          if (!open) {
            setSelectedCard(null);
            fetchAllCards();
          }
        }}
        isDraft={isDraftMode}
        onDraftSave={handleDraftSave}
        onDraftDiscard={handleDraftDiscard}
        draftClients={draftClients}
        onDraftClientChange={handleDraftClientChange}
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




    </div>
  );
};

export default KanbanCentralPage;