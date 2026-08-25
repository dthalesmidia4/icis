/**
 * Resolução da navegação da sidebar.
 *
 * Regra de UX: o bloco de navegação só é renderizado quando TODAS as permissões
 * relevantes já foram resolvidas (financeiro + papel do usuário). Enquanto isso,
 * mostramos placeholders — nunca botões reais parciais (evita pop-in do
 * Financeiro/Developer entrando depois dos demais).
 *
 * Fail-closed: nada é exibido provisoriamente.
 */

export interface SidebarNavInput {
  agencyId?: string | null;
  financeCanAccess: boolean;
  financeLoading: boolean;
  roleLoading: boolean;
  canAccessAdmin: boolean;
}

export function isSidebarNavigationLoading(
  opts: Pick<SidebarNavInput, "financeLoading" | "roleLoading">,
): boolean {
  return opts.financeLoading || opts.roleLoading;
}

export function resolveSidebarNavigation<
  T extends { requiresAgency?: boolean; requiresFinanceAccess?: boolean },
>(items: T[], opts: SidebarNavInput): {
  loading: boolean;
  mainItems: T[];
  showDeveloper: boolean;
  /** Quantidade de placeholders a renderizar enquanto carrega (Home + main + dev). */
  placeholderCount: number;
} {
  const loading = isSidebarNavigationLoading(opts);
  if (loading) {
    return { loading, mainItems: [], showDeveloper: false, placeholderCount: 4 };
  }

  const mainItems = items.filter((item) => {
    if (item.requiresAgency && !opts.agencyId) return false;
    if (item.requiresFinanceAccess && !opts.financeCanAccess) return false;
    return true;
  });

  return {
    loading,
    mainItems,
    showDeveloper: opts.canAccessAdmin,
    placeholderCount: 0,
  };
}
