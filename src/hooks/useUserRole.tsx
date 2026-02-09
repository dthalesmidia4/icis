/**
 * useUserRole - Re-export de useAgencyRole para compatibilidade.
 * Use useAgencyRole() diretamente em código novo.
 */

export { 
  useAgencyRole as useUserRole,
  type AgencyRole as UserRole,
} from './useAgencyRole';

export { useAgencyRole, type AgencyRole } from './useAgencyRole';
