import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, CalendarDays, Filter, Paperclip, Archive, Calendar } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenant } from "@/contexts/TenantContext";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";

interface CentralKanbanCard extends KanbanCardData {
  clientName: string;
  clientId: string;
  isArchived: boolean;
}

const Scheduled = () => {
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

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      fetchScheduledCards();
    }
  }, [tenantId, tenantLoading]);

  // Get publication datetime
  const getPublicationDateTime = (card: CentralKanbanCard): Date | null => {
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

      // Only fetch non-archived demands in "Agendar Publicação" status
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
          )
        `)
        .eq("tenant_id", tenantId)
        .is("archived_at", null);
      
      if (error) throw error;

      const allMappedCards: CentralKanbanCard[] = (demandsData || [])
        .filter(demand => demand.pipeline_statuses?.name === "Agendar Publicação")
        .map(demand => {
          const company = demand.tenant_companies;
          return {
            id: demand.id,
            title: demand.title,
            description: demand.instructions || demand.description || null,
            objective: demand.objective || null,
            instructions: demand.instructions || null,
            observations: demand.observations || null,
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
            demand_type: demand.demand_type
          };
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

      {/* Cards Container */}
      <div className="bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[300px]">
        {filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">
              {selectedClientFilter === "all" ? "Nenhum conteúdo aguardando agendamento" : "Nenhum conteúdo para agendar para este cliente"}
            </p>
            <p className="text-xs mt-1 opacity-70">
              Mova demandas para "Agendar Publicação" nos kanbans dos clientes
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredCards.map(card => {
              const { cleanTitle, type: contentType } = extractContentType(card.title);
              const isHighlighted = highlightedCardId === card.id;
              const priority = getPriorityIndicator(card);
              const pubDateTime = getPublicationDateTime(card);

              return (
                <div
                  key={card.id}
                  ref={el => {
                    if (el) cardRefs.current.set(card.id, el);
                    else cardRefs.current.delete(card.id);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-4 px-4 py-3 bg-background rounded-lg border cursor-pointer hover:bg-muted/50 transition-all duration-300 group",
                    isHighlighted ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-lg scale-[1.02]" : "border-border/50"
                  )}
                  onClick={() => handleCardClick(card)}
                >
                  {/* Left side */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {priority && (
                      <Badge className={cn("text-[10px] px-2 py-0.5 font-medium whitespace-nowrap", priority.className)}>
                        {priority.label}
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{card.clientName}</span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{contentType}</span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className={cn("text-sm font-medium truncate", isHighlighted ? "text-primary" : "text-foreground")}>
                      {cleanTitle}
                    </span>
                  </div>
                  
                  {/* Right side */}
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
                              {pubDateTime
                                ? pubDateTime.toLocaleDateString("pt-BR") + " " + pubDateTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                                : formatDate(card.due_date)}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">
                            {pubDateTime
                              ? pubDateTime.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                              : new Date(card.due_date).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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