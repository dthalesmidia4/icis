import { useState } from "react";
import { History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface ClientSendEntry {
  sendNumber: number;
  at: string;
  automatic?: boolean;
}

const fmt = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

interface Props {
  demandId?: string | null;
  /** Fallback quando não há registros no histórico. */
  fallbackSince?: string | null;
  fallbackResendCount?: number | null;
  className?: string;
}

/**
 * Consulta discreta dos envios feitos ao cliente (nº do envio + data/hora).
 * Os dados vêm de `demand_flow_history` (action = 'sent_to_client'),
 * carregados apenas quando o usuário abre o popover.
 */
export const ClientSendHistoryPopover = ({ demandId, fallbackSince, fallbackResendCount, className }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ClientSendEntry[] | null>(null);

  const buildFallback = (): ClientSendEntry[] => {
    if (!fallbackSince) return [];
    return [{ sendNumber: Math.max(1, (Number(fallbackResendCount) || 0) + 1), at: fallbackSince }];
  };

  const load = async () => {
    if (!demandId) {
      setEntries(buildFallback());
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("demand_flow_history" as any)
        .select("created_at, metadata, from_function_key")
        .eq("demand_id", demandId)
        .eq("action", "sent_to_client")
        .order("created_at", { ascending: true });

      const rows = (data as any[]) || [];
      if (rows.length === 0) {
        setEntries(buildFallback());
      } else {
        setEntries(
          rows.map((r, i) => ({
            sendNumber: Number(r?.metadata?.send_number) || i + 1,
            at: r.created_at,
            automatic: !r.from_function_key,
          })),
        );
      }
    } catch {
      setEntries(buildFallback());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ver envios ao cliente"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-blue-500/15 transition",
            className,
          )}
        >
          <History className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold mb-2">Envios ao cliente</p>
        {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!loading && entries && entries.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum envio registrado.</p>
        )}
        {!loading && entries && entries.length > 0 && (
          <ul className="space-y-1.5">
            {entries.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium shrink-0">{e.sendNumber}º envio</span>
                <span className="text-muted-foreground text-right">{fmt(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};
