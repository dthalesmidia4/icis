import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { loadSystemsClients, type SystemsClient } from "@/lib/systemsClients";

const NONE = "__none__";

interface SubclientSelectProps {
  tenantId?: string | null;
  parentCompanyId?: string | null;
  value?: string | null;
  disabled?: boolean;
  onChange: (subclientId: string | null) => void;
}

/**
 * Seletor opcional do cliente final atendido (clientes de uma empresa de
 * Sistemas). Só aparece quando a empresa do card tem clientes cadastrados.
 */
export default function SubclientSelect({
  tenantId,
  parentCompanyId,
  value,
  disabled,
  onChange,
}: SubclientSelectProps) {
  const [options, setOptions] = useState<SystemsClient[]>([]);

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

  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select
        value={value || NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger
          className="h-7 text-sm border-0 shadow-none bg-transparent px-1.5 gap-1 hover:bg-background/60 focus:ring-0 w-auto min-w-[130px]"
          aria-label="Cliente atendido"
          title="Cliente final atendido (opcional)"
        >
          <SelectValue placeholder="Cliente atendido" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sem cliente final</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
