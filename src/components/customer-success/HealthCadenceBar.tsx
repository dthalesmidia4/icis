import { cn } from "@/lib/utils";
import { HEALTH_LABEL, type SystemsClientHealth } from "@/lib/clientHealth";
import { touchpointLabel } from "@/lib/recordTouchpoint";

interface Props {
  row: SystemsClientHealth;
  onClick?: () => void;
}

/**
 * Barra de cadência: mostra "dias desde o último contato" contra a faixa
 * desejável (0 → cadência), atenção (até 1.5x) e risco (além disso).
 */
export function HealthCadenceBar({ row, onClick }: Props) {
  const cadence = Math.max(1, row.cadenceDays);
  const max = cadence * 2;
  const days = row.daysSinceTouch === null ? max : Math.min(row.daysSinceTouch, max);
  const pct = (days / max) * 100;

  const okWidth = (cadence / max) * 100;
  const warnWidth = ((cadence * 1.5 - cadence) / max) * 100;
  const riskWidth = 100 - okWidth - warnWidth;

  const markerTone =
    row.daysSinceTouch === null || row.daysSinceTouch > cadence * 1.5
      ? "bg-red-600"
      : row.daysSinceTouch > cadence
        ? "bg-amber-500"
        : "bg-emerald-600";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border p-3 transition-shadow hover:shadow-sm bg-card"
      title={
        `Último contato: ${row.lastTouchAt ? new Date(row.lastTouchAt).toLocaleString("pt-BR") : "sem registro"}` +
        (row.lastTouchType ? ` (${touchpointLabel(row.lastTouchType)})` : "") +
        `\nAbertas: ${row.openDemands} · Atrasadas: ${row.overdueDemands}` +
        `\nCadência desejada: ${cadence} dias`
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium truncate">{row.clientName}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.daysSinceTouch === null ? "sem contato" : `há ${row.daysSinceTouch}d`} · meta {cadence}d
        </span>
      </div>

      <div className="relative mt-2 h-3 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-500/25" style={{ width: `${okWidth}%` }} />
        <div className="h-full bg-amber-500/25" style={{ width: `${warnWidth}%` }} />
        <div className="h-full bg-red-500/25" style={{ width: `${riskWidth}%` }} />
        <div
          className="absolute top-0 h-full w-0 border-l border-dashed border-muted-foreground/60"
          style={{ left: `${okWidth}%` }}
        />
        <div
          className={cn("absolute top-1/2 -translate-y-1/2 h-4 w-1.5 rounded-full ring-2 ring-background", markerTone)}
          style={{ left: `calc(${pct}% - 3px)` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
        <span>desejável</span>
        <span>{HEALTH_LABEL[row.level]} · {row.score}</span>
      </div>
    </button>
  );
}
