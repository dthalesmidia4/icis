import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SystemsClientHealth, TimelineTouchpoint } from "@/lib/clientHealth";
import { touchpointLabel } from "@/lib/recordTouchpoint";

interface Props {
  rows: SystemsClientHealth[];
  timeline: Record<string, TimelineTouchpoint[]>;
  days?: number;
  onSelect?: (row: SystemsClientHealth) => void;
}

const DAY = 86_400_000;

const TYPE_TONE: Record<string, string> = {
  solicitacao: "bg-primary",
  visita: "bg-emerald-600",
  reuniao: "bg-sky-600",
  ligacao: "bg-indigo-500",
  mensagem: "bg-teal-500",
  treinamento: "bg-violet-500",
  entrega: "bg-amber-500",
  feedback: "bg-rose-500",
  outro: "bg-muted-foreground",
};

/**
 * Linha do tempo de contatos por cliente com a "margem desejada": blocos de
 * cadência sombreados — claros quando houve contato, marcados quando houve gap.
 */
export function TouchpointTimeline({ rows, timeline, days = 90, onSelect }: Props) {
  const end = useMemo(() => Date.now(), []);
  const start = end - days * DAY;

  const ticks = useMemo(() => {
    const out: { pct: number; label: string }[] = [];
    for (let i = days; i >= 0; i -= 15) {
      const d = new Date(end - i * DAY);
      out.push({
        pct: ((days - i) / days) * 100,
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      });
    }
    return out;
  }, [days, end]);

  const pctOf = (iso: string) =>
    Math.max(0, Math.min(100, ((new Date(iso).getTime() - start) / (end - start)) * 100));

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <span className="text-xs font-semibold uppercase">Linha do tempo de contatos · {days} dias</span>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-emerald-500/20" /> dentro da cadência
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-red-500/20" /> gap sem contato
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* eixo */}
          <div className="relative h-6 ml-40 mr-3 border-b">
            {ticks.map((t) => (
              <span
                key={t.label + t.pct}
                className="absolute top-1 -translate-x-1/2 text-[10px] text-muted-foreground"
                style={{ left: `${t.pct}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>

          {rows.map((row) => {
            const cadence = Math.max(1, row.cadenceDays);
            const tps = timeline[row.clientId] || [];
            const blocks: { left: number; width: number; hit: boolean }[] = [];
            for (let offset = days; offset > 0; offset -= cadence) {
              const bStart = end - offset * DAY;
              const bEnd = Math.min(end, bStart + cadence * DAY);
              const hit = tps.some((t) => {
                const ts = new Date(t.occurredAt).getTime();
                return ts >= bStart && ts < bEnd;
              });
              blocks.push({
                left: ((bStart - start) / (end - start)) * 100,
                width: ((bEnd - bStart) / (end - start)) * 100,
                hit,
              });
            }

            return (
              <div
                key={row.clientId}
                className="flex items-center gap-2 py-1.5 pr-3 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                onClick={() => onSelect?.(row)}
              >
                <div className="w-40 shrink-0 px-3 text-xs truncate" title={row.clientName}>
                  {row.clientName}
                </div>
                <div className="relative flex-1 h-8 rounded bg-muted/30">
                  {blocks.map((b, i) => (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 h-full border-r border-background/80",
                        b.hit ? "bg-emerald-500/20" : "bg-red-500/15",
                      )}
                      style={{ left: `${b.left}%`, width: `${b.width}%` }}
                      title={`Janela de ${cadence} dias — ${b.hit ? "com contato" : "sem contato"}`}
                    />
                  ))}
                  {tps.map((t, i) => (
                    <span
                      key={i}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                        TYPE_TONE[t.type] || TYPE_TONE.outro,
                      )}
                      style={{ left: `${pctOf(t.occurredAt)}%` }}
                      title={`${touchpointLabel(t.type)} · ${new Date(t.occurredAt).toLocaleString("pt-BR")}${t.summary ? `\n${t.summary}` : ""}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum cliente para exibir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
