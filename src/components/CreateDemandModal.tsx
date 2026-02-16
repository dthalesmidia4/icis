import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { 
  CalendarIcon, 
  Loader2, 
  Sparkles, 
  RefreshCw, 
  Instagram, 
  Linkedin, 
  Video, 
  Image, 
  FileText,
  Repeat,
  MoreHorizontal
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
}

interface PipelineStatus {
  id: string;
  name: string;
  color: string;
  is_initial: boolean;
  requires_fields: string[];
}

interface Client {
  id: string;
  name: string;
  fantasy_name?: string;
}

interface DemandSuggestion {
  id: string;
  title_template: string;
  instructions_template?: string;
  demand_type?: string;
  channel?: string;
  pipeline_id: string;
  status_id: string;
  default_publish_weekday?: number;
  recurrence_hint?: string;
  score: number;
  source: 'seed' | 'learned' | 'manual';
  times_used: number;
  suggested_publish_date?: string;
}

interface CreateDemandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodPlanId?: string | null;
  onDemandCreated?: () => void;
}

const DEMAND_TYPES = [
  { value: "Captação", label: "Captação", icon: Video },
  { value: "Reel", label: "Reel", icon: Video },
  { value: "Carrossel", label: "Carrossel", icon: Image },
  { value: "Post", label: "Post", icon: Image },
  { value: "Stories", label: "Stories", icon: Image },
  { value: "Landing", label: "Landing Page", icon: FileText },
  { value: "Roteiro", label: "Roteiro", icon: FileText },
  { value: "Outro", label: "Outro", icon: FileText },
];

const CHANNELS = [
  { value: "Instagram", label: "Instagram", icon: Instagram },
  { value: "LinkedIn", label: "LinkedIn", icon: Linkedin },
  { value: "TikTok", label: "TikTok", icon: Video },
  { value: "YouTube", label: "YouTube", icon: Video },
  { value: "Facebook", label: "Facebook", icon: Image },
];

