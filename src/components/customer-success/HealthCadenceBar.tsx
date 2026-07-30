import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { History, Plus } from "lucide-react";
import { HEALTH_LABEL, type SystemsClientHealth } from "@/lib/clientHealth";
import { touchpointLabel } from "@/lib/recordTouchpoint";

interface Props {
  row: SystemsClientHealth;
  onHistory?: () => void;
  onRegister?: () => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatDay = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Cartão de cadência: último contato, próximo contato ideal e barra com a
 * faixa desejável (0 → cadência), atenção (até 2x) e risco.
 */
export function HealthCadenceBar({ row, onHistory, onRegister }: Props) {
  const cadence = Math.max(1, row.cadenceDays);
  const max = cadence * 2;
  const days = row.daysSinceTouch === null ? max : Math.min(row.daysSinceTouch, max);
  const pct = (days / max) * 100;
  const okWidth = 50; // cadence / (cadence*2)

  const tone =
    row.daysSinceTouch === null || row.daysSinceTouch > cadence * 1.5
      ? { marker: "bg-red-600", chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900" }
      : row.daysSinceTouch > cadence
        ? { marker: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900" }
        : { marker: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900" };

  const nextIdeal = row.lastTouchAt
    ? formatDay(new Date(row.lastTouchAt).getTime() + cadence * 86_400_000)
    : "o quanto antes";

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold truncate" title={row.clientName}>
          {row.clientName}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
            tone.chip,
          )}
        >
          {HEALTH_LABEL[row.level]} · {row.score}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-xs">
        <div>
          <span className="text-muted-foreground">Último contato: </span>
          {row.lastTouchAt ? (
            <span className="font-medium">
              {formatDate(row.lastTouchAt)}
              {row.lastTouchType ? ` · ${touchpointLabel(row.lastTouchType)}` : ""}
              {row.daysSinceTouch !== null ? ` (há ${row.daysSinceTouch} dia${row.daysSinceTouch === 1 ? "" : "s"})` : ""}
            </span>
          ) : (
            <span className="font-medium text-red-600">nunca registrado</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Próximo contato ideal até: </span>
          <span className="font-medium">{nextIdeal}</span>
          <span className="text-muted-foreground"> · meta {cadence}d</span>
        </div>
      </div>

      <div className="relative mt-2 h-3 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-500/25" style={{ width: `${okWidth}%` }} />
        <div className="h-full bg-amber-500/25" style={{ width: "25%" }} />
        <div className="h-full bg-red-500/25" style={{ width: "25%" }} />
        <div
          className="absolute top-0 h-full w-0 border-l border-dashed border-muted-foreground/60"
          style={{ left: `${okWidth}%` }}
        />
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-4 w-1.5 rounded-full ring-2 ring-background",
            tone.marker,
          )}
          style={{ left: `calc(${pct}% - 3px)` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
        <span>desejável até {cadence}d</span>
        <span>{max}d+</span>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRegister}>
          <Plus className="h-3 w-3 mr-1" />
          Registrar contato
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onHistory}>
          <History className="h-3 w-3 mr-1" />
          Histórico
        </Button>
      </div>
    </div>
  );
}
