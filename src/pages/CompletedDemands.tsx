import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useRealtimeAttachments } from "@/hooks/useRealtimeAttachments";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PipelineStatus } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SmartSearchBar from "@/components/SmartSearchBar";
import type { SearchableItem } from "@/hooks/useSmartSearch";
import BackButton from "@/components/BackButton";
import KanbanCard from "@/components/KanbanCard";
import { cn } from "@/lib/utils";

const DONE_COLUMN_NAMES = ["feito", "feitos"];
const isDoneColumn = (name: string) => DONE_COLUMN_NAMES.includes(name.toLowerCase().trim());

const CompletedDemands = () => {
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>("all");
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>("all");
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; fantasy_name: string | null }[]>([]);
  const [periods, setPeriods] = useState<{ id: string; title: string }[]>([]);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleRealtimeUpdate = useCallback((itemId: string, attachments: Attachment[]) => {
    setCards(prev => prev.map(c => c.id === itemId ? { ...c, attachments } : c));
    if (selectedCard?.id === itemId) {
      setSelectedCard(prev => prev ? { ...prev, attachments } : prev);
    }
  }, [selectedCard?.id]);

  useRealtimeAttachments({
    tenantId,
    onAttachmentUpdate: handleRealtimeUpdate,
    enabled: !!tenantId,
  });

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data: pipelines } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1);

      if (!pipelines?.length) { setLoading(false); return; }
      const pipelineId = pipelines[0].id;

      const { data: statuses } = await supabase
        .from("pipeline_statuses")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");

      if (statuses) {
        setPipelineStatuses(statuses.map(s => ({
          id: s.id, name: s.name, color: s.color, position: s.position,
          pipeline_id: s.pipeline_id, is_fixed: s.is_fixed, parent_status_id: s.parent_status_id,
        })));
      }

      const doneStatusIds = (statuses || []).filter(s => isDoneColumn(s.name)).map(s => s.id);

      if (doneStatusIds.length === 0) {
        setCards([]);
        setLoading(false);
        return;
      }

      const { data: demands } = await supabase
        .from("demands")
        .select("*, pipeline_statuses!inner(name, color), tenant_companies!inner(name, fantasy_name)")
        .eq("tenant_id", tenantId)
        .in("status_id", doneStatusIds)
        .order("updated_at", { ascending: false });

      if (demands) {
        const mapped: KanbanCardData[] = demands.map((d: any) => ({
          id: d.id,
          title: d.title,
          description: d.description || "",
          status: d.pipeline_statuses.name,
          due_date: d.due_date || "",
          publish_date: d.publish_date || "",
          publish_time: d.publish_time || "",
          channel: d.channel || "",
          demand_type: d.demand_type || "",
          objective: d.objective || "",
          instructions: d.instructions || "",
          observations: d.observations || "",
          post_caption: d.post_caption || "",
          attachments: Array.isArray(d.attachments) ? d.attachments as Attachment[] : [],
          additional_publish_dates: Array.isArray(d.additional_publish_dates) ? d.additional_publish_dates as string[] : [],
          source: d.source || "manual",
          delivery_date: d.delivery_date || "",
          due_time: d.due_time || "",
          delivery_time: d.delivery_time || "",
          period_plan_id: d.period_plan_id || "",
          tenant_id: d.tenant_id,
          created_at: d.created_at,
          updated_at: d.updated_at,
          clientName: d.tenant_companies.fantasy_name || d.tenant_companies.name,
          clientId: d.client_id,
        }));
        setCards(mapped);

        const uniqueClients = new Map<string, { id: string; name: string; fantasy_name: string | null }>();
        demands.forEach((d: any) => {
          if (!uniqueClients.has(d.client_id)) {
            uniqueClients.set(d.client_id, {
              id: d.client_id,
              name: d.tenant_companies.name,
              fantasy_name: d.tenant_companies.fantasy_name,
            });
          }
        });
        setClients(Array.from(uniqueClients.values()));

        const periodIds = [...new Set(demands.filter((d: any) => d.period_plan_id).map((d: any) => d.period_plan_id))];
        if (periodIds.length > 0) {
          const { data: periodsData } = await supabase
            .from("period_plans")
            .select("id, period_title")
            .in("id", periodIds);
          if (periodsData) {
            setPeriods(periodsData.map(p => ({ id: p.id, title: p.period_title })));
          }
        }
      }
    } catch (err) {
      console.error("Error fetching completed demands:", err);
      sonnerToast.error("Erro ao carregar demandas completas");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) fetchData();
  }, [tenantId, tenantLoading, fetchData]);

  const filteredCards = useMemo(() => {
    let result = cards;
    if (selectedClientFilter !== "all") {
      result = result.filter(c => c.clientId === selectedClientFilter);
    }
    if (selectedPeriodFilter !== "all") {
      result = result.filter(c => c.period_plan_id === selectedPeriodFilter);
    }
    return result;
  }, [cards, selectedClientFilter, selectedPeriodFilter]);

  const searchableCards: (SearchableItem & { _card: KanbanCardData })[] = useMemo(() =>
    filteredCards.map(card => ({
      id: card.id,
      title: card.title,
      clientName: card.clientName || "",
      deliveryDate: card.publish_date || card.due_date,
      status: card.status,
      _card: card,
    })),
    [filteredCards]
  );

  const handleSearchSelect = (item: SearchableItem & { _card: KanbanCardData }) => {
    setHighlightedCardId(item._card.id);
    const el = cardRefs.current.get(item._card.id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightedCardId(null), 2000);
  };

  const handleSave = async (field: string, value: string) => {
    if (!selectedCard) return;
    try {
      const updateData: Record<string, any> = {};
      if (field === "status") {
        const status = pipelineStatuses.find(s => s.name === value);
        if (status) updateData.status_id = status.id;
      } else {
        updateData[field] = value || null;
      }
      const { error } = await supabase.from("demands").update(updateData as any).eq("id", selectedCard.id);
      if (error) throw error;

      if (field === "status") {
        const newStatus = pipelineStatuses.find(s => s.name === value);
        if (newStatus && !isDoneColumn(newStatus.name)) {
          setCards(prev => prev.filter(c => c.id !== selectedCard.id));
          setSelectedCard(null);
          sonnerToast.success("Demanda movida de volta ao Kanban");
          return;
        }
      }

      setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, [field]: value } : c));
      setSelectedCard(prev => prev ? { ...prev, [field]: value } : prev);
      sonnerToast.success("Salvo!");
    } catch (err) {
      console.error("Error saving:", err);
      sonnerToast.error("Erro ao salvar");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files?.length) return;
    const file = event.target.files[0];
    const filePath = `${tenantId}/${selectedCard.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("card-attachments").upload(filePath, file);
    if (uploadError) { sonnerToast.error("Erro no upload"); return; }
    const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(filePath);
    const newAtt = { name: file.name, url: urlData.publicUrl, type: file.type, size: file.size, storagePath: filePath, uploadedAt: new Date().toISOString(), uploadedBy: { id: "", email: "" }, cardId: selectedCard.id, tenantId: tenantId || "" } as Attachment;
    const updated = [...(selectedCard.attachments || []), newAtt];
    await supabase.from("demands").update({ attachments: updated as any }).eq("id", selectedCard.id);
    setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, attachments: updated } : c));
    setSelectedCard(prev => prev ? { ...prev, attachments: updated } : prev);
  };

  const handleRemoveAttachment = async (url: string) => {
    if (!selectedCard) return;
    const updated = (selectedCard.attachments || []).filter(a => a.url !== url);
    await supabase.from("demands").update({ attachments: updated as any }).eq("id", selectedCard.id);
    setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, attachments: updated } : c));
    setSelectedCard(prev => prev ? { ...prev, attachments: updated } : prev);
  };

  const handleReorderAttachments = async (attachments: Attachment[]) => {
    if (!selectedCard) return;
    await supabase.from("demands").update({ attachments: attachments as any }).eq("id", selectedCard.id);
    setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, attachments } : c));
    setSelectedCard(prev => prev ? { ...prev, attachments } : prev);
  };

  const handleDelete = async () => {
    if (!selectedCard) return;
    await supabase.from("demands").delete().eq("id", selectedCard.id);
    setCards(prev => prev.filter(c => c.id !== selectedCard.id));
    setSelectedCard(null);
    sonnerToast.success("Demanda excluída");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackButton to="/home" />
      
      <div className="flex flex-col items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Demandas Completas</h1>
          <Badge variant="secondary" className="text-sm">{filteredCards.length}</Badge>
        </div>

        <div className="w-full max-w-md">
          <SmartSearchBar
            items={searchableCards}
            onResultSelect={handleSearchSelect}
            placeholder="Buscar demandas completas..."
          />
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          {clients.length > 1 && (
            <Select value={selectedClientFilter} onValueChange={setSelectedClientFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {periods.length > 0 && (
            <Select value={selectedPeriodFilter} onValueChange={setSelectedPeriodFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                {periods.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma demanda completa</p>
          <p className="text-sm mt-1">Cards movidos para a coluna "Feito" aparecerão aqui</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredCards.map(card => (
            <div
              key={card.id}
              ref={el => {
                if (el) cardRefs.current.set(card.id, el);
                else cardRefs.current.delete(card.id);
              }}
              className={cn(highlightedCardId === card.id && "ring-2 ring-primary/50 rounded-lg")}
            >
              <KanbanCard
                title={card.title}
                subtitle={card.clientName || ""}
                dueDate={card.due_date}
                dueTime={(card as any).due_time || undefined}
                cardDeliveryDate={(card as any).delivery_date || undefined}
                deliveryTime={(card as any).delivery_time || undefined}
                cardId={card.id}
                onClick={() => setSelectedCard(card)}
              />
            </div>
          ))}
        </div>
      )}

      <TaskCard
        open={!!selectedCard}
        onOpenChange={(open) => { if (!open) setSelectedCard(null); }}
        card={selectedCard}
        onCardChange={(updated) => setSelectedCard(prev => prev ? { ...prev, ...updated } : prev)}
        onSave={handleSave}
        onFileUpload={handleFileUpload}
        onRemoveAttachment={handleRemoveAttachment}
        onReorderAttachments={handleReorderAttachments}
        onDelete={handleDelete}
        pipelineStatuses={pipelineStatuses}
      />
    </div>
  );
};

export default CompletedDemands;
