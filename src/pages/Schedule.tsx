import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import { Calendar, Filter, LayoutGrid, Loader2, History, Paperclip } from "lucide-react";
import { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment } from "@/components/TaskCard";
import SmartSearchBar from "@/components/SmartSearchBar";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const COLUMNS = [
  { id: "Planejamento", title: "Planejamento", color: "bg-purple-500" },
  { id: "Produção", title: "Produção", color: "bg-amber-500" },
  { id: "Revisão", title: "Revisão", color: "bg-emerald-500" },
  { id: "Aguardando Cliente", title: "Aguardando Cliente", color: "bg-yellow-500" },
  { id: "Agendar Publicação", title: "Agendar Publicação", color: "bg-cyan-500" },
];

// Helper to check if a status name is a sub-column of Produção
const isProductionSubColumn = (statusName: string, productionSubColumns: Set<string>) => {
  return productionSubColumns.has(statusName);
};

export default function Schedule() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { selectedClient, isInitialized } = useSelectedClient();
  
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [isTaskCardOpen, setIsTaskCardOpen] = useState(false);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [referencePeriod, setReferencePeriod] = useState<{ titulo: string; dataInicio: string; dataFim: string } | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [productionSubColumns, setProductionSubColumns] = useState<Set<string>>(new Set());

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPeriods, setHistoryPeriods] = useState<{ id: string; period_title: string; period_start: string; period_end: string; status: string; created_at: string; final_plan: Json | null; }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);

  const handleSearchResultSelect = useCallback((card: KanbanCardData) => {
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
  }, []);

  const periodPlanId = useMemo(() => {
    if (activePeriodId) return activePeriodId;
    const stateValue = (location.state as { periodPlanId?: string })?.periodPlanId;
    if (stateValue) return stateValue;
    const fromQuery = searchParams.get("periodPlanId");
    if (fromQuery) return fromQuery;
    return sessionStorage.getItem('selected-period-id');
  }, [activePeriodId, location.state, searchParams]);

  // Realtime handlers
  const handleRealtimeUpdate = useCallback((itemId: string, attachments: Attachment[]) => {
    setCards(prevCards => 
      prevCards.map(card => card.id === itemId ? { ...card, attachments } : card)
    );
    setSelectedCard(prev => 
      prev && prev.id === itemId ? { ...prev, attachments } : prev
    );
  }, []);

  useRealtimeAttachments({
    tenantId,
    periodPlanId,
    onAttachmentUpdate: handleRealtimeUpdate,
    enabled: !!tenantId && !!periodPlanId
  });

  useEffect(() => {
    if (!isInitialized || tenantLoading) return;
    if (periodPlanId && tenantId) {
      fetchPeriodPlanCards();
      fetchProductionSubColumns();
    } else if (!periodPlanId) {
      setLoading(false);
    }
  }, [periodPlanId, tenantId, isInitialized, tenantLoading]);

  const fetchProductionSubColumns = async () => {
    if (!tenantId) return;
    try {
      const { data: pipelineData } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .maybeSingle();

      if (!pipelineData) return;

      const { data: subColumns } = await supabase
        .from("pipeline_statuses")
        .select("name")
        .eq("pipeline_id", pipelineData.id)
        .not("parent_status_id", "is", null);

      if (subColumns) {
        setProductionSubColumns(new Set(subColumns.map(c => c.name)));
      }
    } catch (error) {
      console.error("Error fetching production sub-columns:", error);
    }
  };

  const fetchPeriodPlanCards = async () => {
    if (!periodPlanId) return;
    
    try {
      setLoading(true);
      
      const [demandsResponse, periodPlanResponse] = await Promise.all([
        supabase
          .from("demands")
          .select(`
            *,
            pipeline_statuses!demands_status_id_fkey (
              name,
              color,
              position,
              parent_status_id
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

      if (demandsResponse.error) throw demandsResponse.error;
      if (periodPlanResponse.error) throw periodPlanResponse.error;

      const allItems: KanbanCardData[] = (demandsResponse.data || []).map(demand => {
        const statusName = demand.pipeline_statuses?.name || "Planejamento";
        const parentStatusId = demand.pipeline_statuses?.parent_status_id;
        
        // For display in Schedule, group sub-columns under "Produção"
        const displayStatus = parentStatusId ? "Produção" : statusName;
        
        return {
          id: demand.id,
          title: demand.title,
          description: demand.instructions || demand.description || null,
          objective: demand.objective || null,
          instructions: demand.instructions || null,
          observations: demand.observations || null,
          status: displayStatus,
          due_date: demand.due_date || demand.publish_date || new Date().toISOString().split('T')[0],
          channel: demand.channel || null,
          attachments: (demand.attachments as unknown as Attachment[] | null) || [],
          publish_date: demand.publish_date || null,
          publish_time: demand.publish_time || null,
          tenant_id: demand.tenant_id,
          period_plan_id: demand.period_plan_id,
          created_at: demand.created_at,
          updated_at: demand.updated_at,
          source: demand.source,
          demand_id: demand.id,
          demand_type: demand.demand_type
        };
      });
      
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

  // Fetch history periods
  const fetchHistoryPeriods = async () => {
    if (!selectedClient?.id || !tenantId) return;
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
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectHistoryPeriod = (periodId: string) => {
    setActivePeriodId(periodId);
    setShowHistoryModal(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString("pt-BR");
  };

  const getPublicationInfo = (card: KanbanCardData) => {
    if (card.publish_date) {
      const time = card.publish_time || '09:00';
      return { date: card.publish_date, time, hasSchedule: true };
    }
    return { date: card.due_date, time: null, hasSchedule: false };
  };

  const contentTypes = useMemo(() => {
    const types = new Set<string>();
    cards.forEach(card => {
      if (card.demand_type) types.add(card.demand_type);
    });
    return Array.from(types).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (contentTypeFilter === "all") return cards;
    return cards.filter(card => card.demand_type === contentTypeFilter);
  }, [cards, contentTypeFilter]);

  if (tenantLoading || !isInitialized) {
    return <LoadingScreen title="Carregando agenda..." />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!periodPlanId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <LayoutGrid className="h-16 w-16 mb-4 opacity-30" />
        <h3 className="text-lg font-semibold mb-2 text-foreground">Nenhum período selecionado</h3>
        <p className="text-sm mb-4">Selecione um período no hub do cliente para ver as demandas</p>
        <Button variant="outline" onClick={() => navigate("/client-hub")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Ir para Hub do Cliente
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Demandas
            </h2>
            {referencePeriod && (
              <p className="text-xs text-muted-foreground">
                {referencePeriod.titulo} • {formatDate(referencePeriod.dataInicio)} - {formatDate(referencePeriod.dataFim)}
              </p>
            )}
          </div>
          <Badge variant="secondary">
            {filteredCards.length} {filteredCards.length === 1 ? 'demanda' : 'demandas'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            fetchHistoryPeriods();
            setShowHistoryModal(true);
          }}>
            <History className="h-4 w-4 mr-1" />
            Períodos
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <SmartSearchBar
            items={cards}
            onResultSelect={handleSearchResultSelect}
            placeholder="Pesquisar demandas..."
            maxResults={8}
          />
        </div>

        {contentTypes.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de conteúdo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {contentTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Read-only Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => {
          const columnCards = filteredCards.filter(
            (card) => card.status === column.id
          );

          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-[280px] bg-muted/30 rounded-xl border border-border/50 flex flex-col"
            >
              {/* Column Header */}
              <div className="px-3 py-3 flex items-center justify-between border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full flex-shrink-0", column.color)} />
                  <span className="text-sm font-semibold text-foreground">{column.title}</span>
                  <Badge variant="secondary" className="text-xs">{columnCards.length}</Badge>
                </div>
              </div>

              {/* Column Content - Static, no drag */}
              <ScrollArea className="flex-1 p-2 min-h-[200px] max-h-[calc(100vh-280px)]">
                <div className="space-y-0">
                  {columnCards.map((card) => {
                    const pubInfo = getPublicationInfo(card);
                    return (
                      <div
                        key={card.id}
                        ref={(el) => {
                          if (el) cardRefs.current.set(card.id, el);
                          else cardRefs.current.delete(card.id);
                        }}
                        className={cn(
                          highlightedCardId === card.id && "ring-2 ring-primary/50 rounded-lg"
                        )}
                      >
                        <Card
                          className="mb-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50"
                          onClick={() => {
                            setSelectedCard(card);
                            setIsTaskCardOpen(true);
                          }}
                        >
                          <div className="px-3 pt-3 pb-2">
                            <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">
                              {card.title}
                            </h4>
                          </div>
                          <div className="px-3 pb-3 pt-0 space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              {card.demand_type && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                                  {card.demand_type}
                                </Badge>
                              )}
                              {card.channel && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium">
                                  {card.channel}
                                </Badge>
                              )}
                              {card.attachments && card.attachments.length > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium">
                                  <Paperclip className="h-3 w-3 mr-0.5" />
                                  {card.attachments.length}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
                              <Calendar className="h-3 w-3" />
                              {formatDate(pubInfo.date)}
                              {pubInfo.hasSchedule && pubInfo.time && (
                                <span className="ml-1">{pubInfo.time}</span>
                              )}
                            </div>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {/* TaskCard Modal - Read Only */}
      <TaskCard
        open={isTaskCardOpen}
        onOpenChange={(open) => {
          setIsTaskCardOpen(open);
          if (!open) {
            setSelectedCard(null);
          }
        }}
        card={selectedCard}
        onCardChange={(card) => setSelectedCard(card)}
        onSave={async () => {}}
        onFileUpload={async () => {}}
        onRemoveAttachment={async () => {}}
        onDelete={() => {}}
        readOnly={true}
      />

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de Períodos</DialogTitle>
          </DialogHeader>
          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {historyPeriods.map(period => (
                  <div
                    key={period.id}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                      period.id === periodPlanId ? "border-primary bg-primary/5" : "border-border"
                    )}
                    onClick={() => handleSelectHistoryPeriod(period.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{period.period_title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(period.period_start)} - {formatDate(period.period_end)}
                        </p>
                      </div>
                      <Badge variant={period.status === 'generated' ? 'secondary' : 'outline'} className="text-xs">
                        {period.status === 'generated' ? 'Gerado' : period.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {historyPeriods.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Nenhum período encontrado
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
