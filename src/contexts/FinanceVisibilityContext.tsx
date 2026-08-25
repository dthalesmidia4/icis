/**
 * ESTADO ÚNICO de visibilidade de valores no `Financeiro completo`.
 *
 * O olho pode ser clicado em qualquer tela do domínio; a decisão vale para
 * todas as outras imediatamente e a navegação interna NÃO reseta nada.
 * Nada é persistido: um novo mount do domínio volta ao default seguro
 * (valores ocultos).
 */
import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { maskMoney } from "@/lib/financePrivacy";

interface FinanceVisibilityValue {
  valuesVisible: boolean;
  toggleValuesVisible: () => void;
  /** Formata montante já respeitando a decisão atual. */
  money: (value: number | null | undefined) => string;
}

const FinanceVisibilityContext = createContext<FinanceVisibilityValue | null>(null);

export function FinanceVisibilityProvider({ children }: { children: ReactNode }) {
  const [valuesVisible, setValuesVisible] = useState(false);
  const toggleValuesVisible = useCallback(() => setValuesVisible((v) => !v), []);
  const value = useMemo<FinanceVisibilityValue>(
    () => ({
      valuesVisible,
      toggleValuesVisible,
      money: (amount) => maskMoney(amount, valuesVisible),
    }),
    [valuesVisible, toggleValuesVisible],
  );
  return (
    <FinanceVisibilityContext.Provider value={value}>{children}</FinanceVisibilityContext.Provider>
  );
}

/**
 * Fora do provider (ex.: cockpit de ferramentas, que não agrega valores
 * sigilosos) o comportamento é neutro: valores visíveis e toggle inerte.
 */
export function useFinanceVisibility(): FinanceVisibilityValue {
  const ctx = useContext(FinanceVisibilityContext);
  if (ctx) return ctx;
  return {
    valuesVisible: true,
    toggleValuesVisible: () => {},
    money: (amount) => maskMoney(amount, true),
  };
}
