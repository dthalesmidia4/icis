import { useEffect, useMemo, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeFlowConfig } from "@/hooks/realtime";
import { DURATION_MATRIX, type DurationTypeGroup } from "@/lib/reorderSequence";
import { AreaAllocationTab } from "@/components/config/AreaAllocationTab";

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
  { key: "enviar_cliente", name: "Enviar cliente" },
  { key: "aguardando_cliente", name: "Aguardando cliente" },
  { key: "publicar", name: "Publicar" },
  { key: "revisar_publicacao", name: "Revisar publicação" },
];

const DEMAND_TYPES: { key: string; name: string; group: DurationTypeGroup }[] = [
  { key: "criativo_estatico", name: "Criativo estático", group: "estatico" },
  { key: "carrossel", name: "Carrossel", group: "carrossel" },
  { key: "video_captado", name: "Vídeo captado", group: "video_curto" },
  { key: "video_gerado", name: "Vídeo gerado", group: "video_curto" },
  { key: "anuncio", name: "Anúncio", group: "estatico" },
  { key: "outro", name: "Outro", group: "outro" },
];

const DEFAULTS: Record<string, Record<string, Requirement>> = {
  criativo_estatico: {
    planejar: "required", criar_roteiro: "disabled", criar_arte: "required",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", enviar_cliente: "required", aguardando_cliente: "required", publicar: "required", revisar_publicacao: "required",
  },
  carrossel: {
    planejar: "required", criar_roteiro: "required", criar_arte: "required",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", enviar_cliente: "required", aguardando_cliente: "required", publicar: "required", revisar_publicacao: "required",
  },
  video_captado: {
    planejar: "required", criar_roteiro: "required", criar_arte: "disabled",
    captar: "required", gerar_video: "disabled", editar_video: "required",
    revisar: "required", enviar_cliente: "required", aguardando_cliente: "required", publicar: "required", revisar_publicacao: "required",
  },
  video_gerado: {
    planejar: "required", criar_roteiro: "required", criar_arte: "disabled",
    captar: "disabled", gerar_video: "required", editar_video: "disabled",
    revisar: "required", enviar_cliente: "required", aguardando_cliente: "required", publicar: "required", revisar_publicacao: "required",
  },
  anuncio: {
    planejar: "required", criar_roteiro: "required", criar_arte: "required",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", enviar_cliente: "required", aguardando_cliente: "required", publicar: "required", revisar_publicacao: "disabled",
  },
  outro: {
    planejar: "required", criar_roteiro: "disabled", criar_arte: "disabled",
    captar: "disabled", gerar_video: "disabled", editar_video: "disabled",
    revisar: "required", enviar_cliente: "disabled", aguardando_cliente: "disabled", publicar: "disabled", revisar_publicacao: "disabled",
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

/** Duração hardcoded para uma célula (função × grupo do tipo). */
function hardcodedDuration(functionKey: string, group: DurationTypeGroup): number {
  const row = DURATION_MATRIX[functionKey];
  if (row) return row[group] ?? row.default ?? 15;
  return 15;
}

export function FunctionPermissionsModal({ open, onOpenChange }: Props) {
  const { agencyId } = useAgency();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Record<string, Record<string, Requirement>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  // durations[function_key][group] = minutos
  const [durations, setDurations] = useState<Record<string, Partial<Record<DurationTypeGroup, number>>>>({});
  const [savingDuration, setSavingDuration] = useState<string | null>(null);

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
    const [{ data, error }, { data: fnRows }] = await Promise.all([
      supabase
        .from("demand_type_flow_rules")
        .select("demand_type_key, function_key, requirement")
        .eq("tenant_id", tenantId),
      supabase
        .from("flow_functions")
        .select("function_key, config")
        .eq("tenant_id", tenantId),
    ]);
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

    const durMap: Record<string, Partial<Record<DurationTypeGroup, number>>> = {};
    (fnRows || []).forEach((r: any) => {
      const stored = r?.config?.durations;
      if (stored && typeof stored === "object") {
        durMap[r.function_key] = { ...stored };
      }
    });
    setDurations(durMap);
    setLoading(false);
  };

  useEffect(() => {
    if (open && agencyId) load(agencyId);
  }, [open, agencyId]);

  const savingRef = useRef<string | null>(null);
  useEffect(() => { savingRef.current = saving || savingDuration; }, [saving, savingDuration]);

  useRealtimeFlowConfig({
    tenantId: agencyId ?? null,
    enabled: open && !!agencyId,
    onChange: () => {
      if (savingRef.current) return; // ignora eco do próprio save
      if (agencyId) load(agencyId);
    },
  });

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

  /** Retorna minutos exibidos (override do banco OU hardcoded). */
  const cellMinutes = (fnKey: string, group: DurationTypeGroup): number => {
    const stored = durations[fnKey]?.[group];
    if (typeof stored === "number" && stored > 0) return stored;
    return hardcodedDuration(fnKey, group);
  };

  /** Salva uma célula (função × grupo) no config JSONB da flow_functions. */
  const saveDuration = async (fnKey: string, group: DurationTypeGroup, minutes: number) => {
    if (!agencyId) return;
    const rowKey = `${fnKey}:${group}`;
    setSavingDuration(rowKey);
    const newRow: Partial<Record<DurationTypeGroup, number>> = {
      ...(durations[fnKey] || {}),
      [group]: minutes,
    };
    setDurations((prev) => ({ ...prev, [fnKey]: newRow }));

    // Busca config atual para preservar outras chaves
    const { data: current } = await supabase
      .from("flow_functions")
      .select("config")
      .eq("tenant_id", agencyId)
      .eq("function_key", fnKey)
      .maybeSingle();
    const currentConfig = (current as any)?.config || {};
    const newConfig = { ...currentConfig, durations: newRow };
    const { error } = await supabase
      .from("flow_functions")
      .update({ config: newConfig })
      .eq("tenant_id", agencyId)
      .eq("function_key", fnKey);
    if (error) {
      toast.error("Erro ao salvar duração");
      console.error(error);
    }
    setSavingDuration(null);
  };

  /** Restaura todos os valores da linha (tipo de demanda) para o hardcoded. */
  const resetDurationsForType = async (demandKey: string) => {
    if (!agencyId) return;
    const dt = DEMAND_TYPES.find((d) => d.key === demandKey);
    if (!dt) return;
    const group = dt.group;
    setSavingDuration(`reset:${demandKey}`);
    const nextDurations = { ...durations };
    for (const fn of FUNCTIONS) {
      const req = rules[demandKey]?.[fn.key];
      if (req !== "required") continue;
      const fallback = hardcodedDuration(fn.key, group);
      const newRow = { ...(nextDurations[fn.key] || {}), [group]: fallback };
      nextDurations[fn.key] = newRow;
      const { data: current } = await supabase
        .from("flow_functions")
        .select("config")
        .eq("tenant_id", agencyId)
        .eq("function_key", fn.key)
        .maybeSingle();
      const currentConfig = (current as any)?.config || {};
      const newConfig = { ...currentConfig, durations: newRow };
      await supabase
        .from("flow_functions")
        .update({ config: newConfig })
        .eq("tenant_id", agencyId)
        .eq("function_key", fn.key);
    }
    setDurations(nextDurations);
    setSavingDuration(null);
    toast.success(`Durações de "${dt.name}" restauradas.`);
  };

  /** Subtotal por linha (soma das etapas required). */
  const rowSubtotal = (demandKey: string, group: DurationTypeGroup): number => {
    let total = 0;
    for (const fn of FUNCTIONS) {
      if (rules[demandKey]?.[fn.key] === "required") {
        total += cellMinutes(fn.key, group);
      }
    }
    return total;
  };

  const fmtMinutes = (m: number): string => {
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm === 0 ? `${h}h` : `${h}h${String(rm).padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Configurar funções do fluxo</DialogTitle>
          <DialogDescription>
            Defina, para cada tipo de demanda, quais funções participam e quanto tempo cada etapa costuma levar.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="participacao" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="participacao">Participação</TabsTrigger>
            <TabsTrigger value="tempo">Tempo estimado</TabsTrigger>
            <TabsTrigger value="alocacao">Alocação por área</TabsTrigger>
          </TabsList>

          <TabsContent value="participacao" className="mt-4">
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
          </TabsContent>

          <TabsContent value="tempo" className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">
              Tempo estimado, em minutos, para cada etapa por tipo de demanda. Usado ao reorganizar sequência automaticamente. Só é possível editar etapas marcadas como "Sim" na aba anterior.
            </p>

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
                    <th className="text-center p-3 font-semibold uppercase text-[10px] whitespace-nowrap">Total</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2 + FUNCTIONS.length + 1} className="p-8 text-center">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : (
                    DEMAND_TYPES.map((dt) => {
                      const subtotal = rowSubtotal(dt.key, dt.group);
                      return (
                        <tr key={dt.key} className="border-t">
                          <td className="p-3 font-medium sticky left-0 bg-background z-10">{dt.name}</td>
                          {FUNCTIONS.map((fn) => {
                            const req = rules[dt.key]?.[fn.key] ?? "disabled";
                            if (req !== "required") {
                              return (
                                <td key={fn.key} className="p-2 text-center text-muted-foreground/40">—</td>
                              );
                            }
                            const value = cellMinutes(fn.key, dt.group);
                            const cellKey = `${fn.key}:${dt.group}`;
                            const isSaving = savingDuration === cellKey;
                            return (
                              <td key={fn.key} className="p-1.5 text-center">
                                <div className="relative inline-block">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={5}
                                    defaultValue={value}
                                    key={`${cellKey}:${value}`}
                                    disabled={isSaving}
                                    onBlur={(e) => {
                                      const raw = parseInt(e.target.value, 10);
                                      if (!Number.isFinite(raw) || raw < 1) {
                                        e.target.value = String(value);
                                        return;
                                      }
                                      if (raw === value) return;
                                      saveDuration(fn.key, dt.group, raw);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-16 h-8 text-center text-xs px-1"
                                  />
                                  {isSaving && (
                                    <Loader2 className="h-3 w-3 animate-spin absolute -right-4 top-2.5 text-muted-foreground" />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="p-3 text-center text-xs font-semibold whitespace-nowrap">
                            {fmtMinutes(subtotal)}
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px]"
                              disabled={savingDuration === `reset:${dt.key}`}
                              onClick={() => resetDurationsForType(dt.key)}
                              title="Restaurar padrões desta linha"
                            >
                              {savingDuration === `reset:${dt.key}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="alocacao" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Blocos de horário de cada colaborador por dia da semana × área (Mídia ou Sistemas). Vazios significam sem alocação naquela área. A área padrão define em qual área nascem as demandas criadas por esse colaborador.
            </p>
            <AreaAllocationTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
