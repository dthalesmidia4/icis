/**
 * Constantes centralizadas para roles do sistema de convites.
 * 
 * IMPORTANTE: Este arquivo define as roles válidas para o produto atual.
 * Não usar o enum app_role diretamente na UI - usar estas constantes.
 */

// Roles válidas para o produto atual (agências apenas)
export const VALID_AGENCY_ROLES = ['agency_admin', 'agency_manager', 'agency_user'] as const;

// Tipo derivado das roles válidas
export type ValidAgencyRole = typeof VALID_AGENCY_ROLES[number];

// Labels para exibição de todas as roles (incluindo super_admin para histórico)
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  agency_admin: 'Administrador da Agência',
  agency_manager: 'Gestor Operacional',
  agency_user: 'Colaborador',
};

// Roles legadas (DEPRECATED - apenas para compatibilidade histórica)
export const LEGACY_ROLES = ['client_admin', 'client_user', 'subclient_user'] as const;
export const LEGACY_ROLE_LABEL = 'Role legada (não utilizada)';

// Opções para o select de convite (lista explícita, não baseada no enum)
export const INVITE_ROLE_OPTIONS: readonly {
  value: ValidAgencyRole;
  label: string;
  description: string;
}[] = [
  { 
    value: 'agency_admin', 
    label: 'Administrador da Agência', 
    description: 'Acesso total à agência' 
  },
  { 
    value: 'agency_manager', 
    label: 'Gestor Operacional', 
    description: 'Gerencia operações e equipe' 
  },
  { 
    value: 'agency_user', 
    label: 'Colaborador', 
    description: 'Executa tarefas operacionais' 
  },
] as const;

/**
 * Obtém o label de uma role para exibição na UI.
 * Trata roles legadas retornando o label apropriado.
 */
export function getRoleLabel(role: string): string {
  if (LEGACY_ROLES.includes(role as typeof LEGACY_ROLES[number])) {
    return LEGACY_ROLE_LABEL;
  }
  return ROLE_LABELS[role] || role;
}

/**
 * Verifica se uma role é legada (deprecated).
 */
export function isLegacyRole(role: string): boolean {
  return LEGACY_ROLES.includes(role as typeof LEGACY_ROLES[number]);
}

/**
 * Verifica se uma role é válida para novos convites.
 */
export function isValidInviteRole(role: string): role is ValidAgencyRole {
  return VALID_AGENCY_ROLES.includes(role as ValidAgencyRole);
}
