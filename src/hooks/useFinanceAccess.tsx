/**
 * Wrapper LEGADO: `canAccess` significa FINANCEIRO COMPLETO.
 *
 * Para decidir se o módulo aparece (completo OU só assinaturas/ferramentas),
 * use `useFinanceAccessScope()` — a fonte da verdade é a RPC
 * `public.finance_access_scope`, espelhada na RLS.
 */
import { useFinanceAccessScope } from "@/hooks/useFinanceAccessScope";

export function useFinanceAccess() {
  const { canAccessFullFinance, isLoading, refresh } = useFinanceAccessScope();
  return { canAccess: canAccessFullFinance, isLoading, refresh };
}
