/**
 * Shell compartilhado acima da lista agrupada do Financeiro.
 *
 * Usado por `Composição do mês` e `Contas e despesas` para manter a mesma
 * estrutura visual: período + recorte + privacidade na primeira linha, e hint +
 * busca + filtros + agrupamento/expansão na segunda.
 *
 * O componente não contém JSX específico de nenhuma view — apenas recebe os
 * segmentos, o slot de filtros e o conteúdo do hint.
 */
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFinanceVisibility } from "@/contexts/FinanceVisibilityContext";
import { CompositionGroupBy } from "@/lib/financeGrouping";
import FinanceGroupingControl from "./FinanceGroupingControl";

export interface FinanceGroupedViewToolbarSegment {
  value: string;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Valor opcional exibido ao lado do rótulo (respeita o olho de privacidade). */
  amount?: number | null;
}

interface Props {
  /** Barra de período compartilhada (`FinancePeriodBar`). */
  periodBar: React.ReactNode;
  /** Segmentos do recorte (ex.: Todos / Pagos / Em aberto). */
  segments: FinanceGroupedViewToolbarSegment[];
  /** Hint contextual alinhado à esquerda na segunda linha. */
  hint: React.ReactNode;
  /** Valor da busca. */
  searchValue: string;
  /** Callback de alteração da busca. */
  onSearchChange: (value: string) => void;
  /** Placeholder do campo de busca. */
  searchPlaceholder?: string;
  /** Slot para o botão/popover de filtros específicos da view. */
  filterSlot: React.ReactNode;
  /** Dimensão de agrupamento (Categoria | Centro de custo). */
  groupBy: CompositionGroupBy;
  onGroupByChange: (value: CompositionGroupBy) => void;
  /** Estado "Expandir tudo" (true = todos abertos). */
  allOpen: boolean;
  onToggleAll: () => void;
  className?: string;
}

export default function FinanceGroupedViewToolbar({
  periodBar,
  segments,
  hint,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filterSlot,
  groupBy,
  onGroupByChange,
  allOpen,
  onToggleAll,
  className,
}: Props) {
  const { valuesVisible, toggleValuesVisible, money } = useFinanceVisibility();

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Linha superior: período + recorte + privacidade */}
      <div className="flex flex-wrap items-center gap-2">
        {periodBar}

        <div
          role="tablist"
          aria-label="Recorte"
          className="flex flex-wrap items-stretch gap-1 rounded-lg border bg-muted/30 p-1 min-h-10"
        >
          {segments.map((segment) => {
            const active = segment.active;
            return (
              <button
                key={segment.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={segment.onClick}
                className={`inline-flex items-baseline gap-1.5 rounded-md px-3 min-h-8 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border border-primary bg-primary/10 text-foreground"
                    : "border border-transparent hover:bg-muted/60"
                }`}
              >
                <span className="text-muted-foreground">{segment.label}</span>
                {segment.amount !== undefined && (
                  <span className="font-semibold whitespace-nowrap">
                    {money(segment.amount)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={toggleValuesVisible}
          aria-label={valuesVisible ? "Ocultar valores" : "Exibir valores"}
          aria-pressed={valuesVisible}
        >
          {valuesVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
      </div>

      {/* Linha inferior: hint + busca + filtros + agrupamento/expansão */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 min-w-[180px] text-sm text-muted-foreground">{hint}</p>

        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full sm:w-56"
        />

        {filterSlot}

        <FinanceGroupingControl
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
          allOpen={allOpen}
          onToggleAll={onToggleAll}
        />
      </div>
    </div>
  );
}
