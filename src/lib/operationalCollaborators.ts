/**
 * FONTE CANÔNICA DE COLABORADORES OPERACIONAIS.
 *
 * Antes a lista de "quem pode receber card" era derivada do PAPEL
 * administrativo (`user_roles` em agency_admin/manager/user). Isso é
 * semanticamente errado:
 *  - um `super_admin` COM funções operacionais desaparecia das colunas e dos
 *    seletores de responsável (mesmo tendo cards atribuídos);
 *  - um `agency_user` SEM nenhuma função operacional aparecia como coluna
 *    vazia e como opção de responsável — atribuição que o banco recusaria.
 *
 * Agora a fonte é `collaborator_function_assignments` (allowed = true).
 * Papel/profile entram apenas para rótulo.
 *
 * Três listas distintas, sem ambiguidade:
 *  - `members`    → todo mundo do tenant (telas de configuração: conceder
 *                   funções, horários). Precisa incluir quem ainda não tem
 *                   função, senão nunca seria possível conceder a primeira.
 *  - `collaborators` (display) → quem tem função operacional OU ainda possui
 *                   cards ativos atribuídos (legado, para não tornar cards
 *                   órfãos/invisíveis).
 *  - `assignable` → apenas quem tem função operacional. Única lista válida
 *                   para NOVAS atribuições.
 *
 * Puro: nenhuma consulta aqui.
 */
import { getRoleLabel } from "@/lib/constants/roles";
import { countOperationalDemands, isActiveOwnedRow, type CountableDemandRow } from "@/lib/operationalCount";

export interface RoleRow {
  user_id: string;
  role: string;
  manager_work_area?: string | null;
}

export interface FunctionRow {
  user_id: string;
  function_key: string;
  work_area?: string | null;
  allowed?: boolean | null;
}

export interface ProfileRow {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface OperationalCollaborator {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  roleLabel: string;
  /** Possui ao menos uma função operacional habilitada. */
  hasOperationalFunction: boolean;
  /** Áreas em que possui função habilitada. */
  workAreas: string[];
  /** Só pode receber NOVAS demandas quem tem função operacional. */
  assignable: boolean;
  /** Sem função, mantido visível apenas por cards ativos existentes. */
  legacyOnly: boolean;
  /** @deprecated número ambíguo — use `operationalDemandCount`. */
  demandCount: number;
  operationalDemandCount: number;
  scheduledDemandCount: number;
  totalActiveDemandCount: number;
}

const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 4,
  agency_admin: 3,
  agency_manager: 2,
  agency_user: 1,
};

/** Papel mais alto quando o usuário tem múltiplas rows em `user_roles`. */
export function pickHighestRole(rows: RoleRow[]): RoleRow | null {
  let best: RoleRow | null = null;
  for (const r of rows) {
    if (!best || (ROLE_PRIORITY[r.role] || 0) > (ROLE_PRIORITY[best.role] || 0)) best = r;
  }
  return best;
}

export interface BuildParams {
  roleRows: RoleRow[];
  functionRows: FunctionRow[];
  profiles: ProfileRow[];
  demandRows: CountableDemandRow[];
  activeDispatchIds: Set<string> | ReadonlySet<string>;
  today?: string;
}

export interface BuildResult {
  /** Colunas/exibição: função operacional ou cards ativos legados. */
  collaborators: OperationalCollaborator[];
  /** Novas atribuições: somente com função operacional. */
  assignable: OperationalCollaborator[];
  /** Telas de configuração: todos os integrantes do tenant. */
  members: OperationalCollaborator[];
}

export function buildOperationalCollaborators(params: BuildParams): BuildResult {
  const { roleRows, functionRows, profiles, demandRows, activeDispatchIds } = params;

  const rolesByUser = new Map<string, RoleRow[]>();
  for (const r of roleRows) {
    if (!r?.user_id) continue;
    const list = rolesByUser.get(r.user_id) || [];
    list.push(r);
    rolesByUser.set(r.user_id, list);
  }

  const areasByUser = new Map<string, Set<string>>();
  for (const f of functionRows) {
    if (!f?.user_id || !f.function_key) continue;
    if (f.allowed === false) continue;
    const set = areasByUser.get(f.user_id) || new Set<string>();
    if (f.work_area) set.add(f.work_area);
    areasByUser.set(f.user_id, set);
  }

  const usersWithActiveCards = new Set<string>();
  for (const row of demandRows) {
    const uid = row?.assigned_to ?? null;
    if (uid && isActiveOwnedRow(row, uid)) usersWithActiveCards.add(uid);
  }

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const allIds = new Set<string>([
    ...rolesByUser.keys(),
    ...areasByUser.keys(),
    ...usersWithActiveCards,
  ]);

  const build = (userId: string): OperationalCollaborator => {
    const roleRow = pickHighestRole(rolesByUser.get(userId) || []);
    const role = roleRow?.role || "agency_user";
    const profile = profileById.get(userId);
    const areas = areasByUser.get(userId);
    const hasFn = !!areas;
    const counts = countOperationalDemands(demandRows, userId, activeDispatchIds, params.today);
    return {
      userId,
      fullName: profile?.full_name || "Colaborador",
      avatarUrl: profile?.avatar_url || null,
      role,
      roleLabel: getRoleLabel(role, roleRow?.manager_work_area ?? null),
      hasOperationalFunction: hasFn,
      workAreas: areas ? [...areas].sort() : [],
      assignable: hasFn,
      legacyOnly: !hasFn && usersWithActiveCards.has(userId),
      demandCount: counts.operationalDemandCount,
      operationalDemandCount: counts.operationalDemandCount,
      scheduledDemandCount: counts.scheduledDemandCount,
      totalActiveDemandCount: counts.totalActiveDemandCount,
    };
  };

  const byName = (a: OperationalCollaborator, b: OperationalCollaborator) =>
    a.fullName.localeCompare(b.fullName, "pt-BR");

  const all = [...allIds].map(build).sort(byName);

  return {
    collaborators: all.filter((c) => c.hasOperationalFunction || c.legacyOnly),
    assignable: all.filter((c) => c.assignable),
    members: all.filter((c) => rolesByUser.has(c.userId)).sort(byName),
  };
}
