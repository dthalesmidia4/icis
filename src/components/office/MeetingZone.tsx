import { memo } from "react";

/**
 * SALA DE REUNIÃO como LUGAR físico: piso delimitado, divisória translúcida,
 * mesa oval e 4 cadeiras. Deliberadamente sem avatar automático: hoje não
 * existe fonte operacional confiável de reunião, e a cena não finge saber o
 * que não sabe. Sem caixa branca de widget: o que delimita é o piso/divisória.
 */
export const MeetingZone = memo(function MeetingZone() {
  return (
    <div className="flex w-[clamp(204px,16vw,258px)] flex-col items-center" aria-hidden="true">
      <div className="relative w-full pb-2 pt-3">
        {/* divisória de vidro (parede leve da sala) */}
        <span className="absolute inset-x-1 top-0 h-[3px] rounded-full bg-primary/35" />
        <span className="absolute inset-x-1 top-[3px] bottom-4 rounded-[6px] border border-primary/15 bg-primary/[0.05] backdrop-blur-[1px]" />
        {/* piso/tapete da sala */}
        <span className="absolute inset-x-4 bottom-0 h-[34px] rounded-[46%] border border-foreground/10 bg-foreground/[0.07] dark:bg-background/40" />

        <div className="relative">
          {/* cadeiras do fundo */}
          <div className="flex justify-center gap-5">
            {[0, 1].map((i) => (
              <span key={i} className="flex flex-col items-center">
                <span className="h-4 w-6 rounded-t-[4px] bg-foreground/30" />
                <span className="h-[3px] w-7 rounded bg-foreground/20" />
              </span>
            ))}
          </div>

          {/* mesa oval com sombra de contato */}
          <span className="mx-auto my-1 block h-9 w-[84%] rounded-[50%] bg-gradient-to-b from-muted to-muted/45 shadow-[0_8px_12px_-8px_hsl(var(--foreground)/0.85)] ring-1 ring-foreground/10">
            <span className="mx-auto mt-3 block h-[3px] w-8 rounded bg-foreground/15" />
          </span>

          {/* cadeiras da frente */}
          <div className="flex justify-center gap-5">
            {[0, 1].map((i) => (
              <span key={i} className="flex flex-col items-center">
                <span className="h-[3px] w-7 rounded bg-foreground/20" />
                <span className="h-4 w-6 rounded-b-[4px] bg-foreground/30" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <span className="rounded-[3px] border border-border/70 bg-muted/85 px-1.5 text-[9px] font-bold uppercase leading-[15px] tracking-[0.12em] text-muted-foreground shadow-[0_2px_4px_-3px_hsl(var(--foreground)/0.8)]">
        Sala de reunião
      </span>
    </div>
  );
});

export default MeetingZone;
