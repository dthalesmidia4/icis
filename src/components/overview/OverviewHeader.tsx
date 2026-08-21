import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, CalendarDays, HeartPulse, History, LayoutGrid, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Montado apenas sob clique — evita custo no primeiro acesso ao Escritório.
const LazyCreateColumnModal = lazy(() => import("@/components/CreateColumnModal"));
import NewDemandAction from "@/components/overview/NewDemandAction";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDispatchIds } from "@/hooks/useActiveDispatchIds";
import { useSelectedClient } from "@/contexts/SelectedClientContext";

export interface OverviewHeaderClient {
  id: string;
  name: string;
  count: number;
}

interface OverviewHeaderProps {
  tenantId: string | null | undefined;
  title: string;
  icon?: ReactNode;
  /** Badge/indicadores exclusivos do host (ex.: total de demandas, modo foco). */
  extra?: ReactNode;
  modeSelector?: ReactNode;
  /** Lista de clientes com demandas ativas — quando ausente, é buscada aqui. */
  clients?: OverviewHeaderClient[];
  /** Popover de "Registro de cards" do host (Kanban). Ausente = fallback leve. */
  historyControl?: ReactNode;
  /** Fallback do "Registro de cards" quando o host não é o Kanban. */
  onRequestOperationalMode?: () => void;
  /** Pipeline do host; quando ausente é resolvido aqui (pipeline padrão). */
  pipelineId?: string;
  existingPositions?: number[];
  /** Handlers do host — quando ausentes, o header usa fluxos autônomos. */
  onNewDemand?: () => void;
  onNewStatus?: () => void;
  onStatusCreated?: () => void;
  onDemandCreated?: () => void;
}

/**
 * Barra ÚNICA da Visão Geral, compartilhada pelos dois modos
 * (Escritório virtual e Visão geral). É deliberadamente leve: nenhuma
 * consulta do board é feita aqui, apenas o mínimo de cada ação global.
 */
