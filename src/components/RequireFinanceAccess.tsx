import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useFinanceAccessScope } from "@/hooks/useFinanceAccessScope";
import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * Guard de rota do Financeiro. Espelha a RPC `finance_access_scope`:
 * `none` volta para /home; `tools` e `full` entram (a view liberada é decidida
 * dentro da página). Esconder rota não é segurança: a RLS é a autoridade final.
 */
export function RequireFinanceAccess({ children }: { children: ReactNode }) {
  const { canAccessFinance, isLoading } = useFinanceAccessScope();

  if (isLoading) return <LoadingScreen title="Verificando acesso ao Financeiro..." />;
  if (!canAccessFinance) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
