import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2, Loader2, CheckCircle2, Filter } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PublicationDate } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  useEffect(() => {
    if (!tenantLoading && tenantId) {
      fetchScheduledCards();
    }
  }, [tenantId, tenantLoading]);
  const fetchScheduledCards = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      // Buscar cards na coluna "Conteúdo Programado" com informações do cliente
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
        `).eq("tenant_id", tenantId).eq("column_name", "Conteúdo Programado").order("delivery_date", {
        ascending: true
      });
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

      // Verificar se o card saiu da coluna "Conteúdo Programado"
      if (field === 'column_name' && parsedValue !== 'Conteúdo Programado') {
        // Remover do kanban central
        setCards(prev => prev.filter(c => c.id !== selectedCard.id));
        setIsTaskCardOpen(false);
        setSelectedCard(null);
        sonnerToast.info("Card removido do Conteúdo Programado Geral");
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Kanban Central
          </h2>
          <Badge variant="secondary">
            {filteredCards.length} {filteredCards.length === 1 ? 'item' : 'itens'}
          </Badge>
        </div>

        {/* Client Filter */}
        {clients.length > 0 && <div className="flex items-center gap-2 sm:ml-auto">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
              <SelectTrigger className="w-[200px]">
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
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="font-semibold text-foreground">Conteúdo Programado</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {filteredCards.length}
          </Badge>
        </div>

        {/* Cards Grid */}
        {filteredCards.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">
              {selectedClientFilter === "all" ? "Nenhum conteúdo programado no momento" : "Nenhum conteúdo programado para este cliente"}
            </p>
            <p className="text-xs mt-1 opacity-70">
              Mova demandas para "Conteúdo Programado" nos kanbans dos clientes
            </p>
          </div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredCards.map(card => {
          const {
            type,
            cleanTitle
          } = extractContentType(card.title);
          return <Card key={card.id} className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50 group" onClick={() => handleCardClick(card)}>
                  {/* Client Badge */}
                  <div className="px-3 pt-3">
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-medium">
                      <Building2 className="h-2.5 w-2.5 mr-1" />
                      {card.clientName}
                    </Badge>
                  </div>


                  {/* Title */}
                  <CardHeader className="px-3 pt-2 pb-2">
                    <CardTitle className="font-semibold leading-snug line-clamp-2 text-foreground text-base">
                      {cleanTitle || card.title}
                    </CardTitle>
                  </CardHeader>

                  {/* Footer: Date */}
                  <CardContent className="px-3 pb-3 pt-0">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
                      <Calendar className="h-3 w-3" />
                      {formatDate(card.delivery_date)}
                    </div>
                  </CardContent>
                </Card>;
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