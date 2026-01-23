import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole, UserRole } from '@/hooks/useUserRole';
import { LoadingScreen } from '@/components/LoadingScreen';

interface RequireRoleProps {
  /** Roles que têm permissão para acessar */
  allowedRoles: UserRole[];
  /** Conteúdo a ser renderizado se autorizado */
  children: ReactNode;
  /** Componente alternativo se não autorizado (opcional) */
  fallback?: ReactNode;
  /** Rota para redirecionar se não autorizado (padrão: '/') */
  redirectTo?: string;
}

/**
 * Componente wrapper para proteção de rotas e conteúdo baseado em roles.
 * 
 * Super admin sempre tem acesso a tudo.
 * 
 * @example
 * // Apenas agency_admin pode acessar
 * <RequireRole allowedRoles={['agency_admin']}>
 *   <AdminPanel />
 * </RequireRole>
 * 
 * @example
 * // Todos os roles podem acessar
 * <RequireRole allowedRoles={['agency_admin', 'agency_user']}>
 *   <Dashboard />
 * </RequireRole>
 */
export function RequireRole({ 
  allowedRoles, 
  children, 
  fallback,
  redirectTo = '/'
}: RequireRoleProps) {
  const { role, isSuperAdmin, isLoading } = useUserRole();

  // Enquanto carrega, mostrar loading
  if (isLoading) {
    return <LoadingScreen title="Verificando permissões..." />;
  }

  // Super admin tem acesso a tudo
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Verificar se role está na lista de permitidos
  if (role && allowedRoles.includes(role)) {
    return <>{children}</>;
  }

  // Sem permissão - mostrar fallback ou redirecionar
  if (fallback) {
    return <>{fallback}</>;
  }

  return <Navigate to={redirectTo} replace />;
}

/**
 * Hook helper para verificar permissões condicionalmente em componentes
 */
export function useCanAccess(allowedRoles: UserRole[]): boolean {
  const { role, isSuperAdmin, isLoading } = useUserRole();

  if (isLoading) return false;
  if (isSuperAdmin) return true;
  if (role && allowedRoles.includes(role)) return true;
  
  return false;
}
