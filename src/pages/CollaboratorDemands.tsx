import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PipelineStatus } from "@/components/TaskCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast as sonnerToast } from "sonner";
import BackButton from "@/components/BackButton";
import KanbanCard from "@/components/KanbanCard";
import { getRoleLabel } from "@/lib/constants/roles";

const FINAL_STATUSES = ["feito", "feitos", "publicado"];
const isOverdue = (deliveryDate?: string | null, deliveryTime?: string | null, status?: string) => {
  if (!deliveryDate) return false;
  if (FINAL_STATUSES.includes((status || "").toLowerCase())) return false;
  const time = (deliveryTime || "23:59");
  const t = time.length === 5 ? `${time}:00` : time;
  const deadline = new Date(`${deliveryDate}T${t}`);
  if (isNaN(deadline.getTime())) return false;
  return new Date() >= deadline;
};

const CollaboratorDemands = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [collaboratorName, setCollaboratorName] = useState<string>("");
  const [collaboratorRole, setCollaboratorRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!tenantId || !userId) return;
    setLoading(true);
    try {
      const [{ data: profile }, { data: role }, { data: pipelines }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("pipelines").select("id").eq("tenant_id", tenantId).limit(1),
      ]);
      setCollaboratorName(profile?.full_name || "Colaborador");
      setCollaboratorRole(role?.role ? getRoleLabel(role.role) : "");

      if (pipelines?.length) {
        const { data: statuses } = await supabase
          .from("pipeline_statuses")
          .select("*")
          .eq("pipeline_id", pipelines[0].id)
          .order("position");
        if (statuses) {
          setPipelineStatuses(statuses.map((s: any) => ({
            id: s.id, name: s.name, color: s.color, position: s.position,
            pipeline_id: s.pipeline_id, is_fixed: s.is_fixed, parent_status_id: s.parent_status_id,
          })));
        }
      }

      const { data: demands } = await supabase
        .from("demands")
        .select("*, pipeline_statuses!inner(name, color), tenant_companies!inner(name, fantasy_name)")
        .eq("tenant_id", tenantId)
        .eq("assigned_to", userId)
        .is("archived_at", null)
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
          assigned_to: d.assigned_to || null,
          clientName: d.tenant_companies.fantasy_name || d.tenant_companies.name,
          clientId: d.client_id,
        }));
        setCards(mapped);
      }
    } catch (err) {
      console.error("[CollaboratorDemands] fetch error", err);
      sonnerToast.error("Erro ao carregar demandas do colaborador");
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    if (!tenantLoading && tenantId && userId) fetchData();
  }, [tenantId, tenantLoading, userId, fetchData]);

  type SortKey = "title" | "due_date" | "due_time" | "delivery_date" | "delivery_time" | "assigned";
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedCards = useMemo(() => {
    const arr = [...cards];
    const getVal = (c: KanbanCardData): string => {
      switch (sortKey) {
        case "title": return (c.title || "").toLowerCase();
        case "due_date": return c.due_date || "9999-99-99";
        case "due_time": return c.due_time || "99:99";
        case "delivery_date": return c.delivery_date || "9999-99-99";
        case "delivery_time": return c.delivery_time || "99:99";
        case "assigned": return (collaboratorName || "").toLowerCase();
      }
    };
    arr.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [cards, sortKey, sortDir, collaboratorName]);

  const totalCards = cards.length;

  const formatDate = (d?: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const formatTime = (t?: string | null) => (t ? t.slice(0, 5) : "—");

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? (
      <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
    ) : sortDir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );



  const handleSave = async (field: string, value: string) => {
    if (!selectedCard) return;
    try {
      const updateData: Record<string, any> = {};
      if (field === "status") {
        const st = pipelineStatuses.find((s) => s.name === value);
        if (st) updateData.status_id = st.id;
      } else {
        updateData[field] = value || null;
      }
      const { error } = await supabase.from("demands").update(updateData as any).eq("id", selectedCard.id);
      if (error) throw error;

      // Se mudou o responsável e não é mais este usuário, remover da lista
      if (field === "assigned_to" && value !== userId) {
        setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
        setSelectedCard(null);
        sonnerToast.success("Responsável atualizado");
        return;
      }

      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, [field]: value } : c));
      setSelectedCard((prev) => prev ? { ...prev, [field]: value } : prev);
      sonnerToast.success("Salvo!");
    } catch (err) {
      console.error("[CollaboratorDemands] save error", err);
      sonnerToast.error("Erro ao salvar");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCard || !event.target.files?.length) return;
    const file = event.target.files[0];
    const filePath = `${tenantId}/${selectedCard.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("card-attachments").upload(filePath, file);
    if (upErr) { sonnerToast.error("Erro no upload"); return; }
    const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(filePath);
    const newAtt = {
      name: file.name, url: urlData.publicUrl, type: file.type, size: file.size,
      storagePath: filePath, uploadedAt: new Date().toISOString(),
      uploadedBy: { id: "", email: "" }, cardId: selectedCard.id, tenantId: tenantId || "",
    } as Attachment;
    const updated = [...(selectedCard.attachments || []), newAtt];
    await supabase.from("demands").update({ attachments: updated as any }).eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments: updated } : c));
    setSelectedCard((prev) => prev ? { ...prev, attachments: updated } : prev);
  };

  const handleRemoveAttachment = async (url: string) => {
    if (!selectedCard) return;
    const updated = (selectedCard.attachments || []).filter((a) => a.url !== url);
    await supabase.from("demands").update({ attachments: updated as any }).eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments: updated } : c));
    setSelectedCard((prev) => prev ? { ...prev, attachments: updated } : prev);
  };

  const handleReorderAttachments = async (attachments: Attachment[]) => {
    if (!selectedCard) return;
    await supabase.from("demands").update({ attachments: attachments as any }).eq("id", selectedCard.id);
    setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, attachments } : c));
    setSelectedCard((prev) => prev ? { ...prev, attachments } : prev);
  };

  const handleDelete = async () => {
    if (!selectedCard) return;
    await supabase.from("demands").delete().eq("id", selectedCard.id);
    setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
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

      <div className="flex flex-col items-center gap-2 mb-6 text-center">
        <div className="flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            Demandas de {collaboratorName}
          </h1>
          <Badge variant="secondary" className="text-sm">{totalCards}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {collaboratorRole ? `${collaboratorRole} • ` : ""}Cards atribuídos a este colaborador
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="text-sm text-muted-foreground">Visualizar por:</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setGroupBy("start")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${groupBy === "start" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-accent/40"}`}
          >
            Data de início
          </button>
          <button
            type="button"
            onClick={() => setGroupBy("delivery")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${groupBy === "delivery" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-accent/40"}`}
          >
            Data de entrega
          </button>
        </div>
      </div>

      {totalCards === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma demanda atribuída a este colaborador no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(({ date, items }) => {
            const collapsed = collapsedDates.has(date);
            return (
              <div key={date} className="rounded-lg border border-border bg-card/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDate(date)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
                >
                  {collapsed ? (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="text-lg sm:text-xl font-bold text-foreground">
                    {formatDateHeader(date)}
                  </span>
                  <Badge variant="secondary" className="ml-2">{items.length}</Badge>
                </button>
                {!collapsed && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {items.map((card) => (
                      <KanbanCard
                        key={card.id}
                        title={card.title}
                        subtitle={card.clientName || ""}
                        demandType={card.demand_type || undefined}
                        dueDate={card.due_date}
                        dueTime={card.due_time || undefined}
                        cardDeliveryDate={card.delivery_date || undefined}
                        deliveryTime={card.delivery_time || undefined}
                        cardId={card.id}
                        hideDueDate
                        emphasizeDelivery
                        showStartEndLabels
                        emphasizeStart={groupBy === "delivery"}
                        isOverdue={isOverdue(card.delivery_date, card.delivery_time, card.status)}
                        onClick={() => setSelectedCard(card)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}


      <TaskCard
        open={!!selectedCard}
        onOpenChange={(open) => { if (!open) setSelectedCard(null); }}
        card={selectedCard}
        onCardChange={(updated) => setSelectedCard((prev) => prev ? { ...prev, ...updated } : prev)}
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

export default CollaboratorDemands;
