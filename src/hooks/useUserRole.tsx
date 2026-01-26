/**
 * useUserRole - DEPRECATED
 * 
 * Este arquivo foi mantido apenas para compatibilidade com código legado.
 * Use useAgencyRole() ao invés de useUserRole().
 * 
 * MIGRAÇÃO: Tenant → Agency
 * - role busca de agency_memberships (novo) ou user_roles (fallback)
 */

// Re-export tudo do useAgencyRole para compatibilidade
export { 
  useAgencyRole as useUserRole,
  type AgencyRole as UserRole,
} from './useAgencyRole';

// Re-export o novo hook também
export { useAgencyRole, type AgencyRole } from './useAgencyRole';
