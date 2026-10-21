import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOfficeOverview, type OfficeAreaFilter } from "@/hooks/useOfficeOverview";
import OfficeIsoScene from "@/components/office/OfficeIsoScene";
import OfficeQueueSheet from "@/components/office/OfficeQueueSheet";
import OfficeCardOverlay from "@/components/office/OfficeCardOverlay";
import OfficeAgencyPanel from "@/components/office/OfficeAgencyPanel";
import OfficeMissionPanel from "@/components/office/OfficeMissionPanel";
import { type OfficePerson } from "@/components/office/OfficePeopleLayer";
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
  const worldRef = useRef<HTMLDivElement>(null);
  const stackAnchors = useRef<Map<string, Element>>(new Map());
  const snapshotRef = useRef<AssignmentSnapshot | null>(null);
  const recentRef = useRef<Record<string, number>>({});
  const [transfers, setTransfers] = useState<QueuedTransfer[]>([]);

  const registerStackAnchor = useCallback((userId: string, el: SVGElement | null) => {
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

  const activeStation = useMemo(
    () => stations.find((s) => s.collaborator.userId === queueUserId) || null,
    [stations, queueUserId],
  );

  // Painel da agência: SEMPRE agency-wide (não muda com o filtro de área).
  const queueCounts = useMemo(() => stations.map((s) => s.queueCount), [stations]);
  const pulse = useOfficeAgencyPulse(tenantId, { cards: agencyCards, queueCounts });



  return (
    <div>
      <div ref={worldRef} className="office-iso relative overflow-hidden rounded-2xl border border-border" style={{ height: 'max(720px, calc(100dvh - 100px))' }}>
        <OfficeIsoScene stations={stations} people={people} myId={user?.id} mobile={isMobile}
          onQueue={setQueueUserId} onCard={setOpenCardId} startPress={startPress}
          consumeClickSuppression={consumeClickSuppression} targetUserId={drag?.targetUserId}
          registerStack={registerStackAnchor} />
        <div className="pointer-events-none absolute left-4 right-4 top-4 flex flex-wrap items-start justify-between gap-3">
          {!isMobile && <OfficeMissionPanel level={pulse.level} missions={pulse.missions} doneCount={pulse.missionsDone} total={pulse.missionsTotal} />}
          <OfficeAgencyPanel deliveredToday={pulse.deliveredToday} inProgress={pulse.inProgress} atRisk={pulse.atRisk} awaitingClient={pulse.awaitingClient} progressPct={pulse.progressPct} width={isMobile ? 290 : 340} />
        </div>
        <div className="absolute bottom-4 right-4 flex rounded-xl border bg-card p-1 shadow-lg">
          {AREA_TABS.map(tab => <button key={tab.id} onClick={() => setArea(tab.id)} className={cn("rounded-lg px-3 py-2 text-xs", area === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{tab.label}</button>)}
        </div>
        {loading && <p className="absolute bottom-20 left-4 rounded-lg bg-card p-3 text-sm">Carregando escritório…</p>}
        {!loading && !stations.length && <p className="absolute bottom-20 left-4 rounded-lg bg-card p-3 text-sm">Nenhum colaborador encontrado neste tenant.</p>}
        <OfficeTransferLayer containerRef={worldRef} anchors={stackAnchors} events={transfers} />
      </div>

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
