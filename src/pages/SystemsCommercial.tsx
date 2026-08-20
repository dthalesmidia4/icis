import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useCollaborators } from "@/hooks/useCollaborators";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Handshake,
  Loader2,
  Plus,
  Search,
  Users,
  AlertTriangle,
  CalendarClock,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FINAL_STAGES,
  STAGE_OPTIONS,
  hasMigrationAvailable,
  isFinalStage,
  loadSystemsCompanies,
  loadSystemsProspects,
  markOpportunityWon,
  normalizeCurrentSystem,
  saveSystemsClient,
  stageLabel,
  updateLastContactResult,
  type CommercialStage,
  type SystemsClient,
  type SystemsCompany,
} from "@/lib/systemsClients";
import {
  buildOpportunityRows,
  countQuickFilters,
  loadLastTouchBySubclient,
  type OpportunityRow,
} from "@/lib/systemsCommercial";
import {
  TOUCHPOINT_OPTIONS,
  loadSubclientTouchpoints,
  recordManualTouchpoint,
  touchpointLabel,
  type TouchpointRecord,
  type TouchpointType,
} from "@/lib/recordTouchpoint";

type QuickFilter =
  | "all"
  | "hoje"
  | "atrasados"
  | "sem_acao"
  | "simplesvet"
  | "avaliacao"
  | "negociacao";

