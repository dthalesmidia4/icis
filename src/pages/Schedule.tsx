import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { ArrowLeft, Calendar, FileText, Link as LinkIcon, Search, Filter, Trash2, LayoutGrid, Target, ClipboardList, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast as sonnerToast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { LoadingScreen } from "@/components/LoadingScreen";

interface KanbanCard {
  id: string;
  title: string;
  status: string;
  column_name: string | null;
  publication_date: string;
  file_location: string | null;
  objetivo: string | null;
  description: string | null;
  instrucoes: string | null;
  observations: string | null;
  period_plan_id: string | null;
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
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [referencePeriod, setReferencePeriod] = useState<{ titulo: string; dataInicio: string; dataFim: string } | null>(null);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const periodPlanId = searchParams.get("periodPlanId");

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

      if (periodPlanId) {
        fetchPeriodPlanCards();
        return;
      }

      // Sem periodPlanId, redirecionar para plan-period
      sonnerToast.info("Selecione um período para ver as demandas");
      navigate("/plan-period");
    };

    initializeSchedule();
  }, [periodPlanId, tenantId, selectedClient, navigate]);

  const fetchPeriodPlanCards = async () => {
    if (!periodPlanId) return;
    
    try {
      setLoading(true);
      
      // Fetch cards and period plan info
      const [cardsResponse, periodPlanResponse] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("period_plan_id", periodPlanId)
          .order("created_at", { ascending: true }),
        supabase
          .from("period_plans")
          .select("period_title, period_start, period_end")
          .eq("id", periodPlanId)
          .single()
      ]);

      if (cardsResponse.error) throw cardsResponse.error;
      if (periodPlanResponse.error) throw periodPlanResponse.error;

      setCards(cardsResponse.data || []);
      
      if (periodPlanResponse.data) {
        setReferencePeriod({
          titulo: periodPlanResponse.data.period_title,
          dataInicio: periodPlanResponse.data.period_start,
          dataFim: periodPlanResponse.data.period_end
        });
      }
    } catch (error) {
      console.error("Error fetching period plan cards:", error);
      toast({
        title: "Erro ao carregar demandas",
        description: "Não foi possível carregar as demandas do período.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
      
      await fetchPeriodPlanCards();
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
      fetchPeriodPlanCards();
    }
  };

  const handleAutoSave = async (field: string, value: string) => {
    if (!selectedCard) return;

    setSaving(true);
    try {
      const updateData: Record<string, any> = { [field]: value };
      
      const { error } = await supabase
        .from("cards")
        .update(updateData)
        .eq("id", selectedCard.id);

      if (error) throw error;

      // Update local cards state
      setCards(prev => prev.map(c => 
        c.id === selectedCard.id ? { ...c, [field]: value } : c
      ));

      sonnerToast.success("Salvo automaticamente");
    } catch (error) {
      console.error("Error saving card:", error);
      sonnerToast.error("Erro ao salvar");
    } finally {
      setSaving(false);
      setEditingField(null);
    }
  };

  // Extrair canais únicos dos cards
  const availableChannels = useMemo(() => {
    const channels = new Set<string>();
    cards.forEach(card => {
      const text = `${card.file_location || ''} ${card.description || ''}`.toLowerCase();
      
      const channelKeywords = [
        'instagram', 'facebook', 'linkedin', 'youtube', 
        'tiktok', 'twitter', 'whatsapp', 'email', 'e-mail',
        'reels', 'story', 'stories', 'post', 'feed'
      ];
      
      channelKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
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
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        card.title.toLowerCase().includes(searchLower) ||
        card.description?.toLowerCase().includes(searchLower) ||
        card.file_location?.toLowerCase().includes(searchLower) ||
        new Date(card.publication_date).toLocaleDateString("pt-BR").includes(searchLower);

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

  // Format description with hierarchy
  const formatDescription = (description: string | null) => {
    if (!description) return null;
    
    const lines = description.split('\n');
    
    return lines.map((line, index) => {
      const trimmedLine = line.trim();
      
      // Check if it's a section title (ends with : or starts with **)
      if (trimmedLine.endsWith(':') || (trimmedLine.startsWith('**') && trimmedLine.endsWith('**'))) {
        const cleanTitle = trimmedLine.replace(/\*\*/g, '').replace(/:$/, '');
        return (
          <div key={index} className="mt-3 first:mt-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h4 className="font-semibold text-sm text-foreground">{cleanTitle}</h4>
            </div>
          </div>
        );
      }
      
      // Check if it's a bullet point
      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
        const bulletContent = trimmedLine.replace(/^[-•]\s*/, '');
        return (
          <div key={index} className="flex items-start gap-2 ml-4 py-0.5">
            <span className="text-muted-foreground mt-1">•</span>
            <span className="text-sm text-muted-foreground">{bulletContent}</span>
          </div>
        );
      }
      
      // Regular text
      if (trimmedLine) {
        return (
          <p key={index} className="text-sm text-muted-foreground ml-3 py-0.5">
            {trimmedLine}
          </p>
        );
      }
      
      return null;
    });
  };

  // Extract platform and content type from description/file_location
  const extractMetadata = (card: KanbanCard) => {
    const text = `${card.file_location || ''} ${card.description || ''}`.toLowerCase();
    
    const platforms: string[] = [];
    const contentTypes: string[] = [];
    
    // Platforms
    if (text.includes('instagram')) platforms.push('Instagram');
    if (text.includes('facebook')) platforms.push('Facebook');
    if (text.includes('linkedin')) platforms.push('LinkedIn');
    if (text.includes('youtube')) platforms.push('YouTube');
    if (text.includes('tiktok')) platforms.push('TikTok');
    if (text.includes('twitter') || text.includes('x.com')) platforms.push('Twitter/X');
    if (text.includes('whatsapp')) platforms.push('WhatsApp');
    
    // Content types
    if (text.includes('reels') || text.includes('reel')) contentTypes.push('Reels');
    if (text.includes('story') || text.includes('stories')) contentTypes.push('Stories');
    if (text.includes('carrossel') || text.includes('carousel')) contentTypes.push('Carrossel');
    if (text.includes('post') || text.includes('feed')) contentTypes.push('Post');
    if (text.includes('vídeo') || text.includes('video')) contentTypes.push('Vídeo');
    if (text.includes('artigo') || text.includes('blog')) contentTypes.push('Artigo');
    
    return { platforms, contentTypes };
  };

  if (loading) {
    return (
      <LoadingScreen
        title="Carregando demandas"
        description="Aguarde enquanto carregamos suas tarefas..."
        icon={LayoutGrid}
      />
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
              className="h-8 w-8 sm:h-10 sm:w-10"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Demandas
              </h1>
              {selectedClient && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {selectedClient.fantasy_name || selectedClient.name}
                </p>
              )}
            </div>
          </div>

          {/* Período de Referência */}
          {referencePeriod && (
            <div className="mb-4">
              <Badge variant="secondary" className="text-xs sm:text-sm px-3 py-1">
                Período: {referencePeriod.titulo} ({new Date(referencePeriod.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')} - {new Date(referencePeriod.dataFim + 'T00:00:00').toLocaleDateString('pt-BR')})
              </Badge>
            </div>
          )}

          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar demandas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Canal" />
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
        </div>

        {/* Kanban Board */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {COLUMNS.map((column) => (
              <div key={column.id} className="flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${column.color}`} />
                  <h3 className="font-semibold text-sm text-foreground">
                    {column.title}
                  </h3>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {getCardsByColumn(column.id).length}
                  </Badge>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 min-h-[200px] rounded-lg p-2 transition-colors ${
                        snapshot.isDraggingOver
                          ? "bg-accent/50"
                          : "bg-muted/30"
                      }`}
                    >
                      {getCardsByColumn(column.id).map((card, index) => (
                        <Draggable
                          key={card.id}
                          draggableId={card.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Card
                                    className={`mb-2 cursor-pointer hover:shadow-md transition-all ${
                                      snapshot.isDragging ? "shadow-lg rotate-2" : ""
                                    }`}
                                    onClick={() => {
                                      setSelectedCard(card);
                                      setEditingField(null);
                                    }}
                                  >
                                    <CardHeader className="p-3 pb-2">
                                      <CardTitle className="text-sm font-medium line-clamp-2">
                                        {card.title}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                      <div className="flex flex-wrap gap-1 mb-2">
                                        {extractMetadata(card).platforms.slice(0, 2).map((platform) => (
                                          <Badge key={platform} variant="outline" className="text-[10px] px-1.5 py-0">
                                            {platform}
                                          </Badge>
                                        ))}
                                        {extractMetadata(card).contentTypes.slice(0, 1).map((type) => (
                                          <Badge key={type} variant="secondary" className="text-[10px] px-1.5 py-0">
                                            {type}
                                          </Badge>
                                        ))}
                                      </div>
                                      <div className="flex items-center text-xs text-muted-foreground">
                                        <Calendar className="h-3 w-3 mr-1" />
                                        {new Date(card.publication_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                                      </div>
                                    </CardContent>
                                  </Card>
                                </DialogTrigger>

                                {/* Card Detail Modal */}
                                <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[90vh] p-0 overflow-hidden">
                                  <div className="grid grid-cols-1 md:grid-cols-3 h-[90vh]">
                                    {/* Left Column - Main Content (Scrollable) */}
                                    <ScrollArea className="md:col-span-2 h-full border-b md:border-b-0 md:border-r border-border">
                                      <div className="p-4 sm:p-6">
                                      <DialogHeader className="mb-4">
                                        {editingField === 'title' ? (
                                          <Input
                                            autoFocus
                                            value={selectedCard?.title || ""}
                                            onChange={(e) =>
                                              setSelectedCard((prev) =>
                                                prev ? { ...prev, title: e.target.value } : null
                                              )
                                            }
                                            onBlur={() => handleAutoSave('title', selectedCard?.title || '')}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleAutoSave('title', selectedCard?.title || '');
                                              }
                                            }}
                                            className="text-lg font-semibold"
                                          />
                                        ) : (
                                          <DialogTitle 
                                            className="text-lg cursor-pointer rounded-lg p-2 -m-2 transition-all duration-200 hover:bg-muted/50"
                                            onClick={() => setEditingField('title')}
                                          >
                                            {selectedCard?.title}
                                          </DialogTitle>
                                        )}
                                      </DialogHeader>

                                      {/* Content Sections */}
                                      <div className="space-y-4">
                                        {/* Objetivo */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <Target className="h-4 w-4 text-primary" />
                                            <Label className="text-sm font-medium">Objetivo</Label>
                                            {saving && editingField === 'objetivo' && (
                                              <span className="text-xs text-muted-foreground">Salvando...</span>
                                            )}
                                          </div>
                                          {editingField === 'objetivo' ? (
                                            <Textarea
                                              autoFocus
                                              value={selectedCard?.objetivo || ""}
                                              onChange={(e) =>
                                                setSelectedCard((prev) =>
                                                  prev ? { ...prev, objetivo: e.target.value } : null
                                                )
                                              }
                                              onBlur={() => handleAutoSave('objetivo', selectedCard?.objetivo || '')}
                                              className="min-h-[60px]"
                                              rows={2}
                                            />
                                          ) : (
                                            <div 
                                              className="bg-muted/30 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:shadow-sm"
                                              onClick={() => setEditingField('objetivo')}
                                            >
                                              {selectedCard?.objetivo || (
                                                <span className="text-muted-foreground text-sm italic">Clique para adicionar objetivo</span>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {/* Atividade (antigo Descrição) */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-sm font-medium">Atividade</Label>
                                            {saving && editingField === 'description' && (
                                              <span className="text-xs text-muted-foreground">Salvando...</span>
                                            )}
                                          </div>
                                          {editingField === 'description' ? (
                                            <Textarea
                                              autoFocus
                                              value={selectedCard?.description || ""}
                                              onChange={(e) =>
                                                setSelectedCard((prev) =>
                                                  prev ? { ...prev, description: e.target.value } : null
                                                )
                                              }
                                              onBlur={() => handleAutoSave('description', selectedCard?.description || '')}
                                              className="min-h-[150px] font-mono text-sm"
                                              rows={8}
                                            />
                                          ) : (
                                            <div 
                                              className="bg-muted/30 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:shadow-sm"
                                              onClick={() => setEditingField('description')}
                                            >
                                              {formatDescription(selectedCard?.description) || (
                                                <span className="text-muted-foreground text-sm italic">Clique para adicionar atividade</span>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {/* Instruções */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-sm font-medium">Instruções</Label>
                                            {saving && editingField === 'instrucoes' && (
                                              <span className="text-xs text-muted-foreground">Salvando...</span>
                                            )}
                                          </div>
                                          {editingField === 'instrucoes' ? (
                                            <Textarea
                                              autoFocus
                                              value={selectedCard?.instrucoes || ""}
                                              onChange={(e) =>
                                                setSelectedCard((prev) =>
                                                  prev ? { ...prev, instrucoes: e.target.value } : null
                                                )
                                              }
                                              onBlur={() => handleAutoSave('instrucoes', selectedCard?.instrucoes || '')}
                                              className="min-h-[80px]"
                                              rows={3}
                                            />
                                          ) : (
                                            <div 
                                              className="bg-muted/30 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:shadow-sm"
                                              onClick={() => setEditingField('instrucoes')}
                                            >
                                              {selectedCard?.instrucoes ? (
                                                <div className="space-y-2">
                                                  {selectedCard.instrucoes
                                                    .split(/[.]\s+|[\n]/)
                                                    .filter(line => line.trim())
                                                    .map((line, idx) => (
                                                      <p key={idx} className="text-sm text-muted-foreground">
                                                        • {line.trim().replace(/\.$/, '')}
                                                      </p>
                                                    ))}
                                                </div>
                                              ) : (
                                                <span className="text-muted-foreground text-sm italic">Clique para adicionar instruções</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      </div>
                                    </ScrollArea>

                                    {/* Right Column - Metadata (Fixed) */}
                                    <div className="p-4 sm:p-6 bg-muted/20 space-y-4 overflow-y-auto max-h-[90vh]">
                                      {/* Status */}
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
                                        {editingField === 'status' ? (
                                          <Select
                                            value={selectedCard?.status || "unassigned"}
                                            onValueChange={(value) => {
                                              setSelectedCard((prev) =>
                                                prev ? { ...prev, status: value } : null
                                              );
                                              handleAutoSave('status', value);
                                            }}
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="unassigned">A Fazer</SelectItem>
                                              <SelectItem value="in_progress">Em Andamento</SelectItem>
                                              <SelectItem value="completed">Concluído</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Badge
                                            onClick={() => setEditingField('status')}
                                            className={`cursor-pointer transition-all duration-200 hover:opacity-80 ${
                                              selectedCard?.status === "completed"
                                                ? "bg-emerald-500"
                                                : selectedCard?.status === "in_progress"
                                                ? "bg-amber-500"
                                                : ""
                                            }`}
                                            variant={
                                              selectedCard?.status === "completed"
                                                ? "default"
                                                : selectedCard?.status === "in_progress"
                                                ? "secondary"
                                                : "outline"
                                            }
                                          >
                                            {selectedCard?.status === "completed"
                                              ? "Concluído"
                                              : selectedCard?.status === "in_progress"
                                              ? "Em Andamento"
                                              : "A Fazer"}
                                          </Badge>
                                        )}
                                      </div>

                                      {/* Publication Date */}
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1 block">Data de Publicação</Label>
                                        {editingField === 'publication_date' ? (
                                          <Input
                                            type="date"
                                            autoFocus
                                            value={selectedCard?.publication_date || ""}
                                            onChange={(e) =>
                                              setSelectedCard((prev) =>
                                                prev ? { ...prev, publication_date: e.target.value } : null
                                              )
                                            }
                                            onBlur={() => handleAutoSave('publication_date', selectedCard?.publication_date || '')}
                                          />
                                        ) : (
                                          <p 
                                            className="text-sm font-medium cursor-pointer rounded p-1 -m-1 transition-all duration-200 hover:bg-muted/50"
                                            onClick={() => setEditingField('publication_date')}
                                          >
                                            {selectedCard?.publication_date
                                              ? new Date(selectedCard.publication_date + 'T00:00:00').toLocaleDateString("pt-BR", {
                                                  weekday: "long",
                                                  day: "numeric",
                                                  month: "long",
                                                  year: "numeric",
                                                })
                                              : "-"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Platform & Content Type */}
                                      {selectedCard && (
                                        <div>
                                          <Label className="text-xs text-muted-foreground mb-1 block">Canal e Formato</Label>
                                          <div className="flex flex-wrap gap-1">
                                            {extractMetadata(selectedCard).platforms.map((platform) => (
                                              <Badge key={platform} variant="outline" className="text-xs">
                                                {platform}
                                              </Badge>
                                            ))}
                                            {extractMetadata(selectedCard).contentTypes.map((type) => (
                                              <Badge key={type} variant="secondary" className="text-xs">
                                                {type}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* File Location */}
                                      <div>
                                        <Label className="text-xs text-muted-foreground mb-1 block">Tipo de Conteúdo</Label>
                                        {editingField === 'file_location' ? (
                                          <Input
                                            autoFocus
                                            value={selectedCard?.file_location || ""}
                                            onChange={(e) =>
                                              setSelectedCard((prev) =>
                                                prev ? { ...prev, file_location: e.target.value } : null
                                              )
                                            }
                                            onBlur={() => handleAutoSave('file_location', selectedCard?.file_location || '')}
                                            placeholder="Ex: Google Drive, Notion..."
                                          />
                                        ) : (
                                          <p 
                                            className="text-sm font-medium cursor-pointer rounded p-1 -m-1 transition-all duration-200 hover:bg-muted/50"
                                            onClick={() => setEditingField('file_location')}
                                          >
                                            {selectedCard?.file_location || "Clique para definir"}
                                          </p>
                                        )}
                                      </div>

                                      {/* Timestamps */}
                                      <div className="pt-4 border-t border-border space-y-2">
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Criado em</Label>
                                          <p className="text-xs">
                                            {selectedCard?.created_at
                                              ? new Date(selectedCard.created_at).toLocaleString("pt-BR")
                                              : "-"}
                                          </p>
                                        </div>
                                        <div>
                                          <Label className="text-xs text-muted-foreground">Atualizado em</Label>
                                          <p className="text-xs">
                                            {selectedCard?.updated_at
                                              ? new Date(selectedCard.updated_at).toLocaleString("pt-BR")
                                              : "-"}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Delete Button */}
                                      <div className="pt-4">
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          className="w-full"
                                          onClick={() => setCardToDelete(selectedCard?.id || null)}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Excluir Demanda
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
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

        {/* Empty State */}
        {cards.length === 0 && (
          <div className="text-center py-12">
            <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhuma demanda encontrada
            </h3>
            <p className="text-muted-foreground mb-4">
              Gere um planejamento de período para criar suas demandas.
            </p>
            <Button onClick={() => navigate("/plan-period")}>
              Ir para Planejamento de Período
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        open={!!cardToDelete}
        onOpenChange={(open) => !open && setCardToDelete(null)}
        onConfirm={handleDeleteCard}
        title="Excluir Demanda"
        description="Tem certeza que deseja excluir esta demanda? Esta ação não pode ser desfeita."
        loading={isDeleting}
      />
    </div>
  );
}
