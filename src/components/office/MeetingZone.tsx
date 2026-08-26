import { memo } from "react";

/**
 * SALA DE REUNIÃO como ambiente FÍSICO (mesa oval + cadeiras + divisória de
 * vidro). Deliberadamente sem avatar automático: hoje não existe fonte
 * operacional confiável de reunião, e a cena não finge saber o que não sabe.
 */
export const MeetingZone = memo(function MeetingZone() {
  return (
    <div className="flex w-[176px] flex-col items-center gap-1" aria-hidden="true">
      <div className="relative w-full rounded-[4px] border border-border/60 bg-background/35 px-3 pb-2 pt-3 backdrop-blur-[1px]">
        {/* divisória de vidro */}
        <span className="absolute inset-x-2 top-1 h-[2px] rounded bg-primary/20" />
        {/* cadeiras de trás */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-3.5 rounded-t-[3px] bg-foreground/25" />
          ))}
        </div>
        {/* mesa oval */}
        <span className="mx-auto my-[3px] block h-6 w-[86%] rounded-[50%] bg-gradient-to-b from-muted to-muted/50 shadow-[0_5px_9px_-8px_hsl(var(--foreground)/0.7)]" />
        {/* cadeiras da frente */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-3.5 rounded-b-[3px] bg-foreground/25" />
          ))}
        </div>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        Sala de reunião
      </span>
    </div>
  );
});

export default MeetingZone;
