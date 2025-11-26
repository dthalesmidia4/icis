import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { ArrowLeft, Calendar, FileText, Link as LinkIcon, Edit2, Save, Search, Filter, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast as sonnerToast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { PeriodSelectionModal } from "@/components/PeriodSelectionModal";

interface KanbanCard {
  id: string;
  title: string;
  status: string;
  column_name: string | null;
  publication_date: string;
  file_location: string | null;
  description: string | null;
  observations: string | null;
  plan_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = [
  { id: "Planejamento Automatizado", title: "Planejamento Automatizado", color: "bg-purple-500" },
  { id: "A Fazer", title: "A Fazer", color: "bg-blue-500" },
  { id: "Em Andamento", title: "Em Andamento", color: "bg-amber-500" },
  { id: "Concluído", title: "Concluído", color: "bg-emerald-500" },
];

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [referencePeriod, setReferencePeriod] = useState<{ titulo: string; dataInicio: string; dataFim: string } | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [needsPeriodSelection, setNeedsPeriodSelection] = useState(false);

  const planId = searchParams.get("planId");

  // Verificar se há cliente selecionado
  useEffect(() => {
    if (!selectedClient) {
      sonnerToast.error('Nenhum cliente selecionado');
      navigate('/home');
    }
  }, [selectedClient, navigate]);

  useEffect(() => {
    const initializeSchedule = async () => {
      if (!selectedClient || !tenantId) return;

      if (!planId) {
        // Fetch the most recent approved plan for the selected client
        const { data: approvedPlan, error } = await supabase
          .from("marketing_plans")
          .select("id")
          .eq("company_id", selectedClient.id)
          .eq("tenant_id", tenantId)
          .eq("approved", true)
          .order("approved_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching approved plan:", error);
          navigate("/client-hub");
          return;
        }

        if (approvedPlan) {
          navigate(`/schedule?planId=${approvedPlan.id}`, { replace: true });
          return;
        } else {
          sonnerToast.error("Nenhum plano aprovado encontrado para este cliente");
          navigate("/client-hub");
          return;
        }
      }

      if (planId) {
        fetchCards();
      }
    };

    initializeSchedule();
  }, [planId, tenantId, selectedClient, navigate]);

  const fetchCards = async () => {
    try {
      setLoading(true);
      
      // Buscar cards e informações do plano
      const [cardsResponse, planResponse] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("plan_id", planId)
          .order("created_at", { ascending: true }),
        supabase
          .from("marketing_plans")
          .select("periodo_titulo, periodo_data_inicio, periodo_data_fim")
          .eq("id", planId)
          .single()
      ]);

      if (cardsResponse.error) throw cardsResponse.error;
      if (planResponse.error) throw planResponse.error;

      setCards(cardsResponse.data || []);
      
      // Definir o período de referência
      if (planResponse.data?.periodo_titulo) {
        setReferencePeriod({
          titulo: planResponse.data.periodo_titulo,
          dataInicio: planResponse.data.periodo_data_inicio,
          dataFim: planResponse.data.periodo_data_fim
        });
        setNeedsPeriodSelection(false);
      } else {
        // Plano antigo sem período definido
        setNeedsPeriodSelection(true);
      }
    } catch (error) {
      console.error("Error fetching cards:", error);
      toast({
        title: "Erro ao carregar tarefas",
        description: "Não foi possível carregar as tarefas do cronograma.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateCards = async () => {
    if (!planId) return;
    
    // Verificar se o plano tem período definido
    if (needsPeriodSelection) {
      setShowPeriodModal(true);
      sonnerToast.info("Por favor, selecione um período antes de regenerar o cronograma");
      return;
    }
    
    setRegenerating(true);
    try {
      // Primeiro, deletar os cards existentes
      const { error: deleteError } = await supabase
        .from("cards")
        .delete()
        .eq("plan_id", planId);

      if (deleteError) throw deleteError;

      // Chamar a edge function para regenerar
      const { data, error: functionError } = await supabase.functions.invoke('generate-kanban-tasks', {
        body: { planId }
      });

      if (functionError) {
        console.error("Edge function error:", functionError);
        throw new Error(functionError.message || "Erro ao regenerar cronograma");
      }

      if (!data?.success) {
        console.error("Edge function failed:", data);
        throw new Error(data?.error || "Erro ao gerar tarefas");
      }

      sonnerToast.success(`Cronograma regenerado! ${data.cardsCreated || 0} tarefas criadas.`);
      
      // Recarregar os cards
      await fetchCards();
    } catch (error) {
      console.error("Error regenerating cards:", error);
      sonnerToast.error("Erro ao regenerar cronograma. Tente novamente.");
    } finally {
      setRegenerating(false);
    }
  };

  const handlePeriodSaved = async (periodData: { titulo: string; dataInicio: Date; dataFim: Date }) => {
    if (!planId) return;
    
    try {
      // Atualizar o plano com o período selecionado
      const { error } = await supabase
        .from('marketing_plans')
        .update({
          periodo_titulo: periodData.titulo,
          periodo_data_inicio: periodData.dataInicio.toISOString().split('T')[0],
          periodo_data_fim: periodData.dataFim.toISOString().split('T')[0],
          periodo_status: 'ativo'
        })
        .eq('id', planId);

      if (error) throw error;

      setReferencePeriod({
        titulo: periodData.titulo,
        dataInicio: periodData.dataInicio.toISOString().split('T')[0],
        dataFim: periodData.dataFim.toISOString().split('T')[0]
      });
      setNeedsPeriodSelection(false);
      setShowPeriodModal(false);
      
      sonnerToast.success("Período atualizado com sucesso!");
      
      // Recarregar os cards
      await fetchCards();
    } catch (error) {
      console.error("Error updating period:", error);
      sonnerToast.error("Erro ao atualizar período");
    }
  };

  const handleDeleteCard = async () => {
    if (!cardToDelete) return;

    try {
      setIsDeleting(true);

      const { error } = await supabase
        .from("cards")
        .delete()
        .eq("id", cardToDelete);

      if (error) throw error;

      sonnerToast.success("Card excluído com sucesso!");
      setCardToDelete(null);
      
      // Recarregar os cards
      await fetchCards();
    } catch (error) {
      console.error("Error deleting card:", error);
      sonnerToast.error("Erro ao excluir card");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId) return;

    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    const newColumnName = destination.droppableId;
    const newStatus = newColumnName === "Concluído" ? "completed" : 
                      newColumnName === "Em Andamento" ? "in_progress" : "unassigned";

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

      toast({
        title: "Tarefa movida!",
        description: `Movida para "${newColumnName}"`,
      });
    } catch (error) {
      console.error("Error updating card:", error);
      toast({
        title: "Erro ao mover tarefa",
        description: "Não foi possível atualizar a tarefa.",
        variant: "destructive",
      });
      // Reverter mudança local
      fetchCards();
    }
  };

  const handleSaveCard = async () => {
    if (!selectedCard) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("cards")
        .update({
          title: selectedCard.title,
          description: selectedCard.description,
          publication_date: selectedCard.publication_date,
          file_location: selectedCard.file_location,
          observations: selectedCard.observations,
          status: selectedCard.status,
        })
        .eq("id", selectedCard.id);

      if (error) throw error;

      toast({
        title: "Tarefa atualizada!",
        description: "As alterações foram salvas com sucesso.",
      });

      setEditMode(false);
      fetchCards();
    } catch (error) {
      console.error("Error saving card:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Extrair canais únicos dos cards
  const availableChannels = useMemo(() => {
    const channels = new Set<string>();
    cards.forEach(card => {
      // Buscar por canal em file_location ou description
      const text = `${card.file_location || ''} ${card.description || ''}`.toLowerCase();
      
      // Lista de canais comuns
      const channelKeywords = [
        'instagram', 'facebook', 'linkedin', 'youtube', 
        'tiktok', 'twitter', 'whatsapp', 'email', 'e-mail',
        'reels', 'story', 'stories', 'post', 'feed'
      ];
      
      channelKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
          // Normalizar nome do canal
          const normalizedChannel = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          channels.add(normalizedChannel);
        }
      });
    });
    return Array.from(channels).sort();
  }, [cards]);

  // Filtrar cards baseado na busca e filtro de canal
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // Filtro de busca
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        card.title.toLowerCase().includes(searchLower) ||
        card.description?.toLowerCase().includes(searchLower) ||
        card.file_location?.toLowerCase().includes(searchLower) ||
        new Date(card.publication_date).toLocaleDateString("pt-BR").includes(searchLower);

      // Filtro de canal
      const matchesChannel = channelFilter === "all" || (() => {
        const text = `${card.file_location || ''} ${card.description || ''}`.toLowerCase();
        return text.includes(channelFilter.toLowerCase());
      })();

      return matchesSearch && matchesChannel;
    });
  }, [cards, searchQuery, channelFilter]);

  const getCardsByColumn = (columnId: string) => {
    return filteredCards.filter((card) => (card.column_name || "Planejamento Automatizado") === columnId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="mb-6 sm:mb-8 space-y-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-card rounded-md animate-pulse" />
              <div className="space-y-2">
                <div className="h-7 w-48 bg-card rounded animate-pulse" />
                <div className="h-4 w-64 bg-card rounded animate-pulse" />
              </div>
            </div>
            
            {/* Period and Actions Skeleton */}
            <div className="flex gap-3">
              <div className="h-8 w-48 bg-card rounded-full animate-pulse" />
              <div className="h-8 w-40 bg-card rounded-md animate-pulse" />
            </div>
            
            {/* Filters Skeleton */}
            <div className="flex gap-3">
              <div className="h-10 flex-1 bg-card rounded-md animate-pulse" />
              <div className="h-10 w-48 bg-card rounded-md animate-pulse" />
            </div>
          </div>
          
          {/* Kanban Columns Skeleton */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:overflow-x-auto pb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full sm:min-w-[324px] sm:max-w-[324px]">
                <div className="bg-card rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
                    <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                  </div>
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="bg-muted/50 rounded-lg p-4 space-y-3 animate-pulse">
                      <div className="h-4 w-3/4 bg-muted rounded" />
                      <div className="h-3 w-full bg-muted rounded" />
                      <div className="h-3 w-5/6 bg-muted rounded" />
                      <div className="flex gap-2">
                        <div className="h-6 w-16 bg-muted rounded-full" />
                        <div className="h-6 w-20 bg-muted rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/client-hub")}
              className="hover:bg-accent transition-colors h-8 w-8 sm:h-10 sm:w-10"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
                Cronograma de Tarefas
              </h1>
              <p className="text-muted-foreground mt-0.5 sm:mt-1 text-xs sm:text-sm">
                Organize e acompanhe suas tarefas no formato Kanban
              </p>
            </div>
          </div>

          {/* Período de Referência e Ações */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
            {referencePeriod ? (
              <div className="flex flex-col gap-1">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5 text-sm font-medium w-fit">
                  📅 Período: {referencePeriod.titulo}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {new Date(referencePeriod.dataInicio).toLocaleDateString('pt-BR')} até {new Date(referencePeriod.dataFim).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ) : needsPeriodSelection && (
              <Badge variant="destructive" className="px-3 py-1.5 text-sm font-medium w-fit">
                ⚠️ Período não definido
              </Badge>
            )}
            <div className="flex gap-2">
              {needsPeriodSelection && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowPeriodModal(true)}
                  className="w-fit"
                >
                  Selecionar Período
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateCards}
                disabled={regenerating || needsPeriodSelection}
                className="w-fit"
              >
                {regenerating ? "Regenerando..." : "Regenerar Cronograma"}
              </Button>
            </div>
          </div>

          {/* Filtros */}
          {cards.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {/* Barra de busca */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar tarefas por título, descrição ou canal..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-card border-input"
                />
              </div>

              {/* Filtro por canal */}
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-full sm:w-[220px] bg-card">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Filtrar por canal" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os canais</SelectItem>
                  {availableChannels.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {channel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {cards.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
              Nenhuma tarefa encontrada
            </h2>
            <p className="text-muted-foreground mb-4 sm:mb-6 text-sm sm:text-base">
              As tarefas são geradas automaticamente ao aprovar o plano.
            </p>
            <Button onClick={() => navigate("/plans")}>
              Voltar para Planos
            </Button>
          </Card>
        ) : filteredCards.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <Search className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
              Nenhuma tarefa encontrada
            </h2>
            <p className="text-muted-foreground mb-4 sm:mb-6 text-sm sm:text-base">
              Tente ajustar os filtros de busca ou selecionar outro canal.
            </p>
            <Button 
              onClick={() => {
                setSearchQuery("");
                setChannelFilter("all");
              }} 
              variant="outline"
            >
              Limpar Filtros
            </Button>
          </Card>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:overflow-x-auto pb-4">
              {COLUMNS.map((column) => (
                <div key={column.id} className="w-full sm:min-w-[300px] sm:max-w-[324px] md:min-w-[324px] flex-shrink-0">
                  {/* Column Header */}
                  <div className="bg-card rounded-lg shadow-sm mb-3 sm:mb-4 border border-border">
                    <div className="h-11 sm:h-12 px-3 sm:px-4 flex items-center justify-between border-b border-border">
                      <div className="flex items-center gap-2">
                        <div className={`w-1 h-4 sm:h-5 rounded ${column.color}`} />
                        <h3 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-1">
                          {column.title}
                        </h3>
                      </div>
                      <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full">
                        {getCardsByColumn(column.id).length}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Droppable Area */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-3 sm:space-y-4 p-2 sm:p-3 rounded-lg transition-all duration-200 ${
                          snapshot.isDraggingOver 
                            ? "bg-primary/5 border-2 border-primary border-dashed" 
                            : "bg-transparent"
                        }`}
                        style={{ minHeight: "300px" }}
                      >
                        {getCardsByColumn(column.id).map((card, index) => (
                          <Draggable
                            key={card.id}
                            draggableId={card.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Dialog>
                                <DialogTrigger asChild>
                                   <Card
                                     ref={provided.innerRef}
                                     {...provided.draggableProps}
                                     {...provided.dragHandleProps}
                                     className={`cursor-pointer bg-card border border-border p-3 sm:p-4 rounded-lg transition-all duration-200 w-full max-h-[160px] overflow-hidden ${
                                       snapshot.isDragging 
                                         ? "shadow-xl rotate-2 scale-105" 
                                         : "shadow-sm hover:shadow-md"
                                     }`}
                                     onClick={() => {
                                       setSelectedCard(card);
                                       setEditMode(false);
                                     }}
                                   >
                                     {/* Card Header with Delete Button */}
                                     <div className="flex items-start justify-between mb-2 gap-2">
                                       <h4 className="text-[13px] sm:text-[14px] font-semibold text-foreground leading-tight line-clamp-2 flex-1">
                                         {card.title}
                                       </h4>
                                       <Button
                                         variant="ghost"
                                         size="icon"
                                         className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           setCardToDelete(card.id);
                                         }}
                                       >
                                         <Trash2 className="h-3.5 w-3.5" />
                                       </Button>
                                     </div>
                                     
                                      {/* Card Metadata */}
                                       <div className="space-y-1.5 sm:space-y-2">
                                        {/* Platform and Content Type */}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {(() => {
                                            const text = `${card.title} ${card.file_location || ''}`.toLowerCase();
                                            let platform = '';
                                            let contentType = '';
                                            
                                            // Extract platform
                                            if (text.includes('instagram')) platform = 'Instagram';
                                            else if (text.includes('linkedin')) platform = 'LinkedIn';
                                            else if (text.includes('facebook')) platform = 'Facebook';
                                            else if (text.includes('youtube')) platform = 'YouTube';
                                            else if (text.includes('tiktok')) platform = 'TikTok';
                                            else if (text.includes('twitter') || text.includes('x.com')) platform = 'Twitter/X';
                                            else if (text.includes('whatsapp')) platform = 'WhatsApp';
                                            else if (text.includes('e-mail') || text.includes('email')) platform = 'E-mail';
                                            else if (text.includes('blog')) platform = 'Blog';
                                            else if (text.includes('site') || text.includes('landing')) platform = 'Site';
                                            
                                            // Extract content type
                                            if (text.includes('carrossel')) contentType = 'Carrossel';
                                            else if (text.includes('reel')) contentType = 'Reel';
                                            else if (text.includes('story') || text.includes('stories')) contentType = 'Story';
                                            else if (text.includes('post')) contentType = 'Post';
                                            else if (text.includes('vídeo') || text.includes('video')) contentType = 'Vídeo';
                                            else if (text.includes('artigo')) contentType = 'Artigo';
                                            else if (text.includes('newsletter')) contentType = 'Newsletter';
                                            else if (text.includes('e-mail') || text.includes('email')) contentType = 'E-mail';
                                            else if (text.includes('landing')) contentType = 'Landing Page';
                                            else if (text.includes('relatório') || text.includes('relatorio')) contentType = 'Relatório';
                                            else if (text.includes('broadcast')) contentType = 'Broadcast';
                                            
                                            return (
                                              <>
                                                {platform && (
                                                  <Badge variant="secondary" className={`text-[10px] sm:text-[11px] px-2 py-0.5 h-auto font-medium ${column.color} text-white border-0`}>
                                                    {platform}
                                                  </Badge>
                                                )}
                                                {contentType && (
                                                  <Badge variant="outline" className="text-[10px] sm:text-[11px] px-2 py-0.5 h-auto font-normal border-muted-foreground/30 text-muted-foreground">
                                                    {contentType}
                                                  </Badge>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                        
                                        {/* Description Preview */}
                                        {card.description && (
                                          <p className="text-[10px] sm:text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                            {card.description}
                                          </p>
                                        )}
                                      </div>
                                   </Card>
                                 </DialogTrigger>

                                {/* Modal */}
                                <DialogContent className="max-w-[95vw] sm:max-w-[600px] md:max-w-[700px] max-h-[90vh] overflow-y-auto">
                                  <DialogHeader className="border-b pb-3 sm:pb-4">
                                    <DialogTitle className="text-xl sm:text-2xl font-bold">
                                      {editMode ? "Editar Tarefa" : "Detalhes da Tarefa"}
                                    </DialogTitle>
                                  </DialogHeader>

                                  {selectedCard && (
                                    <div className="space-y-4 sm:space-y-5 pt-2">
                                      {/* Title */}
                                      <div>
                                        <Label className="text-sm font-semibold">Título</Label>
                                        {editMode ? (
                                          <Input
                                            value={selectedCard.title}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                title: e.target.value,
                                              })
                                            }
                                            className="mt-2"
                                          />
                                        ) : (
                                          <p className="text-[15px] mt-2 text-foreground">{selectedCard.title}</p>
                                        )}
                                      </div>

                                      {/* Status */}
                                      <div>
                                        <Label className="text-sm font-semibold">Status</Label>
                                        {editMode ? (
                                          <Select
                                            value={selectedCard.status}
                                            onValueChange={(value) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                status: value,
                                              })
                                            }
                                          >
                                            <SelectTrigger className="mt-2">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="unassigned">A Fazer</SelectItem>
                                              <SelectItem value="in_progress">Em Andamento</SelectItem>
                                              <SelectItem value="completed">Concluído</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <p className="text-sm mt-2 text-muted-foreground">
                                            {selectedCard.status === "completed" ? "Concluído" :
                                             selectedCard.status === "in_progress" ? "Em Andamento" : "A Fazer"}
                                          </p>
                                        )}
                                      </div>

                                       {/* Publication Date */}
                                      <div>
                                        <Label className="text-sm font-semibold">Data de Publicação</Label>
                                        {editMode ? (
                                          <Input
                                            type="date"
                                            value={selectedCard.publication_date}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                publication_date: e.target.value,
                                              })
                                            }
                                            className="mt-2"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-muted-foreground">
                                            {new Date(selectedCard.publication_date).toLocaleDateString("pt-BR")}
                                          </p>
                                        )}
                                      </div>

                                      {/* File Location */}
                                      <div>
                                        <Label className="text-sm font-semibold">Local do Arquivo</Label>
                                        {editMode ? (
                                          <Input
                                            value={selectedCard.file_location || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                file_location: e.target.value,
                                              })
                                            }
                                            placeholder="Link, upload ou anotação"
                                            className="mt-2"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-muted-foreground">
                                            {selectedCard.file_location || "Não especificado"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Description */}
                                      <div>
                                        <Label className="text-sm font-semibold">Descrição</Label>
                                        {editMode ? (
                                          <Textarea
                                            value={selectedCard.description || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                description: e.target.value,
                                              })
                                            }
                                            rows={4}
                                            placeholder="Explicação do que deve ser feito"
                                            className="mt-2"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                            {selectedCard.description || "Sem descrição"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Observations */}
                                      <div>
                                        <Label className="text-sm font-semibold">Observações</Label>
                                        {editMode ? (
                                          <Textarea
                                            value={selectedCard.observations || ""}
                                            onChange={(e) =>
                                              setSelectedCard({
                                                ...selectedCard,
                                                observations: e.target.value,
                                              })
                                            }
                                            rows={3}
                                            placeholder="Detalhes adicionais"
                                            className="mt-2"
                                          />
                                        ) : (
                                          <p className="text-sm mt-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                            {selectedCard.observations || "Sem observações"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Action Buttons */}
                                      <div className="flex justify-end gap-3 pt-4 border-t">
                                        {editMode ? (
                                          <>
                                            <Button
                                              variant="outline"
                                              onClick={() => {
                                                setEditMode(false);
                                                setSelectedCard(card);
                                              }}
                                              disabled={saving}
                                            >
                                              Cancelar
                                            </Button>
                                            <Button
                                              onClick={handleSaveCard}
                                              disabled={saving}
                                              className="gap-2"
                                            >
                                              <Save className="w-4 h-4" />
                                              {saving ? "Salvando..." : "Salvar Alterações"}
                                            </Button>
                                          </>
                                        ) : (
                                          <Button 
                                            onClick={() => setEditMode(true)}
                                            className="gap-2"
                                          >
                                            <Edit2 className="w-4 h-4" />
                                            Editar
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </DialogContent>
                              </Dialog>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      <PeriodSelectionModal
        open={showPeriodModal}
        onClose={() => setShowPeriodModal(false)}
        onConfirm={handlePeriodSaved}
        isGenerating={false}
      />

      <ConfirmationModal
        open={cardToDelete !== null}
        onOpenChange={(open) => !open && setCardToDelete(null)}
        title="Excluir Card"
        description="Tem certeza que deseja excluir este card? Esta ação não pode ser desfeita."
        onConfirm={handleDeleteCard}
        loading={isDeleting}
      />
    </div>
  );
}