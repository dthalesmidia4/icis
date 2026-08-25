import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * Guard de rota do Financeiro. Espelha a RPC `has_finance_access`
 * (super_admin/agency_admin sempre; agency_manager só com finance_access).
 * Esconder botão não é segurança: a RLS continua a autoridade final.
 */
export function RequireFinanceAccess({ children }: { children: ReactNode }) {
  const { canAccess, isLoading } = useFinanceAccess();

  if (isLoading) return <LoadingScreen title="Verificando acesso ao Financeiro..." />;
  if (!canAccess) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
