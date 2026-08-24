/**
 * Shell compartilhado do Financeiro.
 *
 * Header e conteúdo precisam usar EXATAMENTE o mesmo container e padding, senão
 * o título "desloca" em relação ao corpo. O teto de 1600px + respiro lateral
 * maior no desktop mantém ~90% da área útil do main sem perder legibilidade em
 * telas ultrawide.
 *
 * `PageHeader` já aplica `mx-auto px-4 sm:px-6`; por isso o extra de desktop é
 * concatenado ao `containerClassName` e repetido no corpo da página.
 */

/** Largura + respiro extra de desktop — passar ao `PageHeader`. */
export const FINANCE_SHELL_WIDTH = "w-full max-w-[1600px] lg:px-10";

/** Container completo do conteúdo (mesma largura/padding do header). */
export const FINANCE_SHELL = `${FINANCE_SHELL_WIDTH} mx-auto px-4 sm:px-6`;
