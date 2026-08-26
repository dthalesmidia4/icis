import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";

interface PlanningZoneProps {
  register?: (key: string, el: HTMLElement | null) => void;
}

/**
 * Representação ABSTRATA de capacidade: 3 colunas conceituais e poucos blocos
 * sutis. Nenhum número/tarefa é inventado e nenhum placeholder vazio é
 * desenhado — espaço sem bloco fica simplesmente neutro, para o quadro não
 * virar um mini-Kanban concorrente da Visão Geral.
 */
const PLANNING_COLUMNS: { label: string; blocks: string[] }[] = [
  { label: "Hoje", blocks: ["h-[36%] bg-primary/55", "h-[24%] bg-primary/30"] },
  { label: "Amanhã", blocks: ["h-[28%] bg-primary/40"] },
  { label: "Semana", blocks: ["h-[20%] bg-foreground/20", "h-[15%] bg-primary/22"] },
];

/**
 * PLANEJAMENTO como AMBIENTE físico: quadro de capacidade emoldurado na parede
 * lateral (com trilho, bandeja de canetas e marcadores) e, no piso, uma MESA
 * OVAL colaborativa com cadeiras ao redor e poucos objetos estáticos no tampo.
 * Não é card de dashboard: a placa "Planejamento" é legenda ambiental e o corpo
 * das pessoas vem da `OfficePeopleLayer` pelos anchors medidos.
 */
export const PlanningZone = memo(function PlanningZone({ register }: PlanningZoneProps) {
  return (
    <div className="flex w-full max-w-[254px] flex-col items-center">
      {/* ---------- quadro de planejamento (abstrato, com acabamento) ---------- */}
      <div aria-hidden="true" className="relative w-full">
        {/* trilho superior + suportes do quadro */}
        <span className="absolute inset-x-3 -top-[6px] h-[4px] rounded-full bg-foreground/30" />
        <span className="absolute -top-[6px] left-5 h-[6px] w-[3px] rounded bg-foreground/25" />
        <span className="absolute -top-[6px] right-5 h-[6px] w-[3px] rounded bg-foreground/25" />

        <div className="relative h-[clamp(102px,8.5vw,126px)] w-full rounded-[5px] border-2 border-foreground/28 bg-background/92 px-2 pb-2.5 pt-1.5 shadow-[inset_0_1px_6px_hsl(var(--foreground)/0.08)]">
          {/* marcadores discretos no topo do quadro */}
          <span className="absolute right-2 top-1 flex gap-[3px]">
            <span className="h-[3px] w-4 rounded-full bg-primary/60" />
            <span className="h-[3px] w-3 rounded-full bg-foreground/30" />
          </span>

          <div className="flex h-full gap-2">
            {PLANNING_COLUMNS.map((column) => (
              <span key={column.label} className="flex flex-1 flex-col">
                <span className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {column.label}
                </span>
                <span className="mt-[3px] block h-[2px] w-[60%] rounded-full bg-foreground/22" />
                <span className="mt-1 flex flex-1 flex-col justify-end gap-1">
                  {column.blocks.map((tone, i) => (
                    <span key={i} className={`block w-full rounded-[2px] ${tone}`} />
                  ))}
                </span>
              </span>
            ))}
          </div>

          {/* linha de base do quadro */}
          <span className="absolute inset-x-2 bottom-1.5 h-[2px] rounded-full bg-foreground/15" />
        </div>

        {/* bandeja de canetas encostada na moldura */}
        <div className="relative mx-auto -mt-[2px] flex w-[62%] flex-col items-center">
          <span className="h-[6px] w-full rounded-b-[4px] bg-gradient-to-b from-foreground/32 to-foreground/18" />
          <span className="-mt-[9px] mb-[3px] flex gap-1 self-start pl-2">
            <span className="h-[3px] w-5 rounded-full bg-primary/70" />
            <span className="h-[3px] w-4 rounded-full bg-foreground/35" />
          </span>
        </div>
      </div>

      {/* ---------- mesa oval colaborativa (piso) ---------- */}
      <div className="relative mt-3 w-full">
        {/* tapete oval sob a mesa: proporcional e sempre inteiro */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-[62px] w-[94%] -translate-x-1/2 rounded-[46%] border border-foreground/10 bg-foreground/[0.06] dark:bg-background/40"
        />

        <div className="relative flex flex-col items-center pb-1.5">
          {/* cadeiras do fundo */}
          <div aria-hidden="true" className="relative z-0 flex w-[74%] justify-between">
            {[0, 1].map((i) => (
              <span key={i} className="flex flex-col items-center">
                <span className="h-[4px] w-6 rounded-[3px] bg-foreground/38" />
                <span className="h-2 w-[4px] bg-foreground/24" />
              </span>
            ))}
          </div>

          {/* tampo oval com objetos estáticos */}
          <div
            aria-hidden="true"
            className="relative z-10 -mt-[3px] h-[42px] w-[86%] rounded-[50%] border border-foreground/20 bg-gradient-to-b from-muted/95 to-muted/60 shadow-[0_8px_12px_-9px_hsl(var(--foreground)/0.85)]"
          >
            <span className="absolute inset-x-[16%] top-[6px] h-[2px] rounded-full bg-foreground/10" />
            {/* plantinha */}
            <span className="absolute left-[24%] top-[6px] flex flex-col items-center">
              <span className="h-2 w-2 rotate-45 rounded-[2px] bg-primary/55" />
              <span className="-mt-[3px] h-2.5 w-3 rounded-b-[3px] bg-foreground/40" />
            </span>
            {/* bloco de folhas + caneta */}
            <span className="absolute right-[22%] top-[10px] flex items-end gap-[3px]">
              <span className="h-4 w-3.5 -rotate-[6deg] rounded-[2px] border border-border/80 bg-background/95" />
              <span className="h-[3px] w-3 rotate-[18deg] rounded-full bg-primary/65" />
            </span>
            {/* placa ambiental integrada ao móvel */}
            <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 rounded-[3px] border border-border/70 bg-muted/90 px-1 text-[7px] font-bold uppercase leading-[12px] tracking-[0.1em] text-muted-foreground">
              Planejamento
            </span>
          </div>

          {/* cadeiras da frente + lugares reais das pessoas (anchors medidos) */}
          <div className="relative z-20 -mt-[6px] flex w-full items-end justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="relative flex w-[42px] flex-col items-center">
                <OfficeZoneAnchor anchorKey={`planning:${i}`} width={38} register={register} />
                <span aria-hidden="true" className="flex flex-col items-center opacity-90">
                  <span className="h-[4px] w-6 rounded-[3px] bg-foreground/42" />
                  <span className="h-2.5 w-[4px] bg-foreground/26" />
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default PlanningZone;
