import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Settings2
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
}

const KanbanCentralPage = () => {
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [cards, setCards] = useState<CentralKanbanCard[]>([]);
  const [archivedCards, setArchivedCards] = useState<CentralKanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<CentralKanbanCard | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Estado para colunas dinâmicas e modal
  const [columns, setColumns] = useState<PipelineStatus[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [isCreateColumnModalOpen, setIsCreateColumnModalOpen] = useState(false);
  const [isManageColumnsModalOpen, setIsManageColumnsModalOpen] = useState(false);
  const [isCreateDemandModalOpen, setIsCreateDemandModalOpen] = useState(false);

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

  // Filtrar cards por cliente (apenas os ativos - em_andamento)
  const filteredCards = useMemo(() => {
    if (selectedClientFilter === "all") return cards;
    return cards.filter(card => card.clientId === selectedClientFilter);
  }, [cards, selectedClientFilter]);

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

  // Unified realtime handler
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

  useRealtimeAttachments({
    tenantId,
    onAttachmentUpdate: handleRealtimeUpdate,
    enabled: !!tenantId
  });

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      fetchColumns();
      fetchAllCards();
    }
  }, [tenantId, tenantLoading]);

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

  const fetchAllCards = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      const { data: demandsData, error } = await supabase
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
        .order("created_at", { ascending: true });

      if (error) throw error;

      const activeCards: CentralKanbanCard[] = [];
      const archived: CentralKanbanCard[] = [];

      (demandsData || []).forEach(demand => {
        const statusName = demand.pipeline_statuses?.name || "Planejamento";
        const company = demand.tenant_companies;
        const period = demand.period_plans;
        
        const mappedCard: CentralKanbanCard = {
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
          clientName: company?.fantasy_name || company?.name || "Cliente",
          clientId: company?.id || demand.client_id || "",
          periodPlanId: period?.id || "",
          isArchived: period?.operational_status === "concluido",
          source: demand.source,
          demand_id: demand.id,
          demand_type: demand.demand_type
        };

        if (period?.operational_status === 'concluido') {
          archived.push(mappedCard);
        } else if (period?.operational_status === 'em_andamento') {
          activeCards.push(mappedCard);
        }
      });

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

    if (source.droppableId === destination.droppableId) return;

    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    const newColumnName = destination.droppableId;
    const newStatus = getStatusFromColumn(newColumnName);

    // Validação: exigir data de publicação para mover para "Agendar Publicação"
    if (newColumnName === "Agendar Publicação") {
      if (!card.publish_date) {
        sonnerToast.error("Defina uma data de publicação", {
          description: "Para mover para 'Agendar Publicação', defina data e horário primeiro."
        });
        return;
      }
    }

    setCards((prev) =>
      prev.map((c) =>
        c.id === draggableId
          ? { ...c, status: newColumnName }
          : c
      )
    );

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
      else if (field === 'description') demandUpdateData.instructions = parsedValue;
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
        .update(demandUpdateData)
        .eq("id", selectedCard.id);

      if (error) throw error;

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
      <div className="flex items-center justify-between mb-4">
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
                    <div className="px-3 py-3 flex items-center justify-between border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: column.color }}
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {column.name}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {columnCards.length}
                        </Badge>
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
                                  platforms={[card.clientName, card.demand_type || card.channel || ''].filter(Boolean)}
                                  deliveryDate={card.publish_date || card.due_date}
                                  isDragging={snapshot.isDragging}
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
        saving={saving}
        savingField={savingField}
        uploading={uploading}
        pipelineStatuses={columns}
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