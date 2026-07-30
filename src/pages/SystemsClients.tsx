import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Building2, Plus, Pencil, Trash2, Search, HeartPulse } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  loadSystemsClients,
  loadSystemsCompanies,
  saveSystemsClient,
  deleteSystemsClient,
  STATUS_LABEL,
  type SystemsClient,
  type SystemsClientStatus,
  type SystemsCompany,
} from "@/lib/systemsClients";

const STATUS_STYLES: Record<SystemsClientStatus, string> = {
  ativo: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  pausado: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  cancelado: "bg-muted text-muted-foreground border-border",
};

interface FormState {
  id?: string;
  parentCompanyId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  plan: string;
  notes: string;
  contactCadenceDays: string;
  status: SystemsClientStatus;
  onboardedAt: string;
}

const emptyForm = (parentCompanyId = ""): FormState => ({
  parentCompanyId,
  name: "",
  contactName: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  plan: "",
  notes: "",
  contactCadenceDays: "30",
  status: "ativo",
  onboardedAt: "",
});

export default function SystemsClients() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<SystemsCompany[]>([]);
  const [rows, setRows] = useState<SystemsClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemsClient | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [comps, clients] = await Promise.all([
        loadSystemsCompanies(tenantId),
        loadSystemsClients(tenantId),
      ]);
      setCompanies(comps);
      setRows(clients);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar os clientes de Sistemas.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => map.set(c.id, c.fantasy_name || c.name));
    return map;
  }, [companies]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (companyFilter !== "all" && r.parent_company_id !== companyFilter) return false;
      if (!term) return true;
      return [r.name, r.contact_name, r.email, r.city, r.plan]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [rows, search, companyFilter]);

  const openCreate = () => {
    if (companies.length === 0) {
      toast.error("Cadastre uma empresa com área Sistemas antes de adicionar clientes.");
      return;
    }
    setForm(emptyForm(companies[0].id));
  };

  const openEdit = (r: SystemsClient) => {
    setForm({
      id: r.id,
      parentCompanyId: r.parent_company_id,
      name: r.name,
      contactName: r.contact_name || "",
      email: r.email || "",
      phone: r.phone || "",
      city: r.city || "",
      state: r.state || "",
      plan: r.plan || "",
      notes: r.notes || "",
      contactCadenceDays: String(r.contact_cadence_days ?? 30),
      status: (r.status as SystemsClientStatus) || "ativo",
      onboardedAt: r.onboarded_at || "",
    });
  };

  const submit = async () => {
    if (!tenantId || !form) return;
    if (!form.name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setSaving(true);
    const res = await saveSystemsClient({
      id: form.id,
      tenantId,
      parentCompanyId: form.parentCompanyId,
      name: form.name,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      city: form.city,
      state: form.state,
      plan: form.plan,
      notes: form.notes,
      contactCadenceDays: Number(form.contactCadenceDays) || 30,
      status: form.status,
      onboardedAt: form.onboardedAt || null,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Erro ao salvar cliente.");
      return;
    }
    toast.success(form.id ? "Cliente atualizado." : "Cliente cadastrado.");
    setForm(null);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await deleteSystemsClient(deleteTarget.id);
    if (!res.success) {
      toast.error(res.message || "Erro ao remover cliente.");
      return;
    }
    toast.success("Cliente removido.");
    setDeleteTarget(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Clientes de Sistemas"
        subtitle="Base de clientes atendidos pelas empresas de Sistemas (ex.: clínicas da SmartVety)."
        backTo="/customer-success-sistemas"
        actions={[
          {
            label: "Novo cliente",
            icon: <Plus className="h-4 w-4" />,
            onClick: openCreate,
          },
          {
            label: "Customer Success",
            variant: "outline",
            icon: <HeartPulse className="h-4 w-4" />,
            onClick: () => navigate("/customer-success-sistemas", { state: { from: "/clientes-sistemas" } }),
          },
        ]}
      />

      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">


      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, contato, cidade ou plano"
            className="pl-9"
          />
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold uppercase">Cliente</th>
              <th className="text-left p-3 text-xs font-semibold uppercase">Empresa</th>
              <th className="text-left p-3 text-xs font-semibold uppercase">Contato</th>
              <th className="text-left p-3 text-xs font-semibold uppercase">Plano</th>
              <th className="text-center p-3 text-xs font-semibold uppercase">Cadência</th>
              <th className="text-left p-3 text-xs font-semibold uppercase">Situação</th>
              <th className="text-right p-3 text-xs font-semibold uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">
                Nenhum cliente cadastrado ainda.
              </td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    {(r.city || r.state) && (
                      <div className="text-xs text-muted-foreground">
                        {[r.city, r.state].filter(Boolean).join(" / ")}
                      </div>
                    )}
                  </td>
                  <td className="p-3">{companyName.get(r.parent_company_id) || "—"}</td>
                  <td className="p-3">
                    <div>{r.contact_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.email, r.phone].filter(Boolean).join(" · ") || "sem contato"}
                    </div>
                  </td>
                  <td className="p-3">{r.plan || "—"}</td>
                  <td className="p-3 text-center">{r.contact_cadence_days}d</td>
                  <td className="p-3">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold", STATUS_STYLES[(r.status as SystemsClientStatus) || "ativo"])}>
                      {STATUS_LABEL[(r.status as SystemsClientStatus) || "ativo"]}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(r)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>



      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar cliente" : "Novo cliente de Sistemas"}</DialogTitle>
            <DialogDescription>Apenas o nome é obrigatório.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Nome *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                  placeholder="Ex.: Clínica Bicho Feliz"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Empresa de Sistemas</label>
                <Select value={form.parentCompanyId} onValueChange={(v) => setForm({ ...form, parentCompanyId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Situação</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SystemsClientStatus })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Contato</label>
                <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">E-mail</label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Telefone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Plano</label>
                <Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Cidade</label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Estado</label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Cadência de contato (dias)</label>
                <Input
                  type="number"
                  min={1}
                  value={form.contactCadenceDays}
                  onChange={(e) => setForm({ ...form, contactCadenceDays: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Início do atendimento</label>
                <Input type="date" value={form.onboardedAt} onChange={(e) => setForm({ ...form, onboardedAt: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Observações</label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover cliente</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} será removido. As demandas e contatos vinculados permanecem, sem o vínculo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
