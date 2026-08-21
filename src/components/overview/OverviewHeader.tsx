import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, CalendarDays, HeartPulse, History, LayoutGrid, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex shrink-0 items-center gap-3 min-w-0">
        <div className="p-2 bg-primary/10 rounded-lg">
          {icon || <LayoutGrid className="h-5 w-5 text-primary" />}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h2>
        {extra}
      </div>

      <div className="flex flex-nowrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="relative">
              <MoreHorizontal className="h-4 w-4 mr-1" />
              Ações
              {scheduledCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm"
                  aria-label={`${scheduledCount} agendamentos ativos`}
                >
                  {scheduledCount > 99 ? "99+" : scheduledCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => navigate("/scheduled")}>
              <CalendarDays className="h-4 w-4 mr-2" />
              Conteúdos agendados
              {scheduledCount > 0 && (
                <span className="ml-auto text-[10px] font-bold text-primary">
                  {scheduledCount > 99 ? "99+" : scheduledCount}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setEvolutionOpen(true);
                loadClients();
              }}
            >
              <Activity className="h-4 w-4 mr-2" />
              Evolução das demandas
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate("/customer-success-sistemas", { state: { from: "/visao-geral" } })}
            >
              <HeartPulse className="h-4 w-4 mr-2" />
              Customer Success
            </DropdownMenuItem>
            {!historyControl && (
              <DropdownMenuItem onClick={() => onRequestOperationalMode?.()}>
                <History className="h-4 w-4 mr-2" />
                Registro de cards
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {historyControl}

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

      <Dialog
        open={evolutionOpen}
        onOpenChange={(o) => {
          setEvolutionOpen(o);
          if (!o) setEvolutionSearch("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Evolução das demandas</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={evolutionSearch}
            onChange={(e) => setEvolutionSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="h-8 text-xs"
          />
          {filteredClients.length === 0 ? (
            <div className="text-[11px] text-muted-foreground px-2 py-3 text-center">
              Nenhum cliente com demandas ativas.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
