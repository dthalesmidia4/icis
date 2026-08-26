import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";

interface ReviewZoneProps {
  register?: (key: string, el: HTMLElement | null) => void;
}

/**
 * REVISÃO / QUALIDADE como pequena ESTAÇÃO física: bancada com documentos,
 * lupa, checklist e selo de aprovação, placa integrada ao móvel e espaço real
 * para 1–2 pessoas em pé (anchors medidos pela `OfficePeopleLayer`).
 * Escala próxima do Planejamento — nunca um rodapé decorativo.
 */
export const ReviewZone = memo(function ReviewZone({ register }: ReviewZoneProps) {
  return (
    <div className="flex w-[clamp(206px,16.5vw,262px)] flex-col items-start">
      <div aria-hidden="true" className="relative w-full">
        {/* painel de parede da bancada */}
        <span className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-foreground/20" />

        {/* objetos de controle de qualidade sobre o tampo */}
        <div className="relative mx-3 flex items-end justify-start gap-2 pb-[3px] pt-2">
          {/* pilha de documentos */}
          <span className="block h-10 w-8 -rotate-[5deg] rounded-[2px] border border-border/80 bg-background/95 shadow-[0_3px_6px_-4px_hsl(var(--foreground)/0.9)]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="mx-auto mt-[3px] block h-[2px] w-5 bg-foreground/30" />
            ))}
          </span>
          {/* checklist aprovado */}
          <span className="block h-11 w-8 rotate-[3deg] rounded-[2px] border border-border/80 bg-background/98 shadow-[0_3px_6px_-4px_hsl(var(--foreground)/0.9)]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="mt-[4px] flex items-center gap-[3px] pl-[4px]">
                <span
                  className={`block h-[4px] w-[4px] rounded-[1px] ${i < 2 ? "bg-primary/80" : "border border-foreground/30"}`}
                />
                <span className="block h-[2px] w-4 bg-foreground/25" />
              </span>
            ))}
          </span>
          {/* lupa */}
          <span className="relative block h-7 w-7">
            <span className="absolute inset-0 rounded-full border-[3px] border-primary/70 bg-background/40" />
            <span className="absolute -bottom-[3px] -right-[3px] h-[11px] w-[4px] rotate-45 rounded bg-primary/70" />
          </span>
          {/* selo de qualidade */}
          <span className="mb-1 block h-5 w-5 rounded-full bg-primary/30 ring-2 ring-primary/55" />
        </div>

        {/* tampo + corpo da bancada com a placa integrada */}
        <span className="block h-[9px] rounded-t-[3px] bg-gradient-to-b from-foreground/35 to-foreground/20" />
        <div className="rounded-b-[5px] bg-gradient-to-b from-muted to-muted/55 px-2 py-1 text-center shadow-[0_8px_12px_-8px_hsl(var(--foreground)/0.75)]">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Revisão
          </span>
        </div>
        <div className="flex justify-between px-4">
          <span className="h-4 w-[4px] bg-foreground/30" />
          <span className="h-4 w-[4px] bg-foreground/30" />
        </div>
        <span className="mx-auto block h-1.5 w-[82%] rounded-[50%] bg-foreground/15 blur-[2px] dark:bg-background/60" />
      </div>

      {/* lugares em pé ao lado da bancada */}
      <div className="relative mt-1 flex h-[44px] w-full items-end justify-end gap-1 pr-1">
        {[0, 1].map((i) => (
          <span key={i} className="relative flex h-0 w-[46px] justify-center">
            <OfficeZoneAnchor anchorKey={`review:${i}`} width={40} register={register} />
          </span>
        ))}
      </div>
    </div>
  );
});

export default ReviewZone;
