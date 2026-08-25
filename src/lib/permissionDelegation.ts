/**
 * Regras puras do modal moderno de permissões (`TeamMembers`).
 *
 * Duas seções apenas:
 * - `Início`     -> quais cards da tela inicial aparecem (`user_hub_permissions`)
 * - `Financeiro` -> `user_roles.finance_access` / `finance_tools_access`
 *
 * Teto de delegação: um editor só vê/concede capacidade que ele próprio tem.
 * O trigger `trg_enforce_user_role_delegation` é a segunda camada no banco.
 */
import { NAVIGATION_ITEMS } from "@/lib/constants/navigation";
import type { FinanceScope } from "@/lib/financeScope";
import type { HubSectionId } from "@/hooks/useHubPermissions";

/** Ids que realmente existem como card da tela inicial hoje. */
export const HOME_PERMISSION_IDS = [
  "clientes",
  "clientes-sistemas",
  "comercial-sistemas",
  "kanban",
] as const;

export type HomePermissionId = (typeof HOME_PERMISSION_IDS)[number];

export interface HomePermissionItem {
  id: HomePermissionId;
  label: string;
  description: string;
}

const HOME_PERMISSION_DESCRIPTIONS: Record<HomePermissionId, string> = {
  clientes: "Abrir o workspace dos clientes de Mídia.",
  "clientes-sistemas": "Cadastro e acompanhamento dos clientes de Sistemas.",
  "comercial-sistemas": "Oportunidades comerciais das empresas de Sistemas.",
  kanban: "Visão geral das tarefas e escritório virtual.",
};

/**
 * Lista derivada de `NAVIGATION_ITEMS` para nunca divergir da Home. Se um id
 * deixar de existir na navegação, ele desaparece daqui automaticamente.
 */
export const HOME_PERMISSION_ITEMS: HomePermissionItem[] = HOME_PERMISSION_IDS.flatMap((id) => {
  const nav = NAVIGATION_ITEMS.find((item) => item.id === (id as HubSectionId));
  if (!nav) return [];
  return [{ id, label: nav.title, description: HOME_PERMISSION_DESCRIPTIONS[id] }];
});

export function isHomePermissionId(value: string): value is HomePermissionId {
  return (HOME_PERMISSION_IDS as readonly string[]).includes(value);
}

/** Somente super admin e administrador da agência editam permissões. */
export function canEditPermissions(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "agency_admin";
}

export interface FinanceGrantable {
  full: boolean;
  tools: boolean;
  any: boolean;
}

/**
 * Capacidades financeiras que o EDITOR pode delegar.
 * - super_admin: tudo
 * - agency_admin: espelha o próprio escopo (`full` -> ambos, `tools` -> só tools)
 * - demais: nada
 */
export function financeGrantableCapabilities(
  editorRole: string | null | undefined,
  editorScope: FinanceScope,
): FinanceGrantable {
  if (editorRole === "super_admin") return { full: true, tools: true, any: true };
  if (editorRole !== "agency_admin") return { full: false, tools: false, any: false };
  if (editorScope === "full") return { full: true, tools: true, any: true };
  if (editorScope === "tools") return { full: false, tools: true, any: true };
  return { full: false, tools: false, any: false };
}

export interface FinanceFlags {
  finance_access: boolean;
  finance_tools_access: boolean;
}

/**
 * Payload de gravação financeira: campo fora do teto do editor NÃO é enviado,
 * preservando o valor atual do alvo (nem concede, nem remove silenciosamente).
 * Retorna `null` quando não há nada a gravar.
 */
export function buildFinanceUpdate(
  grantable: FinanceGrantable,
  desired: FinanceFlags,
  current: FinanceFlags,
): Partial<FinanceFlags> | null {
  const payload: Partial<FinanceFlags> = {};
  if (grantable.full && desired.finance_access !== current.finance_access) {
    payload.finance_access = desired.finance_access;
  }
  if (grantable.tools && desired.finance_tools_access !== current.finance_tools_access) {
    payload.finance_tools_access = desired.finance_tools_access;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

export interface HomePermissionUpsertRow {
  user_id: string;
  tenant_id: string;
  hub_section: HomePermissionId;
  can_access: boolean;
  updated_at: string;
}

/**
 * UPSERT apenas dos ids atuais — rows legadas de outras seções permanecem
 * intocadas (nunca `delete all`).
 */
export function buildHomePermissionUpserts(
  userId: string,
  tenantId: string,
  selected: Record<string, boolean>,
  now = new Date().toISOString(),
): HomePermissionUpsertRow[] {
  return HOME_PERMISSION_ITEMS.map((item) => ({
    user_id: userId,
    tenant_id: tenantId,
    hub_section: item.id,
    can_access: selected[item.id] !== false,
    updated_at: now,
  }));
}

/** Estado inicial dos switches de Início a partir das rows do banco. */
export function resolveHomePermissionState(
  rows: Array<{ hub_section: string; can_access: boolean }>,
): Record<HomePermissionId, boolean> {
  const state = {} as Record<HomePermissionId, boolean>;
  HOME_PERMISSION_IDS.forEach((id) => {
    const row = rows.find((r) => r.hub_section === id);
    state[id] = row ? row.can_access === true : true;
  });
  return state;
}
