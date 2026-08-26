/**
 * EXCEÇÕES DO MÊS — lançamentos IGNORADOS.
 *
 * Ignorar não é excluir e não altera o padrão: a recorrência continua valendo
 * para as próximas datas. O registro fica visível aqui (com data prevista e
 * motivo) para que a ausência seja EXPLICADA, nunca silenciosa — e pode ser
 * restaurado a qualquer momento.
 */
import { useState } from "react";
import { CalendarOff, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SkippedEntry } from "@/lib/financeModel";

interface Props {
  entries: SkippedEntry[];
  onRestore: (occurrenceId: string) => Promise<boolean>;
}

const formatDay = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "sem data prevista";

export default function SkippedEntriesPanel({ entries, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <section className="rounded-lg border border-dashed bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
        <CalendarOff className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">
          Ignorados neste mês ({entries.length})
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Fora dos totais — a recorrência segue normal
        </span>
      </button>

      {open && (
        <ul className="divide-y border-t">
          {entries.map((entry) => (
            <li
              key={entry.occurrence.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.item.name}</p>
                <p className="text-xs text-muted-foreground">
                  Previsto para {formatDay(entry.scheduledDate)}
                  {entry.reason ? ` — ${entry.reason}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === entry.occurrence.id}
                onClick={async () => {
                  setBusyId(entry.occurrence.id);
                  await onRestore(entry.occurrence.id);
                  setBusyId(null);
                }}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                {busyId === entry.occurrence.id ? "Restaurando..." : "Restaurar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
