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
  period,
  planItems,
  strategyText,
  onOpenStrategy,
  onOpenPeriodHistory,
}: StrategyTabProps) {
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

  const paidBudget = (period?.paid_traffic_budget || "").trim();
  const generalBudget = (period?.budget || "").trim();
  const periodObjective = (period?.objective || "").trim();
  const hasPaidMedia = !!(paidBudget || generalBudget);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-14">
      <div className="space-y-10">
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

      <div className="space-y-10">
        {/* Mídia paga */}
        <section className="bg-primary p-6 text-primary-foreground">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Mídia paga</p>
          {hasPaidMedia ? (
            <>
              <h3 className="mt-3 text-xl font-black leading-tight">
                Fazer cada anúncio cumprir uma função.
              </h3>
              <dl className="mt-5 space-y-3 text-sm">
                {paidBudget && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                    <dt className="opacity-80">Verba de tráfego pago</dt>
                    <dd className="font-bold">{paidBudget}</dd>
                  </div>
                )}
                {generalBudget && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                    <dt className="opacity-80">Orçamento do período</dt>
                    <dd className="font-bold">{generalBudget}</dd>
                  </div>
                )}
              </dl>
              {periodObjective && (
                <p className="mt-4 text-xs leading-relaxed opacity-85">{periodObjective}</p>
              )}
            </>
          ) : (
            <>
              <h3 className="mt-3 text-xl font-black leading-tight">
                Nenhum plano de mídia paga neste período.
              </h3>
              <p className="mt-4 text-xs leading-relaxed opacity-85">
                Quando o período tiver verba de tráfego pago definida no planejamento, a distribuição
                dos anúncios aparece aqui.
              </p>
            </>
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
