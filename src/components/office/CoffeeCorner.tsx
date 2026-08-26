import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";
import { ZONE_SEATS } from "@/lib/officeZone";

interface CoffeeCornerProps {
  /** Quantas pessoas a `OfficePeopleLayer` vai posicionar na zona. */
  occupied: number;
  /** Excedente além dos lugares físicos. */
  overflow?: number;
  register?: (key: string, el: HTMLElement | null) => void;
}

const SEATS = ZONE_SEATS.coffee;

/**
 * CAFETERIA como AMBIENTE DE PISO, na composição da referência:
 * `[ tapete oval ]` cobrindo a zona, PESSOAS na metade ESQUERDA (anchors
 * medidos) e BALCÃO à DIREITA, com a cafeteira e as canecas claramente
 * APOIADAS SOBRE o tampo. Objetos de parede (prateleira/gráfico) NÃO vivem
 * aqui — eles pertencem à faixa decorativa da parede em `OfficeWorld`.
 * O MÓVEL vive neste componente; o personagem vem da `OfficePeopleLayer`, para
 * existir uma única instância da pessoa na cena inteira.
 */
export const CoffeeCorner = memo(function CoffeeCorner({
  occupied,
  overflow = 0,
  register,
}: CoffeeCornerProps) {
  return (
    <div className="relative flex w-full min-w-[188px] max-w-[238px] flex-col items-stretch pb-[6px]">
      {/* ---------- tapete oval HORIZONTAL, sempre inteiro na zona ---------- */}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 h-[54px] w-full -translate-x-1/2 rounded-[50%] border border-foreground/10 bg-foreground/[0.07] dark:bg-background/40"
      />

      <div className="relative flex items-end justify-between gap-1">
        {/* ---------- PESSOAS (metade esquerda) ---------- */}
        <div className="relative z-20 flex flex-1 items-end justify-start gap-0.5 pb-3">
          {Array.from({ length: SEATS }).map((_, i) => (
            <span key={i} className="relative flex h-0 w-[36px] justify-center">
              <OfficeZoneAnchor anchorKey={`coffee:${i}`} width={36} register={register} />
            </span>
          ))}
          {overflow > 0 && (
            <span className="mb-1 rounded-full border border-border bg-background/90 px-1 text-[8px] font-bold">
              +{overflow}
            </span>
          )}
        </div>


        {/* ---------- BALCÃO à direita, com objetos SOBRE o tampo ---------- */}
        <div aria-hidden="true" className="relative z-10 w-[92px] shrink-0">
          {/* objetos apoiados no tampo: cafeteira + jarra + canecas */}
          <div className="relative z-10 mb-[-2px] flex items-end justify-center gap-1.5">
            <span className="relative block h-11 w-7 rounded-[4px] bg-foreground/65 shadow-[0_3px_6px_-4px_hsl(var(--foreground)/0.9)]">
              <span className="absolute left-1/2 top-1.5 h-3 w-4 -translate-x-1/2 rounded-[2px] bg-primary/75" />
              <span className="absolute left-1/2 top-[21px] h-1.5 w-2 -translate-x-1/2 rounded-b bg-background/75" />
              <span className="absolute bottom-1.5 left-1/2 h-3 w-4 -translate-x-1/2 rounded-b-[3px] bg-background/80" />
            </span>
            <span className="relative block h-6 w-5 rounded-b-[6px] rounded-t-[3px] bg-primary/25 ring-1 ring-foreground/25">
              <span className="absolute inset-x-[3px] bottom-[3px] h-2.5 rounded-[2px] bg-primary/55" />
            </span>
            <span className="flex items-end gap-[3px]">
              <span className="h-3 w-3 rounded-b-[3px] bg-background/90 ring-1 ring-foreground/25" />
              <span className="h-2.5 w-2.5 rounded-b-[3px] bg-primary/45" />
            </span>
          </div>

          {/* tampo + corpo do balcão (profundidade) */}
          <span className="relative z-20 block h-[10px] rounded-t-[3px] bg-gradient-to-b from-foreground/40 to-foreground/24" />
          <div className="relative rounded-b-[5px] bg-gradient-to-b from-muted to-muted/50 px-2 py-1.5 text-center shadow-[0_8px_12px_-8px_hsl(var(--foreground)/0.75)]">
            <span className="absolute inset-y-1 left-2 w-[38%] rounded-[2px] border border-foreground/12" />
            <span className="absolute inset-y-1 right-2 w-[38%] rounded-[2px] border border-foreground/12" />
            <span className="relative text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Café
            </span>
          </div>

          {/* banqueta discreta à frente do balcão, fora da faixa das pessoas */}
          <div className="relative -mt-[2px] flex justify-center">
            <span
              className={`flex flex-col items-center ${occupied > 0 ? "opacity-100" : "opacity-80"}`}
            >
              <span className="h-[5px] w-7 rounded-[3px] bg-foreground/42" />
              <span className="h-4 w-[4px] bg-foreground/28" />
              <span className="h-[3px] w-5 rounded bg-foreground/28" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CoffeeCorner;