const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function CreateDemandModal({ 
  open, 
  onOpenChange, 
  periodPlanId,
  onDemandCreated 
}: CreateDemandModalProps) {
  const { tenantId } = useTenant();
  
  // Form state
  const [clientId, setClientId] = useState<string>("");
  const [pipelineId, setPipelineId] = useState<string>("");
  const [statusId, setStatusId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [demandType, setDemandType] = useState("");
  const [channel, setChannel] = useState("");
  const [publishDate, setPublishDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [selectedPeriodPlanId, setSelectedPeriodPlanId] = useState<string>("");
  
  // Data state
  const [clients, setClients] = useState<Client[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [statuses, setStatuses] = useState<PipelineStatus[]>([]);
  const [suggestions, setSuggestions] = useState<DemandSuggestion[]>([]);
  const [strategySnippet, setStrategySnippet] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [periodPlans, setPeriodPlans] = useState<{ id: string; period_title: string; period_start: string; period_end: string }[]>([]);
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingPipelines, setLoadingPipelines] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
  const [loadingPeriodPlans, setLoadingPeriodPlans] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Load clients on mount
  useEffect(() => {
    if (open && tenantId) {
      fetchClients();
      fetchPipelines();
    }
  }, [open, tenantId]);
  
  // Load statuses when pipeline changes
  useEffect(() => {
    if (pipelineId) {
      fetchStatuses(pipelineId);
    } else {
      setStatuses([]);
      setStatusId("");
    }
  }, [pipelineId]);
  
  // Load suggestions and period plans when client changes
  useEffect(() => {
    if (clientId) {
      fetchSuggestions(clientId);
      if (!periodPlanId) {
        fetchPeriodPlans(clientId);
      }
    } else {
      setSuggestions([]);
      setStrategySnippet("");
      setPeriodPlans([]);
      setSelectedPeriodPlanId("");
    }
  }, [clientId]);
  
  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);
  
  const resetForm = () => {
    setClientId("");
    setPipelineId("");
    setStatusId("");
    setTitle("");
    setDescription("");
    setDemandType("");
    setChannel("");
    setPublishDate(undefined);
    setDueDate(undefined);
    setSuggestions([]);
    setStrategySnippet("");
    setSelectedTemplateId(null);
    setPeriodPlans([]);
    setSelectedPeriodPlanId("");
  };

  const fetchPeriodPlans = async (clientId: string) => {
    setLoadingPeriodPlans(true);
    try {
      const { data, error } = await supabase
        .from("period_plans")
        .select("id, period_title, period_start, period_end")
        .eq("company_id", clientId)
        .eq("operational_status", "em_andamento")
        .order("period_start", { ascending: false });
      
      if (error) throw error;
      setPeriodPlans(data || []);
    } catch (error) {
      console.error("Error fetching period plans:", error);
    } finally {
      setLoadingPeriodPlans(false);
    }
  };
  
  const fetchClients = async () => {
    if (!tenantId) return;
    
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", tenantId)
        .order("name");
      
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoadingClients(false);
    }
  };
  
  const fetchPipelines = async () => {
    if (!tenantId) return;
    
    setLoadingPipelines(true);
    try {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, is_default")
        .eq("tenant_id", tenantId)
        .order("position");
      
      if (error) throw error;
      
      setPipelines(data || []);
      
      // Auto-select default pipeline
      const defaultPipeline = data?.find(p => p.is_default);
      if (defaultPipeline) {
        setPipelineId(defaultPipeline.id);
      } else if (data && data.length > 0) {
        setPipelineId(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching pipelines:", error);
      toast.error("Erro ao carregar pipelines");
    } finally {
      setLoadingPipelines(false);
    }
  };
  
  const fetchStatuses = async (pipelineId: string) => {
    setLoadingStatuses(true);
    try {
      const { data, error } = await supabase
        .from("pipeline_statuses")
        .select("id, name, color, is_initial, requires_fields")
        .eq("pipeline_id", pipelineId)
        .order("position");
      
      if (error) throw error;
      
      const statusesData: PipelineStatus[] = (data || []).map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        is_initial: s.is_initial,
        requires_fields: Array.isArray(s.requires_fields) 
          ? (s.requires_fields as unknown as string[]).filter((f): f is string => typeof f === 'string')
          : []
      }));
      
      setStatuses(statusesData);
      
      // Auto-select "Produção" status for manual demands, fallback to initial
      const productionStatus = statusesData.find(s => s.name.toLowerCase().includes('produção') || s.name.toLowerCase().includes('producao'));
      if (productionStatus) {
        setStatusId(productionStatus.id);
      } else {
        const initialStatus = statusesData.find(s => s.is_initial);
        if (initialStatus) {
          setStatusId(initialStatus.id);
        } else if (statusesData.length > 0) {
          setStatusId(statusesData[0].id);
        }
      }
    } catch (error) {
      console.error("Error fetching statuses:", error);
      toast.error("Erro ao carregar status");
    } finally {
      setLoadingStatuses(false);
    }
  };
  
  const fetchSuggestions = async (clientId: string) => {
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.rpc("get_client_demand_suggestions", {
        p_client_id: clientId,
        p_limit: 8
      });
      
      if (error) throw error;
      
      const result = data as { success?: boolean; suggestions?: DemandSuggestion[]; strategy_snippet?: string; error?: string } | null;
      
      if (result?.success) {
        setSuggestions(result.suggestions || []);
        setStrategySnippet(result.strategy_snippet || "");
      } else {
        console.warn("Failed to fetch suggestions:", result?.error);
        setSuggestions([]);
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };
  
  const handleRefreshSuggestions = async () => {
    if (!clientId) return;
    
    setRefreshingSuggestions(true);
    try {
      const { data, error } = await supabase.rpc("refresh_client_templates", {
        p_client_id: clientId
      });
      
      if (error) throw error;
      
      const result = data as { success?: boolean; error?: string; message?: string } | null;
      
      if (result?.success) {
        toast.success("Templates atualizados!");
        await fetchSuggestions(clientId);
      } else {
        toast.error(result?.error || "Erro ao atualizar templates");
      }
    } catch (error) {
      console.error("Error refreshing templates:", error);
      toast.error("Erro ao atualizar templates");
    } finally {
      setRefreshingSuggestions(false);
    }
  };
  
  const handleSelectSuggestion = (suggestion: DemandSuggestion) => {
    setSelectedTemplateId(suggestion.id);
    setTitle(suggestion.title_template);
    setDescription(suggestion.instructions_template || "");
    setDemandType(suggestion.demand_type || "");
    setChannel(suggestion.channel || "");
    
    if (suggestion.pipeline_id) {
      setPipelineId(suggestion.pipeline_id);
    }
    
    if (suggestion.suggested_publish_date) {
      setPublishDate(new Date(suggestion.suggested_publish_date));
    }
    
    toast.success("Sugestão aplicada!");
  };
  
  const handleSubmit = async () => {
    if (!clientId) {
      toast.error("Selecione um cliente");
      return;
    }
    
    if (!periodPlanId && !selectedPeriodPlanId) {
      toast.error("Selecione um período");
      return;
    }
    
    if (!title.trim()) {
      toast.error("Informe um título");
      return;
    }
    
    // Check required fields for selected status
    const selectedStatus = statuses.find(s => s.id === statusId);
    if (selectedStatus?.requires_fields?.includes("publish_date") && !publishDate) {
      toast.error("Data de publicação é obrigatória para este status");
      return;
    }
    
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("create_demand_from_template", {
        p_client_id: clientId,
        p_template_id: selectedTemplateId,
        p_pipeline_id: pipelineId || null,
        p_status_id: statusId || null,
        p_title: title,
        p_description: description || null,
        p_demand_type: demandType || null,
        p_channel: channel || null,
        p_publish_date: publishDate ? format(publishDate, "yyyy-MM-dd") : null,
        p_due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        p_period_plan_id: periodPlanId || selectedPeriodPlanId || null
      });
      
      if (error) throw error;
      
      const result = data as { success?: boolean; demand_id?: string; error?: string } | null;
      
      if (result?.success) {
        toast.success("Demanda criada com sucesso!");
        onOpenChange(false);
        onDemandCreated?.();
      } else {
        toast.error(result?.error || "Erro ao criar demanda");
      }
    } catch (error: any) {
      console.error("Error creating demand:", error);
      toast.error(error.message || "Erro ao criar demanda");
    } finally {
      setSubmitting(false);
    }
  };
  
  const getRecurrenceLabel = (hint?: string) => {
    switch (hint) {
      case "semanal": return "Semanal";
      case "quinzenal": return "Quinzenal";
      case "mensal": return "Mensal";
      default: return null;
    }
  };
  
  const getChannelIcon = (channelName?: string) => {
    const found = CHANNELS.find(c => c.value === channelName);
    return found?.icon || Image;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] !flex !flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Criar Demanda Manual
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto min-h-0 pr-2">
          <div className="space-y-6 pb-4">
            {/* Cliente & Período Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">Cliente *</Label>
                <Select value={clientId} onValueChange={setClientId} disabled={loadingClients}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingClients ? "Carregando..." : "Selecione o cliente"} />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.fantasy_name || client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {!periodPlanId && (
                <div className="space-y-2">
                  <Label>Período *</Label>
                  <Select value={selectedPeriodPlanId} onValueChange={setSelectedPeriodPlanId} disabled={loadingPeriodPlans || !clientId}>
                    <SelectTrigger>
                      <SelectValue placeholder={!clientId ? "Selecione o cliente primeiro" : loadingPeriodPlans ? "Carregando..." : periodPlans.length === 0 ? "Nenhum período ativo" : "Selecione o período *"} />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {periodPlans.map(pp => (
                        <SelectItem key={pp.id} value={pp.id}>
                          {pp.period_title} ({format(new Date(pp.period_start + 'T00:00:00'), "dd/MM", { locale: ptBR })} - {format(new Date(pp.period_end + 'T00:00:00'), "dd/MM", { locale: ptBR })})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {/* Suggestions Section */}
            {clientId && (
              <Accordion type="single" collapsible className="rounded-lg border bg-muted/30">
                <AccordionItem value="suggestions" className="border-none">
                  <AccordionTrigger className="px-4 pt-2 pb-2 hover:no-underline">
                    <span className="font-medium flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      Sugestões para este cliente
                      {suggestions.length > 0 && (
                        <Badge variant="secondary" className="text-xs ml-1">{suggestions.length}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRefreshSuggestions(); }}
                        disabled={refreshingSuggestions}
                        className="ml-auto"
                        asChild={false}
                      >
                        {refreshingSuggestions ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {strategySnippet && (
                      <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2 mb-3">
                        Estratégia: {strategySnippet}...
                      </p>
                    )}
                    
                    {loadingSuggestions ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : suggestions.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {suggestions.map(suggestion => {
                          const ChannelIcon = getChannelIcon(suggestion.channel);
                          const isSelected = selectedTemplateId === suggestion.id;
                          
                          return (
                            <button
                              key={suggestion.id}
                              onClick={() => handleSelectSuggestion(suggestion)}
                              className={cn(
                                "p-3 rounded-lg border text-left transition-all hover:border-primary/50",
                                isSelected 
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                                  : "border-border bg-background"
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <ChannelIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">
                                    {suggestion.title_template}
                                  </p>
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    {suggestion.demand_type && (
                                      <Badge variant="secondary" className="text-xs">
                                        {suggestion.demand_type}
                                      </Badge>
                                    )}
                                    {suggestion.recurrence_hint && (
                                      <Badge variant="outline" className="text-xs">
                                        <Repeat className="h-3 w-3 mr-1" />
                                        {getRecurrenceLabel(suggestion.recurrence_hint)}
                                      </Badge>
                                    )}
                                  </div>
                                  {suggestion.default_publish_weekday !== undefined && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Normalmente: {WEEKDAY_NAMES[suggestion.default_publish_weekday]}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Nenhuma sugestão disponível ainda.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            
            
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da demanda"
              />
            </div>
            
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição / Instruções</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva a demanda e instruções de execução..."
                rows={3}
              />
            </div>
            
            {/* Type & Channel */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Demanda</Label>
                <Select value={demandType} onValueChange={setDemandType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {DEMAND_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {CHANNELS.map(ch => (
                      <SelectItem key={ch.value} value={ch.value}>
                        <div className="flex items-center gap-2">
                          <ch.icon className="h-4 w-4" />
                          {ch.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Data de Publicação
                  {statuses.find(s => s.id === statusId)?.requires_fields?.includes("publish_date") && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !publishDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {publishDate ? format(publishDate, "PPP", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={publishDate}
                      onSelect={setPublishDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>Prazo (Due Date)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !clientId || !title.trim()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Demanda"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
