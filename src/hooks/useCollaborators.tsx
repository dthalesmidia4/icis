import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VALID_AGENCY_ROLES, type ValidAgencyRole, getRoleLabel } from "@/lib/constants/roles";
import { countOperationalDemands, type CountableDemandRow } from "@/lib/operationalCount";

export interface Collaborator {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: ValidAgencyRole;
  roleLabel: string;
  /** @deprecated número ambíguo — use `operationalDemandCount`. */
  demandCount: number;
  /** Fila que o usuário reconhece no Kanban (sem publicação agendada). */
  operationalDemandCount: number;
  /** Ativas com dispatch de publicação ativo (fora da fila operacional). */
  scheduledDemandCount: number;
  /** Ativas não arquivadas/não rascunho como responsável principal. */
  totalActiveDemandCount: number;
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
        .in("role", VALID_AGENCY_ROLES as unknown as ValidAgencyRole[]);
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

      const [{ data: profiles }, { data: demands }, { data: dispatches }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds),
        supabase
          .from("demands")
          .select("id, assigned_to, archived_at, is_draft, current_function_key")
          .eq("tenant_id", tenantId)
          .is("archived_at", null)
          .eq("is_draft", false)
          .in("assigned_to", userIds),
        // Mesma exclusão estrutural da Visão Geral: publicação agendada sai da fila.
        supabase
          .from("scheduled_publication_dispatches")
          .select("card_id")
          .eq("tenant_id", tenantId)
          .in("status", ["scheduled", "dispatching"]),
      ]);

      const rows = (demands || []) as CountableDemandRow[];
      const activeDispatchIds = new Set<string>(
        ((dispatches || []) as any[]).map((d) => d.card_id).filter(Boolean),
      );

      const result: Collaborator[] = userIds.map((uid) => {
        const p = profiles?.find((pr: any) => pr.id === uid);
        const role = roleByUser.get(uid)!;
        const counts = countOperationalDemands(rows, uid, activeDispatchIds);
        return {
          userId: uid,
          fullName: p?.full_name || "Colaborador",
          avatarUrl: p?.avatar_url || null,
          role,
          roleLabel: getRoleLabel(role),
          demandCount: counts.operationalDemandCount,
          operationalDemandCount: counts.operationalDemandCount,
          scheduledDemandCount: counts.scheduledDemandCount,
          totalActiveDemandCount: counts.totalActiveDemandCount,
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

  // Foto/nome do colaborador é canônico em `profiles`. Sem isso a nova foto só
  // apareceria no `/escritorio` após sair e voltar à tela.
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`collaborators-profiles-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `tenant_id=eq.${tenantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, load]);

  return { collaborators, loading, error, refresh: load };
}
