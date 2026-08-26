import { memo } from "react";

interface WaitingZoneProps {
  /** Total agency-wide de CARDS em `aguardando_cliente` (nunca pessoas). */
  count: number;
}

/**
 * SALA DE ESPERA / LOUNGE: poltrona, mesinha e planta. Representa os CARDS
 * aguardando retorno do cliente — jamais um colaborador. Ter card aguardando
 * não tira ninguém da mesa, porque a pessoa pode estar executando outra demanda.
 */
export const WaitingZone = memo(function WaitingZone({ count }: WaitingZoneProps) {
  return (
    <div className="flex w-[168px] flex-col items-center gap-1">
      <div aria-hidden="true" className="relative flex w-full items-end justify-center gap-2">
        {/* planta */}
        <span className="relative flex flex-col items-center">
          <span className="h-4 w-4 -rotate-45 rounded-full bg-primary/30" />
          <span className="-mt-2 ml-3 h-3 w-3 rotate-45 rounded-full bg-primary/25" />
          <span className="mt-[2px] h-3.5 w-4 rounded-b-md bg-foreground/25" />
        </span>

        {/* poltrona */}
        <span className="relative flex flex-col items-center">
          <span className="h-4 w-11 rounded-t-md bg-foreground/25" />
          <span className="flex items-end">
            <span className="h-3 w-2 rounded-l-md bg-foreground/20" />
            <span className="h-2.5 w-8 bg-muted-foreground/45" />
            <span className="h-3 w-2 rounded-r-md bg-foreground/20" />
          </span>
          <span className="h-1.5 w-9 rounded-b-[3px] bg-foreground/25" />
        </span>

        {/* mesinha com a pilha de cards aguardando */}
        <span className="relative flex flex-col items-center">
          {count > 0 && (
            <span className="relative mb-[2px] block h-4 w-5">
              <span className="absolute inset-x-0 bottom-0 h-3 rotate-[-4deg] rounded-[1px] border border-border/70 bg-background/95" />
              <span className="absolute inset-x-0 bottom-[3px] h-3 rotate-[3deg] rounded-[1px] border border-border/70 bg-background/95" />
            </span>
          )}
          <span className="h-[4px] w-8 rounded-[2px] bg-foreground/30" />
          <span className="h-3 w-[3px] bg-foreground/25" />
        </span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Aguardando cliente
        </span>
        {count > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[9px] font-bold leading-4 text-primary-foreground">
            {count}
          </span>
        )}
      </div>
    </div>
  );
});

export default WaitingZone;
