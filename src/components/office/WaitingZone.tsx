import { memo } from "react";

interface WaitingZoneProps {
  /** Total agency-wide de CARDS em `aguardando_cliente` (nunca pessoas). */
  count: number;
}

/**
 * SALA DE ESPERA / LOUNGE físico: sofá, poltrona, mesa lateral, planta e
 * luminária. Representa os CARDS aguardando retorno do cliente — jamais um
 * colaborador (ter card aguardando não tira ninguém da mesa). Por isso NUNCA
 * existe anchor de pessoa aqui.
 */
export const WaitingZone = memo(function WaitingZone({ count }: WaitingZoneProps) {
  return (
    <div className="flex w-[clamp(206px,16.5vw,262px)] flex-col items-center">
      <div aria-hidden="true" className="relative w-full pb-1">
        {/* tapete do lounge */}
        <span className="absolute inset-x-2 bottom-0 h-[36px] rounded-[46%] border border-foreground/10 bg-foreground/[0.07] dark:bg-background/40" />

        <div className="relative flex items-end justify-center gap-2">
          {/* luminária de pé + planta */}
          <span className="relative flex flex-col items-center">
            <span className="h-4 w-6 rounded-t-[40%] bg-primary/25 ring-1 ring-foreground/15" />
            <span className="h-8 w-[3px] bg-foreground/30" />
            <span className="h-[3px] w-5 rounded bg-foreground/30" />
          </span>

          {/* sofá pequeno de 2 lugares */}
          <span className="relative flex flex-col items-center">
            <span className="h-7 w-[74px] rounded-t-[7px] bg-foreground/30 shadow-[0_3px_6px_-5px_hsl(var(--foreground)/0.9)]">
              <span className="mx-auto mt-2 block h-[2px] w-14 rounded bg-background/40" />
            </span>
            <span className="flex items-end">
              <span className="h-5 w-3 rounded-l-[6px] bg-foreground/25" />
              <span className="flex h-4 w-[68px]">
                <span className="h-full flex-1 rounded-t-[3px] bg-muted-foreground/50" />
                <span className="mx-[2px] w-[2px] bg-foreground/20" />
                <span className="h-full flex-1 rounded-t-[3px] bg-muted-foreground/50" />
              </span>
              <span className="h-5 w-3 rounded-r-[6px] bg-foreground/25" />
            </span>
            <span className="h-2 w-[70px] rounded-b-[4px] bg-foreground/30" />
          </span>

          {/* mesa lateral com a pilha de cards aguardando */}
          <span className="relative flex flex-col items-center">
            {count > 0 && (
              <span className="relative mb-[3px] block h-6 w-8">
                <span className="absolute inset-x-0 bottom-0 h-5 rotate-[-5deg] rounded-[2px] border border-border/80 bg-background/95 shadow-[0_2px_4px_-3px_hsl(var(--foreground)/0.9)]" />
                <span className="absolute inset-x-0 bottom-[4px] h-5 rotate-[4deg] rounded-[2px] border border-border/80 bg-background/98 shadow-[0_2px_4px_-3px_hsl(var(--foreground)/0.9)]">
                  <span className="mx-auto mt-[5px] block h-[2px] w-4 bg-foreground/25" />
                  <span className="mx-auto mt-[3px] block h-[2px] w-4 bg-foreground/20" />
                </span>
              </span>
            )}
            <span className="h-[5px] w-11 rounded-[2px] bg-foreground/35" />
            <span className="h-6 w-[4px] bg-foreground/30" />
            <span className="h-[3px] w-7 rounded bg-foreground/25" />
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <span className="rounded-[3px] border border-border/70 bg-muted/85 px-1.5 text-[9px] font-bold uppercase leading-[15px] tracking-[0.12em] text-muted-foreground shadow-[0_2px_4px_-3px_hsl(var(--foreground)/0.8)]">
          Aguardando cliente
        </span>
        {count > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-[15px] text-primary-foreground">
            {count}
          </span>
        )}
      </div>
    </div>
  );
});

export default WaitingZone;
