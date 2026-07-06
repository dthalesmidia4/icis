import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Requirement = "required" | "disabled";

const FUNCTIONS: { key: string; name: string }[] = [
  { key: "planejar", name: "Planejar" },
  { key: "criar_roteiro", name: "Criar roteiro" },
  { key: "criar_arte", name: "Criar arte" },
  { key: "captar", name: "Captar" },
  { key: "gerar_video", name: "Gerar vídeo" },
  { key: "editar_video", name: "Editar vídeo" },
  { key: "revisar", name: "Revisar" },
  { key: "publicar", name: "Publicar" },
  { key: "revisar_publicacao", name: "Revisar publicação" },
];

const DEMAND_TYPES: { key: string; name: string }[] = [
  { key: "criativo_estatico", name: "Criativo estático" },
  { key: "carrossel", name: "Carrossel" },
  { key: "video_captado", name: "Vídeo captado" },
  { key: "video_gerado", name: "Vídeo gerado" },
  { key: "anuncio", name: "Anúncio" },
];

const DEFAULTS: Record<string, Record<string, Requirement>> = {
  criativo_estatico: {
    planejar: "required", criar_roteiro: "disabled", criar_arte: "required",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", publicar: "required", revisar_publicacao: "required",
  },
  carrossel: {
    planejar: "required", criar_roteiro: "required", criar_arte: "required",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", publicar: "required", revisar_publicacao: "required",
  },
  video_captado: {
    planejar: "required", criar_roteiro: "required", criar_arte: "disabled",
    captar: "required", gerar_video: "disabled", editar_video: "required",
    revisar: "required", publicar: "required", revisar_publicacao: "required",
  },
  video_gerado: {
    planejar: "required", criar_roteiro: "required", criar_arte: "disabled",
    captar: "disabled", gerar_video: "required", editar_video: "disabled",
    revisar: "required", publicar: "required", revisar_publicacao: "required",
  },
  anuncio: {
    planejar: "required", criar_roteiro: "required", criar_arte: "required",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", publicar: "required", revisar_publicacao: "disabled",
  },
};

const NEXT: Record<Requirement, Requirement> = {
  required: "disabled",
  disabled: "required",
};

const LABEL: Record<Requirement, string> = {
  required: "Sim",
  disabled: "Não",
};

const STYLE: Record<Requirement, string> = {
  required: "bg-primary text-primary-foreground border-primary",
  disabled: "bg-muted text-muted-foreground border-border",
};

export function FunctionPermissionsModal({ open, onOpenChange }: Props) {
  const { agencyId } = useAgency();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Record<string, Record<string, Requirement>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const seedIfEmpty = async (tenantId: string) => {
    // Seed flow_functions
    const { data: existingFns } = await supabase
      .from("flow_functions").select("function_key").eq("tenant_id", tenantId);
    if (!existingFns || existingFns.length === 0) {
      await supabase.from("flow_functions").insert(
        FUNCTIONS.map((f, i) => ({
          tenant_id: tenantId, function_key: f.key, name: f.name, position: i, active: true,
        }))
      );
    }
    // Seed demand_type_flow_rules
    const { data: existingRules } = await supabase
      .from("demand_type_flow_rules").select("id").eq("tenant_id", tenantId).limit(1);
    if (!existingRules || existingRules.length === 0) {
      const rows = DEMAND_TYPES.flatMap((dt) =>
        FUNCTIONS.map((fn) => ({
          tenant_id: tenantId,
          demand_type_key: dt.key,
          demand_type_name: dt.name,
          function_key: fn.key,
          requirement: DEFAULTS[dt.key][fn.key],
        }))
      );
      await supabase.from("demand_type_flow_rules").insert(rows);
    }
  };

  const load = async (tenantId: string) => {
    setLoading(true);
    await seedIfEmpty(tenantId);
    const { data, error } = await supabase
      .from("demand_type_flow_rules")
      .select("demand_type_key, function_key, requirement")
      .eq("tenant_id", tenantId);
    if (error) {
      console.error(error);
      toast.error("Erro ao carregar configuração");
      setLoading(false);
      return;
    }
    const map: Record<string, Record<string, Requirement>> = {};
    DEMAND_TYPES.forEach((dt) => {
      map[dt.key] = {};
      FUNCTIONS.forEach((fn) => {
        map[dt.key][fn.key] = DEFAULTS[dt.key][fn.key];
      });
    });
    (data || []).forEach((r: any) => {
      if (!map[r.demand_type_key]) map[r.demand_type_key] = {};
      map[r.demand_type_key][r.function_key] = r.requirement;
    });
    setRules(map);
    setLoading(false);
  };

  useEffect(() => {
    if (open && agencyId) load(agencyId);
  }, [open, agencyId]);

  const cycle = async (demandKey: string, fnKey: string) => {
    if (!agencyId) return;
    const current = rules[demandKey]?.[fnKey] ?? "disabled";
    const next = NEXT[current];
    const rowKey = `${demandKey}:${fnKey}`;
    setSaving(rowKey);
    setRules((prev) => ({
      ...prev,
      [demandKey]: { ...(prev[demandKey] || {}), [fnKey]: next },
    }));
    const demandName = DEMAND_TYPES.find((d) => d.key === demandKey)?.name || demandKey;
    const { error } = await supabase
      .from("demand_type_flow_rules")
      .upsert(
        {
          tenant_id: agencyId,
          demand_type_key: demandKey,
          demand_type_name: demandName,
          function_key: fnKey,
          requirement: next,
        },
        { onConflict: "tenant_id,demand_type_key,function_key" }
      );
    if (error) {
      toast.error("Erro ao salvar");
      console.error(error);
      setRules((prev) => ({
        ...prev,
        [demandKey]: { ...(prev[demandKey] || {}), [fnKey]: current },
      }));
    }
    setSaving(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Configurar funções do fluxo</DialogTitle>
          <DialogDescription>
            Defina, para cada tipo de demanda, quais funções operacionais são obrigatórias, opcionais ou não se aplicam. Clique na célula para alternar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 text-xs mb-2">
          <span className="flex items-center gap-1"><span className={cn("inline-block px-2 py-0.5 rounded border", STYLE.required)}>Sim</span> participa desse tipo</span>
          <span className="flex items-center gap-1"><span className={cn("inline-block px-2 py-0.5 rounded border", STYLE.disabled)}>Não</span> não se aplica</span>
        </div>


        <div className="border rounded-lg overflow-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-semibold uppercase text-xs sticky left-0 bg-muted/50 z-20 min-w-[180px]">
                  Tipo de demanda
                </th>
                {FUNCTIONS.map((f) => (
                  <th key={f.key} className="text-center p-3 font-semibold uppercase text-[10px] whitespace-nowrap">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={1 + FUNCTIONS.length} className="p-8 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : (
                DEMAND_TYPES.map((dt) => (
                  <tr key={dt.key} className="border-t">
                    <td className="p-3 font-medium sticky left-0 bg-background z-10">{dt.name}</td>
                    {FUNCTIONS.map((fn) => {
                      const req = rules[dt.key]?.[fn.key] ?? "disabled";
                      const isSaving = saving === `${dt.key}:${fn.key}`;
                      return (
                        <td key={fn.key} className="p-2 text-center">
                          <button
                            disabled={isSaving}
                            onClick={() => cycle(dt.key, fn.key)}
                            className={cn(
                              "inline-flex items-center justify-center min-w-[70px] px-2 py-1 rounded border text-xs font-semibold transition-colors hover:opacity-80",
                              STYLE[req],
                              isSaving && "opacity-50"
                            )}
                          >
                            {LABEL[req]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