export default function OverviewHeader({
  tenantId,
  title,
  icon,
  extra,
  modeSelector,
  clients,
  historyControl,
  onRequestOperationalMode,
  pipelineId,
  existingPositions,
  onNewDemand,
  onNewStatus,
  onStatusCreated,
  onDemandCreated,
}: OverviewHeaderProps) {
  const navigate = useNavigate();
  const { setSelectedClient } = useSelectedClient();
  const { count: scheduledCount } = useActiveDispatchIds(tenantId);

  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [evolutionSearch, setEvolutionSearch] = useState("");
  const [ownClients, setOwnClients] = useState<OverviewHeaderClient[]>([]);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [ownPipelineId, setOwnPipelineId] = useState<string>("");

  const managesPipeline = !onNewStatus;

  // Pipeline padrão: carregado só quando o header é responsável pelo Novo Status.
  useEffect(() => {
    if (!managesPipeline || !tenantId || pipelineId) return;
    let alive = true;
    supabase
      .from("pipelines")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.id) setOwnPipelineId(data.id);
      });
    return () => {
      alive = false;
    };
  }, [managesPipeline, tenantId, pipelineId]);

  // Clientes com demandas ativas — consulta mínima, só ao abrir o popover.
  const loadClients = useCallback(async () => {
    if (clients || !tenantId) return;
    const [{ data: rows }, { data: companies }] = await Promise.all([
      supabase
        .from("demands")
        .select("client_id")
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .eq("is_draft", false),
      supabase.from("tenant_companies").select("id, name, fantasy_name").eq("tenant_id", tenantId),
    ]);
    const names = new Map<string, string>();
    ((companies || []) as any[]).forEach((c) => {
      if (c?.id) names.set(c.id, c.fantasy_name || c.name || "Cliente");
    });
    const counts = new Map<string, OverviewHeaderClient>();
    ((rows || []) as any[]).forEach((row) => {
      if (!row?.client_id) return;
      const prev = counts.get(row.client_id);
      if (prev) prev.count += 1;
      else counts.set(row.client_id, { id: row.client_id, name: names.get(row.client_id) || "Cliente", count: 1 });
    });
    setOwnClients(Array.from(counts.values()));
  }, [clients, tenantId]);

  const clientList = clients ?? ownClients;
  const term = evolutionSearch.trim().toLowerCase();
  const filteredClients = clientList
    .filter((c) => !term || c.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const openEvolution = async (client: OverviewHeaderClient) => {
    setEvolutionOpen(false);
    setEvolutionSearch("");
    try {
      const { data } = await supabase
        .from("tenant_companies")
        .select(
          "id, name, fantasy_name, cnpj_cpf, email, tenant_id, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, mascot_url",
        )
        .eq("id", client.id)
        .maybeSingle();
      setSelectedClient(
        (data as any) ||
          ({ id: client.id, name: client.name, fantasy_name: client.name, cnpj_cpf: "", email: "" } as any),
      );
    } catch {
      setSelectedClient({
        id: client.id,
        name: client.name,
        fantasy_name: client.name,
        cnpj_cpf: "",
        email: "",
      } as any);
    }
    navigate("/client-evolution", { state: { from: "/visao-geral" } });
  };

  const effectivePipelineId = pipelineId || ownPipelineId;

  return (
    <div className="flex items-center justify-between mb-4 gap-x-3 gap-y-2 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-primary/10 rounded-lg">
          {icon || <LayoutGrid className="h-5 w-5 text-primary" />}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h2>
        {extra}
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/scheduled")}
          title="Ver todos os conteúdos com publicação agendada"
          className="relative"
        >
          <CalendarDays className="h-4 w-4 mr-1" />
          Conteúdos agendados
          {scheduledCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm"
              aria-label={`${scheduledCount} agendamentos ativos`}
            >
              {scheduledCount > 99 ? "99+" : scheduledCount}
            </span>
          )}
        </Button>

        <Popover
          open={evolutionOpen}
          onOpenChange={(o) => {
            setEvolutionOpen(o);
            if (o) loadClients();
            else setEvolutionSearch("");
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" title="Ver a evolução das demandas de um cliente">
              <Activity className="h-4 w-4 mr-1" />
              Evolução das demandas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <div className="text-xs font-semibold text-foreground px-2 py-1">Escolha um cliente</div>
            <div className="text-[11px] text-muted-foreground px-2 pb-2">
              Abre a evolução das demandas do cliente selecionado.
            </div>
            <Input
              autoFocus
              value={evolutionSearch}
              onChange={(e) => setEvolutionSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-8 text-xs mb-2"
            />
            {filteredClients.length === 0 ? (
              <div className="text-[11px] text-muted-foreground px-2 py-3 text-center">
                Nenhum cliente com demandas ativas.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto -mx-1">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openEvolution(c)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-xs"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {c.count} {c.count === 1 ? "ativa" : "ativas"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          title="Customer Success — saúde dos clientes de Sistemas"
          onClick={() => navigate("/customer-success-sistemas", { state: { from: "/visao-geral" } })}
        >
          <HeartPulse className="h-4 w-4 mr-1" />
          Customer Success
        </Button>

        {historyControl ?? (
          <Button
            variant="outline"
            size="sm"
            title="Registro de cards — abre na Visão geral"
            onClick={() => onRequestOperationalMode?.()}
          >
            <History className="h-4 w-4 mr-1" />
            Registro de cards
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => (onNewStatus ? onNewStatus() : setStatusModalOpen(true))}
          disabled={!onNewStatus && !effectivePipelineId}
        >
          <Plus className="h-4 w-4 mr-1" />
          Novo Status
        </Button>

        {onNewDemand ? (
          <Button size="sm" onClick={onNewDemand}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Demanda
          </Button>
        ) : (
          <NewDemandAction tenantId={tenantId} onCreated={onDemandCreated} />
        )}

        {modeSelector}
      </div>

      {managesPipeline && effectivePipelineId && statusModalOpen && (
        <Suspense fallback={null}>
          <LazyCreateColumnModal
            open={statusModalOpen}
            onOpenChange={setStatusModalOpen}
            pipelineId={effectivePipelineId}
            onSuccess={() => onStatusCreated?.()}
            existingPositions={existingPositions || []}
          />
        </Suspense>
      )}
    </div>
  );
}
