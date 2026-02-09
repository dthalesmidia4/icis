/**
 * TenantContext - Re-export de AgencyContext para compatibilidade.
 * Use AgencyContext e useAgency() diretamente em código novo.
 */

export { 
  AgencyProvider as TenantProvider,
  useAgency as useTenant,
} from './AgencyContext';

export type { AgencyContextType as TenantContextType } from './AgencyContext';

export { AgencyProvider, useAgency } from './AgencyContext';
