/**
 * Controle ÚNICO de agrupamento do Financeiro: `Agrupar por` + `Expandir tudo`.
 *
 * Usado igual em `Composição do mês` e `Contas e despesas`. Os filtros de cada
 * tela continuam próprios — só a organização/expansão é compartilhada.
 */
import { ChevronsDown, ChevronsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMPOSITION_GROUP_BY_LABELS,
  CompositionGroupBy,
} from "@/lib/financeGrouping";

interface Props {
  groupBy: CompositionGroupBy;
  onGroupByChange: (value: CompositionGroupBy) => void;
  allOpen: boolean;
  onToggleAll: () => void;
}

export default function FinanceGroupingControl({
  groupBy,
  onGroupByChange,
  allOpen,
  onToggleAll,
}: Props) {
  return (
    <>
      <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as CompositionGroupBy)}>
        <SelectTrigger className="h-10 w-[190px]" aria-label="Agrupar por">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(COMPOSITION_GROUP_BY_LABELS) as CompositionGroupBy[]).map((key) => (
            <SelectItem key={key} value={key}>
              Agrupar por: {COMPOSITION_GROUP_BY_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10"
        aria-pressed={allOpen}
        onClick={onToggleAll}
      >
        {allOpen ? (
          <>
            <ChevronsUp className="w-4 h-4 mr-1.5" /> Recolher tudo
          </>
        ) : (
          <>
            <ChevronsDown className="w-4 h-4 mr-1.5" /> Expandir tudo
          </>
        )}
      </Button>
    </>
  );
}
