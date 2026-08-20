import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronDown } from "lucide-react";
import {
  loadActiveSystemsClients,
  loadSystemsSubclientsByIds,
  type SystemsClient,
} from "@/lib/systemsClients";
import {
  buildSubclientOptions,
  clearActiveSelection,
  toggleSubclient,
  selectedLabelNames,
} from "@/lib/subclientSelection";

interface SubclientSelectProps {
  tenantId?: string | null;
  parentCompanyId?: string | null;
  /** Ids dos clientes solicitantes vinculados à demanda. */
  value?: string[] | null;
  disabled?: boolean;
  onChange: (subclientIds: string[]) => void;
}

/**
 * Seletor dos clientes finais solicitantes (clientes de uma empresa de Sistemas).
 * Novas opções são apenas customers ativos; vínculos históricos já gravados
 * continuam visíveis (somente leitura) e nunca são apagados.
 */
export default function SubclientSelect({
  tenantId,
  parentCompanyId,
  value,
  disabled,
  onChange,
}: SubclientSelectProps) {
  const [activeOptions, setActiveOptions] = useState<SystemsClient[]>([]);
  const [linkedRecords, setLinkedRecords] = useState<SystemsClient[]>([]);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => value || [], [value]);
  const selectedKey = useMemo(() => selected.join(","), [selected]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!tenantId) {
        setActiveOptions([]);
        setLinkedRecords([]);
        return;
      }
      const ids = selectedKey ? selectedKey.split(",") : [];
      const [act, linked] = await Promise.all([
        parentCompanyId
          ? loadActiveSystemsClients(tenantId, parentCompanyId).catch(() => [])
          : Promise.resolve<SystemsClient[]>([]),
        loadSystemsSubclientsByIds(tenantId, ids).catch(() => []),
      ]);
      if (!active) return;
      setActiveOptions(act);
      setLinkedRecords(linked);
    })();
    return () => {
      active = false;
    };
  }, [tenantId, parentCompanyId, selectedKey]);

  const options = useMemo(
    () => buildSubclientOptions(activeOptions, linkedRecords, selected),
    [activeOptions, linkedRecords, selected],
  );

  const selectedNames = useMemo(
    () => selectedLabelNames(options, selected),
    [options, selected],
  );

  const label = selectedNames.length === 0
    ? "Sem cliente final"
    : selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames[0]} +${selectedNames.length - 1}`;

  if (options.length === 0) return null;

  const hasClearableActive = clearActiveSelection(options, selected).length < selected.length;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-sm px-1.5 gap-1 font-normal hover:bg-background/60"
            aria-label="Clientes solicitantes"
            title={selectedNames.length > 0 ? selectedNames.join(", ") : "Clientes solicitantes (opcional)"}
          >
            <span className={selectedNames.length === 0 ? "text-muted-foreground" : undefined}>
              {label}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground px-1 pb-2">
            Clientes solicitantes
          </div>
          <div className="space-y-0.5 max-h-64 overflow-auto">
            {options.map((o) =>
              o.legacy ? (
                <div
                  key={o.id}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm opacity-70"
                  title="Vínculo anterior — mantido para histórico, não selecionável"
                >
                  <Checkbox checked disabled />
                  <span className="truncate">{o.name}</span>
                  {o.contextBadge && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {o.contextBadge}
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                    Vínculo anterior
                  </span>
                </div>
              ) : (
                <label
                  key={o.id}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(o.id)}
                    onCheckedChange={() => onChange(toggleSubclient(options, selected, o.id))}
                  />
                  <span className="truncate">{o.name}</span>
                </label>
              ),
            )}
          </div>
          {hasClearableActive && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 h-7 text-xs text-muted-foreground"
              onClick={() => onChange(clearActiveSelection(options, selected))}
            >
              Limpar seleção
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
