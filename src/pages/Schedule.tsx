import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useAgencyRole } from "@/hooks/useAgencyRole";
import { ArrowLeft, Calendar, Filter, LayoutGrid, Loader2, History, Plus, ChevronRight, Paperclip, Sparkles } from "lucide-react";
import { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { toast as sonnerToast } from "sonner";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { LoadingScreen } from "@/components/LoadingScreen";
import TaskCard, { getColumnFromStatus, getStatusFromColumn, LEGACY_STATUS_MAP } from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PublicationDate } from "@/components/TaskCard";
import SmartSearchBar from "@/components/SmartSearchBar";
import { CreateDemandModal } from "@/components/CreateDemandModal";
import { SchedulePublicationModal } from "@/components/SchedulePublicationModal";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

// Using types from TaskCard component

const COLUMNS = [
  { id: "Planejamento", title: "Planejamento", color: "bg-purple-500" },
  { id: "Produção", title: "Produção", color: "bg-amber-500" },
  { id: "Revisão", title: "Revisão", color: "bg-emerald-500" },
  { id: "Aguardando Cliente", title: "Aguardando Cliente", color: "bg-yellow-500" },
  { id: "Agendar Publicação", title: "Agendar Publicação", color: "bg-cyan-500" },
];

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { selectedClient, isInitialized } = useSelectedClient();
  const { isSuperAdmin, isAgencyAdmin, isAgencyManager } = useAgencyRole();
  
  // Permission to create demands (SUPER_ADMIN, AGENCY_ADMIN, or AGENCY_MANAGER)
  const canCreateDemand = isSuperAdmin || isAgencyAdmin || isAgencyManager;
  
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [referencePeriod, setReferencePeriod] = useState<{ titulo: string; dataInicio: string; dataFim: string } | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [showCreateDemandModal, setShowCreateDemandModal] = useState(false);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Handle search result selection - scroll to and highlight card
  const handleSearchResultSelect = useCallback((card: KanbanCardData) => {
    // Highlight the card
    setHighlightedCardId(card.id);
    
    // Scroll to the card after a short delay
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
  }, []);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPeriods, setHistoryPeriods] = useState<{ id: string; period_title: string; period_start: string; period_end: string; status: string; created_at: string; final_plan: Json | null; }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  
  // Schedule Publication Modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [pendingScheduleCard, setPendingScheduleCard] = useState<{
    card: KanbanCardData;
    previousColumn: string;
    previousStatus: string;
  } | null>(null);

  // Prioridade: 1) State local, 2) Router state, 3) Query param, 4) SessionStorage
  const periodPlanId = useMemo(() => {
    // 1. State local (para navegação in-place)
    if (activePeriodId) {
      return activePeriodId;
    }
    // 2. Tentar do state (mais confiável, não sofre encoding)
    const stateValue = (location.state as { periodPlanId?: string })?.periodPlanId;
    if (stateValue) {
      return stateValue;
    }
    // 3. Tentar do query param (fallback para links diretos)
    const fromQuery = searchParams.get("periodPlanId");
    if (fromQuery) {
      return fromQuery;
    }
    // 4. Tentar do sessionStorage (backup)
    return sessionStorage.getItem('selected-period-id');
  }, [activePeriodId, location.state, searchParams]);

  useEffect(() => {
    // Aguardar contextos inicializarem
    if (!isInitialized || tenantLoading) return;
    
    // Só buscar dados se tiver periodPlanId e tenantId
    if (periodPlanId && tenantId) {
      fetchPeriodPlanCards();
    } else if (!periodPlanId) {
      // Sem periodPlanId, mostrar estado vazio (não redirecionar)
      setLoading(false);
    }
  }, [periodPlanId, tenantId, isInitialized, tenantLoading]);

  const fetchPeriodPlanCards = async () => {
    if (!periodPlanId) return;
    
    try {
      setLoading(true);
      
      // Fetch cards, demands, and period plan info in parallel
      const [cardsResponse, demandsResponse, periodPlanResponse] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("period_plan_id", periodPlanId)
          .order("created_at", { ascending: true }),
        supabase
          .from("demands")
          .select(`
            *,
            pipeline_statuses!demands_status_id_fkey (
              name,
              color,
              position
            )
          `)
          .eq("period_plan_id", periodPlanId)
          .order("created_at", { ascending: true }),
        supabase
          .from("period_plans")
          .select("period_title, period_start, period_end, tenant_id")
          .eq("id", periodPlanId)
          .single()
      ]);

      if (cardsResponse.error) throw cardsResponse.error;
      if (demandsResponse.error) throw demandsResponse.error;
      if (periodPlanResponse.error) throw periodPlanResponse.error;

      // Cast attachments and publication_dates from Json to proper types for cards
      const cardsWithAttachments: KanbanCardData[] = (cardsResponse.data || []).map(card => ({
        ...card,
        attachments: (card.attachments as unknown as Attachment[] | null) || [],
        publication_dates: (card.publication_dates as unknown as PublicationDate[] | null) || [],
        source: 'card' as const
      }));
      
      // Map demands to KanbanCardData format
      const demandsAsCards: KanbanCardData[] = (demandsResponse.data || []).map(demand => {
        // O nome do status no banco É o nome da coluna (modelo dinâmico)
        const statusName = demand.pipeline_statuses?.name || "Planejamento";
        const columnName = statusName; // Usar diretamente - não precisa de conversão
        
        return {
          id: demand.id,
          title: demand.title,
          description: demand.instructions || demand.description || null,
          objetivo: demand.objective || null,
          instrucoes: demand.instructions || null,
          observations: null,
          status: statusName,
          column_name: columnName,
          delivery_date: demand.due_date || demand.publish_date || new Date().toISOString().split('T')[0],
          file_location: demand.channel || null,
          attachments: (demand.attachments as unknown as Attachment[] | null) || [],
          publication_dates: demand.publish_date ? [{
            date: demand.publish_date,
            time: "09:00",
            platform: demand.channel || undefined
          }] : [],
          tenant_id: demand.tenant_id,
          period_plan_id: demand.period_plan_id,
          plan_id: null,
          created_at: demand.created_at,
          updated_at: demand.updated_at,
          source: 'demand' as const,
          demand_id: demand.id,
          demand_type: demand.demand_type,
          channel: demand.channel
        };
      });
      
      // Combine cards and demands, sorted by created_at
      const allItems = [...cardsWithAttachments, ...demandsAsCards].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      setCards(allItems);
      
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

      // Find the card to determine its source
      const cardToRemove = cards.find(c => c.id === cardToDelete);
      
      if (cardToRemove?.source === 'demand') {
        const { error } = await supabase
          .from("demands")
          .delete()
          .eq("id", cardToDelete);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cards")
          .delete()
          .eq("id", cardToDelete);

        if (error) throw error;
      }

      sonnerToast.success("Demanda excluída com sucesso!");
      setCardToDelete(null);
      
      await fetchPeriodPlanCards();
    } catch (error) {
      console.error("Error deleting card:", error);
      sonnerToast.error("Erro ao excluir demanda");
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
    const newStatus = getStatusFromColumn(newColumnName);
    const previousColumn = source.droppableId;
    const previousStatus = card.status;

    // Se estiver movendo para "Agendar Publicação", abrir modal de confirmação
    if (newColumnName === "Agendar Publicação") {
      // Guardar estado pendente para o modal
      setPendingScheduleCard({
        card,
        previousColumn,
        previousStatus,
      });
      
      // Mover visualmente para dar feedback
      setCards((prev) =>
        prev.map((c) =>
          c.id === draggableId
            ? { ...c, column_name: newColumnName, status: newStatus }
            : c
        )
      );
      
      // Abrir modal
      setShowScheduleModal(true);
      return;
    }

    // Para outras colunas, mover normalmente
    setCards((prev) =>
      prev.map((c) =>
        c.id === draggableId
          ? { ...c, column_name: newColumnName, status: newStatus }
          : c
      )
    );

    // Atualizar no banco (escolher tabela correta baseado no source)
    try {
      if (card.source === 'demand') {
        // Para demands, buscar status_id pelo NOME DA COLUNA (que é igual ao nome do status no banco)
        const { data: statusData } = await supabase
          .from("pipeline_statuses")
          .select("id")
          .eq("name", newColumnName)
          .limit(1)
          .maybeSingle();
        
        const { error } = await supabase
          .from("demands")
          .update({ 
            status_id: statusData?.id,
            updated_at: new Date().toISOString()
          })
          .eq("id", card.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cards")
          .update({ column_name: newColumnName, status: newStatus })
          .eq("id", card.id);

        if (error) throw error;
      }

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

  // Handler para confirmar agendamento no modal
  const handleConfirmSchedule = async (date: string, time: string) => {
    if (!pendingScheduleCard) return;

    const { card } = pendingScheduleCard;
    
    try {
      // Criar datetime combinando data e hora
      const publishDateTime = new Date(`${date}T${time}:00`);
      
      // publication_dates para atualização local (ambos usam)
      const newPublicationDates = [{
        date,
        time,
        platform: card.file_location || undefined
      }];

      if (card.source === 'demand') {
        // Para demands, buscar status_id e salvar publish_date
        const { data: statusData } = await supabase
          .from("pipeline_statuses")
          .select("id")
          .eq("name", "Agendar Publicação")
          .limit(1)
          .maybeSingle();
        
        const { error } = await supabase
          .from("demands")
          .update({ 
            status_id: statusData?.id,
            publish_date: date,
            updated_at: new Date().toISOString()
          })
          .eq("id", card.id);

        if (error) throw error;
        
        // Atualizar card localmente com publication_dates (para exibir horário correto na UI)
        setCards((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? { ...c, publication_dates: newPublicationDates }
              : c
          )
        );
      } else {
        // Para cards, salvar publication_dates
        const { error } = await supabase
          .from("cards")
          .update({ 
            column_name: "Agendar Publicação", 
            status: getStatusFromColumn("Agendar Publicação"),
            publication_dates: newPublicationDates
          })
          .eq("id", card.id);

        if (error) throw error;
        
        // Atualizar card localmente com publication_dates
        setCards((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? { ...c, publication_dates: newPublicationDates }
              : c
          )
        );
      }

      // Formatar texto do toast
      const dayOfWeek = format(publishDateTime, "EEEE", { locale: ptBR });
      const dateExtenso = format(publishDateTime, "d 'de' MMMM", { locale: ptBR });
      
      // Toast de sucesso com link
      sonnerToast.success(
        <div className="flex flex-col gap-1">
          <span>Conteúdo agendado para {dayOfWeek}, {dateExtenso} às {time}.</span>
          <a 
            href="/content-schedule" 
            className="text-primary underline hover:no-underline text-sm font-medium"
            onClick={(e) => {
              e.preventDefault();
              navigate("/content-schedule");
            }}
          >
            Ver Agendamentos
          </a>
        </div>,
        { duration: 5000 }
      );

      // Limpar estado
      setShowScheduleModal(false);
      setPendingScheduleCard(null);
      
    } catch (error) {
      console.error("Error scheduling card:", error);
      sonnerToast.error("Erro ao agendar publicação");
      
      // Reverter em caso de erro
      if (pendingScheduleCard) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? { ...c, column_name: pendingScheduleCard.previousColumn, status: pendingScheduleCard.previousStatus }
              : c
          )
        );
      }
      setShowScheduleModal(false);
      setPendingScheduleCard(null);
    }
  };

  // Handler para cancelar agendamento no modal
  const handleCancelSchedule = () => {
    if (!pendingScheduleCard) {
      setShowScheduleModal(false);
      return;
    }

    const { card, previousColumn, previousStatus } = pendingScheduleCard;
    
    // Reverter card para coluna anterior
    setCards((prev) =>
      prev.map((c) =>
        c.id === card.id
          ? { ...c, column_name: previousColumn, status: previousStatus }
          : c
      )
    );

    // Toast neutro
    sonnerToast("O conteúdo não foi agendado corretamente.", {
      duration: 3500,
    });

    // Limpar estado
    setShowScheduleModal(false);
    setPendingScheduleCard(null);
  };

  const handleAutoSave = async (field: string, value: string) => {
    if (!selectedCard) return;

    setSaving(true);
    try {
      // Handle JSON fields that need to be parsed
      let parsedValue: any = value;
      if (field === 'publication_dates' || field === 'attachments') {
        try {
          parsedValue = JSON.parse(value);
          // PROTEÇÃO: Nunca sobrescrever attachments com array vazio acidentalmente via handleAutoSave
          if (field === 'attachments' && (!Array.isArray(parsedValue) || parsedValue.length === 0)) {
            console.warn('[Attachment] Proteção ativada: tentativa de sobrescrever attachments com valor vazio via handleAutoSave', {
              cardId: selectedCard.id,
              currentAttachments: selectedCard.attachments?.length,
              attemptedValue: value
            });
            setSaving(false);
            return;
          }
        } catch {
          console.warn('[Attachment] JSON parse falhou para field:', field, value);
          parsedValue = value;
        }
      }
      
      const updateData: Record<string, any> = { [field]: parsedValue };
      
      // If status changes, also update the column_name to sync with Kanban
      if (field === 'status') {
        const newColumnName = getColumnFromStatus(value);
        updateData.column_name = newColumnName;
      }
      
      // Choose table based on source
      if (selectedCard.source === 'demand') {
        // Map card fields to demand fields
        const demandUpdateData: Record<string, any> = {};
        
        if (field === 'title') demandUpdateData.title = parsedValue;
        else if (field === 'description' || field === 'instrucoes') demandUpdateData.instructions = parsedValue;
        else if (field === 'objetivo') demandUpdateData.objective = parsedValue;
        else if (field === 'observations') demandUpdateData.description = parsedValue;
        else if (field === 'attachments') demandUpdateData.attachments = parsedValue;
        else if (field === 'status') {
          // Find status_id by name
          const { data: statusData } = await supabase
            .from("pipeline_statuses")
            .select("id")
            .eq("name", value)
            .limit(1)
            .maybeSingle();
          if (statusData) demandUpdateData.status_id = statusData.id;
        }
        else if (field === 'publication_dates' && Array.isArray(parsedValue) && parsedValue.length > 0) {
          demandUpdateData.publish_date = parsedValue[0].date;
        }
        else if (field === 'delivery_date') demandUpdateData.due_date = parsedValue;
        
        if (Object.keys(demandUpdateData).length > 0) {
          demandUpdateData.updated_at = new Date().toISOString();
          const { error } = await supabase
            .from("demands")
            .update(demandUpdateData)
            .eq("id", selectedCard.id);

          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("cards")
          .update(updateData)
          .eq("id", selectedCard.id);

        if (error) throw error;
      }

      // Update local cards state (include column_name if status changed)
      setCards(prev => prev.map(c => {
        if (c.id === selectedCard.id) {
          const updates: Partial<KanbanCardData> = { [field]: parsedValue };
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
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - limite do plano gratuito Supabase

    // Validar tamanho de cada arquivo
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ');
      const fileSizes = oversizedFiles.map(f => `${(f.size / (1024 * 1024)).toFixed(1)}MB`).join(', ');
      sonnerToast.error(
        `Arquivo muito grande: ${fileNames} (${fileSizes})`,
        { 
          description: "Limite de 50MB por arquivo no plano gratuito do Supabase.",
          duration: 6000 
        }
      );
      event.target.value = '';
      return;
    }

    // Obter dados do usuário atual para rastreabilidade
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      sonnerToast.error("Usuário não autenticado. Faça login novamente.");
      return;
    }

    setUploading(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substring(2, 9);
        
        // Caminho organizado: tenant/client/period/card/timestamp-uniqueId.ext
        // Estrutura hierárquica para rastreabilidade e organização
        const storagePath = [
          tenantId || 'unknown-tenant',
          selectedClient?.id || 'unknown-client',
          periodPlanId || 'unknown-period',
          selectedCard.id,
          `${timestamp}-${uniqueId}.${fileExt}`
        ].join('/');
        
        const { data, error } = await supabase.storage
          .from('card-attachments')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false // Nunca sobrescrever - cada anexo é único
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('card-attachments')
          .getPublicUrl(storagePath);

        // Metadados completos do anexo para rastreabilidade
        const attachment: Attachment = {
          // Identificação do arquivo
          url: urlData.publicUrl,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          storagePath: storagePath,
          
          // Metadados de auditoria
          uploadedAt: new Date().toISOString(),
          uploadedBy: {
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.full_name || undefined
          },
          
          // Vínculos obrigatórios
          cardId: selectedCard.id,
          tenantId: tenantId || '',
          clientId: selectedClient?.id,
          periodPlanId: periodPlanId || undefined
        };

        return attachment;
      });

      const newAttachments = await Promise.all(uploadPromises);
      const updatedAttachments = [...(selectedCard.attachments || []), ...newAttachments];

      // Salvar no banco de dados com metadados completos
      const { error: updateError } = await supabase
        .from('cards')
        .update({ 
          attachments: updatedAttachments as unknown as any,
          updated_at: new Date().toISOString() // Atualizar timestamp para histórico
        })
        .eq('id', selectedCard.id);

      if (updateError) throw updateError;

      // Atualizar estado local
      setSelectedCard(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      setCards(prev => prev.map(c => 
        c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c
      ));

      sonnerToast.success(
        `${newAttachments.length} arquivo(s) anexado(s) com sucesso`,
        { description: `Vinculado à tarefa: ${selectedCard.title?.substring(0, 30)}...` }
      );
    } catch (error: any) {
      console.error("Error uploading file:", error);
      
      // Mensagens de erro específicas para debugging
      if (error?.message?.includes('exceeded the maximum allowed size') || error?.statusCode === '413') {
        sonnerToast.error("Arquivo muito grande para o bucket.", { 
          description: "Contate o administrador para aumentar o limite do storage.",
          duration: 5000 
        });
      } else if (error?.message?.includes('not found') || error?.statusCode === '404') {
        sonnerToast.error("Bucket de armazenamento não encontrado.", {
          description: "Verifique a configuração do Supabase Storage."
        });
      } else if (error?.message?.includes('Duplicate')) {
        sonnerToast.error("Arquivo duplicado.", {
          description: "Um arquivo com esse nome já existe."
        });
      } else {
        sonnerToast.error(`Erro ao fazer upload: ${error?.message || 'Tente novamente'}`);
      }
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveAttachment = async (attachmentUrl: string) => {
    if (!selectedCard) return;

    // Encontrar o anexo pelo URL
    const attachment = (selectedCard.attachments || []).find(a => a.url === attachmentUrl);
    
    // Log de auditoria para debugging
    console.log('[Attachment] Iniciando remoção de anexo:', {
      cardId: selectedCard.id,
      cardTitle: selectedCard.title,
      attachmentName: attachment?.name,
      attachmentUrl: attachmentUrl,
      totalAnexosAntes: selectedCard.attachments?.length || 0
    });

    try {
      // Usar storagePath se disponível (mais confiável), senão extrair da URL
      let filePath: string | null = null;
      if (attachment?.storagePath) {
        filePath = attachment.storagePath;
      } else {
        // Fallback para anexos antigos sem storagePath
        const urlParts = attachmentUrl.split('/card-attachments/');
        if (urlParts.length > 1) {
          filePath = urlParts[1];
        }
      }

      // Remover do storage
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from('card-attachments')
          .remove([filePath]);
        
        if (storageError) {
          console.warn("[Attachment] Aviso ao remover do storage:", storageError);
          // Continuar mesmo com erro no storage (arquivo pode já ter sido removido)
        }
      }

      const updatedAttachments = (selectedCard.attachments || []).filter(a => a.url !== attachmentUrl);

      // Salvar no banco de dados
      const { error } = await supabase
        .from('cards')
        .update({ 
          attachments: updatedAttachments as unknown as any,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCard.id);

      if (error) throw error;

      console.log('[Attachment] Anexo removido com sucesso:', {
        cardId: selectedCard.id,
        totalAnexosDepois: updatedAttachments.length
      });

      // Atualizar estado local
      setSelectedCard(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      setCards(prev => prev.map(c => 
        c.id === selectedCard.id ? { ...c, attachments: updatedAttachments } : c
      ));

      sonnerToast.success("Anexo removido com sucesso");
    } catch (error) {
      console.error("[Attachment] Error removing attachment:", error);
      sonnerToast.error("Erro ao remover anexo. Tente novamente.");
    }
  };

  const isImageFile = (type: string) => type.startsWith('image/');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fetchHistoryPeriods = async () => {
    if (!selectedClient || !tenantId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end, status, created_at, final_plan")
        .eq("company_id", selectedClient.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistoryPeriods(data || []);
    } catch (error) {
      console.error("Error fetching history periods:", error);
      sonnerToast.error("Erro ao carregar histórico");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleHistoryClick = () => {
    fetchHistoryPeriods();
    setShowHistoryModal(true);
  };

  const handleHistoryPeriodSelect = (periodId: string) => {
    setShowHistoryModal(false);
    sessionStorage.setItem('selected-period-id', periodId);
    setActivePeriodId(periodId);
  };

  const getDemandCount = (finalPlan: Json | null): number => {
    if (!finalPlan) return 0;
    if (Array.isArray(finalPlan)) return finalPlan.length;
    return 0;
  };

  const formatHistoryDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
  };

  // Tipos de conteúdo disponíveis para filtro
  const CONTENT_TYPES = [
    { value: "carrossel", label: "Carrossel", keywords: ["carrossel", "carousel"] },
    { value: "reels", label: "Reels", keywords: ["reels", "reel"] },
    { value: "comercial", label: "Comercial", keywords: ["comercial", "vídeo comercial", "video comercial", "anúncio", "anuncio", "ad"] },
    { value: "story", label: "Story/Stories", keywords: ["story", "stories", "storie"] },
    { value: "post-estatico", label: "Post Estático", keywords: ["post estático", "post estatico", "imagem estática", "imagem estatica", "post único", "post unico", "arte única", "arte unica", "single post"] },
    { value: "video", label: "Vídeo", keywords: ["vídeo", "video"] },
    { value: "live", label: "Live", keywords: ["live", "ao vivo"] },
    { value: "blog", label: "Blog/Artigo", keywords: ["blog", "artigo", "texto", "matéria", "materia"] },
  ];

  // Filtrar cards baseado no tipo de conteúdo
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      if (contentTypeFilter === "all") return true;
      
      const contentType = CONTENT_TYPES.find(ct => ct.value === contentTypeFilter);
      if (!contentType) return true;
      
      const text = `${card.title || ''} ${card.file_location || ''} ${card.description || ''}`.toLowerCase();
      return contentType.keywords.some(keyword => text.includes(keyword));
    });
  }, [cards, contentTypeFilter]);

  // Função auxiliar para obter a próxima data de publicação de um card
  const getNextPublicationDateTime = (card: KanbanCardData): Date | null => {
    const pubDates = card.publication_dates;
    if (!pubDates || pubDates.length === 0) {
      // Fallback para delivery_date se não tiver publication_dates
      if (card.delivery_date) {
        return new Date(card.delivery_date + 'T09:00:00');
      }
      return null;
    }
    
    const now = new Date();
    // Encontrar a próxima data de publicação (mais próxima do agora ou a primeira futura)
    const sortedDates = [...pubDates]
      .filter(pd => pd.date)
      .map(pd => new Date(`${pd.date}T${pd.time || '09:00'}:00`))
      .sort((a, b) => a.getTime() - b.getTime());
    
    // Encontrar a primeira data futura ou a mais recente passada
    const futureDate = sortedDates.find(d => d.getTime() >= now.getTime());
    return futureDate || sortedDates[0] || null;
  };

  // Função para calcular a prioridade baseada na data de publicação
  const getPublicationPriority = (card: KanbanCardData): { label: string; className: string } | null => {
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

  const getCardsByColumn = (columnId: string) => {
    let columnCards = filteredCards.filter((card) => (card.column_name || "Planejamento") === columnId);
    
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

  // Extract platform and content type from title/description/file_location
  const extractMetadata = (card: KanbanCardData) => {
    const text = `${card.file_location || ''} ${card.description || ''}`.toLowerCase();
    const titleLower = (card.title || '').toLowerCase();
    
    const platforms: string[] = [];
    
    // Platforms from file_location and description
    if (text.includes('instagram')) platforms.push('Instagram');
    if (text.includes('facebook')) platforms.push('Facebook');
    if (text.includes('linkedin')) platforms.push('LinkedIn');
    if (text.includes('youtube')) platforms.push('YouTube');
    if (text.includes('tiktok')) platforms.push('TikTok');
    if (text.includes('twitter') || text.includes('x.com')) platforms.push('Twitter/X');
    if (text.includes('whatsapp')) platforms.push('WhatsApp');
    
    return { platforms };
  };

  // Extract content type and clean title from card title
  const parseCardTitle = (title: string) => {
    // Content type keywords to detect
    const contentTypes = [
      { keywords: ['reels', 'reel'], type: 'Reels' },
      { keywords: ['carrossel', 'carousel'], type: 'Carrossel' },
      { keywords: ['vídeo curto', 'video curto', 'short'], type: 'Vídeo Curto' },
      { keywords: ['vídeo', 'video'], type: 'Vídeo' },
      { keywords: ['post estático', 'post estatico'], type: 'Post' },
      { keywords: ['post'], type: 'Post' },
      { keywords: ['stories', 'story'], type: 'Stories' },
      { keywords: ['artigo', 'blog'], type: 'Artigo' },
    ];

    let workingTitle = title.trim();
    
    // Remove platform prefix if present (e.g., "Instagram: Carrossel - Title")
    const platformPrefixes = [
      /^instagram:\s*/i,
      /^linkedin:\s*/i,
      /^facebook:\s*/i,
      /^tiktok:\s*/i,
      /^youtube:\s*/i,
    ];
    
    for (const platformPattern of platformPrefixes) {
      if (platformPattern.test(workingTitle)) {
        workingTitle = workingTitle.replace(platformPattern, '').trim();
        break;
      }
    }

    // Try to match content type at the beginning with optional parentheses content
    // Pattern: "ContentType (optional info) — rest" or "ContentType (optional info) - rest"
    for (const { keywords, type } of contentTypes) {
      for (const keyword of keywords) {
        // Match: keyword + optional (parentheses) + separator (—, -, –, :)
        const regex = new RegExp(
          `^${keyword}\\s*(\\([^)]*\\))?\\s*[—–\\-:]\\s*`,
          'i'
        );
        
        if (regex.test(workingTitle)) {
          return {
            contentType: type,
            cleanTitle: workingTitle.replace(regex, '').trim()
          };
        }
      }
    }

    return { contentType: null, cleanTitle: workingTitle };
  };

  // Aguardar contextos inicializarem
  if (!isInitialized || tenantLoading) {
    return (
      <LoadingScreen
        title="Carregando"
        description="Aguarde enquanto preparamos tudo..."
        icon={LayoutGrid}
      />
    );
  }

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
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-3 sm:gap-4 mb-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/client-hub")}
              className="h-8 w-8 sm:h-10 sm:w-10"
              aria-label="Voltar para o hub do cliente"
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
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/client-hub")}
              className="h-8 w-8 sm:h-10 sm:w-10"
              aria-label="Voltar para o hub do cliente"
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <div className="flex-1">
              <SmartSearchBar
                items={cards}
                onResultSelect={handleSearchResultSelect}
                placeholder="Pesquisar demandas..."
                maxResults={10}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                <SelectTrigger className="w-[180px]" aria-label="Filtrar por tipo de conteúdo">
                  <SelectValue placeholder="Tipo de conteúdo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="carrossel">Carrossel</SelectItem>
                  <SelectItem value="reels">Reels</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="story">Story/Stories</SelectItem>
                  <SelectItem value="post-estatico">Post Estático</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="blog">Blog/Artigo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" onClick={handleHistoryClick} className="w-full sm:w-auto">
              <History className="h-4 w-4 mr-2" />
              Histórico
            </Button>
            
            {canCreateDemand && (
              <Button onClick={() => setShowCreateDemandModal(true)} className="w-full sm:w-auto">
                <Sparkles className="h-4 w-4 mr-2" />
                Criar Demanda
              </Button>
            )}
          </div>
        </div>

        {/* Kanban Board */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-4">
            {COLUMNS.map((column) => {
              const columnCards = getCardsByColumn(column.id);
              return (
                <div key={column.id} className="bg-muted/30 rounded-xl p-4 border border-border/50 min-h-[400px] flex flex-col">
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
                            "min-h-[250px] transition-colors rounded-lg p-1",
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
                              const { platforms } = extractMetadata(card);
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
                                      onClick={() => {
                                        setSelectedCard(card);
                                        setIsTaskCardOpen(true);
                                      }}
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
                                        
                                        {/* Platform Badges */}
                                        {platforms.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mb-2">
                                            {platforms.slice(0, 2).map((platform) => (
                                              <Badge 
                                                key={platform} 
                                                variant="outline" 
                                                className="text-[10px] px-2 py-0.5 font-medium border-border/60 text-muted-foreground"
                                              >
                                                {platform}
                                              </Badge>
                                            ))}
                                          </div>
                                        )}
                                        
                                        {/* Title */}
                                        <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground mb-2">
                                          {card.title}
                                        </h4>
                                        
                                        {/* Footer: Publication Date + Time + Attachments */}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                          <div className="flex items-center gap-1">
                                            {column.id === "Agendar Publicação" && card.publication_dates?.[0]?.date ? (
                                              <>
                                                <span>{new Date(card.publication_dates[0].date + 'T00:00:00').toLocaleDateString("pt-BR")}</span>
                                                {card.publication_dates[0].time && (
                                                  <span className="text-muted-foreground/70">• {card.publication_dates[0].time}</span>
                                                )}
                                              </>
                                            ) : (
                                              <span>{new Date(card.delivery_date + 'T00:00:00').toLocaleDateString("pt-BR")}</span>
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
          onOpenChange={setIsTaskCardOpen}
          card={selectedCard}
          onCardChange={setSelectedCard}
          onSave={handleAutoSave}
          onFileUpload={handleFileUpload}
          onRemoveAttachment={handleRemoveAttachment}
          onDelete={() => setCardToDelete(selectedCard?.id || null)}
          saving={saving}
          savingField={savingField}
          uploading={uploading}
        />

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

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="w-[95vw] max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Selecionar Período
            </DialogTitle>
          </DialogHeader>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyPeriods.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Nenhum período encontrado</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 px-4">
                Crie um novo período para começar a planejar suas demandas.
              </p>
              <Button onClick={() => { setShowHistoryModal(false); navigate("/plan-period"); }} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Criar Novo Período
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[50vh] sm:max-h-[400px] pr-2 sm:pr-4">
                <div className="space-y-2">
                  {historyPeriods.map(period => {
                    const demandCount = getDemandCount(period.final_plan);
                    const isCurrentPeriod = period.id === periodPlanId;
                    return (
                      <Card 
                        key={period.id} 
                        className={`p-3 sm:p-4 cursor-pointer hover:bg-accent/50 transition-all border hover:border-primary/50 active:scale-[0.98] group ${isCurrentPeriod ? 'border-primary bg-accent/30' : ''}`}
                        onClick={() => handleHistoryPeriodSelect(period.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-foreground text-sm sm:text-base truncate">
                              {period.period_title}
                              {isCurrentPeriod && <Badge variant="secondary" className="ml-2 text-xs">Atual</Badge>}
                            </h4>
                            <div className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground mt-1">
                              <span>{formatHistoryDate(period.created_at.split('T')[0])}</span>
                              <span>•</span>
                              <span>{demandCount} demandas</span>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="pt-3 sm:pt-4 border-t">
                <Button variant="outline" className="w-full" onClick={() => { setShowHistoryModal(false); navigate("/plan-period"); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Novo Período
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Create Demand Modal */}
      <CreateDemandModal
        open={showCreateDemandModal}
        onOpenChange={setShowCreateDemandModal}
        periodPlanId={periodPlanId}
        onDemandCreated={fetchPeriodPlanCards}
      />

      {/* Schedule Publication Modal */}
      <SchedulePublicationModal
        open={showScheduleModal}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelSchedule();
          }
        }}
        existingDate={pendingScheduleCard?.card?.publication_dates?.[0]?.date || null}
        existingTime={pendingScheduleCard?.card?.publication_dates?.[0]?.time || null}
        onConfirm={handleConfirmSchedule}
        onCancel={handleCancelSchedule}
      />
    </div>
  );
}
