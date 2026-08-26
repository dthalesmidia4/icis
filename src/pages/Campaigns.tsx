import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, Loader2, Plus, Target, MapPin, CalendarRange, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { useSelectedClient } from "@/contexts/SelectedClientContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CampaignFormModal from "@/components/campaigns/CampaignFormModal";
import {
  campaignRegionLabel,
  campaignStatusLabel,
  deleteCampaign,
  isCampaignClosed,
  loadCampaigns,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  planning: "bg-muted text-muted-foreground border-border",
  active: "bg-primary/10 text-primary border-primary/30",
  paused: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const fmtDate = (v?: string | null) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export default function Campaigns() {
  const { tenantId } = useTenant();
  const { selectedClient } = useSelectedClient();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [toDelete, setToDelete] = useState<MarketingCampaign | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !selectedClient?.id) return;
    setLoading(true);
    try {
      setCampaigns(await loadCampaigns(tenantId, selectedClient.id));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar as campanhas.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedClient?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = selectedClient?.fantasy_name || selectedClient?.name || "";

  const { open, closed } = useMemo(
    () => ({
      open: campaigns.filter((c) => !isCampaignClosed(c.status)),
      closed: campaigns.filter((c) => isCampaignClosed(c.status)),
    }),
    [campaigns],
  );

  const handleDelete = async () => {
    if (!toDelete) return;
    const res = await deleteCampaign(toDelete.id);
    setToDelete(null);
    if (!res.success) {
      toast.error(res.message || "Erro ao excluir campanha.");
      return;
    }
    toast.success("Campanha excluída.");
    load();
  };

  if (!selectedClient) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10 text-center text-sm text-muted-foreground">
        Selecione um cliente para gerenciar campanhas.
      </div>
    );
  }

  const renderCard = (c: MarketingCampaign) => (
    <button
      key={c.id}
      type="button"
      onClick={() => navigate(`/campanhas/${c.id}`)}
      className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold">{c.name}</h3>
          {c.objective && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.objective}</p>
          )}
        </div>
        <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black uppercase", STATUS_STYLE[c.status])}>
          {campaignStatusLabel(c.status)}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5" />
          {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {campaignRegionLabel(c)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          {c.channels.length ? c.channels.join(", ") : "Sem canais definidos"}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(c);
            setFormOpen(true);
          }}
        >
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setToDelete(c);
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Excluir
        </Button>
      </div>
    </button>
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Campanhas</h1>
            <p className="text-xs text-muted-foreground">
              Camada que costura Mídia e Comercial de {displayName}.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova campanha
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma campanha ainda. Crie a primeira para vincular períodos de Mídia e prospects do
          Comercial.
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Em operação ({open.length})
            </h2>
            {open.length ? (
              <div className="space-y-3">{open.map(renderCard)}</div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma campanha em operação.</p>
            )}
          </section>
          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Encerradas ({closed.length})
              </h2>
              <div className="space-y-3 opacity-80">{closed.map(renderCard)}</div>
            </section>
          )}
        </div>
      )}

      <CampaignFormModal
        open={formOpen}
        campaign={editing}
        companyId={selectedClient.id}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
        onSaved={load}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Os períodos e prospects vinculados NÃO são apagados — apenas perdem o vínculo com esta
              campanha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
