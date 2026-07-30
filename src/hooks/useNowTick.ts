import { useEffect, useState } from "react";

/**
 * Relógio reativo: devolve um timestamp que se atualiza periodicamente.
 * Necessário porque regras temporais (atraso, virada de dia) ficariam
 * congeladas no instante da primeira renderização.
 */
export function useNowTick(intervalMs: number = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

export default useNowTick;
