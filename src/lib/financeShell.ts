/**
 * Shell compartilhado do Financeiro.
 *
 * Header e conteúdo precisam usar EXATAMENTE o mesmo container e padding, senão
 * o título "desloca" em relação ao corpo. O teto de ~1680px mantém a leitura
 * confortável em telas ultrawide sem deixar o desktop comum estreito.
 */

/** Largura do shell — passar ao `PageHeader` via `containerClassName`. */
export const FINANCE_SHELL_WIDTH = "w-full max-w-[1680px]";

/** Padding horizontal do shell — idêntico ao aplicado pelo `PageHeader`. */
export const FINANCE_SHELL_PADDING = "px-4 sm:px-6";

/** Container completo do conteúdo (mesma largura/padding do header). */
export const FINANCE_SHELL = `${FINANCE_SHELL_WIDTH} mx-auto ${FINANCE_SHELL_PADDING}`;
