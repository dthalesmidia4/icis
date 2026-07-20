import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Loader2, CalendarDays, Filter, Paperclip, Archive, Calendar, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenant } from "@/contexts/TenantContext";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import { useRealtimeDemands, useRealtimeScheduledDispatches, useDebouncedCallback } from "@/hooks/realtime";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";
import { syncPeriodPlanSnapshot } from "@/lib/syncPeriodPlanItem";

interface CentralKanbanCard extends KanbanCardData {
  clientName: string;
  clientId: string;
  isArchived: boolean;
  dispatch_status?: string | null;
  dispatch_scheduled_at?: string | null;
  dispatch_dispatched_at?: string | null;
}

const Scheduled = () => {
  const navigate = useNavigate();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [allCards, setAllCards] = useState<CentralKanbanCard[]>([]);
  const [activeCards, setActiveCards] = useState<CentralKanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<CentralKanbanCard | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clients = useMemo(() => {
    const uniqueClients = new Map<string, string>();
    activeCards.forEach(card => {
      if (card.clientId && card.clientName) {
        uniqueClients.set(card.clientId, card.clientName);
      }
    });
    return Array.from(uniqueClients.entries()).map(([id, name]) => ({ id, name }));
  }, [activeCards]);

  const filteredCards = useMemo(() => {
    if (selectedClientFilter === "all") return activeCards;
    return activeCards.filter(card => card.clientId === selectedClientFilter);
  }, [activeCards, selectedClientFilter]);

  const handleSearchResultSelect = useCallback((card: CentralKanbanCard) => {
    if (card.isArchived) {
      setSelectedCard(card);
      setIsTaskCardOpen(true);
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

  // Realtime handlers
  const handleRealtimeUpdate = useCallback((itemId: string, attachments: Attachment[]) => {
    const updateFn = (c: CentralKanbanCard) => c.id === itemId ? { ...c, attachments } : c;
    setAllCards(prev => prev.map(updateFn));
    setActiveCards(prev => prev.map(updateFn));
    setSelectedCard(prev => prev && prev.id === itemId ? { ...prev, attachments } : prev);
  }, []);

  useRealtimeAttachments({
    tenantId,
    onAttachmentUpdate: handleRealtimeUpdate,
    enabled: !!tenantId
  });

  // Realtime: refetch quando demandas ou dispatches do tenant mudam
  const debouncedRefetch = useDebouncedCallback(() => {
    fetchScheduledCards();
  }, 300);
  useRealtimeDemands({
    tenantId,
    enabled: !!tenantId,
    onChange: () => debouncedRefetch(),
  });
  useRealtimeScheduledDispatches({
    tenantId,
    enabled: !!tenantId,
    onChange: () => debouncedRefetch(),
  });

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      fetchScheduledCards();
    }
  }, [tenantId, tenantLoading]);

  // Get publication datetime
  // Get publication datetime — prioritize dispatch (real source of truth
  // for what was actually scheduled/published) over the demand's mutable fields.
  const getPublicationDateTime = (card: CentralKanbanCard): Date | null => {
    if (card.dispatch_dispatched_at) return new Date(card.dispatch_dispatched_at);
    if (card.dispatch_scheduled_at) return new Date(card.dispatch_scheduled_at);
    if (card.publish_date) {
      return new Date(`${card.publish_date}T${card.publish_time || '09:00'}:00`);
    }
    if (card.due_date) {
      return new Date(card.due_date + 'T09:00:00');
    }
    return null;
  };

  const getPriorityIndicator = (card: CentralKanbanCard) => {
    const pubDateTime = getPublicationDateTime(card);
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

  const fetchScheduledCards = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      // Etapa 1: buscar todos os dispatches do tenant (inclui sent/failed/canceled p/ histórico)
      const { data: allDispatches, error: dispErr } = await supabase
        .from("scheduled_publication_dispatches")
        .select("card_id, status, scheduled_at")
        .eq("tenant_id", tenantId)
        .in("status", ["scheduled", "dispatching", "sent", "failed", "canceled"]);

      if (dispErr) console.error("[Scheduled] dispatches fetch error", dispErr);

      const dispatchCardIds = Array.from(
        new Set((allDispatches || []).map((d: any) => d?.card_id).filter(Boolean))
      );

      // Etapa 2: buscar demandas — inclui arquivadas somente quando têm dispatch (histórico de publicados)
      const demandsSelect = `
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
        )
      `;

      const orFilter = dispatchCardIds.length > 0
        ? `archived_at.is.null,id.in.(${dispatchCardIds.join(",")})`
        : "archived_at.is.null";

      const { data: demandsData, error } = await supabase
        .from("demands")
        .select(demandsSelect)
        .eq("tenant_id", tenantId)
        .eq("is_draft", false)
        .or(orFilter);

      if (error) throw error;




      // Mantém o dispatch mais recente por card_id
      const dispatchByCard = new Map<string, { status: string; scheduled_at: string | null }>();
      (allDispatches || []).forEach((d: any) => {
        if (!d?.card_id) return;
        const prev = dispatchByCard.get(d.card_id);
        if (!prev) {
          dispatchByCard.set(d.card_id, { status: d.status, scheduled_at: d.scheduled_at ?? null });
        } else {
          const prevTime = prev.scheduled_at ? new Date(prev.scheduled_at).getTime() : 0;
          const currTime = d.scheduled_at ? new Date(d.scheduled_at).getTime() : 0;
          if (currTime >= prevTime) {
            dispatchByCard.set(d.card_id, { status: d.status, scheduled_at: d.scheduled_at ?? null });
          }
        }
      });

      const allMappedCards: CentralKanbanCard[] = (demandsData || [])
        .filter(demand => demand.pipeline_statuses?.name === "Agendar Publicação" || dispatchByCard.has(demand.id))
        .map(demand => {
          const company = demand.tenant_companies;
          const dispatch = dispatchByCard.get(demand.id) || null;
          return {
            id: demand.id,
            title: demand.title,
            description: demand.description || null,
            objective: demand.objective || null,
            instructions: demand.instructions || null,
            observations: demand.observations || null,
            post_caption: demand.post_caption || null,
            status: demand.pipeline_statuses?.name || "Planejamento",
            due_date: demand.due_date || demand.publish_date || new Date().toISOString().split('T')[0],
            channel: demand.channel || null,
            attachments: (demand.attachments as unknown as Attachment[] | null) || [],
            publish_date: demand.publish_date || null,
            publish_time: demand.publish_time || null,
            tenant_id: demand.tenant_id,
            period_plan_id: demand.period_plan_id,
            created_at: demand.created_at,
            updated_at: demand.updated_at,
            clientName: company?.fantasy_name || company?.name || "Cliente",
            clientId: company?.id || demand.client_id || "",
            isArchived: false,
            source: demand.source,
            demand_id: demand.id,
            demand_type: demand.demand_type,
            additional_publish_dates: Array.isArray(demand.additional_publish_dates) ? demand.additional_publish_dates as string[] : [],
            dispatch_status: dispatch?.status ?? null,
          } as CentralKanbanCard & { dispatch_status: string | null };
        });

      // Sort by publication date
      allMappedCards.sort((a, b) => {
        const dateA = getPublicationDateTime(a);
        const dateB = getPublicationDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
      });

      setActiveCards(allMappedCards);
      setAllCards(allMappedCards);
    } catch (error) {
      console.error("Error fetching scheduled cards:", error);
      sonnerToast.error("Erro ao carregar conteúdo programado");
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (card: CentralKanbanCard) => {
    setSelectedCard(card);
    setIsTaskCardOpen(true);
  };

  const handleCardChange = (updatedCard: KanbanCardData) => {
    const updatedCentralCard = {
      ...updatedCard,
      clientName: selectedCard?.clientName || "Cliente",
      clientId: selectedCard?.clientId || ""
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
        } catch {
          parsedValue = value;
        }
      }
      
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (field === 'title') updateData.title = parsedValue;
      else if (field === 'description') updateData.description = parsedValue;
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
        .update(updateData as any)
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

      const updateCard = (c: CentralKanbanCard) => c.id === selectedCard.id ? {
        ...c,
        [field]: parsedValue
      } : c;
      setActiveCards(prev => prev.map(updateCard));
      setAllCards(prev => prev.map(updateCard));

      // Check if card left "Agendar Publicação"
      if (field === 'status' && parsedValue !== 'Agendar Publicação') {
        setActiveCards(prev => prev.filter(c => c.id !== selectedCard.id));
        setAllCards(prev => prev.filter(c => c.id !== selectedCard.id));
        setIsTaskCardOpen(false);
        setSelectedCard(null);
        sonnerToast.info("Demanda removida de Agendar Publicação");
      } else {
        sonnerToast.success("Salvo automaticamente");
      }
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
          periodPlanId: selectedCard.period_plan_id || undefined
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
      const updateFn = (c: CentralKanbanCard) => c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c;
      setActiveCards(prev => prev.map(updateFn));
      setAllCards(prev => prev.map(updateFn));
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
    try {
      const attachment = (selectedCard.attachments || []).find(a => a.url === attachmentUrl);
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
      const updateFn = (c: CentralKanbanCard) => c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c;
      setActiveCards(prev => prev.map(updateFn));
      setAllCards(prev => prev.map(updateFn));
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

      const updateFn = (c: CentralKanbanCard) => c.id === selectedCard.id ? { ...c, attachments } : c;
      setActiveCards(prev => prev.map(updateFn));
      setAllCards(prev => prev.map(updateFn));
    } catch (error) {
      console.error("Error reordering attachments:", error);
      sonnerToast.error("Erro ao reordenar anexos");
    }
  };

  const handleDelete = async () => {
    if (!selectedCard) return;
    setActiveCards(prev => prev.filter(c => c.id !== selectedCard.id));
    setAllCards(prev => prev.filter(c => c.id !== selectedCard.id));
    setIsTaskCardOpen(false);
    setSelectedCard(null);
    sonnerToast.success("Card excluído");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString("pt-BR");
  };

  const extractContentType = (title: string): { type: string; cleanTitle: string } => {
    const fixedTypePatterns: Array<{ pattern: RegExp; displayType: string }> = [
      { pattern: /^Carrossel(?:\s+\w+)?(?:\s*\([^)]+\))?\s*[-–:]\s*/i, displayType: "Carrossel" },
      { pattern: /^(?:Story|Stories)(?:\s*\([^)]+\)|\s+\w+)*\s*[-–:]\s*/i, displayType: "Story" }
    ];
    for (const { pattern, displayType } of fixedTypePatterns) {
      const match = title.match(pattern);
      if (match) {
        return { type: displayType, cleanTitle: title.replace(pattern, '').trim() };
      }
    }

    const modifierPatterns = [
      /^(Reels?)(?:\s+(\w+))?(?:\s*\([^)]+\))?\s*[-–:]\s*/i,
      /^(Post)(?:\s+(\w+))?(?:\s*\([^)]+\))?\s*[-–:]\s*/i,
      /^(Vídeo)(?:\s+([Cc]urto|\w+))?(?:\s*\([^)]+\))?\s*[-–:]\s*/i
    ];
    for (const pattern of modifierPatterns) {
      const match = title.match(pattern);
      if (match) {
        const displayType = match[2] ? match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase() : match[1];
        return { type: displayType, cleanTitle: title.replace(pattern, '').trim() };
      }
    }
    return { type: "Conteúdo", cleanTitle: title };
  };

  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12 mt-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          className="gap-1 -ml-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="p-2 bg-violet-500/10 rounded-lg">
          <CalendarDays className="h-5 w-5 text-violet-500" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          Agendamento
        </h2>
        <Badge variant="secondary">
          {filteredCards.length} {filteredCards.length === 1 ? 'item' : 'itens'}
        </Badge>
      </div>


      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <SmartSearchBar items={allCards} onResultSelect={handleSearchResultSelect} placeholder="Pesquisar por tarefa, cliente, anexo, data, mês, palavra-chave… (inclui arquivados)" maxResults={8} />
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
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Calendar Container */}
      {(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

        // Group cards by day key YYYY-MM-DD (local)
        const cardsByDay = new Map<string, typeof filteredCards>();
        filteredCards.forEach((c) => {
          const dt = getPublicationDateTime(c);
          if (!dt) return;
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
          if (!cardsByDay.has(key)) cardsByDay.set(key, [] as any);
          (cardsByDay.get(key) as any).push(c);
        });

        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const monthLabel = currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

        const cells: Array<{ date: Date | null; key: string }> = [];
        for (let i = 0; i < totalCells; i++) {
          const dayNum = i - startWeekday + 1;
          if (dayNum < 1 || dayNum > daysInMonth) {
            cells.push({ date: null, key: `empty-${i}` });
          } else {
            const d = new Date(year, month, dayNum);
            const k = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            cells.push({ date: d, key: k });
          }
        }

        return (
          <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} aria-label="Mês anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} aria-label="Próximo mês">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const n = new Date();
                  setCurrentMonth(new Date(n.getFullYear(), n.getMonth(), 1));
                }}>
                  Hoje
                </Button>
              </div>
              <h3 className="text-lg font-semibold capitalize">{monthLabel}</h3>
              <div className="w-[180px]" />
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdays.map((w) => (
                <div key={w} className="text-xs font-semibold text-muted-foreground text-center py-1">{w}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                if (!cell.date) {
                  return <div key={cell.key} className="min-h-[110px] bg-muted/10 rounded-md border border-primary/10" />;
                }
                const dayItems = (cardsByDay.get(cell.key) as any as typeof filteredCards) || [];
                const isToday = cell.key === todayKey;
                const hasItems = dayItems.length > 0;
                const visible = dayItems.slice(0, 3);
                const extra = dayItems.length - visible.length;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDay(cell.date!)}
                    className={cn(
                      "min-h-[110px] text-left bg-background rounded-md border-2 p-1.5 flex flex-col gap-1 transition-all hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary",
                      isToday
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : hasItems
                          ? "border-primary/40"
                          : "border-primary/15"
                    )}
                  >
                    <div className={cn("text-xs font-bold self-end px-1", isToday || hasItems ? "text-primary" : "text-muted-foreground")}>
                      {cell.date.getDate()}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {visible.map((c) => {
                        const dt = getPublicationDateTime(c)!;
                        const { cleanTitle } = extractContentType(c.title);
                        return (
                          <div
                            key={c.id}
                            className="text-[10px] leading-tight bg-primary text-primary-foreground rounded px-1 py-0.5 truncate border border-primary/60 shadow-sm"
                            title={`${c.clientName} — ${cleanTitle}`}
                          >
                            <span className="font-bold">{dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            {" "}
                            <span className="opacity-90">{c.clientName}</span>
                            {" · "}
                            <span className="opacity-95">{cleanTitle}</span>
                          </div>
                        );
                      })}
                      {extra > 0 && (
                        <div className="text-[10px] font-semibold text-primary px-1">+{extra} agendamento{extra > 1 ? "s" : ""}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Day Modal */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => { if (!open) setSelectedDay(null); }}>
        <DialogContent className="w-auto max-w-[95vw] sm:max-w-fit max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Agendamentos de {selectedDay ? selectedDay.toLocaleDateString("pt-BR") : ""}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            if (!selectedDay) return null;
            const key = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, "0")}-${String(selectedDay.getDate()).padStart(2, "0")}`;
            const dayItems = filteredCards.filter((c) => {
              const dt = getPublicationDateTime(c);
              if (!dt) return false;
              const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
              return k === key;
            }).sort((a, b) => (getPublicationDateTime(a)!.getTime() - getPublicationDateTime(b)!.getTime()));

            if (dayItems.length === 0) {
              return <p className="text-sm text-muted-foreground py-6 text-center">Nenhum conteúdo agendado para este dia.</p>;
            }
            return (
              <table className="w-auto border-separate border-spacing-0">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="text-left font-semibold px-3 py-2">Horário</th>
                    <th className="text-left font-semibold px-3 py-2">Empresa</th>
                    <th className="text-left font-semibold px-3 py-2">Nome</th>
                    <th className="text-left font-semibold px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dayItems.map((card) => {
                    const dt = getPublicationDateTime(card)!;
                    const { cleanTitle } = extractContentType(card.title);
                    const dispatchStatus = (card as any).dispatch_status as string | null;
                    const statusMeta: Record<string, { label: string; className: string }> = {
                      scheduled: { label: "Agendado", className: "bg-primary/10 text-primary border-primary/30" },
                      dispatching: { label: "Enviando", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
                      sent: { label: "Publicado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
                      failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/30" },
                      canceled: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
                    };
                    const badge = dispatchStatus ? statusMeta[dispatchStatus] : null;
                    return (
                      <tr
                        key={card.id}
                        className="cursor-pointer hover:bg-muted/50 border-t border-border/50"
                        onClick={() => { setSelectedDay(null); handleCardClick(card); }}
                      >
                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          <span className="text-2xl font-bold text-primary tabular-nums">
                            {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-sm text-muted-foreground">
                          {card.clientName}
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap text-sm font-medium text-foreground">
                          {cleanTitle}
                        </td>
                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          {badge ? (
                            <Badge variant="outline" className={cn("text-[10px] font-semibold", badge.className)}>
                              {badge.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* TaskCard Modal */}
      <TaskCard 
        open={isTaskCardOpen} 
        onOpenChange={open => {
          setIsTaskCardOpen(open);
          if (!open) {
            setSelectedCard(null);
            fetchScheduledCards();
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
      />
    </div>
  );
};

export default Scheduled;