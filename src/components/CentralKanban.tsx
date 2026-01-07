import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Badge } from "@/components/ui/badge";
import { ChevronRight, Loader2, CheckCircle2, Filter, Paperclip } from "lucide-react";
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
}
const CentralKanban = () => {
  const {
    tenantId,
    isLoading: tenantLoading
  } = useTenant();
  const [cards, setCards] = useState<CentralKanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<CentralKanbanCard | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Extrair lista única de clientes
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

  // Filtrar cards por cliente
  const filteredCards = useMemo(() => {
    if (selectedClientFilter === "all") return cards;
    return cards.filter(card => card.clientId === selectedClientFilter);
  }, [cards, selectedClientFilter]);

  // Handle search result selection - scroll to and highlight card
  const handleSearchResultSelect = useCallback((card: CentralKanbanCard) => {
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
    if (!pubDates || pubDates.length === 0) return null;
    
    const sortedDates = [...pubDates].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
      return dateA.getTime() - dateB.getTime();
    });
    
    const first = sortedDates[0];
    return new Date(`${first.date}T${first.time || '00:00'}`);
  };

  // Função para obter indicador de prioridade
  const getPriorityIndicator = (card: CentralKanbanCard): { label: string; className: string } | null => {
    const pubDateTime = getFirstPublicationDateTime(card);
    if (!pubDateTime) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pubDate = new Date(pubDateTime.getFullYear(), pubDateTime.getMonth(), pubDateTime.getDate());
    
    if (pubDateTime < now) {
      return { label: "Atrasado", className: "bg-red-500/20 text-red-600 border-red-500/30" };
    } else if (pubDate.getTime() === today.getTime()) {
      return { label: "Publica hoje", className: "bg-orange-500/20 text-orange-600 border-orange-500/30" };
    } else if (pubDate.getTime() === tomorrow.getTime()) {
      return { label: "Publica amanhã", className: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30" };
    } else {
      return { label: "Próximos dias", className: "bg-blue-500/20 text-blue-600 border-blue-500/30" };
    }
  };

  const fetchScheduledCards = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      // Buscar cards na coluna "Agendar Publicação" com informações do cliente
      const {
        data: cardsData,
        error: cardsError
      } = await supabase.from("cards").select(`
          *,
          period_plans!cards_period_plan_id_fkey (
            company_id,
            tenant_companies!period_plans_company_id_fkey (
              id,
              fantasy_name,
              name
            )
          )
        `).eq("tenant_id", tenantId).eq("column_name", "Agendar Publicação");
      if (cardsError) throw cardsError;

      // Mapear cards com nome do cliente
      const mappedCards: CentralKanbanCard[] = (cardsData || []).map(card => {
        const company = card.period_plans?.tenant_companies;
        return {
          ...card,
          attachments: card.attachments as unknown as Attachment[] | null || [],
          publication_dates: card.publication_dates as unknown as PublicationDate[] | null || [],
          clientName: company?.fantasy_name || company?.name || "Cliente",
          clientId: company?.id || ""
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

      setCards(mappedCards);
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
      setCards(prev => prev.map(c => c.id === selectedCard.id ? {
        ...c,
        [field]: parsedValue
      } : c));

      // Verificar se o card saiu da coluna "Agendar Publicação"
      if (field === 'column_name' && parsedValue !== 'Agendar Publicação') {
        // Remover do kanban central
        setCards(prev => prev.filter(c => c.id !== selectedCard.id));
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
    setCards(prev => prev.filter(c => c.id !== selectedCard.id));
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
        <div className="p-2 bg-amber-500/10 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-amber-500" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          Agendar Publicação
        </h2>
        <Badge variant="secondary">
          {filteredCards.length} {filteredCards.length === 1 ? 'item' : 'itens'}
        </Badge>
      </div>

      {/* Search Bar and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <SmartSearchBar
            items={cards}
            onResultSelect={handleSearchResultSelect}
            placeholder="Pesquisar por tarefa, cliente, anexo, data, mês, palavra-chave…"
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

      {/* Kanban Column */}
      <div className="bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[300px]">
        {/* Column Header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/50">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="font-semibold text-foreground">Agendar Publicação</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {filteredCards.length}
          </Badge>
        </div>

        {/* Cards List */}
        {filteredCards.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">
              {selectedClientFilter === "all" ? "Nenhum conteúdo aguardando agendamento" : "Nenhum conteúdo para agendar para este cliente"}
            </p>
            <p className="text-xs mt-1 opacity-70">
              Mova demandas para "Agendar Publicação" nos kanbans dos clientes
            </p>
          </div> : <div className="flex flex-col gap-2">
            {filteredCards.map(card => {
          const {
            cleanTitle
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
              {/* Left side: Priority, Date, Title */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {priority && (
                  <Badge className={cn("text-[10px] px-2 py-0.5 font-medium whitespace-nowrap", priority.className)}>
                    {priority.label}
                  </Badge>
                )}
                <span className="text-sm font-medium text-foreground whitespace-nowrap">
                  {firstPubDate ? firstPubDate.toLocaleDateString("pt-BR") + " " + firstPubDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : formatDate(card.delivery_date)}
                </span>
                <span className={cn(
                  "text-sm font-medium truncate",
                  isHighlighted ? "text-primary" : "text-foreground"
                )}>
                  {cleanTitle || card.title}
                </span>
              </div>
              
              {/* Right side: Attachments indicator + Badge + Chevron */}
              <div className="flex items-center gap-3 shrink-0">
                {card.attachments && card.attachments.length > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Paperclip className="h-4 w-4" />
                    <span className="text-xs">{card.attachments.length}</span>
                  </div>
                )}
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-medium whitespace-nowrap">
                  {card.clientName}
                </Badge>
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