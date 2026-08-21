import OfficeWorld from "@/components/office/OfficeWorld";
import OfficeDesk from "@/components/office/OfficeDesk";
import { computeDeskSlots, deskBaseWidth } from "@/lib/officeLayout";
import type { OfficeStationData } from "@/hooks/useOfficeOverview";

const card = (t: string, late = false): any => ({
  id: t, title: t, clientId: null, clientName: "Paulo Bianchini", assignedTo: null,
  additionalAssignees: [], functionKey: "criar", stageLabel: "Criar arte", demandType: "estatico",
  workArea: "midia", dueDate: "2026-08-21", dueTime: "09:00", deliveryDate: null, deliveryTime: null,
  isDailyCard: false, startTs: Date.now(), isLate: late,
});
const st = (name: string, q: number, aw: number, working = true): OfficeStationData => ({
  collaborator: { userId: name, fullName: name, avatarUrl: null } as any,
  current: working ? card(`Reel institucional sobre transporte e Tecsolda ${name}`, q > 15) : null,
  next: card("Carrossel de prestação de contas"),
  queue: [], queueCount: q, awaitingClientCount: aw, loadRatio: q / 32,
});
const stations = [st("Henrique Silva", 32, 3), st("Lúcia Prado", 9, 0), st("Marcos Vieira", 3, 1), st("Ana Costa", 0, 0, false)];
export default function OfficePreviewTmp() {
  const slots = computeDeskSlots(stations.length);
  const w = deskBaseWidth(stations.length);
  return (
    <div className="p-3">
      <OfficeWorld>
        <div className="absolute inset-0">
          {stations.map((s, i) => (
            <div key={i} className="absolute" style={{ left: `${slots[i].leftPct}%`, top: `${slots[i].topPct}%`, width: w, zIndex: slots[i].z, transform: `translate(-50%,-100%) scale(${slots[i].scale})`, transformOrigin: "bottom center" }}>
              <OfficeDesk station={s} onOpenCard={() => {}} onOpenQueue={() => {}} />
            </div>
          ))}
        </div>
      </OfficeWorld>
    </div>
  );
}
