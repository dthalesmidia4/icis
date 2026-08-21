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

/**
 * Escritório virtual (READ-ONLY): visão espacial dos mesmos dados da
 * Visão Geral. Nenhuma edição acontece aqui — cliques abrem o card real
 * em `/kanban-central?openCard=true&highlight=<id>`.
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
    { label: "Pessoas no escritório", value: totals.people, icon: Users },
    { label: "Em execução agora", value: totals.working, icon: Play },
    { label: "Na fila", value: totals.queued, icon: Layers },
    { label: "Aguardando cliente", value: totals.awaitingClient, icon: Hourglass },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <m.icon className="h-3.5 w-3.5" />
              <span className="truncate">{m.label}</span>
            </div>
            <p className="mt-1 text-2xl font-semibold">{m.value}</p>
          </div>
        ))}
      </section>

      {/* Ambiente / piso */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-muted/30 p-4 sm:p-6"
        aria-label="Planta do escritório"
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full text-border/50"
          aria-hidden="true"
        >
          <defs>
            <pattern id="office-floor" width="56" height="56" patternTransform="skewX(-14)" patternUnits="userSpaceOnUse">
              <path d="M56 0H0V56" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#office-floor)" />
        </svg>

        <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}

          {!loading &&
            stations.map((station) => (
              <OfficeStation
                key={station.collaborator.userId}
                station={station}
                onOpenCard={openCard}
                onOpenQueue={setQueueUserId}
              />
            ))}

          {!loading && stations.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
              Nenhum colaborador encontrado neste tenant.
            </p>
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
