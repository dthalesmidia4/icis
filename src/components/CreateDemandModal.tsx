import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { OFFICIAL_DEMAND_TYPES, DEMAND_TYPE_LABEL, type DemandTypeKey } from "@/lib/proceedDemand";

interface Client {
  id: string;
  name: string;
  fantasy_name?: string;
}

interface CreateDemandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodPlanId?: string | null;
  /**
   * Called after the draft demand row is created.
   * The parent should open the TaskCard in draft mode using this demand id.
   */
  onDraftCreated?: (demandId: string) => void;
  /** Backward-compat: fired after user confirms save in the TaskCard (parent re-fetch). */
  onDemandCreated?: () => void;
}

/**
 * Mini-modal para iniciar uma nova demanda.
 *
 * Coleta apenas o mínimo técnico (Cliente + Tipo), cria um rascunho
 * (is_draft = true) e delega a edição completa ao TaskCard, que é o
 * espelho visual real do card.
 */
export function CreateDemandModal({
  open,
  onOpenChange,
  periodPlanId,
  onDraftCreated
}: CreateDemandModalProps) {
  const { tenantId } = useTenant();
  const [clientId, setClientId] = useState<string>("");
  const [demandTypeKey, setDemandTypeKey] = useState<DemandTypeKey | "">("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setClientId("");
      setDemandTypeKey("");
      return;
    }
    if (!tenantId) return;
    (async () => {
      setLoadingClients(true);
      try {
        const { data, error } = await supabase
          .from("tenant_companies")
          .select("id, name, fantasy_name")
          .eq("tenant_id", tenantId)
          .order("name");
        if (error) throw error;
        setClients(data || []);
      } catch (err) {
        console.error("Error loading clients:", err);
        toast.error("Erro ao carregar clientes");
      } finally {
        setLoadingClients(false);
      }
    })();
  }, [open, tenantId]);

  const handleContinue = async () => {
    if (!clientId) {
      toast.error("Selecione um cliente");
      return;
    }
    if (!demandTypeKey) {
      toast.error("Selecione o tipo da demanda");
      return;
    }
    setSubmitting(true);
    try {
      const chosenLabel = DEMAND_TYPE_LABEL[demandTypeKey];
      const { data, error } = await supabase.rpc("create_demand_from_template", {
        p_client_id: clientId,
        p_template_id: null,
        p_pipeline_id: null,
        p_status_id: null,
        p_title: "Nova demanda",
        p_description: null,
        p_demand_type: chosenLabel,
        p_channel: null,
        p_publish_date: null,
        p_due_date: null,
        p_period_plan_id: periodPlanId || null
      });
      if (error) throw error;
      const result = data as { success?: boolean; demand_id?: string; error?: string } | null;
      if (!result?.success || !result.demand_id) {
        toast.error(result?.error || "Erro ao criar demanda");
        return;
      }
      // Marca como rascunho + persiste demand_type_key
      const { error: upErr } = await supabase
        .from("demands")
        .update({ is_draft: true, demand_type_key: demandTypeKey } as any)
        .eq("id", result.demand_id);
      if (upErr) throw upErr;

      onOpenChange(false);
      onDraftCreated?.(result.demand_id);
    } catch (err: any) {
      console.error("Error creating draft demand:", err);
      toast.error(err.message || "Erro ao criar demanda");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nova Demanda
          </DialogTitle>
          <DialogDescription>
            Escolha o cliente e o tipo. Você preencherá o restante direto no card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="client">Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={loadingClients || submitting}>
              <SelectTrigger id="client">
                <SelectValue placeholder={loadingClients ? "Carregando..." : "Selecione o cliente"} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.fantasy_name || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo da demanda *</Label>
            <Select
              value={demandTypeKey}
              onValueChange={(v) => setDemandTypeKey(v as DemandTypeKey)}
              disabled={submitting}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Selecione o tipo técnico" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {OFFICIAL_DEMAND_TYPES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {DEMAND_TYPE_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Define o fluxo operacional. Todos os demais campos ficam no card.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleContinue} disabled={submitting || !clientId || !demandTypeKey}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
