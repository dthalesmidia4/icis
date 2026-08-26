/**
 * EIXO DE PERÍODO do Financeiro — componente ÚNICO e compartilhado.
 *
 * Escopo `full` e escopo `tools` usam exatamente esta barra: setas + mês formam
 * uma unidade visual compacta (≈40px) e `Hoje, 25 ago` é informação contextual
 * da competência, nunca um texto perdido ao lado.
 *
 * Não conhece valores, fatura ou permissão: só competência.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Competence, addMonths } from "@/lib/financeCardCycle";
import { formatDayMonth } from "@/lib/financePaidLabel";
import {
  FINANCE_TRACKING_START,
  FINANCE_TRACKING_START_MESSAGE,
  clampToTrackingStart,
  compareCompetence,
} from "@/lib/financeTrackingPeriod";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface Props {
  competence: Competence;
  onChange: (next: Competence) => void;
  /** Dia civil de hoje (`YYYY-MM-DD`) — fonte do rótulo contextual. */
  today: string;
  className?: string;
  /** Primeiro mês operacional. Padrão: corte do novo Financeiro. */
  minCompetence?: Competence;
}

/** Competência do dia de hoje, derivada do próprio `today`. */
function competenceOfToday(today: string): Competence {
  const [year, month] = today.slice(0, 10).split("-").map(Number);
  return { year, month };
}

export default function FinancePeriodBar({
  competence,
  onChange,
  today,
  className,
  minCompetence = FINANCE_TRACKING_START,
}: Props) {
  const current = clampToTrackingStart(competenceOfToday(today), minCompetence);
  const isCurrentMonth = competence.year === current.year && competence.month === current.month;
  // Antes do corte não existe mês operacional: a seta simplesmente não abre.
  const canGoBack = compareCompetence(addMonths(competence, -1), minCompetence) >= 0;

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 px-1.5 py-1 min-h-10 ${className ?? ""}`}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Mês anterior"
        disabled={!canGoBack}
        title={canGoBack ? undefined : FINANCE_TRACKING_START_MESSAGE}
        onClick={() => canGoBack && onChange(addMonths(competence, -1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="px-1 text-[15px] font-semibold min-w-[126px] text-center whitespace-nowrap">
        {MONTH_LABELS[competence.month - 1]} {competence.year}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Mês seguinte"
        onClick={() => onChange(addMonths(competence, 1))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      <span className="mx-1 hidden sm:block h-5 w-px bg-border" aria-hidden="true" />
      {isCurrentMonth ? (
        <span className="px-1 text-sm text-muted-foreground whitespace-nowrap">
          Hoje, {formatDayMonth(today)}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-sm"
          onClick={() => onChange(current)}
        >
          Voltar ao mês atual
        </Button>
      )}
    </div>
  );
}
