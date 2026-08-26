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
  { label: "Hoje", blocks: ["h-[38%] bg-primary/55", "h-[26%] bg-primary/30"] },
  { label: "Amanhã", blocks: ["h-[30%] bg-primary/40"] },
  { label: "Semana", blocks: ["h-[22%] bg-foreground/20", "h-[16%] bg-primary/22"] },
];

/**
 * PLANEJAMENTO como AMBIENTE físico: quadro de organização/capacidade na parede
 * lateral, tapete delimitando o piso e espaço real à frente para 1–2 pessoas em
 * pé. Não é card de dashboard: a placa "Planejamento" é legenda ambiental e o
 * corpo das pessoas vem da `OfficePeopleLayer` pelos anchors medidos.
 */
export const PlanningZone = memo(function PlanningZone({ register }: PlanningZoneProps) {
  return (
    <div className="flex w-full max-w-[268px] flex-col items-start">
      {/* ---------- quadro de planejamento (abstrato, sem grade de vazios) ---------- */}
      <div
        aria-hidden="true"
        className="relative h-[clamp(104px,9vw,132px)] w-full rounded-[4px] border-2 border-foreground/25 bg-background/90 px-2 pb-2 pt-1.5"
      >
        {/* trilho superior do quadro */}
        <span className="absolute inset-x-2 -top-[5px] h-[3px] rounded-full bg-foreground/25" />

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
        {/* bandeja de canetas */}
        <span className="absolute -bottom-[5px] left-4 h-[5px] w-14 rounded-b-[3px] bg-foreground/28" />
      </div>

      {/* ---------- piso da zona: placa à esquerda, pessoas à direita ---------- */}
      <div className="relative mt-3 w-full">
        {/* tapete oval: largura reduzida e centralizada para nunca clipar */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-[44px] w-[92%] -translate-x-1/2 rounded-[42%] border border-foreground/10 bg-foreground/[0.07] dark:bg-background/40"
        />
        <div className="relative flex h-[54px] w-full items-end gap-1">
          {/* placa ambiental (não é cabeçalho de card) — fora da faixa das pessoas */}
          <span className="mb-[3px] shrink-0 -rotate-[3deg] rounded-[3px] border border-border/70 bg-muted/85 px-1 text-[8px] font-bold uppercase leading-[14px] tracking-[0.1em] text-muted-foreground">
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
