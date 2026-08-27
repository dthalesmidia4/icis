import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOfficeOverview, type OfficeAreaFilter } from "@/hooks/useOfficeOverview";
import {
  agencyPanelWidthPx,
  computeDeskSlots,
  deskBaseWidth,
  deskMonitorWidthPct,
  richLeftZonePx,
  richRightZonePx,
  richZonesActive,
  stageSize,
  officeSceneScale,
  WALL_HEIGHT_PCT,
  agencyPanelTopPct,
} from "@/lib/officeLayout";

import OfficeWorld from "@/components/office/OfficeWorld";
import OfficeDesk from "@/components/office/OfficeDesk";
import OfficeQueueSheet from "@/components/office/OfficeQueueSheet";
import OfficeCardOverlay from "@/components/office/OfficeCardOverlay";
import CoffeeCorner from "@/components/office/CoffeeCorner";
import PlanningZone from "@/components/office/PlanningZone";
import ReviewZone from "@/components/office/ReviewZone";
import MeetingZone from "@/components/office/MeetingZone";
import WaitingZone from "@/components/office/WaitingZone";
import OfficeAgencyPanel from "@/components/office/OfficeAgencyPanel";
import OfficeMissionPanel from "@/components/office/OfficeMissionPanel";
import OfficePeopleLayer, { type OfficePerson } from "@/components/office/OfficePeopleLayer";
import { anchorKeyFor, resolveOfficeZone, zoneIsVisible, zonePosture } from "@/lib/officeZone";
import { useOfficeAgencyPulse } from "@/hooks/useOfficeAgencyPulse";
import { nextStartLabel } from "@/lib/officePresence";
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
import { toast as sonnerToast } from "sonner";
import { smartAdministrativeReassign } from "@/lib/smartReassign";
import { useExecutionExitGuard } from "@/hooks/useExecutionExitGuard";
import { useOfficeCardDrag } from "@/hooks/useOfficeCardDrag";


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

  const { stations, cards, agencyCards, loading, refetch } = useOfficeOverview(tenantId, area, {
    onDemandEvent: handleDemandEvent,
  });
  const { byUser: deskObjectsByUser, save: saveDeskObjects } = useOfficeDeskPreferences(tenantId);
  const { requestExit, dialog: exitGuardDialog } = useExecutionExitGuard();

  // ---------- arraste por ponteiro (fluxo canônico de reassign) ----------
  const [transferring, setTransferring] = useState(false);

  const stageLabelOf = useCallback(
    (key: string) => cards.find((c) => c.functionKey === key)?.stageLabel || key,
    [cards],
  );

  /**
   * Soltar um card na estação de outro colaborador. NUNCA grava `assigned_to`
   * direto: passa pelo guard de saída de passagem + `smartAdministrativeReassign`
   * (validação de função/etapa, conflito de agenda, histórico e realtime).
   */
  const handleDropCard = useCallback(
    async (demandId: string, targetUserId: string) => {
      if (transferring) return;
      const card = cards.find((c) => c.id === demandId);
      if (!card || card.assignedTo === targetUserId) return;
      const targetName =
        stations.find((s) => s.collaborator.userId === targetUserId)?.collaborator.fullName ||
        "colaborador";

      setTransferring(true);
      try {
        let result: Awaited<ReturnType<typeof smartAdministrativeReassign>> | null = null;
        const guard = await requestExit({
          demandId,
          reason: "office_drag",
          actionLabel: "Transferir",
          cardLabel: card.title,
          perform: async () => {
            result = await smartAdministrativeReassign({
              tenantId: tenantId || "",
              card: {
                id: card.id,
                title: card.title,
                tenant_id: tenantId || null,
                assigned_to: card.assignedTo,
                additional_assignees: card.additionalAssignees,
                current_function_key: card.functionKey,
                demand_type: card.demandType,
                demand_type_key: card.demandTypeKey,
                origin: card.origin,
                work_area: card.workArea,
                due_date: card.dueDate,
                due_time: card.dueTime,
                delivery_date: card.deliveryDate,
                delivery_time: card.deliveryTime,
                publish_date: card.publishDate,
                publish_time: card.publishTime,
                is_daily_card: card.isDailyCard,
              },
              targetUserId,
              targetUserName: targetName,
              functionLabel: card.stageLabel,
              stageLabelOf,
              historySource: "office_drag",
            });
            return result.status === "applied" ? "success" : "failure";
          },
        });
        if (!result) return; // cancelado no aviso: nada foi gravado
        const applied = result as Awaited<ReturnType<typeof smartAdministrativeReassign>>;
        if (applied.status !== "applied" || guard.outcome !== "success") {
          sonnerToast.error(applied.message);
          return;
        }
        applied.softMessages.forEach((m) => sonnerToast.warning(m));
        sonnerToast.success(applied.message);
        // Dispara a animação já aqui (não depende do realtime chegar); o dedupe
        // evita repetir quando o evento/refetch trouxer a mesma transferência.
        if (card.assignedTo && card.assignedTo !== targetUserId) {
          enqueueRef.current({
            demandId: card.id,
            title: card.title,
            fromUserId: card.assignedTo,
            toUserId: targetUserId,
          });
        }
      } catch (e) {
        console.error("[office] transfer error", e);
        sonnerToast.error("Erro ao transferir demanda");
      } finally {
        setTransferring(false);
      }
    },
    [cards, stations, tenantId, requestExit, stageLabelOf, transferring],
  );

  // Arraste por ponteiro: long-press/movimento inicia, mesa sob o cursor recebe.
  const { drag, startPress, consumeClickSuppression } = useOfficeCardDrag({
    onDrop: handleDropCard,
  });

  // ---------- animação de transferência (apenas representação visual) ----------
  // `roomRef` = sala inteira (medida); `worldRef` = PALCO LÓGICO (sistema de
  // coordenadas de personagens e animação — coeso também em ultrawide).
  const roomRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const stackAnchors = useRef<Map<string, HTMLElement>>(new Map());
  const snapshotRef = useRef<AssignmentSnapshot | null>(null);
  const recentRef = useRef<Record<string, number>>({});
  const [transfers, setTransfers] = useState<QueuedTransfer[]>([]);

  const registerStackAnchor = useCallback((userId: string, el: HTMLElement | null) => {
    if (el) stackAnchors.current.set(userId, el);
    else stackAnchors.current.delete(userId);
  }, []);

  // Anchors dos LUGARES das pessoas (mesas + zonas coletivas). A camada de
  // personagens mede estes elementos: nada de offset mágico por zona.
  const personAnchors = useRef<Map<string, HTMLElement>>(new Map());
  const registerPersonAnchor = useCallback((key: string, el: HTMLElement | null) => {
    if (el) personAnchors.current.set(key, el);
    else personAnchors.current.delete(key);
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


  // ---------- ZONAS ESPACIAIS: uma zona por colaborador ----------
  // O resolver decide ONDE a pessoa está (mesa, quadro de planejamento, mesa de
  // revisão, café). A camada de pessoas renderiza UMA instância no anchor daquela
  // zona — a mesa fica com a cadeira vazia, nunca com um clone.
  const zoneByUser = useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveOfficeZone>>();
    stations.forEach((s) =>
      map.set(s.collaborator.userId, resolveOfficeZone({ state: s.presence.state, current: s.current })),
    );
    return map;
  }, [stations]);

  const people = useMemo<OfficePerson[]>(() => {
    const seatIndex: Record<string, number> = {};
    const out: OfficePerson[] = [];
    stations.forEach((station) => {
      const zone = zoneByUser.get(station.collaborator.userId) || "desk";
      if (!zoneIsVisible(zone)) return;
      const index = zone === "desk" ? 0 : (seatIndex[zone] = (seatIndex[zone] ?? -1) + 1);
      const anchorKey = anchorKeyFor(zone, station.collaborator.userId, index);
      if (!anchorKey) return;
      out.push({
        userId: station.collaborator.userId,
        name: station.collaborator.fullName,
        avatarUrl: station.collaborator.avatarUrl,
        working: station.presence.state === "working_now" && !!station.current,
        anchorKey,
        posture: zonePosture(zone),
        caption: zone === "coffee" ? nextStartLabel(station.presence) : null,
      });
    });
    return out;
  }, [stations, zoneByUser]);

  const coffeeCount = useMemo(
    () => people.filter((p) => p.anchorKey.startsWith("coffee:")).length,
    [people],
  );
  const coffeeOverflow = useMemo(
    () =>
      stations.filter((s) => zoneByUser.get(s.collaborator.userId) === "coffee").length - coffeeCount,
    [stations, zoneByUser, coffeeCount],
  );

  const activeStation = useMemo(
    () => stations.find((s) => s.collaborator.userId === queueUserId) || null,
    [stations, queueUserId],
  );

  // Tamanho REAL do mundo (medido só no resize, nunca por frame): define o
  // perfil responsivo das mesas (desktop / large / ultrawide).
  const [roomSize, setRoomSize] = useState({ width: 1440, height: 860 });
  useEffect(() => {
    const el = roomRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setRoomSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zonas laterais (planejamento/revisão à esquerda, café/reunião/espera à
  // direita) só entram no desktop: em telas menores a operação vem primeiro.
  /**
   * PALCO LÓGICO: toda a matemática de composição (mesas, faixas laterais,
   * painel) usa esta largura — nunca a largura bruta da viewport.
   */
  const worldSize = useMemo(() => stageSize(roomSize), [roomSize]);

  const layoutOptions = useMemo(
    () => ({ coffeeCorner: !isMobile, sideZones: !isMobile }),
    [isMobile],
  );
  const slots = useMemo(
    () => computeDeskSlots(stations.length, worldSize, layoutOptions),
    [stations.length, worldSize, layoutOptions],
  );
  const monitorPct = useMemo(() => deskMonitorWidthPct(worldSize), [worldSize]);
  /** Densidade do cenário por perfil (desktop normal nasce compacto). */
  const sceneScale = useMemo(() => officeSceneScale(worldSize), [worldSize]);
  const baseWidth = useMemo(
    () => deskBaseWidth(stations.length, worldSize, layoutOptions),
    [stations.length, worldSize, layoutOptions],
  );
  /** Zonas ricas ativas: define se as faixas laterais são exibidas. */
  const richZones = !isMobile && richZonesActive(stations.length, layoutOptions);

  // Painel da agência: SEMPRE agency-wide (não muda com o filtro de área).
  const queueCounts = useMemo(() => stations.map((s) => s.queueCount), [stations]);
  const pulse = useOfficeAgencyPulse(tenantId, { cards: agencyCards, queueCounts });



  return (
    <div>
      {/* ---------- Cenário ---------- */}
      <OfficeWorld
        containerRef={roomRef}
        stageRef={worldRef}
        stageWidth={worldSize.width}
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
          <>
            {/* PAINEL DA AGÊNCIA na FAIXA FUNCIONAL da parede (sempre
                agency-wide): abaixo de janelas/luminária e acima da 1ª fileira,
                centralizado no PALCO LÓGICO (não na viewport bruta). */}
            <div
              className="pointer-events-none absolute left-1/2 z-30 hidden -translate-x-1/2 sm:block"
              style={{ top: `${agencyPanelTopPct(worldSize)}%` }}
            >
              <OfficeAgencyPanel
                deliveredToday={pulse.deliveredToday}
                inProgress={pulse.inProgress}
                atRisk={pulse.atRisk}
                awaitingClient={pulse.awaitingClient}
                progressPct={pulse.progressPct}
                width={agencyPanelWidthPx(worldSize.width, worldSize)}
              />
            </div>

            {/* QUADRO DE MISSÕES/XP montado na PAREDE superior esquerda: some da
                faixa do piso para deixar de parecer card flutuante. */}
            {richZones && (
              <div
                className="pointer-events-none absolute left-2 top-2 z-30 hidden sm:block"
                style={{ width: richLeftZonePx(worldSize) - 16 }}
              >
                <OfficeMissionPanel
                  level={pulse.level}
                  missions={pulse.missions}
                  doneCount={pulse.missionsDone}
                  total={pulse.missionsTotal}
                />
              </div>
            )}

            {/* FAIXA ESQUERDA (piso): Planejamento + Revisão, com respiro. */}
            {richZones && (
              <div
                className="pointer-events-none absolute bottom-4 left-2 z-30 hidden flex-col sm:flex"
                style={{
                  width: richLeftZonePx(worldSize) - 16,
                  // Densidade por perfil: no desktop normal o respiro entre
                  // Planejamento e Revisão também encolhe (nada de zoom 80%).
                  gap: `${Math.round(28 * sceneScale)}px`,
                }}
              >
                <PlanningZone register={registerPersonAnchor} />
                <ReviewZone register={registerPersonAnchor} />
              </div>
            )}


            {/* FAIXA DIREITA: café + reunião + sala de espera */}
            <div
              className="pointer-events-none absolute right-2 z-30 hidden flex-col items-end gap-4 sm:flex sm:right-3"
              style={{
                width: richRightZonePx(worldSize) - 16,
                top: `calc(${WALL_HEIGHT_PCT}% + 10px)`,
              }}
            >
              <CoffeeCorner
                occupied={loading ? 0 : coffeeCount}
                overflow={loading ? 0 : Math.max(0, coffeeOverflow)}
                register={registerPersonAnchor}
              />
              {richZones && <MeetingZone />}
              {richZones && <WaitingZone count={pulse.awaitingClient} />}
            </div>
          </>
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
                  viewerUserId={user?.id ?? null}
                  monitorPct={monitorPct}
                  onSaveDeskObjects={(objects) => saveDeskObjects(station.collaborator.userId, objects)}
                  registerStackAnchor={registerStackAnchor}
                  registerAnchor={registerPersonAnchor}
                  personAway={zoneByUser.get(station.collaborator.userId) !== "desk"}
                  draggingCardId={drag?.cardId ?? null}
                  isDropTarget={drag?.targetUserId === station.collaborator.userId}
                  onPressCard={startPress}
                  consumeClickSuppression={consumeClickSuppression}
                />
              </div>
            ))}
            <OfficePeopleLayer
              people={people}
              containerRef={worldRef}
              anchors={personAnchors}
              layoutToken={`m:${stations.length}`}
            />
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
                    viewerUserId={user?.id ?? null}
                  monitorPct={monitorPct}
                    onSaveDeskObjects={(objects) => saveDeskObjects(station.collaborator.userId, objects)}
                  registerStackAnchor={registerStackAnchor}
                  registerAnchor={registerPersonAnchor}
                  personAway={zoneByUser.get(station.collaborator.userId) !== "desk"}
                  draggingCardId={drag?.cardId ?? null}
                  isDropTarget={drag?.targetUserId === station.collaborator.userId}
                  onPressCard={startPress}
                  consumeClickSuppression={consumeClickSuppression}
                  />
                </div>
              );
            })}

            {/* CAMADA ÚNICA DE PERSONAGENS (posicionada pelos anchors medidos) */}
            <OfficePeopleLayer
              people={people}
              containerRef={worldRef}
              anchors={personAnchors}
              layoutToken={`${worldSize.width}x${worldSize.height}:${stations.length}:${richZones}`}
            />
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
        onPressCard={startPress}
        consumeClickSuppression={consumeClickSuppression}
        dragging={!!drag}
      />

      <OfficeCardOverlay
        demandId={openCardId}
        tenantId={tenantId}
        onClose={() => setOpenCardId(null)}
        onPersisted={refetch}
      />

      {/* Ghost do card sob o cursor (pointer-events-none para o elementFromPoint
          continuar enxergando as mesas embaixo). */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[100] max-w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary/60 bg-card/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-lg"
          style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -50%) rotate(-3deg)" }}
        >
          <span className="line-clamp-2">{drag.title}</span>
        </div>
      )}

      {exitGuardDialog}
    </div>
  );
}
