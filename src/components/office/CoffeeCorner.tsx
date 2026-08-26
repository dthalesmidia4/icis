import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";
import { ZONE_SEATS } from "@/lib/officeZone";

interface CoffeeCornerProps {
  /** Quantas pessoas a `OfficePeopleLayer` vai posicionar nas banquetas. */
  occupied: number;
  /** Excedente além dos assentos físicos. */
  overflow?: number;
  register?: (key: string, el: HTMLElement | null) => void;
}

const SEATS = ZONE_SEATS.coffee;

/**
 * Cafeteria da sala: balcão com profundidade (armário inferior + tampo),
 * máquina de café, canecas e, À FRENTE dele, banquetas. O MÓVEL vive aqui; o
 * personagem vem da `OfficePeopleLayer` via anchor, para que exista uma única
 * instância da pessoa na cena inteira.
 */
export const CoffeeCorner = memo(function CoffeeCorner({
  occupied,
  overflow = 0,
  register,
}: CoffeeCornerProps) {


  return (
    <div className="relative flex w-[212px] flex-col items-center sm:w-[240px]">
      {/* ---------- balcão ---------- */}
      <div aria-hidden="true" className="relative z-10 w-full">
        {/* prateleira de parede com canecas */}
        <div className="mx-auto mb-1 flex w-[74%] items-end justify-center gap-1.5">
          <span className="h-3 w-3 rounded-b-[3px] bg-primary/70" />
          <span className="h-3 w-3 rounded-b-[3px] bg-muted-foreground/70" />
          <span className="h-3 w-3 rounded-b-[3px] bg-primary/50" />
          <span className="h-3 w-3 rounded-b-[3px] bg-foreground/35" />
        </div>
        <span className="mx-auto mb-1.5 block h-[3px] w-[78%] rounded bg-foreground/30" />

        {/* máquina de café + jarra sobre o tampo */}
        <div className="relative -mb-[2px] flex items-end justify-center gap-2">
          <span className="relative block h-12 w-8 rounded-[4px] bg-foreground/65 shadow-[0_3px_6px_-4px_hsl(var(--foreground)/0.9)]">
            <span className="absolute left-1/2 top-1.5 h-3 w-5 -translate-x-1/2 rounded-[2px] bg-primary/75" />
            <span className="absolute left-1/2 top-[22px] h-1.5 w-2 -translate-x-1/2 rounded-b bg-background/75" />
            <span className="absolute bottom-1.5 left-1/2 h-3.5 w-5 -translate-x-1/2 rounded-b-[3px] bg-background/80" />
          </span>
          <span className="relative block h-7 w-6 rounded-b-[6px] rounded-t-[3px] bg-primary/25 ring-1 ring-foreground/25">
            <span className="absolute inset-x-[3px] bottom-[3px] h-3 rounded-[2px] bg-primary/55" />
          </span>
          <span className="h-3.5 w-3.5 rounded-b-[3px] bg-background/90 ring-1 ring-foreground/25" />
        </div>

        {/* tampo + corpo do balcão (profundidade) */}
        <span className="block h-[10px] rounded-t-[3px] bg-gradient-to-b from-foreground/38 to-foreground/22" />
        <div className="relative rounded-b-[5px] bg-gradient-to-b from-muted to-muted/50 px-2 py-1.5 text-center shadow-[0_8px_12px_-8px_hsl(var(--foreground)/0.75)]">
          {/* portas do armário */}
          <span className="absolute inset-y-1 left-3 w-[36%] rounded-[2px] border border-foreground/12" />
          <span className="absolute inset-y-1 right-3 w-[36%] rounded-[2px] border border-foreground/12" />
          <span className="relative text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Café
          </span>
        </div>
      </div>

      {/* ---------- banquetas à frente do balcão ---------- */}
      <div className="relative z-20 -mt-[3px] flex w-full items-end justify-center gap-2">
        {Array.from({ length: SEATS }).map((_, i) => (
          <div key={i} className="flex w-[54px] flex-col items-center">
            {/* ponto físico onde o personagem encosta na banqueta */}
            <OfficeZoneAnchor anchorKey={`coffee:${i}`} width={42} register={register} />
            <span
              aria-hidden="true"
              className={`flex flex-col items-center ${i < occupied ? "opacity-100" : "opacity-85"}`}
            >
              <span
                className={`h-[5px] w-8 rounded-[3px] ${i < occupied ? "bg-foreground/45" : "bg-foreground/32"}`}
              />
              <span className="h-5 w-[4px] bg-foreground/28" />
              <span className="h-[3px] w-6 rounded bg-foreground/28" />
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <span className="mb-4 rounded-full border border-border bg-background/90 px-1 text-[8px] font-bold">
            +{overflow}
          </span>
        )}
      </div>

      <span
        aria-hidden="true"
        className="mx-auto block h-2 w-[82%] rounded-[50%] bg-foreground/18 blur-[2px] dark:bg-background/60"
      />
    </div>
  );
});

export default CoffeeCorner;
