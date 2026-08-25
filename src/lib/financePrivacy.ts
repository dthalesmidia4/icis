/**
 * PRIVACIDADE MONETÁRIA DO FINANCEIRO.
 *
 * Uma única máscara para todos os domínios (`Visão geral`, `Composição do mês`,
 * `Cartões e faturas`, ...). Só montantes são escondidos: datas, nomes, status
 * e quantidades continuam visíveis, porque eles não são o dado sensível.
 */
import { formatBRL } from "./financeModel";

/** Placeholder canônico de valor oculto — igual em toda a árvore do Financeiro. */
export const MASKED_MONEY = "R$ ***";

/** Formata um montante respeitando a decisão global de visibilidade. */
export function maskMoney(value: number | null | undefined, visible: boolean): string {
  return visible ? formatBRL(value ?? 0) : MASKED_MONEY;
}
