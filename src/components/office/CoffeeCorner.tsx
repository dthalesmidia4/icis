import { memo } from "react";
import OfficeCharacter from "./OfficeCharacter";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";
import { nextStartLabel } from "@/lib/officePresence";

interface CoffeeCornerProps {
  /** Colaboradores em micro-pausa (gap confiável entre demandas). */
  people: OfficeStationData[];
}

/**
 * Cafeteria da sala principal: balcão, máquina de café e canecas.
 * Recebe os personagens em micro-pausa — a mesa deles continua existindo.
 */
export const CoffeeCorner = memo(function CoffeeCorner({ people }: CoffeeCornerProps) {
  return (
    <div className="relative flex w-[190px] flex-col items-center sm:w-[210px]">
      {/* pessoas em volta do balcão */}
      <div className="relative z-20 mb-[-6px] flex items-end justify-center gap-1">
        {people.slice(0, 4).map((p) => {
          const label = nextStartLabel(p.presence);
          return (
            <div
              key={p.collaborator.userId}
              className="flex animate-in flex-col items-center fade-in duration-500"
              title={`${p.collaborator.fullName}${label ? ` · ${label}` : ""}`}
            >
              <OfficeCharacter
                name={p.collaborator.fullName}
                avatarUrl={p.collaborator.avatarUrl}
                working={false}
                standing
                size={40}
              />
              <span className="max-w-[64px] truncate text-[8px] font-semibold leading-tight">
                {p.collaborator.fullName.split(" ")[0]}
              </span>
              {label && (
                <span className="text-[7px] leading-tight text-muted-foreground">{label}</span>
              )}
            </div>
          );
        })}
        {people.length > 4 && (
          <span className="mb-2 rounded-full border border-border bg-background/85 px-1 text-[8px] font-bold">
            +{people.length - 4}
          </span>
        )}
      </div>

      {/* balcão */}
      <div aria-hidden="true" className="relative z-30 w-full">
        {/* máquina de café + canecas sobre o balcão */}
        <div className="relative z-30 -mb-[2px] flex items-end justify-center gap-2">
          <span className="relative block h-7 w-5 rounded-[3px] bg-foreground/55">
            <span className="absolute left-1/2 top-1 h-1.5 w-2.5 -translate-x-1/2 rounded-[1px] bg-primary/60" />
            <span className="absolute bottom-1 left-1/2 h-2 w-3 -translate-x-1/2 rounded-b-[2px] bg-background/70" />
          </span>
          <span className="h-2 w-2 rounded-b-[2px] bg-primary/60" />
          <span className="h-2 w-2 rounded-b-[2px] bg-muted-foreground/60" />
          <span className="h-2 w-2 rounded-b-[2px] bg-primary/40" />
        </div>
        <span className="block h-[7px] rounded-t-[3px] bg-gradient-to-b from-foreground/30 to-foreground/20" />
        <div className="rounded-b-[4px] bg-gradient-to-b from-muted to-muted/50 px-2 py-1 text-center shadow-[0_6px_10px_-8px_hsl(var(--foreground)/0.6)]">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Café</span>
        </div>
        <span className="mx-auto block h-1.5 w-[80%] rounded-[50%] bg-foreground/15 blur-[2px] dark:bg-background/60" />
      </div>
    </div>
  );
});

export default CoffeeCorner;
