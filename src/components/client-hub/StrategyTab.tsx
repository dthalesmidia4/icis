import type { CurrentPeriodInfo } from "@/lib/periodCounts";
import type { WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{children}</h2>
);

interface StrategyTabProps {
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  strategyText: string | null;
  onOpenStrategy: () => void;
  onOpenPeriodHistory: () => void;
}

export default function StrategyTab({
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
    <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-14">
      <div className="space-y-10">
        <section>
          <SectionTitle>Arquitetura do período</SectionTitle>
          {typeEntries.length ? (
            <div className="mt-5 divide-y border-y">
              {typeEntries.map(([type, count]) => {
                const pct = Math.round((count / planItems.length) * 100);
                return (
                  <div key={type} className="py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-base font-bold">{type}</span>
                      <span className="text-xs font-bold tabular-nums text-muted-foreground">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Sem itens no plano deste período ainda.</p>
          )}
        </section>

        <section>
          <SectionTitle>Estratégia geral</SectionTitle>
          {strategyText ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {strategyText.length > 1600 ? `${strategyText.slice(0, 1600)}…` : strategyText}
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma estratégia registrada para este cliente.
            </p>
          )}
          <button
            type="button"
            onClick={onOpenStrategy}
            className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Abrir estratégia completa
          </button>
        </section>
      </div>

      <div className="space-y-10 lg:border-l lg:pl-10">
        <section>
          <SectionTitle>Canais prioritários</SectionTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {channels.length ? (
              channels.map((c) => (
                <span
                  key={c}
                  className="bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary"
                >
                  {c}
                </span>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sem canais definidos no plano.</p>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>Objetivos do ciclo</SectionTitle>
          {objectives.length ? (
            <ol className="mt-4 divide-y border-y">
              {objectives.map((o, i) => (
                <li key={i} className="flex gap-4 py-3">
                  <span className="text-lg font-black leading-none tabular-nums text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{o}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Sem objetivos mapeados.</p>
          )}
          <button
            type="button"
            onClick={onOpenPeriodHistory}
            className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Histórico de períodos
          </button>
        </section>
      </div>
    </div>
  );
}
