import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, CalendarDays, Filter, Paperclip, Archive, Calendar } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenant } from "@/contexts/TenantContext";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PublicationDate } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";

interface CentralKanbanCard extends KanbanCardData {
  clientName: string;
  clientId: string;
  isArchived: boolean;
}
const CentralKanban = () => {
  const {
    tenantId,
    isLoading: tenantLoading
  } = useTenant();
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
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Extrair lista única de clientes (apenas de cards ativos)
  const clients = useMemo(() => {
    const uniqueClients = new Map<string, string>();
    activeCards.forEach(card => {
      if (card.clientId && card.clientName) {
        uniqueClients.set(card.clientId, card.clientName);
      }
    });
    return Array.from(uniqueClients.entries()).map(([id, name]) => ({
      id,
      name
    }));
  }, [activeCards]);

  // Filtrar cards ativos por cliente (para exibição)
  const filteredCards = useMemo(() => {
    if (selectedClientFilter === "all") return activeCards;
    return activeCards.filter(card => card.clientId === selectedClientFilter);
  }, [activeCards, selectedClientFilter]);

  // Handle search result selection - scroll to and highlight card, or open modal for archived
  const handleSearchResultSelect = useCallback((card: CentralKanbanCard) => {
    // If card is archived, open it directly in the modal
    if (card.isArchived) {
      setSelectedCard(card);
      setIsTaskCardOpen(true);
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
      fetchScheduledCards();
    }
  }, [tenantId, tenantLoading]);
  // Função para obter a primeira data de publicação
  const getFirstPublicationDateTime = (card: CentralKanbanCard): Date | null => {
    const pubDates = card.publication_dates;
    if (!pubDates || pubDates.length === 0) {
      // Fallback para delivery_date se não tiver publication_dates
      if (card.delivery_date) {
        return new Date(card.delivery_date + 'T09:00:00');
      }
      return null;
    }
    
    const sortedDates = [...pubDates]
      .filter(pd => pd.date)
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time || '09:00'}`);
        const dateB = new Date(`${b.date}T${b.time || '09:00'}`);
        return dateA.getTime() - dateB.getTime();
      });
    
    if (sortedDates.length === 0) {
      if (card.delivery_date) {
        return new Date(card.delivery_date + 'T09:00:00');
      }
      return null;
    }
    
    const first = sortedDates[0];
    return new Date(`${first.date}T${first.time || '09:00'}`);
  };

  // Função para obter indicador de prioridade baseado na data/hora de publicação
  const getPriorityIndicator = (card: CentralKanbanCard): { label: string; className: string } | null => {
    const pubDateTime = getFirstPublicationDateTime(card);
    if (!pubDateTime) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const pubDate = new Date(pubDateTime.getFullYear(), pubDateTime.getMonth(), pubDateTime.getDate());
    
    // Atrasado: data de publicação é anterior a hoje OU é hoje mas o horário já passou
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

      // Buscar cards na coluna "Agendar Publicação" com informações do cliente e status do planejamento
      const {
        data: cardsData,
        error: cardsError
      } = await supabase.from("cards").select(`
          *,
          period_plans!cards_period_plan_id_fkey (
            company_id,
            operational_status,
            tenant_companies!period_plans_company_id_fkey (
              id,
              fantasy_name,
              name
            )
          )
        `).eq("tenant_id", tenantId).eq("column_name", "Agendar Publicação");
      if (cardsError) throw cardsError;

      // Mapear cards com nome do cliente e status de arquivamento
      const mappedCards: CentralKanbanCard[] = (cardsData || []).map(card => {
        const company = card.period_plans?.tenant_companies;
        const operationalStatus = card.period_plans?.operational_status;
        return {
          ...card,
          attachments: card.attachments as unknown as Attachment[] | null || [],
          publication_dates: card.publication_dates as unknown as PublicationDate[] | null || [],
          clientName: company?.fantasy_name || company?.name || "Cliente",
          clientId: company?.id || "",
          isArchived: operationalStatus === "concluido"
        };
      });

      // Ordenar por data de publicação mais próxima
      mappedCards.sort((a, b) => {
        const dateA = getFirstPublicationDateTime(a);
        const dateB = getFirstPublicationDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
      });

      // Separar cards ativos e arquivados
      const active = mappedCards.filter(card => !card.isArchived);
      const all = mappedCards;

      setActiveCards(active);
      setAllCards(all);
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
      if (field === 'publication_dates' || field === 'attachments') {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }
      }
      const {
        error
      } = await supabase.from("cards").update({
        [field]: parsedValue
      }).eq("id", selectedCard.id);
      if (error) throw error;

      // Atualizar estado local
      const updateCard = (c: CentralKanbanCard) => 
        c.id === selectedCard.id ? { ...c, [field]: parsedValue } : c;
      
      setActiveCards(prev => prev.map(updateCard));
      setAllCards(prev => prev.map(updateCard));

      // Verificar se o card saiu da coluna "Agendar Publicação"
      if (field === 'column_name' && parsedValue !== 'Agendar Publicação') {
        // Remover do kanban central
        setActiveCards(prev => prev.filter(c => c.id !== selectedCard.id));
        setAllCards(prev => prev.filter(c => c.id !== selectedCard.id));
        setIsTaskCardOpen(false);
        setSelectedCard(null);
        sonnerToast.info("Card removido de Agendar Publicação");
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
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      sonnerToast.error("Arquivo muito grande. Limite de 50MB.");
      event.target.value = '';
      return;
    }
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
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
        const {
          error
        } = await supabase.storage.from('card-attachments').upload(storagePath, file);
        if (error) throw error;
        const {
          data: urlData
        } = supabase.storage.from('card-attachments').getPublicUrl(storagePath);
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
          periodPlanId: selectedCard.period_plan_id || undefined
        };
        return attachment;
      });
      const newAttachments = await Promise.all(uploadPromises);
      const updatedAttachments = [...(selectedCard.attachments || []), ...newAttachments];
      const {
        error: updateError
      } = await supabase.from('cards').update({
        attachments: updatedAttachments as unknown as any
      }).eq('id', selectedCard.id);
      if (updateError) throw updateError;
      setSelectedCard(prev => prev ? {
        ...prev,
        attachments: updatedAttachments
      } : null);
      const updateAttachments = (c: CentralKanbanCard) => 
        c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c;
      setActiveCards(prev => prev.map(updateAttachments));
      setAllCards(prev => prev.map(updateAttachments));
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
      const {
        error
      } = await supabase.from('cards').update({
        attachments: updatedAttachments as unknown as any
      }).eq('id', selectedCard.id);
      if (error) throw error;
      setSelectedCard(prev => prev ? {
        ...prev,
        attachments: updatedAttachments
      } : null);
      const updateAttachments = (c: CentralKanbanCard) => 
        c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c;
      setActiveCards(prev => prev.map(updateAttachments));
      setAllCards(prev => prev.map(updateAttachments));
      sonnerToast.success("Anexo removido");
    } catch (error) {
      console.error("Error removing attachment:", error);
      sonnerToast.error("Erro ao remover anexo");
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
  const extractContentType = (title: string): {
    type: string;
    cleanTitle: string;
  } => {
    const patterns = [/^(Reels?(?:\s*\([^)]+\))?)\s*[-–:]\s*/i, /^(Carrossel(?:\s*\([^)]+\))?)\s*[-–:]\s*/i, /^(Post(?:\s*\([^)]+\))?)\s*[-–:]\s*/i, /^(Story|Stories(?:\s*\([^)]+\))?)\s*[-–:]\s*/i, /^(Vídeo(?:\s+[Cc]urto)?(?:\s*\([^)]+\))?)\s*[-–:]\s*/i];
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return {
          type: match[1],
          cleanTitle: title.replace(pattern, '').trim()
        };
      }
    }
    return {
      type: "Conteúdo",
      cleanTitle: title
    };
  };
  if (tenantLoading || loading) {
    return <div className="flex items-center justify-center py-12 mt-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>;
  }
  return <div className="mt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
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

      {/* Search Bar and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <SmartSearchBar
            items={allCards}
            onResultSelect={handleSearchResultSelect}
            placeholder="Pesquisar por tarefa, cliente, anexo, data, mês, palavra-chave… (inclui arquivados)"
            maxResults={8}
          />
        </div>

        {/* Client Filter */}
        {clients.length > 0 && <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por cliente">
                <SelectValue placeholder="Filtrar por cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(client => <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>}
      </div>

      {/* Cards Container */}
      <div className="bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[300px]">

        {/* Cards List */}
        {filteredCards.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">
              {selectedClientFilter === "all" ? "Nenhum conteúdo aguardando agendamento" : "Nenhum conteúdo para agendar para este cliente"}
            </p>
            <p className="text-xs mt-1 opacity-70">
              Mova demandas para "Agendar Publicação" nos kanbans dos clientes
            </p>
          </div> : <div className="flex flex-col gap-2">
            {filteredCards.map(card => {
          const {
            cleanTitle,
            type: contentType
          } = extractContentType(card.title);
          const isHighlighted = highlightedCardId === card.id;
          const priority = getPriorityIndicator(card);
          const firstPubDate = getFirstPublicationDateTime(card);
          
          return (
            <div 
              key={card.id}
              ref={(el) => {
                if (el) cardRefs.current.set(card.id, el);
                else cardRefs.current.delete(card.id);
              }}
              className={cn(
                "flex items-center justify-between gap-4 px-4 py-3 bg-background rounded-lg border cursor-pointer hover:bg-muted/50 transition-all duration-300 group",
                isHighlighted 
                  ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-lg scale-[1.02]" 
                  : "border-border/50"
              )}
              onClick={() => handleCardClick(card)}
            >
              {/* Left side: Priority, Company, Content Type, Title */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {priority && (
                  <Badge className={cn("text-[10px] px-2 py-0.5 font-medium whitespace-nowrap", priority.className)}>
                    {priority.label}
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {card.clientName}
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {contentType}
                </span>
                <span className={cn(
                  "text-sm font-medium truncate",
                  isHighlighted ? "text-primary" : "text-foreground"
                )}>
                  {cleanTitle}
                </span>
              </div>
              
              {/* Right side: Attachments indicator + Date + Schedule Button */}
              <div className="flex items-center gap-3 shrink-0">
                {card.attachments && card.attachments.length > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Paperclip className="h-4 w-4" />
                    <span className="text-xs">{card.attachments.length}</span>
                  </div>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/80 rounded-md border border-border/50 cursor-default">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                          {firstPubDate ? firstPubDate.toLocaleDateString("pt-BR") + " " + firstPubDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : formatDate(card.delivery_date)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">
                        {firstPubDate 
                          ? firstPubDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                          : new Date(card.delivery_date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick(card);
                  }}
                >
                  Publicar
                </Button>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          );
        })}
          </div>}
      </div>

      {/* TaskCard Modal */}
      <TaskCard open={isTaskCardOpen} onOpenChange={open => {
      setIsTaskCardOpen(open);
      if (!open) {
        setSelectedCard(null);
        fetchScheduledCards();
      }
    }} card={selectedCard} onCardChange={handleCardChange} onSave={handleSave} onFileUpload={handleFileUpload} onRemoveAttachment={handleRemoveAttachment} onDelete={handleDelete} saving={saving} savingField={savingField} uploading={uploading} />
    </div>;
};
export default CentralKanban;