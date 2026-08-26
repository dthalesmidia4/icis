import { memo } from "react";
import OfficeZoneAnchor from "./OfficeZoneAnchor";

interface ReviewZoneProps {
  register?: (key: string, el: HTMLElement | null) => void;
}

/**
 * REVISÃO / QUALIDADE como móvel físico: mesa baixa com documentos, lupa e
 * selo de qualidade. Sem container de dashboard — quem revisa fica em pé ao
 * lado (anchors medidos pela `OfficePeopleLayer`).
 */
export const ReviewZone = memo(function ReviewZone({ register }: ReviewZoneProps) {
  return (
    <div className="flex w-[164px] flex-col items-start gap-1">
      <div aria-hidden="true" className="relative w-full">
        {/* documentos sobre o tampo */}
        <div className="relative mx-2 flex items-end justify-start gap-1.5 pb-[2px]">
          <span className="block h-6 w-5 -rotate-6 rounded-[1px] border border-border/70 bg-background/90">
            <span className="mx-auto mt-1 block h-[2px] w-3 bg-foreground/25" />
            <span className="mx-auto mt-1 block h-[2px] w-3 bg-foreground/20" />
          </span>
          <span className="block h-7 w-5 rotate-3 rounded-[1px] border border-border/70 bg-background/95">
            <span className="mx-auto mt-1 block h-[2px] w-3 bg-foreground/25" />
            <span className="mx-auto mt-1 block h-[2px] w-3 bg-foreground/20" />
          </span>
          {/* lupa */}
          <span className="relative block h-5 w-5">
            <span className="absolute inset-0 rounded-full border-2 border-primary/60" />
            <span className="absolute -bottom-1 -right-1 h-[7px] w-[3px] rotate-45 rounded bg-primary/60" />
          </span>
          {/* selo de qualidade */}
          <span className="block h-4 w-4 rounded-full bg-primary/25 ring-2 ring-primary/40" />
        </div>
        {/* tampo + pernas */}
        <span className="block h-[7px] rounded-t-[3px] bg-gradient-to-b from-foreground/30 to-foreground/18" />
        <div className="rounded-b-[4px] bg-gradient-to-b from-muted to-muted/50 px-2 py-[3px] text-center shadow-[0_6px_10px_-8px_hsl(var(--foreground)/0.6)]">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            Revisão
          </span>
        </div>
        <div className="flex justify-between px-3">
          <span className="h-2.5 w-[3px] bg-foreground/25" />
          <span className="h-2.5 w-[3px] bg-foreground/25" />
        </div>
      </div>

      <div className="relative flex w-full items-end gap-2">
        {[0, 1].map((i) => (
          <span key={i} className="relative flex h-0 w-[54px] justify-center">
            <OfficeZoneAnchor anchorKey={`review:${i}`} width={44} register={register} />
          </span>
        ))}
      </div>
    </div>
  );
});

export default ReviewZone;
