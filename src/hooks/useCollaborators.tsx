import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOperationalCollaborators,
  type OperationalCollaborator,
} from "@/lib/operationalCollaborators";
import type { CountableDemandRow } from "@/lib/operationalCount";

/** Alias histórico — o formato agora vem de `operationalCollaborators`. */
export type Collaborator = OperationalCollaborator;

/**
 * Colaboradores do tenant.
 *
 * A fonte canônica de quem é OPERACIONAL é `collaborator_function_assignments`
 * (allowed = true), nunca o papel administrativo. Ver
 * `src/lib/operationalCollaborators.ts` para a semântica das três listas:
 *  - `collaborators` → colunas/exibição (função operacional ou cards legados);
 *  - `assignable`    → única lista válida para NOVAS atribuições;
 *  - `members`       → todos os integrantes (telas de configuração).
 */
export function useCollaborators(tenantId: string | null | undefined) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [assignable, setAssignable] = useState<Collaborator[]>([]);
  const [members, setMembers] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setCollaborators([]);
      setAssignable([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        { data: roles, error: rolesErr },
        { data: functions },
        { data: demands },
        { data: dispatches },
      ] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role, manager_work_area")
          .eq("tenant_id", tenantId),
        (supabase.from("collaborator_function_assignments") as any)
          .select("user_id, function_key, work_area, allowed")
          .eq("tenant_id", tenantId)
          .eq("allowed", true),
        supabase
          .from("demands")
          .select("id, assigned_to, archived_at, is_draft, current_function_key, publish_date")
          .eq("tenant_id", tenantId)
          .is("archived_at", null)
          .eq("is_draft", false),
        // Mesma exclusão estrutural da Visão Geral: publicação agendada sai da fila.
        supabase
          .from("scheduled_publication_dispatches")
          .select("card_id")
          .eq("tenant_id", tenantId)
          .in("status", ["scheduled", "dispatching"]),
      ]);
      if (rolesErr) throw rolesErr;

      const roleRows = ((roles || []) as any[]).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        manager_work_area: r.manager_work_area ?? null,
      }));
      const functionRows = ((functions || []) as any[]).map((f) => ({
        user_id: f.user_id,
        function_key: f.function_key,
        work_area: f.work_area ?? null,
        allowed: f.allowed ?? true,
      }));
      const demandRows = (demands || []) as CountableDemandRow[];
      const activeDispatchIds = new Set<string>(
        ((dispatches || []) as any[]).map((d) => d.card_id).filter(Boolean),
      );

      const userIds = [
        ...new Set([
          ...roleRows.map((r) => r.user_id),
          ...functionRows.map((f) => f.user_id),
          ...demandRows.map((d) => d.assigned_to).filter(Boolean),
        ]),
      ] as string[];

      let profiles: any[] = [];
      if (userIds.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds);
        profiles = (data || []) as any[];
      }

      const res = buildOperationalCollaborators({
        roleRows,
        functionRows,
        profiles: profiles.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
        })),
        demandRows,
        activeDispatchIds,
      });

      setCollaborators(res.collaborators);
      setAssignable(res.assignable);
      setMembers(res.members);
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

  return { collaborators, assignable, members, loading, error, refresh: load };
}
