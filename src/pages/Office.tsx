import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, Users, Play, Layers, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfficeOverview, type OfficeAreaFilter } from "@/hooks/useOfficeOverview";
import OfficeStation from "@/components/office/OfficeStation";
import OfficeQueueSheet from "@/components/office/OfficeQueueSheet";

const AREA_TABS: { id: OfficeAreaFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "midia", label: "Mídia" },
  { id: "sistemas", label: "Sistemas" },
];

/** Grid da sala conforme quantidade de pessoas (uma única sala, sem scroll horizontal). */
function roomGridClass(count: number) {
  if (count <= 2) return "grid-cols-1 sm:grid-cols-2 gap-8 lg:gap-14";
  if (count <= 4) return "grid-cols-2 gap-6 lg:gap-12";
  if (count <= 8) return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-8";
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6";
}

/**
 * Escritório virtual 2D (READ-ONLY): uma única sala com piso, paredes e móveis.
 * Nenhuma edição acontece aqui — cliques abrem o card real na Visão Geral.
 */
export default function Office() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [area, setArea] = useState<OfficeAreaFilter>("all");
  const [queueUserId, setQueueUserId] = useState<string | null>(null);

  const { stations, totals, loading } = useOfficeOverview(tenantId, area);

  const activeStation = useMemo(
    () => stations.find((s) => s.collaborator.userId === queueUserId) || null,
    [stations, queueUserId],
  );

  const openCard = (cardId: string) => {
    navigate(`/kanban-central?openCard=true&highlight=${cardId}`);
  };

  const metrics = [
    { label: "pessoas", value: totals.people, icon: Users },
    { label: "trabalhando", value: totals.working, icon: Play },
    { label: "na fila", value: totals.queued, icon: Layers },
    { label: "aguardando cliente", value: totals.awaitingClient, icon: Hourglass },
  ];

  const large = stations.length > 0 && stations.length <= 4;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Escritório</h1>
          <p className="text-sm text-muted-foreground">
            Visão espacial da operação — somente leitura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {AREA_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setArea(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  area === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/kanban-central")}>
            <LayoutGrid className="mr-2 h-4 w-4" /> Visão operacional
          </Button>
        </div>
      </header>

      {/* Faixa de status do escritório (compacta, secundária) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <m.icon className="h-3.5 w-3.5" />
            <span className="text-sm font-semibold tabular-nums text-foreground">{m.value}</span>
            <span>{m.label}</span>
          </div>
        ))}
      </div>

      {/* ================= SALA ================= */}
      <section
        aria-label="Planta do escritório"
        className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-muted/70 via-muted/30 to-muted/50 shadow-inner"
      >
        {/* Parede de fundo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/80 to-transparent sm:h-56"
        />
        {/* Rodapé da parede */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-36 hidden h-1.5 bg-foreground/10 sm:top-52 sm:block"
        />

        {/* Decoração da parede: janela, quadros, prateleira, planta */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-52 sm:block">
          {/* janela */}
          <div className="absolute left-8 top-8 h-24 w-40 rounded-md border-2 border-foreground/15 bg-gradient-to-br from-primary/15 to-background/60">
            <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-foreground/15" />
            <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-foreground/15" />
          </div>
          {/* quadros */}
          <div className="absolute left-56 top-10 h-14 w-12 rounded-sm border-2 border-foreground/15 bg-background/50" />
          <div className="absolute left-[17.5rem] top-16 h-10 w-16 rounded-sm border-2 border-foreground/15 bg-background/40" />
          {/* prateleira com livros */}
          <div className="absolute right-10 top-14 w-40">
            <div className="flex items-end gap-1 pl-2">
              <span className="h-8 w-2 rounded-sm bg-primary/50" />
              <span className="h-6 w-2 rounded-sm bg-foreground/25" />
              <span className="h-9 w-2.5 rounded-sm bg-primary/35" />
              <span className="h-5 w-2 rounded-sm bg-foreground/20" />
              <span className="h-7 w-2 rounded-sm bg-primary/25" />
            </div>
            <div className="h-1.5 w-full rounded-sm bg-foreground/20" />
          </div>
          {/* planta */}
          <div className="absolute right-4 top-24 flex flex-col items-center">
            <span className="h-8 w-1 rounded bg-foreground/25" />
            <span className="-mt-9 h-6 w-6 -rotate-45 rounded-full bg-primary/30" />
            <span className="-mt-4 ml-5 h-5 w-5 rotate-45 rounded-full bg-primary/25" />
            <span className="mt-2 h-4 w-6 rounded-b-md bg-foreground/25" />
          </div>
        </div>

        {/* Piso isométrico sutil */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 top-24 h-auto w-full text-foreground/[0.07] sm:top-40"
        >
          <defs>
            <pattern
              id="office-floor-tiles"
              width="72"
              height="40"
              patternUnits="userSpaceOnUse"
              patternTransform="skewX(-22)"
            >
              <path d="M72 0H0V40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#office-floor-tiles)" />
        </svg>

        {/* Estações posicionadas dentro da sala */}
        <div className="relative px-3 pb-8 pt-6 sm:px-8 sm:pb-14 sm:pt-24">
          {loading ? (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : stations.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nenhum colaborador encontrado neste tenant.
            </p>
          ) : (
            <div className={cn("grid items-end", roomGridClass(stations.length))}>
              {stations.map((station) => (
                <OfficeStation
                  key={station.collaborator.userId}
                  station={station}
                  onOpenCard={openCard}
                  onOpenQueue={setQueueUserId}
                  large={large}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <OfficeQueueSheet
        station={activeStation}
        open={!!activeStation}
        onOpenChange={(open) => !open && setQueueUserId(null)}
        onOpenCard={(id) => {
          setQueueUserId(null);
          openCard(id);
        }}
      />
    </div>
  );
}
