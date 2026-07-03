import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/contexts/AgencyContext";
import { useCollaborators } from "@/hooks/useCollaborators";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const FUNCTIONS: { key: string; label: string }[] = [
  { key: "revisar", label: "Revisar" },
];

export function FunctionPermissionsModal({ open, onOpenChange }: Props) {
  const { agencyId } = useAgency();
  const { collaborators, loading } = useCollaborators(agencyId);
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !agencyId) return;
    (async () => {
      const { data, error } = await supabase
        .from("function_permissions")
        .select("user_id, function_key, allowed")
        .eq("tenant_id", agencyId);
      if (error) {
        console.error(error);
        return;
      }
      const map: Record<string, Record<string, boolean>> = {};
      (data || []).forEach((r: any) => {
        if (!map[r.user_id]) map[r.user_id] = {};
        map[r.user_id][r.function_key] = r.allowed;
      });
      setPerms(map);
    })();
  }, [open, agencyId]);

  const toggle = async (userId: string, functionKey: string, allowed: boolean) => {
    if (!agencyId) return;
    const rowKey = `${userId}:${functionKey}`;
    setSavingKey(rowKey);
    setPerms((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), [functionKey]: allowed },
    }));
    const { error } = await supabase
      .from("function_permissions")
      .upsert(
        { tenant_id: agencyId, user_id: userId, function_key: functionKey, allowed },
        { onConflict: "tenant_id,user_id,function_key" }
      );
    if (error) {
      toast.error("Erro ao salvar permissão");
      console.error(error);
      setPerms((prev) => ({
        ...prev,
        [userId]: { ...(prev[userId] || {}), [functionKey]: !allowed },
      }));
    } else {
      toast.success("Permissão atualizada");
    }
    setSavingKey(null);
  };

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurar permissões de função</DialogTitle>
          <DialogDescription>
            Marque quais colaboradores podem exercer cada função no fluxo.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-semibold uppercase text-xs">Colaborador</th>
                {FUNCTIONS.map((f) => (
                  <th key={f.key} className="text-center p-3 font-semibold uppercase text-xs">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={1 + FUNCTIONS.length} className="p-6 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : collaborators.length === 0 ? (
                <tr>
                  <td colSpan={1 + FUNCTIONS.length} className="p-6 text-center text-muted-foreground">
                    Nenhum colaborador interno encontrado.
                  </td>
                </tr>
              ) : (
                collaborators.map((c) => (
                  <tr key={c.userId} className="border-t">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {c.avatarUrl && <AvatarImage src={c.avatarUrl} />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {initials(c.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{c.fullName}</p>
                          <p className="text-xs text-muted-foreground">{c.roleLabel}</p>
                        </div>
                      </div>
                    </td>
                    {FUNCTIONS.map((f) => {
                      const checked = !!perms[c.userId]?.[f.key];
                      const isSaving = savingKey === `${c.userId}:${f.key}`;
                      return (
                        <td key={f.key} className="text-center p-3">
                          <div className="inline-flex items-center gap-2">
                            <Switch
                              checked={checked}
                              disabled={isSaving}
                              onCheckedChange={(v) => toggle(c.userId, f.key, v)}
                            />
                          </div>
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
