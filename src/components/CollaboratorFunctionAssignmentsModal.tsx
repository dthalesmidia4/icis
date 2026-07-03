import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useCollaborators } from "@/hooks/useCollaborators";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface FlowFunction {
  function_key: string;
  name: string;
  position: number;
}

export function CollaboratorFunctionAssignmentsModal({ open, onOpenChange }: Props) {
  const { agencyId } = useAgency();
  const { collaborators, loading: loadingCollabs } = useCollaborators(agencyId);
  const [functions, setFunctions] = useState<FlowFunction[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async (tenantId: string) => {
    setLoading(true);
    const [{ data: fns }, { data: rows }] = await Promise.all([
      supabase
        .from("flow_functions")
        .select("function_key, name, position")
        .eq("tenant_id", tenantId)
        .eq("active", true)
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
    if (open && agencyId) load(agencyId);
  }, [open, agencyId]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Atribuir funções aos colaboradores</DialogTitle>
          <DialogDescription>
            Marque quais funções operacionais cada colaborador pode exercer. As colunas vêm das funções configuradas no fluxo.
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg overflow-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-semibold uppercase text-xs sticky left-0 bg-muted/50 z-20 min-w-[220px]">
                  Colaborador
                </th>
                {functions.map((f) => (
                  <th key={f.function_key} className="text-center p-3 font-semibold uppercase text-[10px] whitespace-nowrap">
                    {f.name}
                  </th>
                ))}
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
                      return (
                        <td key={fn.function_key} className="p-2 text-center">
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
      </DialogContent>
    </Dialog>
  );
}
