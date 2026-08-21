import { memo } from "react";
import OfficeCharacter from "./OfficeCharacter";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";
import { nextStartLabel } from "@/lib/officePresence";

interface CoffeeCornerProps {
  /** Colaboradores em micro-pausa (gap confiável entre demandas). */
  people: OfficeStationData[];
}

const SEATS = 3;

/**
 * Cafeteria da sala: balcão com máquina de café e, À FRENTE dele, banquetas.
 * Quem está em micro-pausa aparece SENTADO em uma banqueta (contato visual com
 * o assento), com caneca ao lado — nunca flutuando sobre o balcão.
 */
export const CoffeeCorner = memo(function CoffeeCorner({ people }: CoffeeCornerProps) {
  const seated = people.slice(0, SEATS);
  const overflow = people.length - seated.length;

  return (
    <div className="relative flex w-[196px] flex-col items-center sm:w-[214px]">
      {/* ---------- balcão ---------- */}
      <div aria-hidden="true" className="relative z-10 w-full">
        <div className="relative -mb-[2px] flex items-end justify-center gap-2">
          <span className="relative block h-9 w-6 rounded-[3px] bg-foreground/60">
            <span className="absolute left-1/2 top-1 h-2 w-3.5 -translate-x-1/2 rounded-[1px] bg-primary/70" />
            <span className="absolute left-1/2 top-[15px] h-1 w-1.5 -translate-x-1/2 rounded-b bg-background/70" />
            <span className="absolute bottom-1 left-1/2 h-2.5 w-3.5 -translate-x-1/2 rounded-b-[2px] bg-background/75" />
          </span>
          <span className="h-2.5 w-2.5 rounded-b-[2px] bg-primary/70" />
          <span className="h-2.5 w-2.5 rounded-b-[2px] bg-muted-foreground/60" />
          <span className="h-2.5 w-2.5 rounded-b-[2px] bg-primary/45" />
        </div>
        <span className="block h-[8px] rounded-t-[3px] bg-gradient-to-b from-foreground/30 to-foreground/20" />
        <div className="rounded-b-[4px] bg-gradient-to-b from-muted to-muted/50 px-2 py-1 text-center shadow-[0_6px_10px_-8px_hsl(var(--foreground)/0.6)]">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Café</span>
        </div>
      </div>

      {/* ---------- banquetas à frente do balcão ---------- */}
      <div className="relative z-20 -mt-[3px] flex w-full items-end justify-center gap-2">
        {Array.from({ length: SEATS }).map((_, i) => {
          const person = seated[i];
          const label = person ? nextStartLabel(person.presence) : null;
          return (
            <div key={i} className="flex w-[52px] flex-col items-center">
              {person ? (
                <div
                  className="flex animate-in flex-col items-center fade-in duration-500"
                  title={`${person.collaborator.fullName}${label ? ` · ${label}` : ""}`}
                >
                  <div className="relative flex flex-col items-center">
                    <OfficeCharacter
                      name={person.collaborator.fullName}
                      avatarUrl={person.collaborator.avatarUrl}
                      working={false}
                      standing
                      size={38}
                    />
                    {/* caneca na mão (detalhe leve, sem animação de digitação) */}
                    <span
                      aria-hidden="true"
                      className="absolute -right-[2px] bottom-[6px] h-[7px] w-[6px] animate-office-caret rounded-b-[2px] bg-primary/70 motion-reduce:animate-none"
                    />
                  </div>
                  {/* assento da banqueta encostando no personagem */}
                  <span aria-hidden="true" className="-mt-[3px] flex flex-col items-center">
                    <span className="h-[4px] w-7 rounded-[3px] bg-foreground/40" />
                    <span className="h-4 w-[3px] bg-foreground/25" />
                    <span className="h-[2px] w-5 rounded bg-foreground/25" />
                  </span>
                  <span className="max-w-[52px] truncate text-[8px] font-semibold leading-tight">
                    {person.collaborator.fullName.split(" ")[0]}
                  </span>
                  {label && (
                    <span className="max-w-[52px] truncate text-[7px] leading-tight text-muted-foreground">
                      {label}
                    </span>
                  )}
                </div>
              ) : (
                <span aria-hidden="true" className="flex flex-col items-center opacity-80">
                  <span className="h-[4px] w-7 rounded-[3px] bg-foreground/30" />
                  <span className="h-4 w-[3px] bg-foreground/20" />
                  <span className="h-[2px] w-5 rounded bg-foreground/20" />
                </span>
              )}
            </div>
          );
        })}
        {overflow > 0 && (
          <span className="mb-4 rounded-full border border-border bg-background/90 px-1 text-[8px] font-bold">
            +{overflow}
          </span>
        )}
      </div>

      <span
        aria-hidden="true"
        className="mx-auto block h-1.5 w-[80%] rounded-[50%] bg-foreground/15 blur-[2px] dark:bg-background/60"
      />
    </div>
  );
});

export default CoffeeCorner;
