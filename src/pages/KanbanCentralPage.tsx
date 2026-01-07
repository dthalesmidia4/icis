import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight, 
  Loader2, 
  Filter, 
  Paperclip, 
  LayoutGrid,
  Archive,
  Search
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import TaskCard, { getColumnFromStatus, getStatusFromColumn } from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PublicationDate } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import KanbanCard from "@/components/KanbanCard";
import { ScrollArea } from "@/components/ui/scroll-area";

// Colunas do Kanban (mesma estrutura do Schedule)
const COLUMNS = [
  { id: "Produção", title: "Produção", color: "bg-amber-500" },
  { id: "Revisão", title: "Revisão", color: "bg-emerald-500" },
  { id: "Agendar Publicação", title: "Agendar Publicação", color: "bg-cyan-500" },
];

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

  // Handle search result selection - scroll to and highlight card
  const handleSearchResultSelect = useCallback((card: CentralKanbanCard) => {
    // Se for um card arquivado, mostrar toast informativo
    if (card.isArchived) {
      sonnerToast.info(
        "Card de período concluído",
        { description: `Este card pertence a um período já concluído. Ele não aparece no kanban mas está salvo no banco de dados.` }
      );
      return;
    }

    // If card is filtered out, clear the filter first
    if (selectedClientFilter !== "all" && card.clientId !== selectedClientFilter) {
      setSelectedClientFilter("all");
    }
    
    // Highlight the card
    setHighlightedCardId(card.id);
    
    // Scroll to the card after a short delay to allow filter change
    setTimeout(() => {
      const cardElement = cardRefs.current.get(card.id);
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      setHighlightedCardId(null);
    }, 3000);
  }, [selectedClientFilter]);

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      fetchAllCards();
    }
  }, [tenantId, tenantLoading]);

  const fetchAllCards = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      // Buscar todos os cards com informações do período e cliente
      // Filtrando apenas os que pertencem a períodos com operational_status = 'em_andamento'
      const { data: activeCardsData, error: activeError } = await supabase
        .from("cards")
        .select(`
          *,
          period_plans!cards_period_plan_id_fkey (
            id,
            operational_status,
            company_id,
            tenant_companies!period_plans_company_id_fkey (
              id,
              fantasy_name,
              name
            )
          )
        `)
        .eq("tenant_id", tenantId)
        .order("delivery_date", { ascending: true });

      if (activeError) throw activeError;

      // Separar cards ativos (em_andamento) e arquivados (concluido)
      const activeCards: CentralKanbanCard[] = [];
      const archived: CentralKanbanCard[] = [];

      (activeCardsData || []).forEach(card => {
        const period = card.period_plans;
        const company = period?.tenant_companies;
        const mappedCard: CentralKanbanCard = {
          ...card,
          attachments: card.attachments as unknown as Attachment[] | null || [],
          publication_dates: card.publication_dates as unknown as PublicationDate[] | null || [],
          clientName: company?.fantasy_name || company?.name || "Cliente",
          clientId: company?.id || "",
          periodPlanId: period?.id || "",
          isArchived: false
        };

        // Separar por status operacional do período
        if (period?.operational_status === 'em_andamento') {
          activeCards.push(mappedCard);
        } else if (period?.operational_status === 'concluido') {
          archived.push({ ...mappedCard, isArchived: true });
        }
        // Cards de períodos 'em_planejamento' não aparecem no kanban central
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
      const hasValidPublicationDate = card.publication_dates?.some(pd => pd.date && pd.time) || false;
      const hasDeliveryDate = !!card.delivery_date;
      
      if (!hasValidPublicationDate && !hasDeliveryDate) {
        sonnerToast.error("Defina uma data de publicação", {
          description: "Para mover para 'Agendar Publicação', defina data e horário primeiro."
        });
        return;
      }
    }

    // Atualizar localmente
    setCards((prev) =>
      prev.map((c) =>
        c.id === draggableId
          ? { ...c, column_name: newColumnName, status: newStatus }
          : c
      )
    );

    // Atualizar no banco
    try {
      const { error } = await supabase
        .from("cards")
        .update({ column_name: newColumnName, status: newStatus })
        .eq("id", draggableId);

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
      if (field === 'publication_dates' || field === 'attachments') {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }
      }
      
      const updateData: Record<string, any> = { [field]: parsedValue };
      
      // If status changes, also update the column_name to sync with Kanban
      if (field === 'status') {
        const newColumnName = getColumnFromStatus(value);
        updateData.column_name = newColumnName;
      }
      
      const { error } = await supabase.from("cards").update(updateData).eq("id", selectedCard.id);
      if (error) throw error;

      // Atualizar estado local (include column_name if status changed)
      setCards(prev => prev.map(c => {
        if (c.id === selectedCard.id) {
          const updates: Partial<CentralKanbanCard> = { [field]: parsedValue };
          if (field === 'status') {
            updates.column_name = getColumnFromStatus(value);
          }
          return { ...c, ...updates };
        }
        return c;
      }));

      // Also update selectedCard to keep modal in sync
      if (field === 'status') {
        setSelectedCard(prev => prev ? { 
          ...prev, 
          status: value, 
          column_name: getColumnFromStatus(value) 
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
      const { error: updateError } = await supabase.from('cards').update({
        attachments: updatedAttachments as unknown as any
      }).eq('id', selectedCard.id);
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
    try {
      const attachment = (selectedCard.attachments || []).find(a => a.url === attachmentUrl);
      if (attachment?.storagePath) {
        await supabase.storage.from('card-attachments').remove([attachment.storagePath]);
      }
      const updatedAttachments = (selectedCard.attachments || []).filter(a => a.url !== attachmentUrl);
      const { error } = await supabase.from('cards').update({
        attachments: updatedAttachments as unknown as any
      }).eq('id', selectedCard.id);
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

  const handleDelete = async () => {
    if (!selectedCard) return;
    try {
      const { error } = await supabase.from("cards").delete().eq("id", selectedCard.id);
      if (error) throw error;
      
      setCards(prev => prev.filter(c => c.id !== selectedCard.id));
      setIsTaskCardOpen(false);
      setSelectedCard(null);
      sonnerToast.success("Card excluído");
    } catch (error) {
      console.error("Error deleting card:", error);
      sonnerToast.error("Erro ao excluir card");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString("pt-BR");
  };

  // Função auxiliar para obter a próxima data de publicação de um card
  const getNextPublicationDateTime = (card: CentralKanbanCard): Date | null => {
    const pubDates = card.publication_dates;
    if (!pubDates || pubDates.length === 0) {
      if (card.delivery_date) {
        return new Date(card.delivery_date + 'T09:00:00');
      }
      return null;
    }
    
    const now = new Date();
    const sortedDates = [...pubDates]
      .filter(pd => pd.date)
      .map(pd => new Date(`${pd.date}T${pd.time || '09:00'}:00`))
      .sort((a, b) => a.getTime() - b.getTime());
    
    const futureDate = sortedDates.find(d => d.getTime() >= now.getTime());
    return futureDate || sortedDates[0] || null;
  };

  // Função para calcular a prioridade baseada na data de publicação
  const getPublicationPriority = (card: CentralKanbanCard): { label: string; className: string } | null => {
    const pubDate = getNextPublicationDateTime(card);
    if (!pubDate) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const pubDateDay = new Date(pubDate.getFullYear(), pubDate.getMonth(), pubDate.getDate());
    
    if (pubDateDay.getTime() < today.getTime()) {
      return { label: "Atrasado", className: "bg-destructive/10 text-destructive border-destructive/30" };
    }
    if (pubDateDay.getTime() === today.getTime()) {
      return { label: "Hoje", className: "bg-orange-500/10 text-orange-600 border-orange-500/30" };
    }
    if (pubDateDay.getTime() === tomorrow.getTime()) {
      return { label: "Amanhã", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
    }
    if (pubDateDay.getTime() < in3Days.getTime()) {
      return { label: "Próximos dias", className: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" };
    }
    return null;
  };

  // Agrupar cards por coluna com ordenação especial para "Agendar Publicação"
  const getCardsForColumn = (columnId: string) => {
    let columnCards = filteredCards.filter(card => card.column_name === columnId);
    
    // Ordenar cards da coluna "Agendar Publicação" por data/hora de publicação
    if (columnId === "Agendar Publicação") {
      columnCards = columnCards.sort((a, b) => {
        const dateA = getNextPublicationDateTime(a);
        const dateB = getNextPublicationDateTime(b);
        
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        
        return dateA.getTime() - dateB.getTime();
      });
    }
    
    return columnCards;
  };

  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12 mt-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackButton to="/home" />
      
      <div className="mt-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <LayoutGrid className="h-5 w-5 text-cyan-500" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Kanban Central
          </h2>
          <Badge variant="secondary">
            {filteredCards.length} {filteredCards.length === 1 ? 'demanda' : 'demandas'}
          </Badge>
          {archivedCards.length > 0 && (
            <Badge variant="outline" className="ml-2 gap-1">
              <Archive className="h-3 w-3" />
              {archivedCards.length} arquivado(s)
            </Badge>
          )}
        </div>

        {/* Search Bar and Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex-1">
            <SmartSearchBar
              items={allSearchableCards}
              onResultSelect={handleSearchResultSelect}
              placeholder="Pesquisar demandas (inclui arquivados)..."
              maxResults={10}
            />
          </div>

          {/* Client Filter */}
          {clients.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
                <SelectTrigger className="w-[200px]">
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

        {/* Kanban Board with Drag & Drop */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUMNS.map((column) => {
              const columnCards = getCardsForColumn(column.id);
              return (
                <div key={column.id} className="bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[500px] flex flex-col">
                  {/* Column Header */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                    <div className={cn("w-3 h-3 rounded-full", column.color)} />
                    <span className="font-semibold text-foreground text-sm">{column.title}</span>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {columnCards.length}
                    </Badge>
                  </div>

                  {/* Droppable Area */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <ScrollArea className="flex-1">
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "min-h-[300px] transition-colors rounded-lg p-1",
                            snapshot.isDraggingOver && "bg-primary/5"
                          )}
                        >
                          {columnCards.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                              Nenhuma demanda
                            </div>
                          ) : (
                            columnCards.map((card, index) => {
                              const isHighlighted = highlightedCardId === card.id;
                              const priority = column.id === "Agendar Publicação" ? getPublicationPriority(card) : null;
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
                                        "mb-2 transition-all duration-300",
                                        isHighlighted && "ring-2 ring-primary ring-offset-2 scale-[1.02]"
                                      )}
                                      onClick={() => handleCardClick(card)}
                                    >
                                      {/* Card Content */}
                                      <div className={cn(
                                        "p-3 bg-background rounded-lg border cursor-pointer hover:shadow-md transition-all",
                                        snapshot.isDragging ? "shadow-xl rotate-1 scale-105 border-primary" : "border-border/50",
                                        isHighlighted && "border-primary bg-primary/5"
                                      )}>
                                        {/* Priority Badge (only for Agendar Publicação column) */}
                                        {priority && (
                                          <div className="mb-2">
                                            <Badge 
                                              variant="outline" 
                                              className={cn("text-[10px] px-2 py-0.5 font-semibold", priority.className)}
                                            >
                                              {priority.label}
                                            </Badge>
                                          </div>
                                        )}
                                        
                                        {/* Client Badge */}
                                        <Badge 
                                          variant="secondary" 
                                          className="text-[10px] px-2 py-0.5 mb-2 bg-primary/10 text-primary border-primary/20 font-medium"
                                        >
                                          {card.clientName}
                                        </Badge>
                                        
                                        {/* Title */}
                                        <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground mb-2">
                                          {card.title}
                                        </h4>
                                        
                                        {/* Footer: Date + Time + Attachments */}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                          <div className="flex items-center gap-1">
                                            <span>{formatDate(card.delivery_date)}</span>
                                            {column.id === "Agendar Publicação" && card.publication_dates?.[0]?.time && (
                                              <span className="text-muted-foreground/70">• {card.publication_dates[0].time}</span>
                                            )}
                                          </div>
                                          {card.attachments && card.attachments.length > 0 && (
                                            <div className="flex items-center gap-1">
                                              <Paperclip className="h-3 w-3" />
                                              {card.attachments.length}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })
                          )}
                          {provided.placeholder}
                        </div>
                      </ScrollArea>
                    )}
                  </Droppable>
                </div>
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
          onDelete={handleDelete}
          saving={saving}
          savingField={savingField}
          uploading={uploading}
        />
      </div>
    </div>
  );
};

export default KanbanCentralPage;
