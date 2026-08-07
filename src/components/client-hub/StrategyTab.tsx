import { Lightbulb, Target, Radio, ListChecks } from "lucide-react";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";
import type { WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";

interface StrategyTabProps {
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  strategyText: string | null;
  onOpenStrategy: () => void;
  onOpenPeriodHistory: () => void;
}

export default function StrategyTab({
  period,
  planItems,
  strategyText,
  onOpenStrategy,
  onOpenPeriodHistory,
}: StrategyTabProps) {
  const byType = planItems.reduce<Record<string, number>>((acc, item) => {
    const key = item.tipo || "Outros";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  const channels = [
    ...new Set(
      planItems
        .flatMap((i) => (i.canal || "").split(","))
        .map((c) => c.trim())
        .filter(Boolean)
    ),
  ];

  const objectives = [
    ...new Set(planItems.map((i) => (i.objetivo || "").trim()).filter(Boolean)),
  ].slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Arquitetura do período</h2>
          </div>
          {typeEntries.length ? (
            <div className="mt-4 space-y-3">
              {typeEntries.map(([type, count]) => {
                const pct = Math.round((count / planItems.length) * 100);
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{type}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Sem itens no plano deste período ainda.
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Estratégia geral</h2>
          </div>
          {strategyText ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {strategyText.length > 1600 ? `${strategyText.slice(0, 1600)}…` : strategyText}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma estratégia registrada para este cliente.
            </p>
          )}
          <button
            type="button"
            onClick={onOpenStrategy}
            className="mt-4 text-xs font-semibold text-primary hover:underline"
          >
            Abrir estratégia completa
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Canais prioritários</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(channels.length ? channels : (period?.period_title ? [] : [])).map((c) => (
              <span
                key={c}
                className="rounded-full border border-primary/30 bg-background px-3 py-1 text-xs font-medium text-primary"
              >
                {c}
              </span>
            ))}
            {!channels.length && (
              <p className="text-sm text-muted-foreground">Sem canais definidos no plano.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Objetivos do ciclo</h2>
          </div>
          {objectives.length ? (
            <ul className="mt-3 space-y-2">
              {objectives.map((o, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 font-bold text-primary tabular-nums">{i + 1}.</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Sem objetivos mapeados.</p>
          )}
          <button
            type="button"
            onClick={onOpenPeriodHistory}
            className="mt-4 text-xs font-semibold text-primary hover:underline"
          >
            Ver histórico de períodos
          </button>
        </div>
      </div>
    </div>
  );
}
