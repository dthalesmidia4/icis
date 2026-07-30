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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, AlertTriangle, CheckCircle2, Plus, RefreshCw, Building2, History } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  loadSystemsClientHealth,
  HEALTH_LABEL,
  type SystemsClientHealth,
  type HealthLevel,
} from "@/lib/clientHealth";
import {
  recordManualTouchpoint,
  loadSubclientTouchpoints,
  touchpointLabel,
  TOUCHPOINT_OPTIONS,
  type TouchpointType,
  type TouchpointRecord,
} from "@/lib/recordTouchpoint";
import { DEMAND_ORIGIN_LABEL } from "@/lib/proceedDemand";

const LEVEL_STYLES: Record<HealthLevel, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  atencao: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  risco: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const nowLocalInput = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const originSummary = (openByOrigin: Record<string, number> | undefined) => {
  const entries = Object.entries(openByOrigin || {});
  if (entries.length === 0) return "Nenhuma demanda aberta";
  return entries
    .map(([key, count]) => `${(DEMAND_ORIGIN_LABEL as Record<string, string>)[key] || key}: ${count}`)
    .join(" · ");
};

export default function CustomerSuccessSistemas() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SystemsClientHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<"all" | HealthLevel>("all");
  const [dialogClient, setDialogClient] = useState<SystemsClientHealth | null>(null);
  const [tpType, setTpType] = useState<TouchpointType>("solicitacao");
  const [tpWhen, setTpWhen] = useState(nowLocalInput());
  const [tpSummary, setTpSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const [historyClient, setHistoryClient] = useState<SystemsClientHealth | null>(null);
  const [history, setHistory] = useState<TouchpointRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      setRows(await loadSystemsClientHealth(tenantId));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar o Customer Success.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (levelFilter === "all" ? rows : rows.filter((r) => r.level === levelFilter)),
    [rows, levelFilter],
  );

  const summary = useMemo(() => ({
    ok: rows.filter((r) => r.level === "ok").length,
    atencao: rows.filter((r) => r.level === "atencao").length,
    risco: rows.filter((r) => r.level === "risco").length,
  }), [rows]);

  const openDialog = (row: SystemsClientHealth) => {
    setDialogClient(row);
    setTpType("solicitacao");
    setTpWhen(nowLocalInput());
    setTpSummary("");
  };

  const openHistory = async (row: SystemsClientHealth) => {
    setHistoryClient(row);
    setHistory([]);
    if (!tenantId) return;
    setHistoryLoading(true);
    try {
      setHistory(await loadSubclientTouchpoints(tenantId, row.clientId));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar o histórico de contatos.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveTouchpoint = async () => {
    if (!tenantId || !dialogClient) return;
    setSaving(true);
    const res = await recordManualTouchpoint({
      tenantId,
      clientId: dialogClient.parentCompanyId,
      subclientId: dialogClient.clientId,
      touchpointType: tpType,
      occurredAt: new Date(tpWhen).toISOString(),
      summary: tpSummary.trim() || null,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Erro ao registrar contato.");
      return;
    }
    toast.success("Contato registrado.");
    setDialogClient(null);
    load();
  };

  return (
    <div className="mt-4 px-3 sm:px-4">
      {/* Header — mesma estrutura da Visão Geral das Tarefas */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <HeartPulse className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Customer Success · Sistemas
          </h2>
          <Badge variant="secondary">
            {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/clientes-sistemas", { state: { from: "/customer-success-sistemas" } })}
          >
            <Building2 className="h-4 w-4 mr-1" />
            Cadastro de clientes
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="space-y-6 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { level: "ok" as HealthLevel, icon: CheckCircle2, count: summary.ok },
            { level: "atencao" as HealthLevel, icon: AlertTriangle, count: summary.atencao },
            { level: "risco" as HealthLevel, icon: AlertTriangle, count: summary.risco },
          ]).map(({ level, icon: Icon, count }) => (
            <button
              key={level}
              onClick={() => setLevelFilter((prev) => (prev === level ? "all" : level))}
              className={cn(
                "border rounded-xl p-4 text-left transition-shadow hover:shadow-sm",
                LEVEL_STYLES[level],
                levelFilter === level && "ring-2 ring-primary/40",
              )}
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                <Icon className="h-4 w-4" />
                {HEALTH_LABEL[level]}
              </div>
              <div className="text-2xl font-bold mt-1">{count}</div>
            </button>
          ))}
        </div>

        <div className="border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-xs font-semibold uppercase">Cliente</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Empresa</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Saúde</th>
                <th className="text-left p-3 text-xs font-semibold uppercase">Último contato</th>
                <th className="text-center p-3 text-xs font-semibold uppercase">Cadência</th>
                <th className="text-center p-3 text-xs font-semibold uppercase">Abertas</th>
                <th className="text-center p-3 text-xs font-semibold uppercase">Atrasadas</th>
                <th className="text-center p-3 text-xs font-semibold uppercase">Contatos 30d</th>
                <th className="text-right p-3 text-xs font-semibold uppercase">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">
                  <div>Nenhum cliente de Sistemas cadastrado.</div>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/clientes-sistemas", { state: { from: "/customer-success-sistemas" } })}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Cadastrar clientes
                  </Button>
                </td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.clientId} className="border-t align-top">
                    <td className="p-3">
                      <div className="font-medium">{r.clientName}</div>
                      {r.reasons.length > 0 && (
                        <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                          {r.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.parentCompanyName}</td>
                    <td className="p-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold", LEVEL_STYLES[r.level])}>
                        {HEALTH_LABEL[r.level]} · {r.score}
                      </span>
                    </td>
                    <td className="p-3">
                      <div>{formatDateTime(r.lastTouchAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.daysSinceTouch === null ? "sem registro" : `há ${r.daysSinceTouch} dia(s)`}
                        {r.lastTouchType ? ` · ${touchpointLabel(r.lastTouchType)}` : ""}
                      </div>
                    </td>
                    <td className="p-3 text-center">{r.cadenceDays}d</td>
                    <td className="p-3 text-center" title={originSummary(r.openByOrigin)}>
                      <span className="underline decoration-dotted decoration-muted-foreground/50">{r.openDemands}</span>
                    </td>
                    <td className={cn("p-3 text-center", r.overdueDemands > 0 && "text-red-600 font-semibold")}>{r.overdueDemands}</td>
                    <td className="p-3 text-center">{r.touchpoints30d}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openHistory(r)} title="Histórico de contatos">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="ml-1" onClick={() => openDialog(r)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Contato
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!dialogClient} onOpenChange={(v) => !v && setDialogClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar contato</DialogTitle>
            <DialogDescription>
              {dialogClient?.clientName}
              {dialogClient?.parentCompanyName ? ` · ${dialogClient.parentCompanyName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Tipo de contato</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TOUCHPOINT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setTpType(o.value)}
                    className={cn(
                      "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
                      tpType === o.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Quando</label>
              <Input type="datetime-local" value={tpWhen} onChange={(e) => setTpWhen(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Resumo</label>
              <Textarea
                value={tpSummary}
                onChange={(e) => setTpSummary(e.target.value)}
                placeholder="O que foi tratado"
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogClient(null)}>Cancelar</Button>
            <Button onClick={saveTouchpoint} disabled={saving || !tpWhen}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyClient} onOpenChange={(v) => !v && setHistoryClient(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-auto">
          <SheetHeader>
            <SheetTitle>Histórico de contatos</SheetTitle>
            <SheetDescription>
              {historyClient?.clientName}
              {historyClient?.parentCompanyName ? ` · ${historyClient.parentCompanyName}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {historyLoading ? (
              <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado ainda.</p>
            ) : (
              history.map((t) => (
                <div key={t.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{touchpointLabel(t.touchpoint_type)}</span>
                    <span className="text-[11px] uppercase text-muted-foreground">
                      {t.source === "auto" ? "automático" : "manual"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatDateTime(t.occurred_at)}</div>
                  {t.summary && <p className="text-sm mt-2 whitespace-pre-wrap">{t.summary}</p>}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