const STAGE_STYLES: Record<string, string> = {
  mapeado: "bg-muted text-muted-foreground border-border",
  contato: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  demonstracao:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900",
  avaliacao:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  negociacao:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  ganho: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200",
  perdido: "bg-destructive/10 text-destructive border-destructive/30",
  pausado: "bg-muted text-muted-foreground border-border",
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

/** timestamptz → valor de <input type="datetime-local"> em hora local. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
};

const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

interface DrawerForm {
  name: string;
  segment: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  currentSystem: string;
  stage: CommercialStage;
  nextAction: string;
  nextActionAt: string;
  notes: string;
  ownerId: string;
  lossReason: string;
  leadSource: string;
  lastContactResult: string;
}

const formFromClient = (c: SystemsClient): DrawerForm => ({
  name: c.name,
  segment: c.segment || "",
  contactName: c.contact_name || "",
  phone: c.phone || "",
  email: c.email || "",
  address: c.address || "",
  city: c.city || "",
  state: c.state || "",
  currentSystem: c.current_system || "",
  stage: (c.commercial_stage as CommercialStage) || "mapeado",
  nextAction: c.next_action || "",
  nextActionAt: toLocalInput(c.next_action_at),
  notes: c.notes || "",
  ownerId: c.commercial_owner_id || "",
  lossReason: c.loss_reason || "",
  leadSource: c.lead_source || "",
  lastContactResult: c.last_contact_result || "",
});

export default function SystemsCommercial() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const { collaborators } = useCollaborators(tenantId);
  const { user } = useAuth();

  const [companies, setCompanies] = useState<SystemsCompany[]>([]);
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [stageFilter, setStageFilter] = useState<string>("ativos");

  const [selected, setSelected] = useState<SystemsClient | null>(null);
  const [form, setForm] = useState<DrawerForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<TouchpointRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [wonTarget, setWonTarget] = useState<SystemsClient | null>(null);

  // Registro de contato
  const [tpType, setTpType] = useState<TouchpointType>("ligacao");
  const [tpDate, setTpDate] = useState(toLocalInput(new Date().toISOString()));
  const [tpSummary, setTpSummary] = useState("");
  const [tpUseAsResult, setTpUseAsResult] = useState(true);
  const [tpSaving, setTpSaving] = useState(false);

  // Nova oportunidade
  const [newOpen, setNewOpen] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newSystem, setNewSystem] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [comps, prospects] = await Promise.all([
        loadSystemsCompanies(tenantId),
        loadSystemsProspects(tenantId),
      ]);
      setCompanies(comps);
      const touches = await loadLastTouchBySubclient(
        tenantId,
        prospects.map((p) => p.id),
      );
      setRows(buildOpportunityRows(prospects, touches));
      if (comps.length === 1) setCompanyFilter((prev) => (prev === "all" ? comps[0].id : prev));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar as oportunidades de Sistemas.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const companyName = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => map.set(c.id, c.fantasy_name || c.name));
    return map;
  }, [companies]);

  const ownerName = useMemo(() => {
    const map = new Map<string, string>();
    collaborators.forEach((c) => map.set(c.userId, c.fullName));
    return map;
  }, [collaborators]);

  /** Empresa/produto sempre respeitado antes de qualquer contador. */
  const scoped = useMemo(
    () => rows.filter((r) => companyFilter === "all" || r.client.parent_company_id === companyFilter),
    [rows, companyFilter],
  );

  const counters = useMemo(() => countQuickFilters(scoped), [scoped]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scoped.filter(({ client, bucket }) => {
      // Estágio
      if (stageFilter === "ativos") {
        if (isFinalStage(client.commercial_stage)) return false;
      } else if (stageFilter !== "all" && client.commercial_stage !== stageFilter) {
        return false;
      }

      // Filtro rápido
      if (quick === "hoje" && bucket !== "hoje") return false;
      if (quick === "atrasados" && bucket !== "atrasado") return false;
      if (quick === "sem_acao" && bucket !== "sem_acao") return false;
      if (quick === "simplesvet" && normalizeCurrentSystem(client.current_system) !== "simplesvet")
        return false;
      if (quick === "avaliacao" && client.commercial_stage !== "avaliacao") return false;
      if (quick === "negociacao" && client.commercial_stage !== "negociacao") return false;

      if (!term) return true;
      return [client.name, client.contact_name, client.city, client.current_system]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [scoped, search, quick, stageFilter]);

  const openDrawer = async (client: SystemsClient) => {
    setSelected(client);
    setForm(formFromClient(client));
    setTpType("ligacao");
    setTpDate(toLocalInput(new Date().toISOString()));
    setTpSummary("");
    setTpUseAsResult(true);
    setHistoryLoading(true);
    try {
      const list = await loadSubclientTouchpoints(client.tenant_id, client.id);
      setHistory(list);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeDrawer = () => {
    setSelected(null);
    setForm(null);
    setHistory([]);
  };

  const persist = async (overrideStage?: CommercialStage) => {
    if (!selected || !form || !tenantId) return false;
    if (!form.name.trim()) {
      toast.error("Informe o nome da oportunidade.");
      return false;
    }
    setSaving(true);
    const res = await saveSystemsClient({
      id: selected.id,
      tenantId,
      parentCompanyId: selected.parent_company_id,
      name: form.name,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      city: form.city,
      state: form.state,
      plan: selected.plan,
      notes: form.notes,
      contactCadenceDays: selected.contact_cadence_days,
      status: selected.status,
      onboardedAt: selected.onboarded_at,
      lifecycle: "prospect",
      commercialStage: overrideStage ?? form.stage,
      segment: form.segment,
      currentSystem: form.currentSystem,
      address: form.address,
      commercialOwnerId: form.ownerId || null,
      nextAction: form.nextAction,
      nextActionAt: fromLocalInput(form.nextActionAt),
      lastContactResult: form.lastContactResult,
      lossReason: form.lossReason,
      leadSource: form.leadSource,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Erro ao salvar oportunidade.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!form || !selected) return;
    // Ganho exige confirmação e converte o registro.
    if (form.stage === "ganho" && selected.commercial_stage !== "ganho") {
      setWonTarget(selected);
      return;
    }
    const ok = await persist();
    if (!ok) return;
    toast.success("Oportunidade atualizada.");
    closeDrawer();
    load();
  };

  const confirmWon = async () => {
    if (!wonTarget) return;
    setSaving(true);
    const saved = await persist("negociacao"); // grava demais campos preservando dados
    if (!saved) {
      setSaving(false);
      return;
    }
    const res = await markOpportunityWon(wonTarget.id, wonTarget.onboarded_at);
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Erro ao converter em cliente.");
      return;
    }
    toast.success("Oportunidade ganha — agora é cliente de Sistemas.");
    setWonTarget(null);
    closeDrawer();
    load();
  };

  const submitTouchpoint = async () => {
    if (!selected || !tenantId) return;
    setTpSaving(true);
    const res = await recordManualTouchpoint({
      tenantId,
      clientId: selected.parent_company_id,
      subclientId: selected.id,
      touchpointType: tpType,
      occurredAt: fromLocalInput(tpDate) || new Date().toISOString(),
      summary: tpSummary || null,
    });
    if (!res.success) {
      setTpSaving(false);
      toast.error(res.message || "Erro ao registrar contato.");
      return;
    }
    if (tpUseAsResult && tpSummary.trim() && form) {
      setForm({ ...form, lastContactResult: tpSummary.trim() });
      await updateLastContactResult(selected.id, tpSummary.trim());
    }
    setTpSaving(false);
    setTpSummary("");
    toast.success("Contato registrado.");
    try {
      setHistory(await loadSubclientTouchpoints(tenantId, selected.id));
    } catch {
      /* histórico é acessório */
    }
    load();
  };

  const quickChip = (id: QuickFilter, label: string, count: number, icon?: React.ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => setQuick((prev) => (prev === id ? "all" : id))}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        quick === id
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted border-border text-foreground",
      )}
    >
      {icon}
      {label}
      <span className={cn("rounded-full px-1.5", quick === id ? "bg-primary-foreground/20" : "bg-muted")}>
        {count}
      </span>
    </button>
  );

  return (
    <div className="mt-4 px-3 sm:px-4">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Handshake className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Comercial · Sistemas</h1>
          <Badge variant="secondary">
            {visible.length} {visible.length === 1 ? "oportunidade" : "oportunidades"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setNewCompany(companies[0]?.id || ""); setNewOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Nova oportunidade
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/clientes-sistemas")}>
            <Users className="h-4 w-4 mr-1" />
            Clientes
          </Button>
        </div>
      </div>

      <div className="space-y-4 pb-8">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, contato, cidade ou sistema"
              className="pl-9"
            />
          </div>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fantasy_name || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Etapas ativas</SelectItem>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickChip("atrasados", "Atrasados", counters.atrasados, <AlertTriangle className="h-3.5 w-3.5" />)}
          {quickChip("hoje", "Hoje", counters.hoje, <CalendarClock className="h-3.5 w-3.5" />)}
          {quickChip("sem_acao", "Sem próxima ação", counters.semAcao)}
          {quickChip("simplesvet", "SimplesVet", counters.simplesvet)}
          {quickChip("avaliacao", "Em avaliação", counters.avaliacao)}
          {quickChip("negociacao", "Em negociação", counters.negociacao)}
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-xs font-semibold uppercase">Oportunidade</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Empresa/Produto</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Etapa</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Sistema atual</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Último contato</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Próxima ação</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Responsável</th>
                <th className="text-right p-3 text-xs font-semibold uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted-foreground">
                    Nenhuma oportunidade nesta visão.
                  </td>
                </tr>
              ) : (
                visible.map(({ client, lastTouch, bucket }) => (
                  <tr
                    key={client.id}
                    className="border-t align-top hover:bg-muted/40 cursor-pointer"
                    onClick={() => openDrawer(client)}
                  >
                    <td className="p-3">
                      <div className="font-medium">{client.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[client.city, client.state].filter(Boolean).join(" / ") ||
                          client.contact_name ||
                          "—"}
                      </div>
                    </td>
                    <td className="p-3">{companyName.get(client.parent_company_id) || "—"}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold",
                          STAGE_STYLES[client.commercial_stage || "mapeado"],
                        )}
                      >
                        {stageLabel(client.commercial_stage)}
                      </span>
                    </td>
                    <td className="p-3">
                      <div>{client.current_system || "Desconhecido"}</div>
                      {hasMigrationAvailable(client.current_system) && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          Migração disponível
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {lastTouch ? (
                        <div>
                          <div>{touchpointLabel(lastTouch.type)}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(lastTouch.occurredAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem contato registrado</span>
                      )}
                    </td>
                    <td className="p-3">
                      {client.next_action_at || client.next_action ? (
                        <div>
                          <div className="max-w-[240px]">{client.next_action || "—"}</div>
                          <div
                            className={cn(
                              "text-xs",
                              bucket === "atrasado"
                                ? "text-destructive font-semibold"
                                : "text-muted-foreground",
                            )}
                          >
                            {client.next_action_at
                              ? `${fmtDateTime(client.next_action_at)}${bucket === "atrasado" ? " · vencida" : ""}`
                              : "Sem data"}
                          </div>
                        </div>
                      ) : isFinalStage(client.commercial_stage) ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          Sem próxima ação
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {client.commercial_owner_id
                        ? ownerName.get(client.commercial_owner_id) || "—"
                        : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(client);
                        }}
                      >
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer de edição */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && closeDrawer()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {companyName.get(selected?.parent_company_id || "") || "Sistemas"} · oportunidade comercial
            </SheetDescription>
          </SheetHeader>

          {form && selected && (
            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Nome *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Segmento</label>
                  <Input
                    value={form.segment}
                    onChange={(e) => setForm({ ...form, segment: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Etapa</label>
                  <Select
                    value={form.stage}
                    onValueChange={(v) => setForm({ ...form, stage: v as CommercialStage })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Contato</label>
                  <Input
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Telefone</label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">E-mail</label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Sistema atual
                  </label>
                  <Input
                    value={form.currentSystem}
                    onChange={(e) => setForm({ ...form, currentSystem: e.target.value })}
                    className="mt-1"
                    placeholder="Ex.: SimplesVet"
                  />
                  {hasMigrationAvailable(form.currentSystem) && (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      Migração disponível
                    </Badge>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Endereço</label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Cidade</label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Estado</label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Próxima ação
                  </label>
                  <Input
                    value={form.nextAction}
                    onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Data/hora da próxima ação
                  </label>
                  <Input
                    type="datetime-local"
                    value={form.nextActionAt}
                    onChange={(e) => setForm({ ...form, nextActionAt: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Responsável comercial
                  </label>
                  <Select
                    value={form.ownerId || "none"}
                    onValueChange={(v) => setForm({ ...form, ownerId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem responsável</SelectItem>
                      {collaborators.map((c) => (
                        <SelectItem key={c.userId} value={c.userId}>
                          {c.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Origem do lead
                  </label>
                  <Input
                    value={form.leadSource}
                    onChange={(e) => setForm({ ...form, leadSource: e.target.value })}
                    className="mt-1"
                  />
                </div>
                {(form.stage === "perdido" || form.stage === "pausado") && (
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">
                      Motivo de perda/pausa
                    </label>
                    <Textarea
                      value={form.lossReason}
                      onChange={(e) => setForm({ ...form, lossReason: e.target.value })}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Resultado do último contato
                  </label>
                  <Textarea
                    value={form.lastContactResult}
                    onChange={(e) => setForm({ ...form, lastContactResult: e.target.value })}
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Observações
                  </label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeDrawer}>
                  Fechar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </div>

              {/* Registrar contato */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-primary" />
                  Histórico de contatos
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Select value={tpType} onValueChange={(v) => setTpType(v as TouchpointType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOUCHPOINT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="datetime-local"
                    value={tpDate}
                    onChange={(e) => setTpDate(e.target.value)}
                  />
                  <Textarea
                    className="sm:col-span-2"
                    rows={2}
                    placeholder="Resumo do contato"
                    value={tpSummary}
                    onChange={(e) => setTpSummary(e.target.value)}
                  />
                  <label className="sm:col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={tpUseAsResult}
                      onCheckedChange={(v) => setTpUseAsResult(!!v)}
                    />
                    Usar como resultado do último contato
                  </label>
                </div>
                <Button size="sm" onClick={submitTouchpoint} disabled={tpSaving}>
                  {tpSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Registrar contato
                </Button>

                <div className="space-y-2">
                  {historyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem contato registrado.</p>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="border rounded-md p-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold">{touchpointLabel(h.touchpoint_type)}</span>
                          <span className="text-muted-foreground">{fmtDateTime(h.occurred_at)}</span>
                        </div>
                        {h.summary && <p className="mt-1 text-muted-foreground">{h.summary}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmação Ganho */}
      <Dialog open={!!wonTarget} onOpenChange={(v) => !v && setWonTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Ganho?</DialogTitle>
            <DialogDescription>
              {wonTarget?.name} passa a ser cliente de Sistemas (ativo), sai da rotina comercial e
              mantém todo o histórico de contatos no mesmo registro.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWonTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmWon} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar ganho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova oportunidade */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova oportunidade</DialogTitle>
            <DialogDescription>Empresa e nome são obrigatórios.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Empresa/Produto *
              </label>
              <Select value={newCompany} onValueChange={setNewCompany}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fantasy_name || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Nome *</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Contato</label>
              <Input value={newContact} onChange={(e) => setNewContact(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Telefone</label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Cidade</label>
              <Input value={newCity} onChange={(e) => setNewCity(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Sistema atual</label>
              <Input value={newSystem} onChange={(e) => setNewSystem(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={newSaving}
              onClick={async () => {
                if (!tenantId) return;
                if (!newCompany || !newName.trim()) {
                  toast.error("Informe a empresa e o nome da oportunidade.");
                  return;
                }
                setNewSaving(true);
                const res = await saveSystemsClient({
                  tenantId,
                  parentCompanyId: newCompany,
                  name: newName,
                  contactName: newContact,
                  phone: newPhone,
                  city: newCity,
                  currentSystem: newSystem,
                  lifecycle: "prospect",
                  commercialStage: "mapeado",
                  commercialOwnerId: user?.id || null,
                });
                setNewSaving(false);
                if (!res.success) {
                  toast.error(res.message || "Erro ao criar oportunidade.");
                  return;
                }
                toast.success("Oportunidade criada.");
                setNewOpen(false);
                setNewName("");
                setNewContact("");
                setNewPhone("");
                setNewCity("");
                setNewSystem("");
                load();
              }}
            >
              {newSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Nota: filtros finais (ganho/perdido/pausado) só aparecem via filtro de etapa. */
void FINAL_STAGES;
