import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown } from "lucide-react";
import { loadSystemsClients, type SystemsClient } from "@/lib/systemsClients";

interface SubclientSelectProps {
  tenantId?: string | null;
  parentCompanyId?: string | null;
  /** Ids dos clientes solicitantes vinculados à demanda. */
  value?: string[] | null;
  disabled?: boolean;
  onChange: (subclientIds: string[]) => void;
}

/**
 * Seletor opcional dos clientes finais solicitantes (clientes de uma empresa de
 * Sistemas). Permite marcar mais de um. Só aparece quando a empresa do card tem
 * clientes cadastrados.
 */
export default function SubclientSelect({
  tenantId,
  parentCompanyId,
  value,
  disabled,
  onChange,
}: SubclientSelectProps) {
  const [options, setOptions] = useState<SystemsClient[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!tenantId || !parentCompanyId) {
        setOptions([]);
        return;
      }
      try {
        const list = await loadSystemsClients(tenantId, parentCompanyId);
        if (active) setOptions(list);
      } catch {
        if (active) setOptions([]);
      }
    })();
    return () => { active = false; };
  }, [tenantId, parentCompanyId]);

  const selected = useMemo(() => value || [], [value]);

  const selectedNames = useMemo(
    () => selected
      .map((id) => options.find((o) => o.id === id)?.name)
      .filter(Boolean) as string[],
    [selected, options],
  );

  const label = selectedNames.length === 0
    ? "Sem cliente final"
    : selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames[0]} +${selectedNames.length - 1}`;

  if (options.length === 0) return null;

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    onChange(next);
  };

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
        <PopoverContent align="start" className="w-64 p-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground px-1 pb-2">
            Clientes solicitantes
          </div>
          <div className="space-y-0.5 max-h-64 overflow-auto">
            {options.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(o.id)}
                  onCheckedChange={() => toggle(o.id)}
                />
                <span className="truncate">{o.name}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-1 h-7 text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
