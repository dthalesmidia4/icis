import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Play, Layers, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOfficeOverview, type OfficeAreaFilter } from "@/hooks/useOfficeOverview";
import { computeDeskSlots, deskBaseWidth } from "@/lib/officeLayout";
import OfficeWorld from "@/components/office/OfficeWorld";
import OfficeDesk from "@/components/office/OfficeDesk";
import OfficeQueueSheet from "@/components/office/OfficeQueueSheet";
import OfficeCardOverlay from "@/components/office/OfficeCardOverlay";
import CoffeeCorner from "@/components/office/CoffeeCorner";
import OfficeTransferLayer, { type QueuedTransfer } from "@/components/office/OfficeTransferLayer";
import {
  buildAssignmentSnapshot,
  dedupeTransfers,
  detectTransfers,
  transferFromRealtime,
  transferKey,
  type AssignmentSnapshot,
  type TransferEvent,
} from "@/lib/officeTransfers";
import { useOfficeDeskPreferences } from "@/hooks/useOfficeDeskPreferences";
import { useAuth } from "@/hooks/useAuth";


const AREA_TABS: { id: OfficeAreaFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "midia", label: "Mídia" },
  { id: "sistemas", label: "Sistemas" },
];

/**
 * Escritório virtual 2.5D: cenário contínuo com mesas, personagens e pilhas
 * físicas de trabalho. Abrir um card acontece SOBRE o cenário (nunca navega
 * para a Visão Geral) — a lógica de dados vem de `useOfficeOverview`.
 */
