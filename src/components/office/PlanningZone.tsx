import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";

interface PlanningZoneProps {
  register?: (key: string, el: HTMLElement | null) => void;
}

/**
 * PLANEJAMENTO como AMBIENTE físico: quadro branco/kanban grande na parede
 * lateral, tapete delimitando o piso e espaço real à frente para 1–2 pessoas
 * em pé. Não é card de dashboard: a placa "Planejamento" é legenda ambiental e
 * o corpo das pessoas vem da `OfficePeopleLayer` pelos anchors medidos.
 */
export const PlanningZone = memo(function PlanningZone({ register }: PlanningZoneProps) {
  return (
    <div className="flex w-[clamp(212px,17vw,268px)] flex-col items-start">
      {/* ---------- quadro branco / kanban físico ---------- */}
      <div
        aria-hidden="true"
        className="relative h-[clamp(112px,10vw,146px)] w-full rounded-[4px] border-[3px] border-foreground/25 bg-background/92 p-2 shadow-[0_10px_18px_-12px_hsl(var(--foreground)/0.85)]"
      >
        {/* trilho superior do quadro */}
        <span className="absolute inset-x-2 -top-[6px] h-[3px] rounded-full bg-foreground/25" />

        <div className="grid h-full grid-cols-3 gap-1.5">
          {[
            ["bg-primary/55", "bg-primary/35", "bg-foreground/20"],
            ["bg-primary/40", "bg-foreground/18", "bg-primary/28"],
            ["bg-foreground/22", "bg-primary/30", "bg-primary/18"],
          ].map((column, c) => (
            <span key={c} className="flex flex-col gap-1">
              {/* cabeçalho da coluna do kanban */}
              <span className="block h-[3px] w-[70%] rounded-full bg-foreground/30" />
              {column.map((tone, i) => (
                <span
                  key={i}
                  className={`block flex-1 rounded-[2px] ${tone} shadow-[0_1px_2px_hsl(var(--foreground)/0.18)]`}
                />
              ))}
            </span>
          ))}
        </div>
        {/* bandeja de canetas */}
        <span className="absolute -bottom-[6px] left-4 h-[5px] w-14 rounded-b-[3px] bg-foreground/30" />
      </div>

      {/* ---------- piso da zona: placa à esquerda, pessoas à direita ---------- */}
      <div className="relative mt-3 w-full">
        {/* tapete: delimita a área sem container de dashboard */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[46px] rounded-[42%] border border-foreground/10 bg-foreground/[0.07] dark:bg-background/40"
        />
        <div className="relative flex h-[54px] w-full items-end gap-1">
          {/* placa ambiental (não é cabeçalho de card) — fora da faixa das pessoas */}
          <span className="mb-[3px] shrink-0 -rotate-[3deg] rounded-[3px] border border-border/70 bg-muted/85 px-1 text-[8px] font-bold uppercase leading-[14px] tracking-[0.1em] text-muted-foreground shadow-[0_2px_4px_-3px_hsl(var(--foreground)/0.8)]">
            Planejamento
          </span>
          <div className="flex flex-1 items-end justify-end gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="relative flex h-0 w-[44px] justify-center">
                <OfficeZoneAnchor anchorKey={`planning:${i}`} width={40} register={register} />
              </span>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
});

export default PlanningZone;
