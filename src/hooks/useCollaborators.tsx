import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VALID_AGENCY_ROLES, type ValidAgencyRole, getRoleLabel } from "@/lib/constants/roles";

export interface Collaborator {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: ValidAgencyRole;
  roleLabel: string;
  demandCount: number;
}

/**
 * Retorna colaboradores internos do tenant (agency_admin/manager/user)
 * com a contagem de demandas atribuídas (demands.assigned_to) não arquivadas.
 * Não inclui clientes externos (client_user, subclient_user, etc.).
 */
export function useCollaborators(tenantId: string | null | undefined) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setCollaborators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("tenant_id", tenantId)
        .in("role", VALID_AGENCY_ROLES as unknown as string[]);
      if (rolesErr) throw rolesErr;

      if (!roles || roles.length === 0) {
        setCollaborators([]);
        return;
      }

      // Dedup por user_id (usa role mais alto se houver duplicidade)
      const rolePriority: Record<string, number> = {
        agency_admin: 3, agency_manager: 2, agency_user: 1,
      };
      const roleByUser = new Map<string, ValidAgencyRole>();
      for (const r of roles) {
        const existing = roleByUser.get(r.user_id);
        if (!existing || (rolePriority[r.role] || 0) > (rolePriority[existing] || 0)) {
          roleByUser.set(r.user_id, r.role as ValidAgencyRole);
        }
      }
      const userIds = Array.from(roleByUser.keys());

      const [{ data: profiles }, { data: demands }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds),
        supabase
          .from("demands")
          .select("assigned_to")
          .eq("tenant_id", tenantId)
          .is("archived_at", null)
          .in("assigned_to", userIds),
      ]);

      const countByUser = new Map<string, number>();
      (demands || []).forEach((d: any) => {
        if (!d.assigned_to) return;
        countByUser.set(d.assigned_to, (countByUser.get(d.assigned_to) || 0) + 1);
      });

      const result: Collaborator[] = userIds.map((uid) => {
        const p = profiles?.find((pr: any) => pr.id === uid);
        const role = roleByUser.get(uid)!;
        return {
          userId: uid,
          fullName: p?.full_name || "Colaborador",
          avatarUrl: p?.avatar_url || null,
          role,
          roleLabel: getRoleLabel(role),
          demandCount: countByUser.get(uid) || 0,
        };
      });

      result.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
      setCollaborators(result);
    } catch (err) {
      console.error("[useCollaborators] error:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { collaborators, loading, error, refresh: load };
}