export default function Office() {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [area, setArea] = useState<OfficeAreaFilter>("all");
  const [queueUserId, setQueueUserId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // Detector de transferência: alimentado pela ÚNICA assinatura realtime do
  // escritório (dentro de `useOfficeOverview`), sem abrir um segundo canal.
  const handleDemandEvent = useCallback(
    (event: { type: string; id: string; new: Record<string, any> | null; old: Record<string, any> | null }) => {
      if (event.type !== "UPDATE" || !event.new) return;
      const rowNew = event.new;
      const rowOld = event.old;
      const { event: transfer, snapshot } = transferFromRealtime(snapshotRef.current, {
        id: event.id,
        title: (rowNew.title as string) || null,
        assignedTo: (rowNew.assigned_to as string) ?? null,
        oldAssignedTo:
          rowOld && "assigned_to" in rowOld ? ((rowOld.assigned_to as string) ?? null) : undefined,
      });
      snapshotRef.current = snapshot;
      if (transfer) enqueueRef.current(transfer);
    },
    [],
  );

  const { stations, cards, totals, loading, refetch } = useOfficeOverview(tenantId, area, {
    onDemandEvent: handleDemandEvent,
  });
  const { byUser: deskObjectsByUser, save: saveDeskObjects } = useOfficeDeskPreferences(tenantId);

  // ---------- animação de transferência (apenas representação visual) ----------
  const worldRef = useRef<HTMLElement>(null);
  const stackAnchors = useRef<Map<string, HTMLElement>>(new Map());
  const snapshotRef = useRef<AssignmentSnapshot | null>(null);
  const recentRef = useRef<Record<string, number>>({});
  const [transfers, setTransfers] = useState<QueuedTransfer[]>([]);

  const registerStackAnchor = useCallback((userId: string, el: HTMLElement | null) => {
    if (el) stackAnchors.current.set(userId, el);
    else stackAnchors.current.delete(userId);
  }, []);

  /** Enfileira eventos já detectados (dedupe compartilhado entre os 2 caminhos). */
  const enqueue = useCallback((detected: TransferEvent[]) => {
    if (detected.length === 0) return;
    const { events, recent } = dedupeTransfers(detected, recentRef.current, Date.now());
    recentRef.current = recent;
    if (events.length === 0) return;
    const stamp = Date.now();
    setTransfers((prev) => [
      ...prev.slice(-12),
      ...events.map((e) => ({ ...e, key: `${transferKey(e)}:${stamp}` })),
    ]);
  }, []);

  // Ponte estável para o callback realtime (evita recriar a assinatura).
  const enqueueRef = useRef<(event: TransferEvent) => void>(() => {});
  useEffect(() => {
    enqueueRef.current = (event: TransferEvent) => enqueue([event]);
  }, [enqueue]);

  // FALLBACK: detector por snapshot depois do refetch (cobre eventos perdidos).
  useEffect(() => {
    if (loading) return;
    const next = buildAssignmentSnapshot(cards);
    // Primeira carga (e troca de filtro/reload) apenas registra o baseline.
    const detected = detectTransfers(snapshotRef.current, next);
    snapshotRef.current = next;
    enqueue(detected);
  }, [cards, loading, enqueue]);

  // Trocar o filtro de área recompõe as estações: reinicia o baseline.
  useEffect(() => {
    snapshotRef.current = null;
  }, [area]);


  // Quem está em micro-pausa aparece na cafeteria (a mesa continua na sala).
  const atCoffee = useMemo(
    () => stations.filter((s) => s.presence.state === "micro_break"),
    [stations],
  );

  const activeStation = useMemo(
    () => stations.find((s) => s.collaborator.userId === queueUserId) || null,
    [stations, queueUserId],
  );

  const slots = useMemo(() => computeDeskSlots(stations.length), [stations.length]);
  const baseWidth = deskBaseWidth(stations.length);

  const metrics = [
    { label: "pessoas", value: totals.people, icon: Users },
    { label: "trabalhando", value: totals.working, icon: Play },
    { label: "na fila", value: totals.queued, icon: Layers },
    { label: "aguardando cliente", value: totals.awaitingClient, icon: Hourglass },
  ];

  return (
    <div>
      {/* ---------- Cenário ---------- */}
      <OfficeWorld
        containerRef={worldRef}
        hud={
          <>
            {/* Apenas o filtro de área permanece no cenário (HUD de métricas
                foi removido para reduzir poluição visual). */}
            <div className="pointer-events-auto absolute bottom-2 right-2 z-40 flex rounded-lg border border-border/40 bg-background/45 p-0.5 opacity-70 backdrop-blur-[2px] transition-opacity hover:opacity-100">
              {AREA_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setArea(tab.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    area === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        }
        upperZone={
          <div className="pointer-events-auto absolute right-3 top-[24%] z-30 hidden sm:block sm:right-8">
            <CoffeeCorner people={loading ? [] : atCoffee} />
          </div>
        }
        overlay={
          <OfficeTransferLayer
            containerRef={worldRef}
            anchors={stackAnchors}
            events={transfers}
          />
        }
      >

        {loading ? (
          <div className="grid h-full grid-cols-2 items-end gap-8 p-8 sm:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : stations.length === 0 ? (
          <p className="py-24 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado neste tenant.
          </p>
        ) : isMobile ? (
          // Mobile: estações empilhadas, sem posicionamento absoluto.
          <div className="flex flex-col gap-6 px-4 pb-6 pt-10">
            {stations.map((station) => (
              <div key={station.collaborator.userId} className="mx-auto w-full max-w-[300px]">
                <OfficeDesk
                  station={station}
                  onOpenCard={setOpenCardId}
                  onOpenQueue={setQueueUserId}
                  deskObjects={deskObjectsByUser[station.collaborator.userId] || []}
                  isSelf={!!user && user.id === station.collaborator.userId}
                  onSaveDeskObjects={(objects) => saveDeskObjects(station.collaborator.userId, objects)}
                  registerStackAnchor={registerStackAnchor}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0">
            {stations.map((station, index) => {
              const slot = slots[index];
              if (!slot) return null;
              return (
                <div
                  key={station.collaborator.userId}
                  className="absolute"
                  style={{
                    left: `${slot.leftPct}%`,
                    top: `${slot.topPct}%`,
                    width: baseWidth,
                    zIndex: slot.z,
                    transform: `translate(-50%, -100%) scale(${slot.scale})`,
                    transformOrigin: "bottom center",
                  }}
                >
                  <OfficeDesk
                    station={station}
                    onOpenCard={setOpenCardId}
                    onOpenQueue={setQueueUserId}
                    deskObjects={deskObjectsByUser[station.collaborator.userId] || []}
                    isSelf={!!user && user.id === station.collaborator.userId}
                    onSaveDeskObjects={(objects) => saveDeskObjects(station.collaborator.userId, objects)}
                  registerStackAnchor={registerStackAnchor}
                  />
                </div>
              );
            })}
          </div>
        )}
      </OfficeWorld>

      <OfficeQueueSheet
        station={activeStation}
        open={!!activeStation}
        onOpenChange={(open) => !open && setQueueUserId(null)}
        onOpenCard={(id) => {
          setQueueUserId(null);
          setOpenCardId(id);
        }}
      />

      <OfficeCardOverlay
        demandId={openCardId}
        tenantId={tenantId}
        onClose={() => setOpenCardId(null)}
        onPersisted={refetch}
      />
    </div>
  );
}
