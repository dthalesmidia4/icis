/**
 * TenantContext - DEPRECATED
 * 
 * Este arquivo foi mantido apenas para compatibilidade com código legado.
 * Use AgencyContext e useAgency() ao invés de TenantContext e useTenant().
 * 
 * MIGRAÇÃO: Tenant → Agency
 * - tenantId → agencyId
 * - tenantName → agencyName  
 * - tenantType → sempre 'agency' (sem hierarquia)
 */

// Re-export tudo do AgencyContext para compatibilidade
export { 
  AgencyProvider as TenantProvider,
  useAgency as useTenant,
} from './AgencyContext';

// Re-export o tipo com alias
export type { AgencyContextType as TenantContextType } from './AgencyContext';

// Re-export o novo contexto também
export { AgencyProvider, useAgency } from './AgencyContext';
