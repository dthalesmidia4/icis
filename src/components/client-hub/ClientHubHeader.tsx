import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";


const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const formatShort = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || name.slice(0, 2).toUpperCase();

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
  backTo?: string;
  actionsSlot?: React.ReactNode;
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
  backTo,
  actionsSlot,
}: ClientHubHeaderProps) {
  const metrics = [
    { label: "publicações principais", value: publicationsCount },
    { label: "dias com conteúdo", value: daysCount },
    { label: "criativos do ciclo", value: creativesCount },
    { label: "entregas concluídas", value: deliveredCount },
  ];

  return (
    <div className="space-y-10">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-black tracking-tight text-primary-foreground">
            {initialsOf(clientName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black uppercase tracking-[0.12em]">{clientName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {period?.period_title || "Sem período em andamento"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {period && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
                {formatShort(period.period_start)}
              </span>
              <span className="h-px w-8 bg-border sm:w-12" />
              <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
                {formatShort(period.period_end)}
              </span>
              <span className="rounded-sm bg-primary px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground">
                Campanha
              </span>
            </div>
          )}
          {canOpenRegistration && (
            <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={onOpenRegistration}>
              <ClipboardList className="h-3.5 w-3.5" />
              Cadastro
            </Button>
          )}
          {actionsSlot}
        </div>
      </div>


      {/* Hero editorial */}
      <div className="grid gap-8 lg:grid-cols-[1.7fr_minmax(220px,0.9fr)] lg:items-start">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">
            Plano operacional{period?.period_title ? ` · ${period.period_title}` : ""}
          </p>

          {period ? (
            <>
              <h1 className="mt-5 text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
                Cronograma de
                <br />
                conteúdo
                <br />
                <span className="text-primary">pronto para executar.</span>
              </h1>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                Demandas, textos, captação, criativos e validações organizados do início do período
                até o último dia de publicação.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-5 text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
                Prepare o ciclo
                <br />
                <span className="text-primary">antes de produzir.</span>
              </h1>
              <ol className="mt-6 max-w-md space-y-2 text-sm text-muted-foreground">
                {["Anamnese", "Estratégia geral", "Identidade visual", "Planejar período"].map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="font-black tabular-nums text-primary">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <Button
                size="sm"
                className="mt-6"
                onClick={onPlanPeriod}
                disabled={planPeriodDisabled}
                title={planPeriodDisabled ? planPeriodDisabledReason : undefined}
              >
                Planejar período
              </Button>
            </>
          )}
        </div>

        <div className="divide-y border-y">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-baseline gap-3 py-4">
              <span className="text-3xl font-black tabular-nums leading-none">{m.value}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
