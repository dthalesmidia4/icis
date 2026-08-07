import { CalendarDays, ClipboardList, Layers, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const formatShort = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
};

interface Metric {
  label: string;
  value: string | number;
  icon: React.ElementType;
}

interface ClientHubHeaderProps {
  clientName: string;
  period: CurrentPeriodInfo | null;
  publicationsCount: number;
  daysCount: number;
  creativesCount: number;
  deliveredCount: number;
  canOpenRegistration: boolean;
  onOpenRegistration: () => void;
  onPlanPeriod: () => void;
  planPeriodDisabled?: boolean;
  planPeriodDisabledReason?: string;
}

export default function ClientHubHeader({
  clientName,
  period,
  publicationsCount,
  daysCount,
  creativesCount,
  deliveredCount,
  canOpenRegistration,
  onOpenRegistration,
  onPlanPeriod,
  planPeriodDisabled,
  planPeriodDisabledReason,
}: ClientHubHeaderProps) {
  const metrics: Metric[] = [
    { label: "Publicações", value: publicationsCount, icon: Layers },
    { label: "Dias com conteúdo", value: daysCount, icon: CalendarDays },
    { label: "Criativos", value: creativesCount, icon: Sparkles },
    { label: "Entregues", value: deliveredCount, icon: TrendingUp },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
      <div className="relative p-5 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Workspace do cliente
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight break-words">
              {clientName}
            </h1>

            {period ? (
              <>
                <p className="mt-3 max-w-2xl text-sm sm:text-base text-muted-foreground">
                  {period.period_title || "Período em andamento"}
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs sm:text-sm font-semibold tracking-wide text-primary">
                    {formatShort(period.period_start)} — {formatShort(period.period_end)}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-4 max-w-xl rounded-xl border border-dashed p-4">
                <p className="text-sm font-medium">Nenhum período em andamento</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Planeje um período para ativar o cronograma, o calendário e a lista de demandas deste cliente.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={onPlanPeriod}
                  disabled={planPeriodDisabled}
                  title={planPeriodDisabled ? planPeriodDisabledReason : undefined}
                >
                  Planejar período
                </Button>
              </div>
            )}
          </div>

          {canOpenRegistration && (
            <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={onOpenRegistration}>
              <ClipboardList className="h-4 w-4" />
              Cadastro do cliente
            </Button>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border bg-background/70 p-3 sm:p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <m.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
                  {m.label}
                </span>
              </div>
              <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums">{m.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
