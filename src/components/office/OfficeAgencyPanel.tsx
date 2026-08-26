import { memo } from "react";
import { cn } from "@/lib/utils";

interface OfficeAgencyPanelProps {
  deliveredToday: number;
  inProgress: number;
  atRisk: number;
  awaitingClient: number;
  progressPct: number | null;
  /** Largura em px vinda do palco lógico (~420–520). */
  width?: number;
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
  <div className="flex flex-col items-center gap-[2px] leading-none">
    <span
      className={cn(
        "text-[19px] font-bold tabular-nums leading-none",
        tone === "danger" && "text-destructive",
        tone === "primary" && "text-primary",
      )}
    >
      {value}
    </span>
    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
  </div>
);

/**
 * PAINEL DA AGÊNCIA como LOUSA FÍSICA AUTOPORTANTE: moldura limpa + duas pernas
 * longas e contrastadas com pés apoiados no piso (CSS puro, sem 3D e sem imagem
 * externa). As pernas vivem em wrapper próprio, `top-full`, sem `overflow`
 * intermediário, para nunca serem clipadas.
 * Sempre AGENCY-WIDE: o filtro Todas/Mídia/Sistemas muda a cena (mesas), nunca
 * estes números. Largura vem do PALCO LÓGICO, não da viewport bruta.
 */
export const OfficeAgencyPanel = memo(function OfficeAgencyPanel({
  deliveredToday,
  inProgress,
  atRisk,
  awaitingClient,
  progressPct,
  width = 440,
}: OfficeAgencyPanelProps) {
  return (
    <div className="relative" style={{ width }}>
      {/* pernas/suportes da lousa: CURTAS e discretas (~45% da altura anterior),
          atrás do quadro (z menor), sem capturar ponteiro e sem blur nos pés. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-full z-0 flex h-[clamp(32px,4vh,52px)] justify-between px-[16%]"
      >
        {[0, 1].map((i) => (
          <span key={i} className="flex h-full flex-col items-center">
            {/* haste curta */}
            <span className="w-[6px] flex-1 rounded-b-[2px] bg-gradient-to-b from-foreground/55 to-foreground/38 shadow-[1px_0_0_hsl(var(--background)/0.35)]" />
            {/* pé de apoio encostando no piso */}
            <span className="h-[5px] w-[30px] rounded-[2px] bg-foreground/50" />
            <span className="h-[2px] w-[34px] rounded-[50%] bg-foreground/20 dark:bg-background/70" />
          </span>
        ))}
      </div>


      <div className="relative z-10 w-full rounded-[6px] border-[3px] border-foreground/25 bg-background/95 px-4 pb-2.5 pt-2 shadow-[0_10px_18px_-16px_hsl(var(--foreground)/0.9)]">
        {/* parafusos da moldura */}
        <span aria-hidden="true" className="absolute left-2 top-1.5 h-1 w-1 rounded-full bg-foreground/25" />
        <span aria-hidden="true" className="absolute right-2 top-1.5 h-1 w-1 rounded-full bg-foreground/25" />

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/80">
            Painel da agência
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">
            {progressPct === null ? "Sem entregas previstas" : `${progressPct}% do dia`}
          </span>
        </div>

        {progressPct !== null && (
          <div
            className="mt-1.5 h-[8px] w-full overflow-hidden rounded-full bg-foreground/12 ring-1 ring-inset ring-foreground/10"
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

        <div className="mt-2.5 grid grid-cols-4 gap-1 border-t border-border/60 pt-2">
          <Metric label="Concluídas" value={deliveredToday} tone="primary" />
          <Metric label="Em andamento" value={inProgress} />
          <Metric label="Em risco" value={atRisk} tone={atRisk > 0 ? "danger" : undefined} />
          <Metric label="Aguardando" value={awaitingClient} />
        </div>
      </div>
    </div>
  );
});

export default OfficeAgencyPanel;
