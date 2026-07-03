import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarDays, ArrowUp, ArrowDown } from "lucide-react";
import BackButton from "@/components/BackButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TaskCard from "@/components/TaskCard";
import type { KanbanCardData, Attachment, PipelineStatus } from "@/components/TaskCard";
import { toast as sonnerToast } from "sonner";

interface CompanyOption {
  id: string;
  name: string;
  fantasy_name: string | null;
  cnpj_cpf: string;
  email: string;
  tenant_id: string;
}

const FINAL_STATUSES = ["feito", "feitos", "publicado"];
const isOverdue = (deliveryDate?: string | null, deliveryTime?: string | null, status?: string) => {
  if (!deliveryDate) return false;
  if (FINAL_STATUSES.includes((status || "").toLowerCase())) return false;
  const time = deliveryTime || "23:59";
  const t = time.length === 5 ? `${time}:00` : time;
  const deadline = new Date(`${deliveryDate}T${t}`);
  if (isNaN(deadline.getTime())) return false;
  return new Date() >= deadline;
};

type SortKey = "title" | "due_date" | "due_time" | "delivery_date" | "delivery_time" | "assigned" | "status";

const CronogramaGlobal = () => {
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const { selectedClient, setSelectedClient } = useSelectedClient();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(selectedClient?.id || "");
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (tenantLoading || !tenantId) return;
    (async () => {
      setLoadingCompanies(true);
      const { data } = await supabase
        .from("tenant_companies")
        .select("id,name,fantasy_name,cnpj_cpf,email,tenant_id")
        .eq("tenant_id", tenantId)
        .order("fantasy_name");
      if (data) setCompanies(data as CompanyOption[]);
      setLoadingCompanies(false);

      const { data: pipelines } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1);
      if (pipelines?.length) {
        const { data: statuses } = await supabase
          .from("pipeline_statuses")
          .select("*")
          .eq("pipeline_id", pipelines[0].id)
          .order("position");
        if (statuses) {
          setPipelineStatuses(
            statuses.map((s: any) => ({
              id: s.id, name: s.name, color: s.color, position: s.position,
              pipeline_id: s.pipeline_id, is_fixed: s.is_fixed, parent_status_id: s.parent_status_id,
            })),
          );
        }
      }
    })();
  }, [tenantId, tenantLoading]);

  const fetchDemands = useCallback(async () => {
    if (!tenantId || !selectedId) {
      setCards([]);
      return;
    }
    setLoadingCards(true);
    try {
      const { data: demands } = await supabase
        .from("demands")
        .select("*, pipeline_statuses!inner(name, color), tenant_companies!inner(name, fantasy_name)")
        .eq("tenant_id", tenantId)
        .eq("client_id", selectedId)
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
          attachments: Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : [],
          additional_publish_dates: Array.isArray(d.additional_publish_dates) ? (d.additional_publish_dates as string[]) : [],
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

        const userIds = Array.from(new Set(mapped.map((c) => c.assigned_to).filter(Boolean))) as string[];
        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
          if (profs) {
            const map: Record<string, string> = {};
            profs.forEach((p: any) => { map[p.id] = p.full_name || "—"; });
            setAssigneeMap(map);
          }
        } else {
          setAssigneeMap({});
        }
      }
    } catch (err) {
      console.error("[CronogramaGlobal] fetch demands error", err);
      sonnerToast.error("Erro ao carregar demandas");
    } finally {
      setLoadingCards(false);
    }
  }, [tenantId, selectedId]);

  useEffect(() => { fetchDemands(); }, [fetchDemands]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const c = companies.find((x) => x.id === id);
    if (c) {
      setSelectedClient({
        id: c.id, name: c.name, fantasy_name: c.fantasy_name,
        cnpj_cpf: c.cnpj_cpf, email: c.email, tenant_id: c.tenant_id,
      });
    }
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
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
        case "assigned": return (assigneeMap[c.assigned_to || ""] || "").toLowerCase();
        case "status": return (c.status || "").toLowerCase();
      }
    };
    arr.sort((a, b) => {
      const cmp = getVal(a).localeCompare(getVal(b));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [cards, sortKey, sortDir, assigneeMap]);

  const formatDate = (d?: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const formatTime = (t?: string | null) => (t ? t.slice(0, 5) : "—");
  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

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
      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, [field]: value } as KanbanCardData : c));
      setSelectedCard((prev) => prev ? { ...prev, [field]: value } as KanbanCardData : prev);
      sonnerToast.success("Salvo!");
    } catch (err) {
      console.error("[CronogramaGlobal] save error", err);
      sonnerToast.error("Erro ao salvar");
    }
  };

  const currentCompany = companies.find((c) => c.id === selectedId) || null;

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <BackButton to="/home" />

      <div className="flex flex-col items-center gap-2 mb-8 text-center">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cronograma Global</h1>
          {currentCompany && <Badge variant="secondary" className="text-sm">{cards.length}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Selecione uma empresa para visualizar todas as demandas atuais.
        </p>
      </div>

      <div className="max-w-lg mx-auto mb-8">
        <label className="block text-sm font-medium text-foreground mb-2">Selecionar empresa</label>
        {loadingCompanies ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando empresas...
          </div>
        ) : (
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Escolha uma empresa" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!currentCompany ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione uma empresa para visualizar o cronograma.</p>
        </div>
      ) : loadingCards ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Nenhuma demanda atual para esta empresa.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {([
                  { k: "status", label: "Status" },
                  { k: "title", label: "Nome da demanda" },
                  { k: "due_date", label: "Data de início" },
                  { k: "due_time", label: "Hora de início" },
                  { k: "delivery_date", label: "Data de entrega" },
                  { k: "delivery_time", label: "Hora de entrega" },
                  { k: "assigned", label: "Responsável" },
                ] as { k: SortKey; label: string }[]).map(({ k, label }) => (
                  <TableHead key={k} className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort(k)}
                      className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {label}
                      <SortIcon k={k} />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCards.map((card) => {
                const overdue = isOverdue(card.delivery_date, card.delivery_time, card.status);
                return (
                  <TableRow
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className={`cursor-pointer ${overdue ? "bg-destructive/10 hover:bg-destructive/15" : ""}`}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">{card.status}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      <span className="uppercase tracking-wide text-sm">{card.title}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(card.due_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatTime(card.due_time)}</TableCell>
                    <TableCell className={`whitespace-nowrap ${overdue ? "text-destructive font-semibold" : ""}`}>
                      {formatDate(card.delivery_date)}
                    </TableCell>
                    <TableCell className={`whitespace-nowrap ${overdue ? "text-destructive font-semibold" : ""}`}>
                      {formatTime(card.delivery_time)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {assigneeMap[card.assigned_to || ""] || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <TaskCard
        open={!!selectedCard}
        onOpenChange={(open) => { if (!open) setSelectedCard(null); }}
        card={selectedCard}
        onCardChange={(updated) => setSelectedCard((prev) => prev ? { ...prev, ...updated } : prev)}
        onSave={handleSave}
        onFileUpload={async () => {}}
        onRemoveAttachment={async () => {}}
        onReorderAttachments={async () => {}}
        onDelete={async () => {
          if (!selectedCard) return;
          await supabase.from("demands").delete().eq("id", selectedCard.id);
          setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
          setSelectedCard(null);
          sonnerToast.success("Demanda excluída");
        }}
        pipelineStatuses={pipelineStatuses}
      />
    </div>
  );
};

export default CronogramaGlobal;
