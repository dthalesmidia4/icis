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
import { ArrowLeft, Calendar, FileText, Link as LinkIcon, Search, Filter, Trash2, LayoutGrid, Target, ClipboardList, Layers, Paperclip, Upload, X, Image, File, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast as sonnerToast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { LoadingScreen } from "@/components/LoadingScreen";

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

interface KanbanCard {
  id: string;
  title: string;
  status: string;
  column_name: string | null;
  delivery_date: string;
  file_location: string | null;
  objetivo: string | null;
  description: string | null;
  instrucoes: string | null;
  observations: string | null;
  period_plan_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[] | null;
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
  const [uploading, setUploading] = useState(false);

  const periodPlanId = searchParams.get("periodPlanId");

  useEffect(() => {
    // Só buscar dados se tiver periodPlanId e tenantId
    if (periodPlanId && tenantId) {
      fetchPeriodPlanCards();
    } else if (!periodPlanId && tenantId) {
      // Sem periodPlanId, mostrar estado vazio (não redirecionar)
      setLoading(false);
    }
  }, [periodPlanId, tenantId]);

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

      // Cast attachments from Json to Attachment[]
      const cardsWithAttachments = (cardsResponse.data || []).map(card => ({
        ...card,
        attachments: (card.attachments as unknown as Attachment[] | null) || []
      }));
      setCards(cardsWithAttachments);
      
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files || event.target.files.length === 0) return;

    const files = Array.from(event.target.files);
    setUploading(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${selectedCard.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('card-attachments')
          .upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('card-attachments')
          .getPublicUrl(fileName);

        return {
          url: urlData.publicUrl,
          name: file.name,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        } as Attachment;
      });

      const newAttachments = await Promise.all(uploadPromises);
      const updatedAttachments = [...(selectedCard.attachments || []), ...newAttachments];

      // Save to database
      const { error: updateError } = await supabase
        .from('cards')
        .update({ attachments: updatedAttachments as unknown as any })
        .eq('id', selectedCard.id);

      if (updateError) throw updateError;

      // Update local state
      setSelectedCard(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      setCards(prev => prev.map(c => 
        c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c
      ));

      sonnerToast.success(`${newAttachments.length} arquivo(s) anexado(s)`);
    } catch (error) {
      console.error("Error uploading file:", error);
      sonnerToast.error("Erro ao fazer upload do arquivo");
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveAttachment = async (attachmentUrl: string) => {
    if (!selectedCard) return;

    try {
      // Extract file path from URL
      const urlParts = attachmentUrl.split('/card-attachments/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from('card-attachments').remove([filePath]);
      }

      const updatedAttachments = (selectedCard.attachments || []).filter(a => a.url !== attachmentUrl);

      // Save to database
      const { error } = await supabase
        .from('cards')
        .update({ attachments: updatedAttachments as unknown as any })
        .eq('id', selectedCard.id);

      if (error) throw error;

      // Update local state
      setSelectedCard(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      setCards(prev => prev.map(c => 
        c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c
      ));

      sonnerToast.success("Anexo removido");
    } catch (error) {
      console.error("Error removing attachment:", error);
      sonnerToast.error("Erro ao remover anexo");
    }
  };

  const isImageFile = (type: string) => type.startsWith('image/');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        new Date(card.delivery_date).toLocaleDateString("pt-BR").includes(searchLower);

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

  // Estado vazio quando não há periodPlanId
  if (!periodPlanId) {
    return (
      <div className="pb-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-3 sm:gap-4 mb-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/client-hub")}
              className="h-8 w-8 sm:h-10 sm:w-10"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Demandas</h1>
          </div>
          
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Nenhum período selecionado</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Selecione um período para visualizar as demandas do cronograma.
            </p>
            <Button onClick={() => navigate("/client-hub")}>
              Voltar ao Hub
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
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
                                        {new Date(card.delivery_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                                      </div>
                                    </CardContent>
                                  </Card>
                                </DialogTrigger>

                                {/* Card Detail Modal - Redesigned */}
                                <DialogContent className="max-w-[95vw] md:max-w-5xl max-h-[90vh] p-0 overflow-hidden">
                                  <div className="grid grid-cols-1 lg:grid-cols-4 h-[90vh]">
                                    {/* Left Column - Main Content (Scrollable) */}
                                    <ScrollArea className="lg:col-span-3 h-full">
                                      <div className="p-5 sm:p-7 space-y-4">
                                        {/* Header with Title */}
                                        <DialogHeader className="pb-4 border-b border-border">
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
                                              className="text-xl font-bold"
                                            />
                                          ) : (
                                            <DialogTitle 
                                              className="text-xl font-bold cursor-pointer rounded-lg p-3 -m-3 transition-all duration-200 hover:bg-muted/50"
                                              onClick={() => setEditingField('title')}
                                            >
                                              {selectedCard?.title}
                                            </DialogTitle>
                                          )}
                                        </DialogHeader>

                                        {/* Section Cards Container */}
                                        <div className="space-y-4">
                                          {/* Card: Objetivo */}
                                          <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
                                            <div className="flex items-center gap-2 mb-3">
                                              <div className="p-1.5 bg-primary/10 rounded-lg">
                                                <Target className="h-4 w-4 text-primary" />
                                              </div>
                                              <h3 className="text-base font-semibold text-foreground">Objetivo</h3>
                                              {saving && editingField === 'objetivo' && (
                                                <span className="text-xs text-muted-foreground ml-auto">Salvando...</span>
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
                                                className="min-h-[80px] text-sm leading-relaxed"
                                                rows={3}
                                              />
                                            ) : (
                                              <div 
                                                className="cursor-pointer transition-all duration-200 hover:bg-muted/30 rounded-lg p-3 -m-1"
                                                onClick={() => setEditingField('objetivo')}
                                              >
                                                {selectedCard?.objetivo ? (
                                                  <p className="text-sm text-foreground leading-relaxed">{selectedCard.objetivo}</p>
                                                ) : (
                                                  <span className="text-muted-foreground/60 text-sm italic">Clique para adicionar objetivo</span>
                                                )}
                                              </div>
                                            )}
                                          </div>

                                          {/* Card: Copy / Texto da Peça */}
                                          <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
                                            <div className="flex items-center gap-2 mb-3">
                                              <div className="p-1.5 bg-secondary/50 rounded-lg">
                                                <FileText className="h-4 w-4 text-secondary-foreground" />
                                              </div>
                                              <h3 className="text-base font-semibold text-foreground">Copy / Texto da Peça</h3>
                                              {saving && editingField === 'description' && (
                                                <span className="text-xs text-muted-foreground ml-auto">Salvando...</span>
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
                                                className="min-h-[200px] font-mono text-sm leading-relaxed"
                                                rows={10}
                                              />
                                            ) : (
                                              <div 
                                                className="cursor-pointer transition-all duration-200 hover:bg-muted/30 rounded-lg"
                                                onClick={() => setEditingField('description')}
                                              >
                                                {selectedCard?.description ? (
                                                  <div className="space-y-3">
                                                    {(() => {
                                                      const lines = selectedCard.description.split('\n');
                                                      const elements: JSX.Element[] = [];
                                                      let currentSection: string | null = null;
                                                      let currentItems: string[] = [];

                                                      const flushItems = (key: string) => {
                                                        if (currentItems.length > 0) {
                                                          elements.push(
                                                            <div key={key} className="bg-muted/40 rounded-lg p-4 border border-border/50">
                                                              <div className="space-y-2">
                                                                {currentItems.map((item, idx) => (
                                                                  <p key={idx} className="text-sm text-foreground leading-relaxed select-text">
                                                                    {item}
                                                                  </p>
                                                                ))}
                                                              </div>
                                                            </div>
                                                          );
                                                          currentItems = [];
                                                        }
                                                      };

                                                      lines.forEach((line, index) => {
                                                        const trimmed = line.trim();
                                                        
                                                        // Section headers (SLIDE X, titles ending with :, **bold**)
                                                        if (trimmed.match(/^SLIDE\s*\d+/i) || 
                                                            (trimmed.endsWith(':') && trimmed.length < 60) ||
                                                            (trimmed.startsWith('**') && trimmed.endsWith('**'))) {
                                                          flushItems(`items-${index}`);
                                                          const cleanTitle = trimmed.replace(/\*\*/g, '').replace(/:$/, '');
                                                          elements.push(
                                                            <div key={`header-${index}`} className="flex items-center gap-2 pt-2 first:pt-0">
                                                              <div className="w-1 h-5 bg-primary rounded-full" />
                                                              <span className="text-sm font-semibold text-foreground">{cleanTitle}</span>
                                                            </div>
                                                          );
                                                          currentSection = cleanTitle;
                                                        }
                                                        // Bullet points
                                                        else if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('→')) {
                                                          const content = trimmed.replace(/^[-•→]\s*/, '');
                                                          currentItems.push(`• ${content}`);
                                                        }
                                                        // Regular content
                                                        else if (trimmed) {
                                                          currentItems.push(trimmed);
                                                        }
                                                      });

                                                      flushItems('items-final');
                                                      return elements;
                                                    })()}
                                                  </div>
                                                ) : (
                                                  <div className="p-3">
                                                    <span className="text-muted-foreground/60 text-sm italic">Clique para adicionar copy</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>

                                          {/* Card: Instruções Técnicas */}
                                          <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
                                            <div className="flex items-center gap-2 mb-3">
                                              <div className="p-1.5 bg-accent/50 rounded-lg">
                                                <ClipboardList className="h-4 w-4 text-accent-foreground" />
                                              </div>
                                              <h3 className="text-base font-semibold text-foreground">Instruções Técnicas</h3>
                                              {saving && editingField === 'instrucoes' && (
                                                <span className="text-xs text-muted-foreground ml-auto">Salvando...</span>
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
                                                className="min-h-[100px] text-sm"
                                                rows={4}
                                              />
                                            ) : (
                                              <div 
                                                className="cursor-pointer transition-all duration-200 hover:bg-muted/30 rounded-lg"
                                                onClick={() => setEditingField('instrucoes')}
                                              >
                                                {selectedCard?.instrucoes ? (
                                                  <ul className="space-y-2 p-3">
                                                    {selectedCard.instrucoes
                                                      .split(/[.]\s+|[\n]/)
                                                      .filter(line => line.trim())
                                                      .map((line, idx) => (
                                                        <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                                                          <span className="text-primary mt-1">•</span>
                                                          <span className="leading-relaxed">{line.trim().replace(/\.$/, '')}</span>
                                                        </li>
                                                      ))}
                                                  </ul>
                                                ) : (
                                                  <div className="p-3">
                                                    <span className="text-muted-foreground/60 text-sm italic">Clique para adicionar instruções</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </ScrollArea>

                                    {/* Right Column - Sidebar Metadata */}
                                    <div className="border-l border-border bg-muted/10 p-4 sm:p-5 space-y-4 overflow-y-auto">
                                      {/* Status Card */}
                                      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
                                        </div>
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
                                            <SelectTrigger className="h-9">
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
                                            className={`cursor-pointer transition-all duration-200 hover:scale-105 w-full justify-center py-1.5 ${
                                              selectedCard?.status === "completed"
                                                ? "bg-emerald-500/90 hover:bg-emerald-500"
                                                : selectedCard?.status === "in_progress"
                                                ? "bg-amber-500/90 hover:bg-amber-500"
                                                : "bg-muted hover:bg-muted/80"
                                            }`}
                                          >
                                            {selectedCard?.status === "completed"
                                              ? "✓ Concluído"
                                              : selectedCard?.status === "in_progress"
                                              ? "⏳ Em Andamento"
                                              : "○ A Fazer"}
                                          </Badge>
                                        )}
                                      </div>

                                      {/* Date Card */}
                                      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entrega</span>
                                        </div>
                                        {editingField === 'delivery_date' ? (
                                          <Input
                                            type="date"
                                            autoFocus
                                            value={selectedCard?.delivery_date || ""}
                                            onChange={(e) =>
                                              setSelectedCard((prev) =>
                                                prev ? { ...prev, delivery_date: e.target.value } : null
                                              )
                                            }
                                            onBlur={() => handleAutoSave('delivery_date', selectedCard?.delivery_date || '')}
                                            className="h-9"
                                          />
                                        ) : (
                                          <div 
                                            className="cursor-pointer transition-all duration-200 hover:bg-muted/50 rounded-lg p-2 -m-1"
                                            onClick={() => setEditingField('delivery_date')}
                                          >
                                            {selectedCard?.delivery_date ? (
                                              <div className="text-sm">
                                                <p className="font-semibold text-foreground">
                                                  {new Date(selectedCard.delivery_date + 'T00:00:00').toLocaleDateString("pt-BR", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                  })}
                                                </p>
                                                <p className="text-xs text-muted-foreground capitalize">
                                                  {new Date(selectedCard.delivery_date + 'T00:00:00').toLocaleDateString("pt-BR", {
                                                    weekday: "long",
                                                  })}
                                                </p>
                                              </div>
                                            ) : (
                                              <span className="text-sm text-muted-foreground">Definir data</span>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Format Card */}
                                      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                          <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formato</span>
                                        </div>
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
                                            placeholder="Ex: Carrossel, Reels..."
                                            className="h-9"
                                          />
                                        ) : (
                                          <div 
                                            className="cursor-pointer transition-all duration-200 hover:bg-muted/50 rounded-lg p-2 -m-1"
                                            onClick={() => setEditingField('file_location')}
                                          >
                                            <p className="text-sm font-medium text-foreground">
                                              {selectedCard?.file_location || "Definir formato"}
                                            </p>
                                          </div>
                                        )}
                                        </div>

                                      {/* Attachments Card */}
                                      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                          <div className="flex items-center gap-2">
                                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Anexos</span>
                                          </div>
                                          {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                        </div>

                                        {/* Uploaded Files */}
                                        {selectedCard?.attachments && selectedCard.attachments.length > 0 && (
                                          <div className="space-y-2 mb-3">
                                            {selectedCard.attachments.map((attachment, idx) => (
                                              <div key={idx} className="group relative bg-muted/30 rounded-lg overflow-hidden">
                                                {isImageFile(attachment.type) ? (
                                                  <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                                                    <img 
                                                      src={attachment.url} 
                                                      alt={attachment.name}
                                                      className="w-full h-20 object-cover transition-transform hover:scale-105"
                                                    />
                                                  </a>
                                                ) : (
                                                  <a 
                                                    href={attachment.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 p-2 hover:bg-muted/50 transition-colors"
                                                  >
                                                    <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                      <p className="text-xs font-medium text-foreground truncate">{attachment.name}</p>
                                                      <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                                                    </div>
                                                  </a>
                                                )}
                                                <button
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleRemoveAttachment(attachment.url);
                                                  }}
                                                  className="absolute top-1 right-1 p-1 bg-destructive/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                                                >
                                                  <X className="h-3 w-3 text-destructive-foreground" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {/* Upload Button */}
                                        <label className="flex items-center justify-center gap-2 w-full py-2 px-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                                          <input
                                            type="file"
                                            multiple
                                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                            onChange={handleFileUpload}
                                            className="sr-only"
                                            disabled={uploading}
                                          />
                                          {uploading ? (
                                            <>
                                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                              <span className="text-xs text-muted-foreground">Enviando...</span>
                                            </>
                                          ) : (
                                            <>
                                              <Upload className="h-4 w-4 text-muted-foreground" />
                                              <span className="text-xs text-muted-foreground">Anexar arquivos</span>
                                            </>
                                          )}
                                        </label>
                                      </div>

                                      {/* Channel & Type Tags */}
                                      {selectedCard && (extractMetadata(selectedCard).platforms.length > 0 || extractMetadata(selectedCard).contentTypes.length > 0) && (
                                        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                          <div className="flex items-center gap-2 mb-3">
                                            <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Canal</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {extractMetadata(selectedCard).platforms.map((platform) => (
                                              <Badge key={platform} variant="outline" className="text-xs px-2 py-0.5">
                                                {platform}
                                              </Badge>
                                            ))}
                                            {extractMetadata(selectedCard).contentTypes.map((type) => (
                                              <Badge key={type} variant="secondary" className="text-xs px-2 py-0.5">
                                                {type}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Timestamps */}
                                      <div className="text-xs text-muted-foreground space-y-1 px-1 pt-2">
                                        <p>Criado: {selectedCard?.created_at ? new Date(selectedCard.created_at).toLocaleDateString("pt-BR") : "-"}</p>
                                        <p>Atualizado: {selectedCard?.updated_at ? new Date(selectedCard.updated_at).toLocaleDateString("pt-BR") : "-"}</p>
                                      </div>

                                      {/* Delete Button */}
                                      <div className="pt-2 mt-auto">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                          onClick={() => setCardToDelete(selectedCard?.id || null)}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          Excluir
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
