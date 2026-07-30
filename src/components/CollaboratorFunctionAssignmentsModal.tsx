import { useEffect, useMemo, useState, useRef } from "react";
import { useRealtimeFlowConfig } from "@/hooks/realtime";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useCollaborators } from "@/hooks/useCollaborators";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface FlowFunction {
  function_key: string;
  name: string;
  position: number;
  work_area?: "midia" | "sistemas" | null;
}

type WorkAreaKey = "midia" | "sistemas";
const AREA_TABS: { key: WorkAreaKey; label: string }[] = [
  { key: "midia", label: "Mídia" },
  { key: "sistemas", label: "Sistemas" },
];

export function CollaboratorFunctionAssignmentsModal({ open, onOpenChange }: Props) {
  const { agencyId } = useAgency();
  const { collaborators, loading: loadingCollabs } = useCollaborators(agencyId);
  const [area, setArea] = useState<WorkAreaKey>("midia");
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async (tenantId: string, workArea: WorkAreaKey) => {
    setLoading(true);
    const [{ data: fns }, { data: rows }] = await Promise.all([
      supabase
        .from("flow_functions")
        .select("function_key, name, position, work_area")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .eq("work_area", workArea)
        .order("position"),
      supabase
        .from("collaborator_function_assignments")
        .select("user_id, function_key, allowed")
        .eq("tenant_id", tenantId),
    ]);
    setFunctions((fns as FlowFunction[]) || []);
    const map: Record<string, Record<string, boolean>> = {};
    (rows || []).forEach((r: any) => {
      if (!map[r.user_id]) map[r.user_id] = {};
      map[r.user_id][r.function_key] = r.allowed;
    });
    setAssignments(map);
    setLoading(false);
  };

  useEffect(() => {
    if (open && agencyId) load(agencyId, area);
  }, [open, agencyId, area]);

  const savingRef = useRef<string | null>(null);
  useEffect(() => { savingRef.current = saving; }, [saving]);

  useRealtimeFlowConfig({
    tenantId: agencyId ?? null,
    enabled: open && !!agencyId,
    onChange: () => {
      if (savingRef.current) return;
      if (agencyId) load(agencyId, area);
    },
  });

  const toggle = async (userId: string, functionKey: string) => {
    if (!agencyId) return;
    const current = assignments[userId]?.[functionKey] ?? false;
    const next = !current;
    const key = `${userId}:${functionKey}`;
    setSaving(key);
    setAssignments((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), [functionKey]: next },
    }));
    const { error } = await supabase
      .from("collaborator_function_assignments")
      .upsert(
        {
          tenant_id: agencyId,
          user_id: userId,
          function_key: functionKey,
          allowed: next,
        },
        { onConflict: "tenant_id,user_id,function_key" }
      );
    if (error) {
      toast.error("Erro ao salvar");
      console.error(error);
      setAssignments((prev) => ({
        ...prev,
        [userId]: { ...(prev[userId] || {}), [functionKey]: current },
      }));
    }
    setSaving(null);
  };

  const isLoading = loading || loadingCollabs;

  // Cobertura por função (nº de colaboradores com allowed=true)
  const coverage = useMemo(() => {
    const c: Record<string, number> = {};
    functions.forEach((f) => (c[f.function_key] = 0));
    Object.values(assignments).forEach((byFn) => {
      Object.entries(byFn).forEach(([fk, allowed]) => {
        if (allowed && c[fk] !== undefined) c[fk] += 1;
      });
    });
    return c;
  }, [assignments, functions]);

  const uncovered = useMemo(
    () => functions.filter((f) => (coverage[f.function_key] ?? 0) === 0),
    [functions, coverage]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Atribuir funções aos colaboradores</DialogTitle>
          <DialogDescription>
            Marque quais funções operacionais cada colaborador pode exercer. As colunas vêm das funções configuradas no fluxo da área selecionada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
          {AREA_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setArea(t.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                area === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!isLoading && uncovered.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuração incompleta do fluxo</AlertTitle>
            <AlertDescription>
              <p className="mt-1">As seguintes funções ainda não têm colaborador atribuído:</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {uncovered.map((f) => (
                  <li key={`${area}:${f.function_key}`} className="font-medium">{f.name}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs opacity-90">
                Enquanto essas funções estiverem vazias, o botão Prosseguir pode travar.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <TooltipProvider delayDuration={200}>
          <div className="border rounded-lg overflow-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-3 font-semibold uppercase text-xs sticky left-0 bg-muted/50 z-20 min-w-[220px]">
                    Colaborador
                  </th>
                  {functions.map((f) => {
                    const count = coverage[f.function_key] ?? 0;
                    const empty = count === 0;
                    return (
                      <th
                        key={`${area}:${f.function_key}`}
                        className={cn(
                          "text-center p-3 font-semibold uppercase text-[10px] whitespace-nowrap border-l",
                          empty
                            ? "bg-yellow-50 dark:bg-yellow-950/30 border-l-yellow-400 border-b-2 border-b-yellow-400"
                            : "border-l-transparent"
                        )}
                      >
                        {empty ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center gap-1 cursor-help">
                                <div className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
                                  <span>{f.name}</span>
                                </div>
                                <span className="text-[9px] font-bold text-red-600 dark:text-red-400 normal-case">
                                  sem responsável
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Nenhum colaborador atribuído a esta função
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span>{f.name}</span>
                            <span className="text-[9px] font-normal text-muted-foreground normal-case">
                              {count} {count === 1 ? "atribuído" : "atribuídos"}
                            </span>
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={1 + functions.length} className="p-8 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : collaborators.length === 0 ? (
                  <tr>
                    <td colSpan={1 + functions.length} className="p-8 text-center text-muted-foreground text-sm">
                      Nenhum colaborador interno encontrado.
                    </td>
                  </tr>
                ) : functions.length === 0 ? (
                  <tr>
                    <td colSpan={1} className="p-8 text-center text-muted-foreground text-sm">
                      Nenhuma função configurada. Configure primeiro em "Configurar funções do fluxo".
                    </td>
                  </tr>
                ) : (
                  collaborators.map((c) => (
                    <tr key={c.userId} className="border-t">
                      <td className="p-3 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            {c.avatarUrl && <AvatarImage src={c.avatarUrl} />}
                            <AvatarFallback className="text-xs">
                              {c.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.fullName}</div>
                            <div className="text-xs text-muted-foreground truncate">{c.roleLabel}</div>
                          </div>
                        </div>
                      </td>
                      {functions.map((fn) => {
                        const allowed = assignments[c.userId]?.[fn.function_key] ?? false;
                        const cellKey = `${c.userId}:${fn.function_key}`;
                        const isSaving = saving === cellKey;
                        const empty = (coverage[fn.function_key] ?? 0) === 0;
                        return (
                          <td
                            key={`${area}:${fn.function_key}`}
                            className={cn(
                              "p-2 text-center border-l",
                              empty
                                ? "bg-yellow-50/40 dark:bg-yellow-950/10 border-l-yellow-400/60"
                                : "border-l-transparent"
                            )}
                          >
                            <button
                              disabled={isSaving}
                              onClick={() => toggle(c.userId, fn.function_key)}
                              className={cn(
                                "inline-flex items-center justify-center w-9 h-9 rounded border text-base font-semibold transition-colors hover:opacity-80",
                                allowed
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border",
                                isSaving && "opacity-50"
                              )}
                              aria-label={allowed ? "Marcado" : "Desmarcado"}
                            >
                              {allowed ? "✓" : ""}
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
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
