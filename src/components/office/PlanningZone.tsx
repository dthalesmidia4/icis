import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";

interface PlanningZoneProps {
  register?: (key: string, el: HTMLElement | null) => void;
}

/**
 * PLANEJAMENTO como MÓVEL físico: quadro branco na parede lateral com post-its
 * em CSS. Não é um dashboard nem um card grande — quem planeja aparece em pé
 * ao lado, posicionado pela `OfficePeopleLayer` através dos anchors.
 */
export const PlanningZone = memo(function PlanningZone({ register }: PlanningZoneProps) {
  return (
    <div className="flex w-[172px] flex-col items-start gap-1">
      {/* quadro branco */}
      <div
        aria-hidden="true"
        className="relative h-[74px] w-full rounded-[3px] border-2 border-foreground/20 bg-background/80 p-1.5 shadow-[0_4px_10px_-8px_hsl(var(--foreground)/0.7)]"
      >
        <div className="grid h-full grid-cols-3 gap-1">
          {[
            "bg-primary/45",
            "bg-primary/25",
            "bg-foreground/15",
            "bg-primary/30",
            "bg-foreground/12",
            "bg-primary/20",
          ].map((tone, i) => (
            <span key={i} className={`block rounded-[1px] ${tone}`} />
          ))}
        </div>
        {/* bandeja de canetas */}
        <span className="absolute -bottom-[5px] left-3 h-[4px] w-10 rounded-b-[2px] bg-foreground/25" />
      </div>

      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        Planejamento
      </span>

      {/* lugares físicos (em pé, diante do quadro) */}
      <div className="relative flex w-full items-end gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="relative flex h-0 w-[52px] justify-center">
            <OfficeZoneAnchor anchorKey={`planning:${i}`} width={44} register={register} />
          </span>
        ))}
      </div>
    </div>
  );
});

export default PlanningZone;
