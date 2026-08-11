import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useRealtimeFlowConfig } from "@/hooks/realtime";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

type WorkAreaKey = "midia" | "sistemas";

interface Props {
  area: WorkAreaKey;
}

interface FlowFn {
  function_key: string;
  name: string;
  position: number;
}

interface Pref {
  active: boolean;
  priority: number;
}

/**
 * PREFERÊNCIA DE ROTEAMENTO POR CLIENTE
 *
 * Só aparece quem já tem a função habilitada na área (permissão). Marcar
 * preferencial NÃO concede função — apenas define quem recebe primeiro.
 */
export function StageRoutingTab({ area }: Props) {
  const { agencyId } = useAgency();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [functions, setFunctions] = useState<FlowFn[]>([]);
  const [eligible, setEligible] = useState<Record<string, { userId: string; name: string }[]>>({});
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    (async () => {
      const { data } = await supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", agencyId);
      const list = ((data || []) as any[])
        .map((c) => ({ id: c.id, name: (c.fantasy_name || c.name || "Cliente") as string }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setClients(list);
    })();
  }, [agencyId]);

  const load = async () => {
    if (!agencyId) return;
    setLoading(true);
    const [{ data: fns }, { data: assigns }] = await Promise.all([
      supabase
        .from("flow_functions")
        .select("function_key, name, position")
        .eq("tenant_id", agencyId)
        .eq("active", true)
        .eq("work_area", area)
        .order("position"),
      (supabase.from("collaborator_function_assignments") as any)
        .select("user_id, function_key")
        .eq("tenant_id", agencyId)
        .eq("work_area", area)
        .eq("allowed", true),
    ]);

    const userIds = Array.from(new Set(((assigns || []) as any[]).map((a) => a.user_id)));
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const nameById = new Map<string, string>();
    ((profiles || []) as any[]).forEach((p) => nameById.set(p.id, p.full_name || "Colaborador"));

    const byFn: Record<string, { userId: string; name: string }[]> = {};
    ((assigns || []) as any[]).forEach((a) => {
      if (!byFn[a.function_key]) byFn[a.function_key] = [];
      byFn[a.function_key].push({ userId: a.user_id, name: nameById.get(a.user_id) || "Colaborador" });
    });
    Object.values(byFn).forEach((list) => list.sort((x, y) => x.name.localeCompare(y.name, "pt-BR")));

    let prefMap: Record<string, Pref> = {};
    if (clientId) {
      const { data: rows } = await (supabase.from("client_stage_routing_preferences") as any)
        .select("function_key, user_id, priority, active")
        .eq("tenant_id", agencyId)
        .eq("client_id", clientId)
        .eq("work_area", area);
      ((rows || []) as any[]).forEach((r) => {
        prefMap[`${r.function_key}:${r.user_id}`] = {
          active: !!r.active,
          priority: Number(r.priority) || 1,
        };
      });
    }

    setFunctions((fns as FlowFn[]) || []);
    setEligible(byFn);
    setPrefs(prefMap);
    setLoading(false);
  };

  useEffect(() => {
    if (agencyId) load();
  }, [agencyId, area, clientId]);

  useRealtimeFlowConfig({
    tenantId: agencyId ?? null,
    enabled: !!agencyId,
    onChange: () => {
      if (saving) return;
      load();
    },
  });

  const upsert = async (functionKey: string, userId: string, next: Pref) => {
    if (!agencyId || !clientId) return;
    const key = `${functionKey}:${userId}`;
    setSaving(key);
    const before = prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    const { error } = await (supabase.from("client_stage_routing_preferences") as any).upsert(
      {
        tenant_id: agencyId,
        client_id: clientId,
        work_area: area,
        function_key: functionKey,
        user_id: userId,
        priority: next.priority,
        active: next.active,
      },
      { onConflict: "tenant_id,client_id,work_area,function_key,user_id" },
    );
    if (error) {
      toast.error("Erro ao salvar preferência");
      setPrefs((p) => {
        const copy = { ...p };
        if (before) copy[key] = before;
        else delete copy[key];
        return copy;
      });
    }
    setSaving(null);
  };

  const totalActive = useMemo(
    () => Object.values(prefs).filter((p) => p.active).length,
    [prefs],
  );

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          A preferência define <strong>quem recebe primeiro</strong> em cada etapa deste cliente. Ela não
          concede função: se o colaborador perder a permissão, o fluxo volta a escolher pela regra normal.
          <br />
          Prioridade 1 é a primeira escolha; se estiver indisponível ou inelegível, o sistema tenta a próxima e
          depois usa distribuição automática.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Cliente</span>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-[320px] h-9">
            <SelectValue placeholder="Selecione o cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clientId && (
          <span className="text-xs text-muted-foreground">
            {totalActive} preferência(s) ativa(s)
          </span>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-muted-foreground p-6 text-center border rounded-lg">
          Selecione um cliente para configurar as preferências de roteamento.
        </p>
      ) : loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : functions.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6 text-center border rounded-lg">
          Nenhuma função ativa configurada nesta área.
        </p>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
          {functions.map((fn) => {
            const list = eligible[fn.function_key] || [];
            return (
              <div key={fn.function_key} className="border rounded-lg">
                <div className="px-3 py-2 bg-muted/50 border-b flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase">{fn.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {list.length} habilitado(s)
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    Nenhum colaborador com esta função habilitada nesta área.
                  </p>
                ) : (
                  <div className="divide-y">
                    {list.map((u) => {
                      const key = `${fn.function_key}:${u.userId}`;
                      const pref = prefs[key];
                      const isSaving = saving === key;
                      return (
                        <div key={key} className="flex items-center gap-3 px-3 py-2">
                          <span className="flex-1 text-sm truncate">{u.name}</span>
                          {pref?.active && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-semibold uppercase text-primary">Preferencial</span>
                              <span className="text-[10px] uppercase text-muted-foreground">Prioridade</span>
                              <Input
                                type="number"
                                min={1}
                                value={pref.priority}
                                disabled={isSaving}
                                onChange={(e) =>
                                  setPrefs((p) => ({
                                    ...p,
                                    [key]: { active: true, priority: Math.max(1, Number(e.target.value) || 1) },
                                  }))
                                }
                                onBlur={() =>
                                  upsert(fn.function_key, u.userId, {
                                    active: true,
                                    priority: Math.max(1, prefs[key]?.priority || 1),
                                  })
                                }
                                className="h-7 w-16 text-xs"
                              />
                            </div>
                          )}
                          <Switch
                            checked={!!pref?.active}
                            disabled={isSaving}
                            onCheckedChange={(v) =>
                              upsert(fn.function_key, u.userId, {
                                active: v,
                                priority: prefs[key]?.priority || 1,
                              })
                            }
                          />
                          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
