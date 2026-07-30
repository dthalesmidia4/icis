import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  History,
  Focus,
  Wand2,
  Activity
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReorderSequenceModal from "@/components/kanban/ReorderSequenceModal";
import AwaitingClientActions from "@/components/kanban/AwaitingClientActions";

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
import { assignInitialResponsible, resolveFunctionForAssignee } from "@/lib/initialFlowFunction";
import { isReviewFunction, isEvaluationFunction, isClientWaitingFunction } from "@/lib/flowFunctions";
import { resolveCurrentAndNext } from "@/lib/currentWorkCard";
import { useNowTick } from "@/hooks/useNowTick";

import { useActiveDispatchIds } from "@/hooks/useActiveDispatchIds";
import { usePendingEvaluationCards, type PendingEvaluationCard } from "@/hooks/usePendingEvaluationCards";
import { EvaluatePlanCardModal } from "@/components/EvaluatePlanCardModal";
import { ClipboardCheck } from "lucide-react";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Input } from "@/components/ui/input";

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
  additional_assignees?: string[];
  status_color?: string | null;
  work_area?: "midia" | "sistemas" | null;
}

const FINAL_STATUS_NAMES = ['feito', 'feitos', 'publicado'];
const KANBAN_FOCUS_TRANSITION_MS = 280;

const getClientSentAt = (card: Pick<KanbanCardData, "client_wait_started_at"> & { client_sent_at_fallback?: string | null }) =>
  card.client_wait_started_at || card.client_sent_at_fallback || null;

type KanbanFocusKind = 'production' | 'evaluate' | 'awaiting' | 'review';
type KanbanDisplayColumn = {
  id: string;
  name: string;
  color: string;
  userId: string;
  focusKind?: KanbanFocusKind;
};

const getKanbanColumnVisualKey = (column: Pick<KanbanDisplayColumn, "userId" | "focusKind">) => {
  if (column.userId === "__unassigned__") return "kanban-column:unassigned";
  if (column.focusKind && column.focusKind !== "production") {
    return `kanban-column:${column.userId}:${column.focusKind}`;
  }
  return `kanban-column:${column.userId}`;
};

const prefersReducedKanbanMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const { isSuperAdmin, isAgencyManager } = useAgencyRole();
  const canReorder = isSuperAdmin || isAgencyManager;
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
  // Grupo "Aguardando clientes" inicia recolhido por padrão; guardamos as colunas expandidas explicitamente.
  const [expandedAwaiting, setExpandedAwaiting] = useState<Set<string>>(new Set());
  const toggleAwaiting = useCallback((columnId: string) => {
    setExpandedAwaiting((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }, []);
  // Grupo "Em Revisão" inicia recolhido por padrão; guardamos as colunas expandidas explicitamente.
  const [expandedReview, setExpandedReview] = useState<Set<string>>(new Set());
  const toggleReview = useCallback((columnId: string) => {
    setExpandedReview((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }, []);
  // Grupo "Avaliar" (cards planejados aguardando aprovação) — recolhido por padrão.
  const [expandedEvaluate, setExpandedEvaluate] = useState<Set<string>>(new Set());
  const toggleEvaluate = useCallback((columnId: string) => {
    setExpandedEvaluate((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  }, []);
  // Focus mode: quando setado, decompõe a coluna do responsável em sub-colunas por agrupamento.
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null);
  const kanbanColumnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const focusBoardScrollLeftRef = useRef(0);
  const pendingFocusTransitionRef = useRef<{
    direction: "enter" | "exit";
    from: Map<string, { rect: DOMRect; clone: HTMLElement }>;
  } | null>(null);

  const setKanbanColumnRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) kanbanColumnRefs.current.set(key, el);
    else kanbanColumnRefs.current.delete(key);
  }, []);

  const captureKanbanColumnLayout = useCallback(() => {
    const captured = new Map<string, { rect: DOMRect; clone: HTMLElement }>();
    kanbanColumnRefs.current.forEach((el, key) => {
      const clone = el.cloneNode(true);
      if (!(clone instanceof HTMLElement)) return;
      captured.set(key, { rect: el.getBoundingClientRect(), clone });
    });
    return captured;
  }, []);

  const changeFocusColumn = useCallback((nextColumnId: string | null) => {
    if (!prefersReducedKanbanMotion()) {
      if (nextColumnId && boardScrollRef.current) {
        focusBoardScrollLeftRef.current = boardScrollRef.current.scrollLeft;
      }
      pendingFocusTransitionRef.current = {
        direction: nextColumnId ? "enter" : "exit",
        from: captureKanbanColumnLayout(),
      };
    }
    setFocusedColumnId(nextColumnId);
  }, [captureKanbanColumnLayout]);

  const enterFocus = useCallback((userId: string) => {
    changeFocusColumn(userId);
  }, [changeFocusColumn]);
  const exitFocus = useCallback(() => {
    changeFocusColumn(null);
  }, [changeFocusColumn]);

  useLayoutEffect(() => {
    const pending = pendingFocusTransitionRef.current;
    if (!pending) return;
    pendingFocusTransitionRef.current = null;

    const current = new Map(kanbanColumnRefs.current);
    if (boardScrollRef.current) {
      boardScrollRef.current.scrollLeft = pending.direction === "enter" ? 0 : focusBoardScrollLeftRef.current;
    }

    const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

    current.forEach((el, key) => {
      const previous = pending.from.get(key);
      const nextRect = el.getBoundingClientRect();
      const focusOrder = Number(el.dataset.focusOrder || "0");
      const delay = previous ? 0 : Math.min(focusOrder * 34, 120);
      const animation = previous
        ? el.animate(
            [
              {
                transform: `translate3d(${previous.rect.left - nextRect.left}px, ${previous.rect.top - nextRect.top}px, 0)`,
                opacity: 1,
              },
              { transform: "translate3d(0, 0, 0)", opacity: 1 },
            ],
            { duration: KANBAN_FOCUS_TRANSITION_MS, easing, fill: "both" }
          )
        : el.animate(
            [
              { transform: "translate3d(20px, 0, 0)", opacity: 0 },
              { transform: "translate3d(0, 0, 0)", opacity: 1 },
            ],
            { duration: KANBAN_FOCUS_TRANSITION_MS, delay, easing, fill: "both" }
          );

      animation.finished
        .then(() => {
          el.style.transform = "";
          el.style.opacity = "";
        })
        .catch(() => undefined);
    });

    pending.from.forEach(({ rect, clone }, key) => {
      if (current.has(key)) return;
      clone.classList.add("kanban-focus-ghost");
      clone.style.position = "fixed";
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.margin = "0";
      clone.style.zIndex = "30";
      clone.style.pointerEvents = "none";
      document.body.appendChild(clone);

      const moveX = pending.direction === "enter" ? -18 : 18;
      const animation = clone.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
          { transform: `translate3d(${moveX}px, 0, 0)`, opacity: 0 },
        ],
        { duration: KANBAN_FOCUS_TRANSITION_MS - 40, easing, fill: "forwards" }
      );
      animation.finished
        .then(() => clone.remove())
        .catch(() => clone.remove());
    });
  }, [focusedColumnId]);

  useEffect(() => {
    if (!focusedColumnId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") changeFocusColumn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedColumnId, changeFocusColumn]);

  const [evaluateModalCard, setEvaluateModalCard] = useState<PendingEvaluationCard | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const savingDraftRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<CentralKanbanCard | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>("active");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<"all" | "midia" | "sistemas">("all");
  const [dateGroupBy, setDateGroupBy] = useState<"start" | "delivery">("start");
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const { collaborators } = useCollaborators(tenantId);
  const navigate = useNavigate();
  const { setSelectedClient } = useSelectedClient();
  const [evolutionPopoverOpen, setEvolutionPopoverOpen] = useState(false);
  const [evolutionSearch, setEvolutionSearch] = useState("");
  const { activeDispatchIds, count: scheduledCount } = useActiveDispatchIds(tenantId);
  const { cards: pendingEvalCards, refetch: refetchEval } = usePendingEvaluationCards(tenantId);
  // Relógio reativo (virada de dia / atraso não podem ficar congelados na sessão)
  const nowTs = useNowTick(60_000);
  // Entregas já registradas por usuário/card (cards multi-responsável)
  const [deliveredStagesByUser, setDeliveredStagesByUser] = useState<Map<string, Map<string, Set<string>>>>(new Map());
  const [deliveriesRefreshKey, setDeliveriesRefreshKey] = useState(0);

  // Busca as entregas já registradas apenas dos cards multi-responsável
  const multiAssigneeCardIds = useMemo(
    () => cards.filter((c) => ((c as any).additional_assignees?.length ?? 0) > 0).map((c) => c.id).sort(),
    [cards],
  );
  const multiAssigneeKey = multiAssigneeCardIds.join(",");
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!tenantId || multiAssigneeCardIds.length === 0) {
        if (!cancelled) setDeliveredStagesByUser(new Map());
        return;
      }
      const { data, error } = await supabase
        .from("demand_flow_history")
        .select("demand_id, from_user_id, from_function_key, action")
        .eq("tenant_id", tenantId)
        .in("demand_id", multiAssigneeCardIds)
        .in("action", ["partial_delivered", "delivered", "proceeded"]);
      if (error || cancelled) return;
      const byUser = new Map<string, Map<string, Set<string>>>();
      (data || []).forEach((row: any) => {
        const userId = row.from_user_id as string | null;
        const stage = (row.from_function_key || "").toLowerCase().trim();
        if (!userId || !stage) return;
        let byCard = byUser.get(userId);
        if (!byCard) { byCard = new Map(); byUser.set(userId, byCard); }
        let stages = byCard.get(row.demand_id);
        if (!stages) { stages = new Set(); byCard.set(row.demand_id, stages); }
        stages.add(stage);
      });
      setDeliveredStagesByUser(byUser);
    };
    run();
    return () => { cancelled = true; };
  }, [tenantId, multiAssigneeKey, deliveriesRefreshKey]);



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
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const columnScrollRootsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const savedScrollRef = useRef<{ columnId: string; cardId: string; top: number; boardLeft: number } | null>(null);

  const setColumnScrollRoot = useCallback((columnId: string, el: HTMLDivElement | null) => {
    if (el) columnScrollRootsRef.current.set(columnId, el);
    else columnScrollRootsRef.current.delete(columnId);
  }, []);

  const getColumnScrollViewport = useCallback((columnId: string) => {
    const root = columnScrollRootsRef.current.get(columnId);
    return root?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') || null;
  }, []);

  const captureColumnScroll = useCallback((columnId: string, cardId: string) => {
    const viewport = getColumnScrollViewport(columnId);
    savedScrollRef.current = {
      columnId,
      cardId,
      top: viewport?.scrollTop || 0,
      boardLeft: boardScrollRef.current?.scrollLeft || 0,
    };
  }, [getColumnScrollViewport]);

  const restoreSavedScroll = useCallback(() => {
    const saved = savedScrollRef.current;
    if (!saved) return;
    savedScrollRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (boardScrollRef.current) boardScrollRef.current.scrollLeft = saved.boardLeft;

        const viewport = getColumnScrollViewport(saved.columnId);
        if (viewport) {
          viewport.scrollTop = saved.top;
          return;
        }

        cardRefs.current.get(saved.cardId)?.scrollIntoView({ block: "center" });
      });
    });
  }, [getColumnScrollViewport]);
  
  // Estado para colunas dinâmicas e modal
  const [columns, setColumns] = useState<PipelineStatus[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [isCreateColumnModalOpen, setIsCreateColumnModalOpen] = useState(false);
  const [isManageColumnsModalOpen, setIsManageColumnsModalOpen] = useState(false);
  
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [draftClients, setDraftClients] = useState<{ id: string; name: string }[]>([]);

  // Histórico por coluna — cada coluna pode ativar independentemente o "Registro de entregas".
  // range: 'today' | '7' | '30' | 'day' | 'custom'
  type ColumnHistoryFilter = {
    range: "today" | "7" | "30" | "day" | "custom";
    dayISO?: string;
    fromISO?: string;
    toISO?: string;
  };
  const [columnHistory, setColumnHistory] = useState<Map<string, ColumnHistoryFilter>>(new Map());
  const [columnHistoryRows, setColumnHistoryRows] = useState<
    Map<string, Array<{ demandId: string; lastSeenAt: string; deliveredStage?: string | null }>>
  >(new Map());
  const [columnHistoryLoading, setColumnHistoryLoading] = useState<Set<string>>(new Set());
  const [historyPopoverOpen, setHistoryPopoverOpen] = useState<string | null>(null);
  const [globalHistoryFilter, setGlobalHistoryFilter] = useState<ColumnHistoryFilter | null>(null);
  const [globalHistoryPopoverOpen, setGlobalHistoryPopoverOpen] = useState(false);
  // Modal de reorganização de sequência (agency_manager / super_admin)
  const [reorderModalColumnId, setReorderModalColumnId] = useState<string | null>(null);



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
    if (selectedAreaFilter !== "all") {
      baseCards = baseCards.filter(card => (card.work_area || "midia") === selectedAreaFilter);
    }
    // Ocultar cards diários cuja próxima ocorrência ainda não chegou
    baseCards = baseCards.filter(card => isDailyCardVisibleNow(card as any));
    // Cards com dispatch de publicação ativo NÃO devem poluir a Visão Geral —
    // eles ficam disponíveis apenas em Home → Agendamentos (dispatcher).
    baseCards = baseCards.filter(card => !activeDispatchIds.has(card.id));
    return baseCards;
  }, [cards, archivedCards, selectedClientFilter, selectedPeriodFilter, selectedStatusFilter, selectedAreaFilter, activeDispatchIds]);

  // Aplicar mesmos filtros (cliente/período) nos cards planejados aguardando avaliação.
  // Status não se aplica pois esses cards ainda não são demandas.
  const evalByAssignee = useMemo(() => {
    const filtered = pendingEvalCards.filter((c) => {
      if (selectedClientFilter !== "all" && c.clientId !== selectedClientFilter) return false;
      if (selectedPeriodFilter !== "active" && selectedPeriodFilter !== "all" && c.periodId !== selectedPeriodFilter) return false;
      // Status filter: cards planejados não têm status; se um status específico é exigido, ocultá-los
      if (selectedStatusFilter !== "all") return false;
      return true;
    });
    const map = new Map<string, PendingEvaluationCard[]>();
    filtered.forEach((c) => {
      const key = c.assignedTo || "__unassigned__";
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    });
    return map;
  }, [pendingEvalCards, selectedClientFilter, selectedPeriodFilter, selectedStatusFilter]);

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

      const applyPayload = <T extends KanbanCardData>(card: T): T => ({
        ...card,
        status: newStatusName ?? card.status,
        title: payload.title ?? card.title,
        demand_type: payload.demand_type ?? card.demand_type,
        demand_type_key: payload.demand_type_key ?? card.demand_type_key,
        assigned_to: payload.assigned_to !== undefined ? payload.assigned_to : card.assigned_to,
        current_function_key: payload.current_function_key !== undefined ? payload.current_function_key : card.current_function_key,
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
        client_wait_started_at: payload.client_wait_started_at !== undefined ? payload.client_wait_started_at : card.client_wait_started_at,
        client_resend_count: payload.client_resend_count !== undefined ? payload.client_resend_count : card.client_resend_count,
        client_last_resend_at: payload.client_last_resend_at !== undefined ? payload.client_last_resend_at : card.client_last_resend_at,
      });

      setCards(prevCards => prevCards.map(card => (card.id === demandId ? applyPayload(card) : card)));
      setSelectedCard(prev => {
        if (prev && prev.id === demandId) {
          sonnerToast.info("Este card foi atualizado por outro usuário.", { id: `rt-updated-${demandId}` });
          return applyPayload(prev);
        }
        return prev;
      });
      
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
        additional_assignees: Array.isArray((data as any).additional_assignees) ? ((data as any).additional_assignees as string[]) : [],
        status_color: data.pipeline_statuses?.color || null,
        additional_publish_dates: Array.isArray(data.additional_publish_dates) ? (data.additional_publish_dates as unknown as string[]) : [],
        client_wait_started_at: (data as any).client_wait_started_at ?? null,
        client_resend_count: (data as any).client_resend_count ?? 0,
        client_last_resend_at: (data as any).client_last_resend_at ?? null,
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
        captureColumnScroll(card.assigned_to || "__unassigned__", card.id);
        setSelectedCard(card);
        setIsTaskCardOpen(true);
        // Clean up URL params
        searchParams.delete('highlight');
        searchParams.delete('openCard');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [cards, captureColumnScroll, searchParams, setSearchParams]);

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

      const activeHistoryFallback = new Map<string, string>();
      const awaitingWithoutStarted = (activeData || [])
        .filter((d: any) => d.current_function_key === "aguardando_cliente" && !d.client_wait_started_at)
        .map((d: any) => d.id);

      if (awaitingWithoutStarted.length > 0) {
        const { data: historyRows } = await supabase
          .from("demand_flow_history")
          .select("demand_id, created_at")
          .in("demand_id", awaitingWithoutStarted)
          .eq("from_function_key", "enviar_cliente")
          .eq("to_function_key", "aguardando_cliente")
          .order("created_at", { ascending: false });

        (historyRows || []).forEach((row: any) => {
          if (row.demand_id && row.created_at && !activeHistoryFallback.has(row.demand_id)) {
            activeHistoryFallback.set(row.demand_id, row.created_at);
          }
        });
      }

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
          additional_assignees: Array.isArray((demand as any).additional_assignees) ? ((demand as any).additional_assignees as string[]) : [],
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
          work_area: (demand.work_area as any) || "midia",
          client_wait_started_at: (demand as any).client_wait_started_at ?? null,
          client_resend_count: (demand as any).client_resend_count ?? 0,
          client_last_resend_at: (demand as any).client_last_resend_at ?? null,
          client_sent_at_fallback: activeHistoryFallback.get(demand.id) ?? null,
          reorder_meta: (demand as any).reorder_meta ?? null,
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

  // Calcula o range ISO para uma configuração de histórico de coluna.
  const computeHistoryRange = useCallback((filter: ColumnHistoryFilter): { gte: string; lte?: string } => {
    if (filter.range === "today") {
      // Dia calendário em America/Sao_Paulo (UTC-3, sem DST atualmente).
      const TZ_OFFSET_MIN = -180;
      const now = new Date();
      const spNow = new Date(now.getTime() + (now.getTimezoneOffset() - TZ_OFFSET_MIN) * 60000);
      const y = spNow.getUTCFullYear();
      const m = String(spNow.getUTCMonth() + 1).padStart(2, "0");
      const d = String(spNow.getUTCDate()).padStart(2, "0");
      return { gte: `${y}-${m}-${d}T00:00:00-03:00`, lte: `${y}-${m}-${d}T23:59:59.999-03:00` };
    }
    if (filter.range === "day" && filter.dayISO) {
      return { gte: `${filter.dayISO}T00:00:00-03:00`, lte: `${filter.dayISO}T23:59:59.999-03:00` };
    }
    if (filter.range === "custom" && filter.fromISO) {
      const lte = filter.toISO
        ? `${filter.toISO}T23:59:59.999-03:00`
        : `${filter.fromISO}T23:59:59.999-03:00`;
      return { gte: `${filter.fromISO}T00:00:00-03:00`, lte };
    }
    const days = Number(filter.range) || 7;
    return { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() };
  }, []);

  // Buscar histórico de entregas de UMA coluna (colaborador) específica.
  const fetchColumnHistory = useCallback(async (columnId: string, filter: ColumnHistoryFilter) => {
    if (!tenantId || !columnId) return;
    setColumnHistoryLoading((prev) => {
      const next = new Set(prev);
      next.add(columnId);
      return next;
    });
    try {
      const { gte, lte } = computeHistoryRange(filter);
      let q = supabase
        .from("demand_flow_history" as any)
        .select("demand_id, created_at, from_function_key, to_function_key, action")
        .eq("tenant_id", tenantId)
        .eq("from_user_id", columnId)
        .in("action", ["proceeded", "delivered", "partial_delivered"])
        .gte("created_at", gte);
      if (lte) q = q.lte("created_at", lte);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      // Uma entrada por (card + etapa entregue): a mesma pessoa pode ter entregue
      // etapas diferentes do mesmo card dentro do período.
      const seen = new Map<string, { demandId: string; lastSeenAt: string; deliveredStage?: string | null }>();
      (data || []).forEach((row: any) => {
        const stage = (row.from_function_key as string | null) || null;
        const key = `${row.demand_id}::${stage || "__none__"}`;
        if (!seen.has(key)) {
          seen.set(key, { demandId: row.demand_id, lastSeenAt: row.created_at, deliveredStage: stage });
        }
      });
      const rows = Array.from(seen.values()).sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
      setColumnHistoryRows((prev) => {
        const next = new Map(prev);
        next.set(columnId, rows);
        return next;
      });
    } catch (err) {
      console.error("[flowHistory] column fetch error:", err);
    } finally {
      setColumnHistoryLoading((prev) => {
        const next = new Set(prev);
        next.delete(columnId);
        return next;
      });
    }
  }, [tenantId, computeHistoryRange]);

  // Recarregar todas as colunas ativas quando o filtro mudar.
  useEffect(() => {
    columnHistory.forEach((filter, columnId) => {
      fetchColumnHistory(columnId, filter);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnHistory]);

  useRealtimeDemandFlowHistory({
    tenantId,
    enabled: !!tenantId,
    onInsert: () => {
      columnHistory.forEach((filter, columnId) => fetchColumnHistory(columnId, filter));
      setDeliveriesRefreshKey((k) => k + 1);
    },
  });


  const [flowFunctionNames, setFlowFunctionNames] = useState<Record<string, string>>({});

  const fetchFlowFunctionNames = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("flow_functions")
      .select("function_key, name")
      .eq("tenant_id", tenantId);
    const map: Record<string, string> = {};
    (data || []).forEach((r: any) => { if (r.function_key) map[r.function_key] = r.name; });
    setFlowFunctionNames(map);
  }, [tenantId]);

  useEffect(() => { fetchFlowFunctionNames(); }, [fetchFlowFunctionNames]);

  const FALLBACK_FN_NAMES: Record<string, string> = {
    planejar: "Planejar",
    criar_roteiro: "Criar roteiro",
    criar_arte: "Criar arte",
    captar: "Captar",
    gerar_video: "Gerar vídeo",
    editar_video: "Editar vídeo",
    revisar: "Revisar",
    enviar_cliente: "Enviar cliente",
    aguardando_cliente: "Aguardando cliente",
    publicar: "Publicar",
    revisar_publicacao: "Revisar publicação",
    avaliar: "Avaliar",
  };

  const resolveStageLabel = useCallback((
    card: CentralKanbanCard,
    opts?: { isCurrent?: boolean; isNext?: boolean; isPausedByCaptarNow?: boolean },
  ): string => {
    const key = (card as any).current_function_key as string | null | undefined;
    const base = key
      ? (flowFunctionNames[key] || FALLBACK_FN_NAMES[key] || card.status)
      : card.status;
    const pausedMeta = (card as any).reorder_meta?.pausedByCaptar;
    if (pausedMeta || opts?.isPausedByCaptarNow) return `${base} pausado para captação`;
    if (activeDispatchIds.has(card.id)) return `${base} agendado`;
    if (isClientWaitingFunction(key)) return base;
    if (opts?.isCurrent && key) return `${base} em andamento`;
    if (opts?.isNext && key) return `${base} próximo`;
    return base;
  }, [flowFunctionNames, activeDispatchIds]);

  useRealtimeFlowConfig({
    tenantId,
    enabled: !!tenantId,
    onChange: () => { fetchColumns(); fetchFlowFunctionNames(); },
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
    const previousFunctionKey = card.current_function_key ?? null;

    if (previousAssignedTo === newAssignedTo) return;

    // Resolver etapa alvo para o novo responsável (respeita fluxo + funções permitidas).
    let nextFunctionKey: string | null = previousFunctionKey;
    let functionRemappedWarning = false;
    if (newAssignedTo && tenantId) {
      const resolved = await resolveFunctionForAssignee(
        tenantId,
        newAssignedTo,
        card.demand_type_key ?? null,
        previousFunctionKey,
        card.id,
      );
      if (resolved) {
        nextFunctionKey = resolved;
      } else if (previousFunctionKey) {
        functionRemappedWarning = true;
      }
    } else if (!newAssignedTo) {
      // Sem responsável: limpar etapa (comportamento anterior da coluna __unassigned__).
      nextFunctionKey = null;
    }

    // Optimistic update
    setCards((prev) => prev.map((c) =>
      c.id === draggableId ? { ...c, assigned_to: newAssignedTo, current_function_key: nextFunctionKey } : c
    ));

    try {
      const update: Record<string, any> = {
        assigned_to: newAssignedTo,
        updated_at: new Date().toISOString(),
      };
      if (nextFunctionKey !== previousFunctionKey) {
        update.current_function_key = nextFunctionKey;
      }
      const { error } = await supabase
        .from("demands")
        .update(update)
        .eq("id", card.id);

      if (error) throw error;

      if (tenantId) {
        await recordFlowHistory({
          tenantId,
          demandId: card.id,
          action: "manual_assignment",
          fromUserId: previousAssignedTo,
          toUserId: newAssignedTo,
          fromFunctionKey: previousFunctionKey,
          toFunctionKey: nextFunctionKey,
          metadata: { source: "kanban_drag" },
        });
      }

      const collabName = newAssignedTo
        ? collaborators.find((c) => c.userId === newAssignedTo)?.fullName || "colaborador"
        : "Sem responsável";
      if (functionRemappedWarning) {
        sonnerToast.warning(`${collabName} não tem função compatível — etapa mantida`);
      } else {
        sonnerToast.success(`Atribuída a ${collabName}`);
      }
    } catch (error) {
      console.error("Error updating assigned_to:", error);
      sonnerToast.error("Erro ao atribuir demanda");
      // Revert
      setCards((prev) => prev.map((c) =>
        c.id === draggableId ? { ...c, assigned_to: previousAssignedTo, current_function_key: previousFunctionKey } : c
      ));
    }
  };

  useEffect(() => {
    if (!isTaskCardOpen) restoreSavedScroll();
  }, [isTaskCardOpen, restoreSavedScroll]);

  const handleCardClick = (card: CentralKanbanCard, columnId?: string) => {
    captureColumnScroll(columnId || card.assigned_to || "__unassigned__", card.id);
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

  // Inline dates update from KanbanCard popover
  const handleInlineDatesChange = useCallback(
    async (cardId: string, changes: { due_date?: string | null; due_time?: string | null; delivery_date?: string | null; delivery_time?: string | null }) => {
      try {
        const payload: Record<string, any> = {};
        if ("due_date" in changes) payload.due_date = changes.due_date;
        if ("due_time" in changes) payload.due_time = changes.due_time;
        if ("delivery_date" in changes) payload.delivery_date = changes.delivery_date;
        if ("delivery_time" in changes) payload.delivery_time = changes.delivery_time;
        const { error } = await supabase.from("demands").update(payload).eq("id", cardId);
        if (error) throw error;
        setCards((prev) => prev.map((c) => (c.id === cardId ? ({ ...c, ...payload } as CentralKanbanCard) : c)));
        sonnerToast.success("Datas atualizadas");
      } catch (err: any) {
        console.error("[KanbanCentral] update dates error", err);
        sonnerToast.error(err?.message || "Erro ao atualizar datas");
      }
    },
    [],
  );

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
    if (savingDraftRef.current) return;
    if (!selectedCard) return;
    if (!selectedCard.clientId) {
      sonnerToast.error("Selecione uma empresa");
      return;
    }
    if (!selectedCard.demand_type_key) {
      sonnerToast.error("Defina o tipo da demanda");
      return;
    }
    const isDaily = !!(selectedCard as any).is_daily_card;
    if (!isDaily && !selectedCard.due_date) {
      sonnerToast.error("Defina a data de início de produção");
      return;
    }
    if (isDaily && !(selectedCard as any).daily_start_date) {
      sonnerToast.error("Defina a data de início do Card Diário");
      return;
    }
    if (!selectedCard.title?.trim()) {
      sonnerToast.error("Informe um título");
      return;
    }
    savingDraftRef.current = true;
    setIsSavingDraft(true);
    try {
      const chosenLabel = selectedCard.demand_type || selectedCard.demand_type_key;
      // Para Card Diário, não passamos publish_date/due_date reais (evita herdar data de criação como entrega).
      // A RPC exige due_date apenas se o status inicial requerer; usamos daily_start_date como fallback técnico.
      const dueDateArg = isDaily
        ? ((selectedCard as any).daily_start_date || null)
        : (selectedCard.due_date || null);
      const { data, error } = await supabase.rpc("create_demand_from_template", {
        p_client_id: selectedCard.clientId,
        p_template_id: null,
        p_pipeline_id: null,
        p_status_id: null,
        p_title: selectedCard.title,
        p_description: selectedCard.description || null,
        p_demand_type: chosenLabel,
        p_channel: selectedCard.channel || null,
        p_publish_date: isDaily ? null : (selectedCard.publish_date || null),
        p_due_date: dueDateArg,
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
      if (selectedCard.objective) extra.objective = selectedCard.objective;
      if (selectedCard.instructions) extra.instructions = selectedCard.instructions;
      if (selectedCard.observations) extra.observations = selectedCard.observations;
      if (selectedCard.post_caption) extra.post_caption = selectedCard.post_caption;
      if (selectedCard.assigned_to) extra.assigned_to = selectedCard.assigned_to;

      if (isDaily) {
        // Card Diário: NÃO usar delivery/publish/due — depende só dos campos diários.
        extra.delivery_date = null;
        extra.delivery_time = null;
        extra.publish_time = null;
        extra.due_time = null;
        extra.is_daily_card = true;
        extra.daily_start_date = (selectedCard as any).daily_start_date ?? null;
        extra.daily_end_date = (selectedCard as any).daily_end_date ?? null;
        extra.daily_time = (selectedCard as any).daily_time ?? null;
        extra.daily_exclude_weekends = (selectedCard as any).daily_exclude_weekends ?? true;
        extra.daily_exclude_holidays = (selectedCard as any).daily_exclude_holidays ?? true;
        extra.daily_next_date = (selectedCard as any).daily_next_date ?? (selectedCard as any).daily_start_date ?? null;
        extra.daily_total_occurrences = (selectedCard as any).daily_total_occurrences ?? null;
        extra.daily_completed_occurrences = 0;
        extra.daily_completed_dates = [];
      } else {
        if (selectedCard.delivery_date) extra.delivery_date = selectedCard.delivery_date;
        if (selectedCard.due_time) extra.due_time = selectedCard.due_time;
        if (selectedCard.delivery_time) extra.delivery_time = selectedCard.delivery_time;
        if (selectedCard.publish_time) extra.publish_time = selectedCard.publish_time;
        if (selectedCard.additional_publish_dates?.length) extra.additional_publish_dates = selectedCard.additional_publish_dates;
      }

      await supabase.from("demands").update(extra).eq("id", result.demand_id);

      if (tenantId) {
        await assignInitialResponsible(
          result.demand_id,
          tenantId,
          selectedCard.demand_type_key ?? null,
          { metadataSource: "manual" },
        );
      }

      sonnerToast.success("Demanda criada!");
      setIsDraftMode(false);
      setIsTaskCardOpen(false);
      setSelectedCard(null);
      fetchAllCards();
    } catch (err: any) {
      console.error("Error saving draft demand:", err);
      sonnerToast.error(err?.message || "Erro ao salvar demanda");
    } finally {
      savingDraftRef.current = false;
      setIsSavingDraft(false);
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
    <div className="mt-4 px-3 sm:px-4">
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
          {focusedColumnId && (() => {
            const focusName = collaborators.find((c) => c.userId === focusedColumnId)?.fullName || "Colaborador";
            return (
              <div className="flex items-center gap-2 pl-3 ml-1 border-l border-border/60 animate-fade-in">
                <Focus className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Modo foco: {focusName}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exitFocus}
                  className="h-7 px-2 text-xs"
                  title="Sair do modo foco (Esc)"
                >
                  Sair
                </Button>
              </div>
            );
          })()}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/scheduled")}
            title="Ver todos os conteúdos com publicação agendada"
            className="relative"
          >
            <CalendarDays className="h-4 w-4 mr-1" />
            Conteúdos agendados
            {scheduledCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm"
                aria-label={`${scheduledCount} agendamentos ativos`}
              >
                {scheduledCount > 99 ? "99+" : scheduledCount}
              </span>
            )}
          </Button>
          {/* Evolução das Demandas — seletor rápido de cliente */}
          <Popover
            open={evolutionPopoverOpen}
            onOpenChange={(o) => {
              setEvolutionPopoverOpen(o);
              if (!o) setEvolutionSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                title="Ver a evolução das demandas de um cliente"
              >
                <Activity className="h-4 w-4 mr-1" />
                Evolução das demandas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="text-xs font-semibold text-foreground px-2 py-1">
                Escolha um cliente
              </div>
              <div className="text-[11px] text-muted-foreground px-2 pb-2">
                Abre a evolução das demandas do cliente selecionado.
              </div>
              <Input
                autoFocus
                value={evolutionSearch}
                onChange={(e) => setEvolutionSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="h-8 text-xs mb-2"
              />
              {(() => {
                const counts = new Map<string, { id: string; name: string; count: number }>();
                cards.forEach((c) => {
                  if (!c.clientId) return;
                  const prev = counts.get(c.clientId);
                  if (prev) prev.count += 1;
                  else counts.set(c.clientId, { id: c.clientId, name: c.clientName || "Cliente", count: 1 });
                });
                const term = evolutionSearch.trim().toLowerCase();
                const list = Array.from(counts.values())
                  .filter((c) => !term || c.name.toLowerCase().includes(term))
                  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                if (list.length === 0) {
                  return (
                    <div className="text-[11px] text-muted-foreground px-2 py-3 text-center">
                      Nenhum cliente com demandas ativas.
                    </div>
                  );
                }
                return (
                  <div className="max-h-72 overflow-y-auto -mx-1">
                    {list.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={async () => {
                          setEvolutionPopoverOpen(false);
                          setEvolutionSearch("");
                          try {
                            const { data } = await supabase
                              .from("tenant_companies")
                              .select("id, name, fantasy_name, cnpj_cpf, email, tenant_id, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, mascot_url")
                              .eq("id", c.id)
                              .maybeSingle();
                            if (data) {
                              setSelectedClient(data as any);
                            } else {
                              setSelectedClient({
                                id: c.id,
                                name: c.name,
                                fantasy_name: c.name,
                                cnpj_cpf: "",
                                email: "",
                              } as any);
                            }
                          } catch {
                            setSelectedClient({
                              id: c.id,
                              name: c.name,
                              fantasy_name: c.name,
                              cnpj_cpf: "",
                              email: "",
                            } as any);
                          }
                          navigate("/client-evolution", { state: { from: "/kanban-central" } });
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-xs"
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {c.count} {c.count === 1 ? "ativa" : "ativas"}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </PopoverContent>
          </Popover>
          {/* Registro de Cards global — replica o filtro para todas as colunas */}
          <Popover open={globalHistoryPopoverOpen} onOpenChange={setGlobalHistoryPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={globalHistoryFilter ? "default" : "outline"}
                size="sm"
                title="Registro de cards — o que cada colaborador entregou"
              >
                <History className="h-4 w-4 mr-1" />
                Registro de cards
                {globalHistoryFilter && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {globalHistoryFilter.range === "today"
                      ? "hoje"
                      : globalHistoryFilter.range === "day"
                        ? globalHistoryFilter.dayISO
                        : `${globalHistoryFilter.range}d`}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="text-xs font-semibold text-foreground px-2 py-1">
                Registro em todas as colunas
              </div>
              <div className="text-[11px] text-muted-foreground px-2 pb-2">
                Aplica o mesmo período ao registro de todos os colaboradores.
              </div>
              {[
                { key: "today" as const, label: "Hoje" },
                { key: "7" as const, label: "Últimos 7 dias" },
                { key: "30" as const, label: "Últimos 30 dias" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    const filter = { range: opt.key } as ColumnHistoryFilter;
                    setGlobalHistoryFilter(filter);
                    setColumnHistory((prev) => {
                      const next = new Map(prev);
                      collaborators.forEach((c) => next.set(c.userId, filter));
                      return next;
                    });
                    setGlobalHistoryPopoverOpen(false);
                  }}
                  className={cn(
                    "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                    globalHistoryFilter?.range === opt.key && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <div className="border-t border-border/50 my-2" />
              <div className="px-2 pb-1 text-[11px] text-muted-foreground">Data específica</div>
              <input
                type="date"
                className="w-full text-sm px-2 py-1.5 rounded bg-background border border-border"
                value={globalHistoryFilter?.range === "day" ? (globalHistoryFilter.dayISO || "") : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const filter: ColumnHistoryFilter = { range: "day", dayISO: v };
                  setGlobalHistoryFilter(filter);
                  setColumnHistory((prev) => {
                    const next = new Map(prev);
                    collaborators.forEach((c) => next.set(c.userId, filter));
                    return next;
                  });
                }}
              />
              {globalHistoryFilter && (
                <>
                  <div className="border-t border-border/50 my-2" />
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalHistoryFilter(null);
                      setColumnHistory((prev) => {
                        const next = new Map(prev);
                        collaborators.forEach((c) => next.delete(c.userId));
                        return next;
                      });
                      setColumnHistoryRows((prev) => {
                        const next = new Map(prev);
                        collaborators.forEach((c) => next.delete(c.userId));
                        return next;
                      });
                      setGlobalHistoryPopoverOpen(false);
                    }}
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive"
                  >
                    Desativar registro geral
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>
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
          (selectedAreaFilter !== "all" ? 1 : 0) +
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
                {selectedAreaFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Área: {selectedAreaFilter === "midia" ? "Mídia" : "Sistemas"}
                    <button
                      type="button"
                      onClick={() => setSelectedAreaFilter("all")}
                      className="ml-1 hover:bg-background/40 rounded p-0.5"
                      aria-label="Limpar filtro de área"
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
                    setSelectedAreaFilter("all");
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

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Área</label>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {(["all", "midia", "sistemas"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelectedAreaFilter(opt)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium transition-colors",
                      selectedAreaFilter === opt
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-foreground hover:bg-accent/40"
                    )}
                  >
                    {opt === "all" ? "Todas" : opt === "midia" ? "Mídia" : "Sistemas"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedClientFilter("all");
                setSelectedPeriodFilter("active");
                setSelectedStatusFilter("all");
                setSelectedAreaFilter("all");
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

      <DragDropContext onDragEnd={handleDragEnd}>
        <div ref={boardScrollRef} className="flex gap-4 overflow-x-auto pb-4">
          {(() => {
            const rawColumns: KanbanDisplayColumn[] = [
              ...collaborators.map((c) => ({
                id: c.userId,
                name: c.fullName,
                color: "hsl(var(--primary))",
                userId: c.userId,
              })),
              ...((filteredCards.some((c) => !c.assigned_to && !(c.additional_assignees?.length))
                || (evalByAssignee.get("__unassigned__")?.length ?? 0) > 0)
                ? [{ id: "__unassigned__", name: "Sem responsável", color: "hsl(var(--muted-foreground))", userId: "__unassigned__" }]
                : []),
            ];

            let displayColumns = rawColumns;
            if (focusedColumnId) {
              const target = rawColumns.find((c) => c.userId === focusedColumnId);
              if (target) {
                const userCards = filteredCards.filter((c) =>
                  target.userId === "__unassigned__"
                    ? !c.assigned_to && !(c.additional_assignees?.length)
                    : c.assigned_to === target.userId || (c.additional_assignees?.includes(target.userId) ?? false)
                );
                const _aw = userCards.filter((c) => isClientWaitingFunction(c.current_function_key));
                const _nonAw = userCards.filter((c) => !isClientWaitingFunction(c.current_function_key));
                const _rev = _nonAw.filter((c) => isReviewFunction(c.current_function_key));
                const _prod = _nonAw.filter((c) => !isReviewFunction(c.current_function_key) && !isEvaluationFunction(c.current_function_key));
                const _eval = evalByAssignee.get(target.userId) || [];
                const sub: typeof rawColumns = [];
                if (_prod.length > 0) sub.push({ id: `${target.userId}::production`, name: target.name, color: 'hsl(var(--primary))', userId: target.userId, focusKind: 'production' });
                if (_rev.length > 0) sub.push({ id: `${target.userId}::review`, name: 'Em revisão', color: 'hsl(38 92% 50%)', userId: target.userId, focusKind: 'review' });
                if (_aw.length > 0) sub.push({ id: `${target.userId}::awaiting`, name: 'Aguardando clientes', color: 'hsl(210 90% 55%)', userId: target.userId, focusKind: 'awaiting' });
                if (_eval.length > 0) sub.push({ id: `${target.userId}::evaluate`, name: 'Avaliar', color: 'hsl(280 70% 55%)', userId: target.userId, focusKind: 'evaluate' });
                if (sub.length === 0) sub.push({ id: `${target.userId}::production`, name: target.name, color: 'hsl(var(--primary))', userId: target.userId, focusKind: 'production' });
                displayColumns = sub;
              }
            }

            return displayColumns.map((column, _focusIdx) => {
            const columnUserId = column.userId;
            const focusKind = column.focusKind;
            const columnVisualKey = getKanbanColumnVisualKey(column);
            const columnHistoryFilter = columnHistory.get(columnUserId);
            const isHistoryMode = !!columnHistoryFilter && !focusKind;
            const isHistoryLoadingCol = columnHistoryLoading.has(columnUserId);

            // Cards ATIVOS deste colaborador (modo normal)
            const activeColumnCards = filteredCards.filter((card) => {
              if (columnUserId === "__unassigned__") return !card.assigned_to && !(card.additional_assignees?.length);
              return card.assigned_to === columnUserId || (card.additional_assignees?.includes(columnUserId) ?? false);
            });

            // Cards HISTÓRICOS: todos que já passaram por esse colaborador
            let historyColumnCards: Array<CentralKanbanCard & { _historyAt?: string; _historyStage?: string }> = [];
            if (isHistoryMode) {
              const rows = columnHistoryRows.get(columnUserId) || [];
              const cardIndex = new Map<string, CentralKanbanCard>();
              [...cards, ...archivedCards].forEach((c) => cardIndex.set(c.id, c));
              historyColumnCards = rows
                .map((r) => {
                  const c = cardIndex.get(r.demandId);
                  if (!c) return null;
                  // No Registro, o rótulo deve ser a ETAPA ENTREGUE naquele evento,
                  // não a etapa atual do card (que pode já ter avançado).
                  const stage = r.deliveredStage || c.current_function_key || null;
                  return {
                    ...c,
                    current_function_key: stage,
                    _historyAt: r.lastSeenAt,
                    _historyStage: r.deliveredStage || undefined,
                  } as CentralKanbanCard & { _historyAt?: string; _historyStage?: string };
                })
                .filter((x): x is CentralKanbanCard & { _historyAt?: string; _historyStage?: string } => !!x);
            }

            const allColumnCards = isHistoryMode ? historyColumnCards : activeColumnCards;

            // Aguardando Clientes = cards que estão com/para cliente (apenas modo ativo)
            const awaitingCardsBase = !isHistoryMode
              ? allColumnCards.filter((c) => isClientWaitingFunction(c.current_function_key))
              : [];
            const nonAwaitingCards = !isHistoryMode
              ? allColumnCards.filter((c) => !isClientWaitingFunction(c.current_function_key))
              : allColumnCards;

            // Revisão: agrupar SE houver 3 ou mais cards em função de revisão neste colaborador (só modo ativo)
            const reviewCandidateCards = !isHistoryMode
              ? nonAwaitingCards.filter((c) => isReviewFunction(c.current_function_key))
              : [];
            const shouldGroupReview = reviewCandidateCards.length >= 3;
            const reviewCardsBase = shouldGroupReview ? reviewCandidateCards : [];
            const columnCardsBase = shouldGroupReview
              ? nonAwaitingCards.filter((c) => !isReviewFunction(c.current_function_key))
              : nonAwaitingCards;

            // Avaliar: cards planejados aguardando aprovação atribuídos a esse colaborador
            const evaluateCardsBase = !isHistoryMode
              ? (evalByAssignee.get(columnUserId) || [])
              : [];

            // Aplicar overrides do modo foco (isola exatamente 1 agrupamento por sub-coluna)
            const columnCards = focusKind
              ? (focusKind === 'production' ? nonAwaitingCards.filter((c) => !isReviewFunction(c.current_function_key) && !isEvaluationFunction(c.current_function_key)) : [])
              : columnCardsBase;
            const evaluateCards = focusKind
              ? (focusKind === 'evaluate' ? evaluateCardsBase : [])
              : evaluateCardsBase;
            const awaitingCards = focusKind
              ? (focusKind === 'awaiting' ? awaitingCardsBase : [])
              : awaitingCardsBase;
            const reviewCardsUnsorted = focusKind
              ? (focusKind === 'review' ? reviewCandidateCards : [])
              : reviewCardsBase;

            // --- Ordenação cronológica dos agrupamentos ---
            const startKeyOf = (c: CentralKanbanCard): string =>
              `${c.due_date || "9999-12-31"}T${(c.due_time || "23:59").slice(0, 5)}`;
            const sortChrono = (list: CentralKanbanCard[]) =>
              [...list].sort((a, b) => startKeyOf(a).localeCompare(startKeyOf(b)));
            const reviewCards = sortChrono(reviewCardsUnsorted);
            const awaitingCardsSorted = sortChrono(awaitingCards);
            const evaluateCardsSorted = [...evaluateCards].sort((a, b) =>
              (a.suggestedDate || "9999-12-31").localeCompare(b.suggestedDate || "9999-12-31"));

            // --- "Em andamento" = primeiro card pendente da fila operacional deste colaborador ---
            // A coluna só contém cards pendentes: a entrega remove o card daqui.
            // Ver src/lib/currentWorkCard.ts para a regra completa.
            const { currentId: currentFlowCardId, nextId: nextFlowCardId } = isHistoryMode
              ? { currentId: null as string | null, nextId: null as string | null }
              : resolveCurrentAndNext(activeColumnCards as any[], {
                  now: nowTs,
                  activeDispatchIds,
                  deliveredStagesByCard: deliveredStagesByUser.get(columnUserId),
                });



            const isAwaitingCollapsed = focusKind ? false : !expandedAwaiting.has(column.id);
            const isReviewCollapsed = focusKind ? false : !expandedReview.has(column.id);
            const isEvaluateCollapsed = focusKind ? false : !expandedEvaluate.has(column.id);

            return (
              <Droppable key={column.id} droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={(el) => {
                      provided.innerRef(el);
                      setKanbanColumnRef(columnVisualKey, el);
                    }}
                    {...provided.droppableProps}
                    data-kanban-column-key={columnVisualKey}
                    data-focus-order={_focusIdx}
                    className={cn(
                      "kanban-focus-column flex-shrink-0 w-[280px] bg-muted/30 rounded-xl border border-border/50 flex flex-col",
                      snapshot.isDraggingOver && "border-primary/50 bg-primary/5"
                    )}
                  >

                    {/* Column Header */}
                    <div className="px-3 py-3 flex flex-col border-b border-border/30">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const isFocusToggle = columnUserId !== "__unassigned__" && !isHistoryMode;

                          const nameInner = (
                            <>
                              <span
                                className="h-3 w-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: column.color }}
                              />
                              <span className="text-base font-bold text-foreground truncate">
                                {column.name}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {focusKind
                                  ? (columnCards.length + evaluateCards.length + awaitingCards.length + reviewCards.length)
                                  : allColumnCards.length}
                              </Badge>
                              {isFocusToggle && (
                                <Focus
                                  className={cn(
                                    "h-3.5 w-3.5 flex-shrink-0 ml-auto",
                                    focusKind ? "text-primary" : "text-muted-foreground"
                                  )}
                                />
                              )}
                            </>
                          );
                          if (isFocusToggle) {
                            return (
                              <button
                                type="button"
                                onClick={() => (focusKind ? exitFocus() : enterFocus(columnUserId))}
                                className={cn(
                                  "flex items-center gap-2 flex-1 min-w-0 -mx-1 px-1 py-0.5 rounded-md transition-colors text-left",
                                  focusKind ? "hover:bg-primary/10" : "hover:bg-primary/5"
                                )}
                                title={focusKind ? "Sair do modo foco" : "Clique para focar nesta coluna"}
                                aria-label={focusKind ? "Sair do modo foco" : `Focar em ${column.name}`}
                                aria-pressed={!!focusKind}
                              >
                                {nameInner}
                              </button>
                            );
                          }
                          return <div className="flex items-center gap-2 flex-1 min-w-0">{nameInner}</div>;
                        })()}

                        {columnUserId !== "__unassigned__" && (!focusKind || focusKind === 'production') && (
                          <Popover
                            open={historyPopoverOpen === columnUserId}
                            onOpenChange={(o) => setHistoryPopoverOpen(o ? columnUserId : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  "h-6 w-6 inline-flex items-center justify-center rounded-md transition-colors",
                                  isHistoryMode
                                    ? "text-primary bg-primary/10"
                                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                                )}
                                title="Registro de entregas do colaborador"
                                aria-label={`Registro de entregas: ${column.name}`}
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2" align="end">
                              <div className="text-xs font-semibold text-foreground px-2 py-1">
                                Registro de entregas
                              </div>
                              <div className="text-[11px] text-muted-foreground px-2 pb-2">
                                Mostra apenas o que passou por {column.name}.
                              </div>
                              {[
                                { key: "today" as const, label: "Hoje" },
                                { key: "7" as const, label: "Últimos 7 dias" },
                                { key: "30" as const, label: "Últimos 30 dias" },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => {
                                    setColumnHistory((prev) => {
                                      const next = new Map(prev);
                                      next.set(columnUserId, { range: opt.key });
                                      return next;
                                    });
                                    setHistoryPopoverOpen(null);
                                  }}
                                  className={cn(
                                    "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors",
                                    columnHistoryFilter?.range === opt.key && "bg-primary/10 text-primary font-medium"
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                              <div className="border-t border-border/50 my-2" />
                              <div className="px-2 pb-1 text-[11px] text-muted-foreground">Data específica</div>
                              <input
                                type="date"
                                className="w-full text-sm px-2 py-1.5 rounded bg-background border border-border"
                                value={columnHistoryFilter?.range === "day" ? (columnHistoryFilter.dayISO || "") : ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  setColumnHistory((prev) => {
                                    const next = new Map(prev);
                                    next.set(columnUserId, { range: "day", dayISO: v });
                                    return next;
                                  });
                                }}
                              />
                              {isHistoryMode && (
                                <>
                                  <div className="border-t border-border/50 my-2" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setColumnHistory((prev) => {
                                        const next = new Map(prev);
                                        next.delete(columnUserId);
                                        return next;
                                      });
                                      setColumnHistoryRows((prev) => {
                                        const next = new Map(prev);
                                        next.delete(columnUserId);
                                        return next;
                                      });
                                      setHistoryPopoverOpen(null);
                                    }}
                                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive"
                                  >
                                    Desativar registro
                                  </button>
                                </>
                              )}
                            </PopoverContent>
                          </Popover>
                        )}
                        {columnUserId !== "__unassigned__" && canReorder && !isHistoryMode && (!focusKind || focusKind === 'production') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReorderModalColumnId(columnUserId);
                            }}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Reorganizar sequência (IA)"
                            aria-label={`Reorganizar sequência: ${column.name}`}
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isHistoryMode && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                          <History className="h-3 w-3" />
                          <span className="truncate">
                            Registro —{" "}
                            {columnHistoryFilter?.range === "today"
                              ? "hoje"
                              : columnHistoryFilter?.range === "day"
                                ? columnHistoryFilter.dayISO
                                : columnHistoryFilter?.range === "custom"
                                  ? `${columnHistoryFilter.fromISO} → ${columnHistoryFilter.toISO || columnHistoryFilter.fromISO}`
                                  : `últimos ${columnHistoryFilter?.range} dias`}
                            {isHistoryLoadingCol ? " · carregando..." : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Column Content */}
                    <ScrollArea
                      ref={(el) => setColumnScrollRoot(column.id, el)}
                      className="flex-1 p-2 min-h-[200px] max-h-[calc(100vh-280px)]"
                    >
                      <div className="space-y-2">
                        {(() => {
                          const nowMs = Date.now();
                          const captarDue = (c: CentralKanbanCard): number => {
                            const key = (c.current_function_key || "").toLowerCase();
                            if (key !== "captar" || !c.due_date) return Number.POSITIVE_INFINITY;
                            const t = (c.due_time || "00:00").slice(0, 5);
                            const [y, mo, d] = c.due_date.split("-").map((x) => parseInt(x, 10));
                            const [h, mm] = t.split(":").map((x) => parseInt(x, 10));
                            return new Date(y, (mo || 1) - 1, d || 1, h || 0, mm || 0).getTime();
                          };

                          // R3 real: captar cujo horário já chegou sobe ao TOPO ABSOLUTO da coluna,
                          // fora dos agrupamentos por data.
                          const captarNow: CentralKanbanCard[] = [];
                          const remaining: CentralKanbanCard[] = [];
                          for (const c of columnCards) {
                            const cap = captarDue(c);
                            // No Registro (histórico) não há priorização operacional:
                            // são eventos passados, não fila de trabalho.
                            if (!isHistoryMode && cap !== Number.POSITIVE_INFINITY && cap <= nowMs) {
                              captarNow.push(c);
                            } else {
                              remaining.push(c);
                            }
                          }
                          captarNow.sort((a, b) => captarDue(a) - captarDue(b));

                          // Group cards by chosen date
                          const _todayForGroup = new Date();
                          const _todayISOForGroup = `${_todayForGroup.getFullYear()}-${String(_todayForGroup.getMonth() + 1).padStart(2, "0")}-${String(_todayForGroup.getDate()).padStart(2, "0")}`;
                          const historyDayOf = (c: CentralKanbanCard): string => {
                            const at = (c as any)._historyAt as string | undefined;
                            if (!at) return "__no_date__";
                            const d = new Date(at);
                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          };
                          const groups = new Map<string, CentralKanbanCard[]>();
                          for (const c of remaining) {
                            let key: string;
                            if (isHistoryMode) {
                              key = historyDayOf(c);
                            } else if (dateGroupBy === "start") {
                              const start = c.due_date;
                              const end = c.delivery_date || c.due_date;
                              if (start && start < _todayISOForGroup && end && end >= _todayISOForGroup) {
                                key = _todayISOForGroup;
                              } else {
                                key = start || "__no_date__";
                              }
                            } else {
                              key = c.delivery_date || "__no_date__";
                            }
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key)!.push(c);
                          }
                          const entries = Array.from(groups.entries()).map(([date, items]) => {
                            const sorted = [...items].sort((a, b) => {
                              if (isHistoryMode) {
                                // Registro: mais recentes primeiro, pelo horário da entrega
                                const aAt = ((a as any)._historyAt as string | undefined) || "";
                                const bAt = ((b as any)._historyAt as string | undefined) || "";
                                return bAt.localeCompare(aAt);
                              }
                              // Boost secundário: captar futuros do próprio dia mantêm prioridade dentro do grupo
                              const aCap = captarDue(a);
                              const bCap = captarDue(b);
                              const aActive = aCap <= nowMs ? 0 : 1;
                              const bActive = bCap <= nowMs ? 0 : 1;
                              if (aActive !== bActive) return aActive - bActive;
                              if (aActive === 0 && bActive === 0) return aCap - bCap;
                              const keyOf = (c: CentralKanbanCard) => {
                                const d = (dateGroupBy === "start" ? c.due_date : c.delivery_date) || "9999-12-31";
                                const t = ((dateGroupBy === "start" ? c.due_time : c.delivery_time) || "99:99").slice(0, 5);
                                return `${d}T${t}`;
                              };
                              return keyOf(a).localeCompare(keyOf(b));
                            });
                            return { date, items: sorted };
                          });
                          entries.sort((a, b) => {
                            if (a.date === "__no_date__") return 1;
                            if (b.date === "__no_date__") return -1;
                            return isHistoryMode
                              ? b.date.localeCompare(a.date)
                              : a.date.localeCompare(b.date);
                          });

                          // Prepend pseudo-grupo "Captação · agora" quando houver
                          if (captarNow.length > 0) {
                            entries.unshift({ date: "__captar_now__", items: captarNow });
                          }

                          let runningIndex = -1;
                          let nonCaptarIndex = -1;
                          const _today = new Date();
                          const isoOf = (d: Date) => {
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            return `${y}-${m}-${day}`;
                          };
                          const todayISO = isoOf(_today);
                          const yesterdayISO = isoOf(new Date(_today.getFullYear(), _today.getMonth(), _today.getDate() - 1));
                          const tomorrowISO = isoOf(new Date(_today.getFullYear(), _today.getMonth(), _today.getDate() + 1));
                          const formatHeader = (date: string) => {
                            if (date === "__captar_now__") return "Captação · agora";
                            if (date === "__no_date__") {
                              return dateGroupBy === "start" ? "Sem data de início" : "Sem data de término";
                            }
                            if (date === todayISO) return "Hoje";
                            if (date === yesterdayISO) return "Ontem";
                            if (date === tomorrowISO) return "Amanhã";
                            const [y, m, d] = date.split("-");
                            return `${d}/${m}/${y}`;
                          };

                          return entries.map(({ date, items }) => {
                            const groupKey = `${column.id}::${date}`;
                            const isCollapsed = collapsedDateGroups.has(groupKey);
                            const isCaptarNow = date === "__captar_now__";
                            return (
                            <div key={date} className="space-y-1">
                              <button
                                type="button"
                                onClick={() => toggleDateGroup(groupKey)}
                                className={cn(
                                  "w-full flex items-center gap-2 px-1 pt-1 pb-1 rounded-sm transition-colors",
                                  isCaptarNow
                                    ? "border border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 px-2"
                                    : "border-b border-border/40 hover:bg-muted/40"
                                )}
                                aria-expanded={!isCollapsed}
                                aria-label={isCollapsed ? "Expandir grupo" : "Recolher grupo"}
                              >
                                {isCollapsed ? (
                                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", isCaptarNow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
                                ) : (
                                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", isCaptarNow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
                                )}
                                <CalendarDays className={cn("h-3.5 w-3.5", isCaptarNow ? "text-amber-600 dark:text-amber-400" : "text-primary")} />
                                <span className={cn(
                                  "text-xs font-bold",
                                  isCaptarNow ? "text-amber-700 dark:text-amber-300 uppercase tracking-wide" : "text-foreground"
                                )}>
                                  {formatHeader(date)}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 h-4 ml-auto",
                                    isCaptarNow && "bg-amber-500/25 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                  )}
                                >
                                  {items.length}
                                </Badge>
                              </button>
                              <div className={cn(isCollapsed && "hidden")}>
                              {items.map((card) => {
                                runningIndex += 1;
                                const index = runningIndex;
                                const isTopCard = index === 0;
                                if (!isCaptarNow) nonCaptarIndex += 1;
                                const isTopNonCaptar = !isCaptarNow && nonCaptarIndex === 0;
                                const cardKey = (card.current_function_key || "").toLowerCase();
                                // Só marca como "pausado por captação" o PRIMEIRO card não-captar
                                // da coluna, e apenas se sua data de início já chegou. Cards em
                                // datas futuras não estão pausados — nem começariam ainda.
                                const todayISO = (() => {
                                  const d = new Date();
                                  const y = d.getFullYear();
                                  const m = String(d.getMonth() + 1).padStart(2, "0");
                                  const day = String(d.getDate()).padStart(2, "0");
                                  return `${y}-${m}-${day}`;
                                })();
                                const cardStartsInFuture = !!card.due_date && card.due_date > todayISO;
                                const isPausedByCaptarNow =
                                  !isHistoryMode &&
                                  captarNow.length > 0 &&
                                  isTopNonCaptar &&
                                  !cardStartsInFuture &&
                                  cardKey !== "captar" &&
                                  !isClientWaitingFunction(cardKey) &&
                                  !(card as any).is_daily_card;
                                const syntheticPausedByCaptar = isPausedByCaptarNow
                                  ? {
                                      atTime: (captarNow[0].due_time || "").slice(0, 5),
                                      captarTitle: captarNow[0].title,
                                    }
                                  : null;
                                return (
                                   <Draggable
                                     key={`${card.id}${(card as any)._historyStage ? `::${(card as any)._historyStage}` : ""}`}
                                     draggableId={`${card.id}${(card as any)._historyStage ? `::${(card as any)._historyStage}` : ""}`}
                                     index={index}
                                     isDragDisabled={isHistoryMode}
                                   >
                                    {(provided, snapshot) => {
                                      const isHistory = isHistoryMode;
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
                                           statusName={resolveStageLabel(card, { isCurrent: card.id === currentFlowCardId, isNext: card.id === nextFlowCardId, isPausedByCaptarNow })}
                                            statusColor={card.status_color}
                                            isDailyCard={(card as any).is_daily_card}
                                            dailyCompleted={(card as any).daily_completed_occurrences}
                                            dailyTotal={(card as any).daily_total_occurrences}
                                            dailyNextDate={(card as any).daily_next_date}
                                            workArea={(card as any).work_area || null}
                                            pausedByCaptar={(card as any).reorder_meta?.pausedByCaptar
                                              ? {
                                                  atTime: (card as any).reorder_meta.pausedByCaptar.atTime,
                                                  captarTitle: (card as any).reorder_meta.pausedByCaptar.captarTitle,
                                                }
                                              : syntheticPausedByCaptar}
                                            onClick={() => handleCardClick(card, column.id)}
                                            onDatesChange={isHistory ? undefined : (changes) => handleInlineDatesChange(card.id, changes)}
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

                        {/* Em Revisão — agrupa quando há 3+ cards em função de revisão neste colaborador */}
                        {reviewCards.length > 0 && (
                          <div className="mt-3 pt-2 border-t-2 border-amber-500/60">
                            <button
                              type="button"
                              onClick={() => toggleReview(column.id)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 transition-colors border border-amber-500/40"
                              aria-expanded={!isReviewCollapsed}
                            >
                              {isReviewCollapsed ? (
                                <ChevronRight className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                              )}
                              <span className="text-sm font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                                Em revisão
                              </span>
                              <Badge variant="secondary" className="text-xs px-2 py-0.5 h-5 ml-auto bg-amber-500/25 text-amber-700 dark:text-amber-300 border-amber-500/40 font-bold">
                                {reviewCards.length}
                              </Badge>
                            </button>

                            {!isReviewCollapsed && (
                              <div className="mt-1 space-y-1">
                                {reviewCards.map((card) => (
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
                                      statusName={resolveStageLabel(card, { isCurrent: card.id === currentFlowCardId, isNext: card.id === nextFlowCardId })}
                                      statusColor={(card as any).status_color}
                                      isDailyCard={(card as any).is_daily_card}
                                      dailyCompleted={(card as any).daily_completed_occurrences}
                                      dailyTotal={(card as any).daily_total_occurrences}
                                      dailyNextDate={(card as any).daily_next_date}
                                      workArea={(card as any).work_area || null}
                                      onClick={() => handleCardClick(card, column.id)}
                                      onDatesChange={(changes) => handleInlineDatesChange(card.id, changes)}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
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
                                {awaitingCardsSorted.map((card) => {
                                  const resendCount = (card as any).client_resend_count || 0;
                                  const waitStart = getClientSentAt(card as any);
                                  return (
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
                                      cardId={card.id}
                                      statusName={undefined}
                                      statusColor={(card as any).status_color}
                                      workArea={(card as any).work_area || null}
                                      awaitingClient
                                      awaitingClientSince={waitStart || null}
                                      awaitingClientResendCount={resendCount}
                                      awaitingClientActions={
                                        tenantId ? (
                                          <AwaitingClientActions
                                            demandId={card.id}
                                            tenantId={tenantId}
                                            demandTypeKey={(card as any).demand_type_key || card.demand_type}
                                            currentFunctionKey={card.current_function_key}
                                            onDone={() => fetchAllCards()}
                                          />
                                        ) : null
                                      }
                                      onClick={() => handleCardClick(card, column.id)}
                                    />

                                  </div>
                                  );
                                })}

                              </div>
                            )}
                          </div>
                        )}

                        {/* Avaliar — cards planejados aguardando aprovação atribuídos a esse responsável */}
                        {evaluateCards.length > 0 && (
                          <div className="mt-3 pt-2 border-t-2 border-purple-500/60">
                            <button
                              type="button"
                              onClick={() => toggleEvaluate(column.id)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 transition-colors border border-purple-500/40"
                              aria-expanded={!isEvaluateCollapsed}
                            >
                              {isEvaluateCollapsed ? (
                                <ChevronRight className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0" />
                              )}
                              <ClipboardCheck className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                              <span className="text-sm font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                                Avaliar
                              </span>
                              <Badge variant="secondary" className="text-xs px-2 py-0.5 h-5 ml-auto bg-purple-500/25 text-purple-700 dark:text-purple-300 border-purple-500/40 font-bold">
                                {evaluateCards.length}
                              </Badge>
                            </button>

                            {!isEvaluateCollapsed && (
                              <div className="mt-1 space-y-1">
                                {evaluateCardsSorted.map((ec) => (
                                  <button
                                    type="button"
                                    key={ec.key}
                                    onClick={() => setEvaluateModalCard(ec)}
                                    className="w-full text-left rounded-lg border border-purple-500/30 bg-background hover:border-purple-500/60 hover:bg-purple-500/5 transition-colors p-2.5"
                                  >
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-600/90 dark:text-purple-300/90 mb-0.5 truncate">
                                      {ec.clientName}
                                    </div>
                                    <div className="text-sm font-medium text-foreground break-words line-clamp-2">
                                      {ec.title}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {ec.demandType && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                          {ec.demandType}
                                        </span>
                                      )}
                                      {ec.suggestedDate && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                          {ec.suggestedDate}
                                        </span>
                                      )}
                                      {ec.source === "ultra" && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                          Ultra
                                        </span>
                                      )}
                                    </div>
                                  </button>
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
            });
          })()}
        </div>
      </DragDropContext>

      {/* TaskCard Modal */}
      <EvaluatePlanCardModal
        open={!!evaluateModalCard}
        onOpenChange={(v) => { if (!v) setEvaluateModalCard(null); }}
        card={evaluateModalCard}
        tenantId={tenantId}
        onDone={() => refetchEval()}
      />

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
          }
        }}
        isDraft={isDraftMode}
        onDraftSave={handleDraftSave}
        savingDraft={isSavingDraft}
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

      {/* Reorder Sequence Modal (Gestor Operacional) */}
      {reorderModalColumnId && (
        <ReorderSequenceModal
          open={!!reorderModalColumnId}
          onOpenChange={(o) => !o && setReorderModalColumnId(null)}
          tenantId={tenantId}
          assigneeId={reorderModalColumnId}
          scheduledPublishIds={activeDispatchIds}

          hasActiveFilters={
            selectedClientFilter !== "all" ||
            (selectedPeriodFilter !== "active" && selectedPeriodFilter !== "all") ||
            selectedStatusFilter !== "all" ||
            selectedAreaFilter !== "all"
          }
          columnName={
            collaborators.find((c) => c.userId === reorderModalColumnId)?.fullName || "Coluna"
          }
          cards={cards
            .filter((c) => {
              const belongs =
                c.assigned_to === reorderModalColumnId ||
                (Array.isArray((c as any).additional_assignees) &&
                  (c as any).additional_assignees.includes(reorderModalColumnId));
              if (!belongs) return false;
              // Excluir arquivados e cards com publicação agendada (fora da coluna operacional)
              if ((c as any).isArchived) return false;
              if (activeDispatchIds.has(c.id)) return false;
              return true;
            })

            .map((c) => ({
              id: c.id,
              title: c.title,
              demand_type: c.demand_type,
              demand_type_key: c.demand_type_key,
              is_daily_card: (c as any).is_daily_card,
              publish_date: c.publish_date,
              publish_time: c.publish_time,
              due_date: c.due_date,
              due_time: c.due_time,
              delivery_date: c.delivery_date,
              delivery_time: c.delivery_time,
              current_function_key: c.current_function_key,
              work_area: (c as any).work_area || null,
              updated_at: (c as any).updated_at || null,
            }))}
          onApplied={() => {
            setReorderModalColumnId(null);
            fetchAllCards?.();
          }}
        />
      )}


    </div>
  );
};

export default KanbanCentralPage;