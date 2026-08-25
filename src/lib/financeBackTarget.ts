/**
 * Navegação interna do Financeiro.
 *
 * O módulo inteiro (incluindo o `FinanceAccessGate`) fica montado enquanto a
 * navegação acontece apenas via `?view=`. Por isso o "Voltar" de qualquer
 * subview NUNCA pode usar rota (`navigate('/')`/`navigate(-1)`): isso
 * desmontaria o gate e faria o sistema pedir a senha novamente.
 */
import { FinanceView } from "./financeScope";

export type FinanceBackTarget =
  /** Troca apenas a view interna (sem desmontar o módulo/gate). */
  | { kind: "internal"; view: FinanceView }
  /** Sai do Financeiro. Só o overview pode fazer isso. */
  | { kind: "route"; to: string };

export function financeBackTarget(view: FinanceView): FinanceBackTarget {
  if (view === "overview") return { kind: "route", to: "/" };
  return { kind: "internal", view: "overview" };
}
