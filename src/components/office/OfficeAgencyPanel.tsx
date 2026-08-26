import { memo } from "react";
import { cn } from "@/lib/utils";

interface OfficeAgencyPanelProps {
  deliveredToday: number;
  inProgress: number;
  atRisk: number;
  awaitingClient: number;
  progressPct: number | null;
}

const Metric = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "primary";
}) => (
  <div className="flex flex-col items-center leading-none">
    <span
      className={cn(
        "text-[13px] font-bold tabular-nums",
        tone === "danger" && "text-destructive",
        tone === "primary" && "text-primary",
      )}
    >
      {value}
    </span>
    <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{label}</span>
  </div>
);

/**
 * PAINEL DA AGÊNCIA na parede: sempre AGENCY-WIDE. O filtro Todas/Mídia/
 * Sistemas muda a cena (mesas), nunca estes números — por isso o título é
 * explícito.
 */
export const OfficeAgencyPanel = memo(function OfficeAgencyPanel({
  deliveredToday,
  inProgress,
  atRisk,
  awaitingClient,
  progressPct,
}: OfficeAgencyPanelProps) {
  return (
    <div className="w-[300px] rounded-md border border-border/70 bg-background/80 px-3 py-2 shadow-[0_8px_18px_-14px_hsl(var(--foreground)/0.8)] backdrop-blur-[2px] sm:w-[340px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Painel da agência
        </span>
        <span className="text-[9px] text-muted-foreground">
          {progressPct === null ? "Sem entregas previstas" : `${progressPct}% do dia`}
        </span>
      </div>

      {progressPct !== null && (
        <div
          className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-foreground/10"
          role="progressbar"
          aria-label="Progresso de entregas do dia"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
        >
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-700"
            style={{ width: `${Math.max(3, Math.min(100, progressPct))}%` }}
          />
        </div>
      )}

      <div className="mt-2 grid grid-cols-4 gap-1">
        <Metric label="Concluídas" value={deliveredToday} tone="primary" />
        <Metric label="Em andamento" value={inProgress} />
        <Metric label="Em risco" value={atRisk} tone={atRisk > 0 ? "danger" : undefined} />
        <Metric label="Aguardando" value={awaitingClient} />
      </div>
    </div>
  );
});

export default OfficeAgencyPanel;
