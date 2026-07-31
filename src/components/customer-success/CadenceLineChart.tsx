import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildCadenceSeries, type SystemsClientHealth, type TimelineTouchpoint } from "@/lib/clientHealth";
import { touchpointLabel } from "@/lib/recordTouchpoint";
import { cn } from "@/lib/utils";

interface Props {
  rows: SystemsClientHealth[];
  timeline: Record<string, TimelineTouchpoint[]>;
  days: number;
}

const LINE_COLORS = [
  "hsl(var(--primary))",
  "hsl(160 84% 39%)",
  "hsl(24 95% 53%)",
  "hsl(280 65% 60%)",
  "hsl(199 89% 48%)",
  "hsl(340 75% 55%)",
];

/**
 * Gráfico de linha "dias desde o último contato" com a faixa desejável
 * sombreada (0 → cadência), atenção (até 2x) e risco (acima).
 */
export function CadenceLineChart({ rows, timeline, days }: Props) {
  const [focused, setFocused] = useState<string | null>(null);

  const { points, contactsByDay } = useMemo(
    () => buildCadenceSeries(rows, timeline, days),
    [rows, timeline, days],
  );

  const cadences = rows.map((r) => Math.max(1, r.cadenceDays));
  const cadence = focused
    ? Math.max(1, rows.find((r) => r.clientId === focused)?.cadenceDays ?? 30)
    : cadences.length
      ? cadences.sort((a, b) => a - b)[Math.floor(cadences.length / 2)]
      : 30;
  const mixedCadence = new Set(cadences).size > 1;

  const maxValue = points.reduce((max, p) => {
    rows.forEach((r) => {
      const v = p[r.clientId];
      if (typeof v === "number" && v > max) max = v;
    });
    return max;
  }, cadence * 2);
  const yMax = Math.ceil((maxValue + 2) / 5) * 5;

  const colorOf = (clientId: string) =>
    LINE_COLORS[rows.findIndex((r) => r.clientId === clientId) % LINE_COLORS.length];

  const tickInterval = points.length <= 14 ? 0 : Math.max(1, Math.floor(points.length / 8));

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase">
          Dias sem contato · últimos {days} dias
        </span>
        <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-emerald-500/25" /> faixa desejável (até {cadence}d)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-amber-500/25" /> atenção
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded bg-red-500/20" /> risco
          </span>
        </div>
      </div>

      <div className="h-[320px] px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <ReferenceArea y1={0} y2={cadence} fill="hsl(160 84% 39%)" fillOpacity={0.12} />
            <ReferenceArea y1={cadence} y2={cadence * 2} fill="hsl(38 92% 50%)" fillOpacity={0.12} />
            <ReferenceArea y1={cadence * 2} y2={yMax} fill="hsl(0 84% 60%)" fillOpacity={0.1} />
            <ReferenceLine
              y={cadence}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{
                value: `meta ${cadence}d`,
                position: "insideTopRight",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
              }}
            />
            <XAxis
              dataKey="label"
              interval={tickInterval}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
              width={32}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-xs space-y-1">
                    <div className="font-semibold">{String(label)}</div>
                    {payload.map((p) => {
                      const clientId = String(p.dataKey);
                      const row = rows.find((r) => r.clientId === clientId);
                      const contacts = contactsByDay[clientId]?.[String(label)] || [];
                      return (
                        <div key={clientId}>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: p.color as string }}
                            />
                            <span>{row?.clientName || clientId}</span>
                            <span className="text-muted-foreground">
                              · {Number(p.value)}d sem contato
                            </span>
                          </div>
                          {contacts.map((c, i) => (
                            <div key={i} className="ml-3.5 text-muted-foreground">
                              contato: {touchpointLabel(c.type as never)}{" "}
                              {new Date(c.occurredAt).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {rows
              .filter((r) => !focused || r.clientId === focused)
              .map((r) => (
                <Line
                  key={r.clientId}
                  type="monotone"
                  dataKey={r.clientId}
                  name={r.clientName}
                  stroke={colorOf(r.clientId)}
                  strokeWidth={2}
                  dot={(props: any) => {
                    const hasContact =
                      (contactsByDay[r.clientId]?.[String(props.payload?.label)] || []).length > 0;
                    if (!hasContact) return <g key={props.key} />;
                    return (
                      <circle
                        key={props.key}
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill={colorOf(r.clientId)}
                        stroke="hsl(var(--background))"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t">
        {rows.map((r) => (
          <button
            key={r.clientId}
            type="button"
            onClick={() => setFocused((prev) => (prev === r.clientId ? null : r.clientId))}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
              focused === r.clientId ? "bg-muted font-semibold" : "hover:bg-muted/60",
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(r.clientId) }} />
            {r.clientName}
          </button>
        ))}
        {mixedCadence && (
          <span className="text-[10px] text-muted-foreground">
            cadências diferentes entre clientes — faixas usam {cadence}d
            {focused ? " (cliente selecionado)" : " (mediana)"}
          </span>
        )}
      </div>
    </div>
  );
}
