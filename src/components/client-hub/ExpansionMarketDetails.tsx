import { ArrowRight } from "lucide-react";
import {
  isBaseMarket,
  marketBudgetLabel,
  marketDate,
  marketVisitWindow,
  marketWindow,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import type { MarketCommercialStats, MarketLead } from "@/lib/commercialMarketActivity";
import { stageLabel } from "@/lib/systemsClients";

/**
 * Detalhe expandido de uma praça: carteira comercial (os MESMOS registros do
 * Comercial), execução planejada × realizada e contexto local. Nunca cria CRM
 * paralelo nem copia lead.
 */
export default function ExpansionMarketDetails({
  market,
  stats,
  leads,
  activationsCount,
  allocatedBudget,
  onOpenLead,
  onOpenCommercial,
  onOpenPaidMedia,
}: {
  market: ExpansionMarket;
  stats: MarketCommercialStats;
  leads: MarketLead[];
  activationsCount: number;
  allocatedBudget: number;
  onOpenLead: (leadId: string) => void;
  onOpenCommercial: () => void;
  onOpenPaidMedia?: () => void;
}) {
  const base = isBaseMarket(market);
  const planned = market.paid_traffic_budget;
  const available = planned === null || planned === undefined ? null : planned - allocatedBudget;

  return (
    <div className="grid gap-6 border-l-2 border-primary pl-4 lg:grid-cols-2">
      <section>
        <Title>Carteira comercial</Title>
        {leads.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum registro vinculado a esta praça ainda. O vínculo é sempre explícito no
            Comercial.
          </p>
        ) : (
          <ul className="mt-2 divide-y border-y text-sm">
            {leads.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-bold">{lead.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {lead.lifecycle === "customer"
                        ? "Cliente"
                        : stageLabel(lead.commercial_stage)}
                    </span>
                    {lead.current_system && (
                      <span className="text-xs text-muted-foreground">
                        Sistema atual: {lead.current_system}
                      </span>
                    )}
                  </div>
                  {lead.last_contact_result && (
                    <p className="text-xs text-muted-foreground">
                      Último resultado: {lead.last_contact_result}
                    </p>
                  )}
                  {lead.next_action && (
                    <p className="text-xs text-muted-foreground">
                      Próxima ação: {lead.next_action}
                      {lead.next_action_at
                        ? ` · ${new Date(lead.next_action_at).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenLead(lead.id)}
                  className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-primary hover:underline"
                >
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onOpenCommercial}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-primary hover:underline"
        >
          Abrir Comercial nesta praça
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>

      <div className="space-y-6">
        <section>
          <Title>Execução comercial</Title>
          <dl className="mt-2 divide-y border-y text-sm">
            <Line
              label="Ligações"
              planned={
                market.calls_start_date ? marketDate(market.calls_start_date) : "Sem janela planejada"
              }
              real={`${stats.calls} realizadas`}
            />
            <Line
              label="Visitas"
              planned={
                market.visits_start_date || market.visits_end_date
                  ? marketVisitWindow(market.visits_start_date, market.visits_end_date)
                  : "Sem janela planejada"
              }
              real={`${stats.visits} realizadas`}
            />
            <Line label="Demonstrações" planned="Sob demanda" real={`${stats.demos} realizadas`} />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.lastTouchAt
              ? `Última atividade real: ${new Date(stats.lastTouchAt).toLocaleDateString("pt-BR")}`
              : "Nenhuma atividade comercial registrada ainda."}
          </p>
        </section>

        <section>
          <Title>{base ? "Contexto da base" : "Planejamento da praça"}</Title>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            {(market.objective || "").trim() && (
              <p>
                <b className="text-foreground">Objetivo local: </b>
                {market.objective}
              </p>
            )}
            {market.channels.length > 0 && (
              <p>
                <b className="text-foreground">Canais: </b>
                {market.channels.join(", ")}
              </p>
            )}
            {(market.acquisition_strategy || "").trim() && (
              <p>
                <b className="text-foreground">Abordagem: </b>
                {market.acquisition_strategy}
              </p>
            )}
            {(market.observations || "").trim() && (
              <p>
                <b className="text-foreground">Observações: </b>
                {market.observations}
              </p>
            )}
            {!(market.objective || market.acquisition_strategy || market.observations) &&
              market.channels.length === 0 && <p>Sem contexto local registrado.</p>}
          </div>
        </section>

        <section>
          <Title>Mídia paga</Title>
          {base && planned === null && activationsCount === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sem plano pago definido para a base.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <Info label="Janela" value={marketWindow(market.ads_start_date, market.ads_end_date)} />
                <Info label="Verba planejada" value={marketBudgetLabel(planned)} />
                <Info label="Alocado" value={marketBudgetLabel(allocatedBudget)} />
                <Info
                  label="Disponível"
                  value={available === null ? "A definir" : marketBudgetLabel(available)}
                />
                <Info label="Ativações" value={String(activationsCount)} />
              </div>
              {onOpenPaidMedia && (
                <button
                  type="button"
                  onClick={onOpenPaidMedia}
                  className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-primary hover:underline"
                >
                  Planejar mídia desta praça
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
    {children}
  </p>
);

const Line = ({
  label,
  planned,
  real,
}: {
  label: string;
  planned: string;
  real: string;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
    <dt className="font-bold">{label}</dt>
    <dd className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
      <span>Planejado: {planned}</span>
      <span className="text-foreground">{real}</span>
    </dd>
  </div>
);

const Info = ({ label, value }: { label: string; value: string }) => (
  <span className="whitespace-nowrap text-muted-foreground">
    <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label} </span>
    <span className="tabular-nums text-foreground">{value}</span>
  </span>
);
