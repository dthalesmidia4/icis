export interface GridPoint { x: number; y: number }
export const FLOOR = { width: 18, height: 16 };
export const iso = (x: number, y: number): GridPoint => ({ x: (x - y) * 42, y: (x + y) * 22 });
export function inverseIso(pt: GridPoint, floor = FLOOR): GridPoint {
  return { x: Math.max(0, Math.min(floor.width, (pt.x / 42 + pt.y / 22) / 2)), y: Math.max(0, Math.min(floor.height, (pt.y / 22 - pt.x / 42) / 2)) };
}
export const deskGrid = (index: number): GridPoint => ({ x: 5 + index % 3 * 3.4, y: 4 + Math.floor(index / 3) * 3 });
export const floorForDesks = (count: number) => ({ width: 18, height: Math.max(16, 6 + Math.ceil(count / 3) * 3) });
export const ZONE_SPOTS = { planning: { x: 1.7, y: 4 }, review: { x: 1.7, y: 9 }, coffee: { x: 14.8, y: 2 }, meeting: { x: 15, y: 8 }, waiting: { x: 15, y: 13 } };
export function anchorGrid(key: string, users: string[]): GridPoint {
  const [zone, seat] = key.split(':');
  if (zone === 'desk') { const p = deskGrid(Math.max(0, users.indexOf(seat))); return { x: p.x + 0.8, y: p.y + 1.3 }; }
  const p = ZONE_SPOTS[zone as keyof typeof ZONE_SPOTS] || ZONE_SPOTS.coffee;
  return { x: p.x + Number(seat || 0) * .65, y: p.y + 1.3 };
}
export const manualStayMs = ({ idle }: { idle: boolean }) => idle ? 600000 : 45000;
export interface WalkSignature { demands: { id: string; stage: string | null }[]; presenceZone: string }
export function shouldCancelManualWalk(previous: WalkSignature, next: WalkSignature): boolean {
  const normalize = (s: WalkSignature) => JSON.stringify([s.presenceZone, s.demands.map(d => [d.id, d.stage]).sort((a,b) => a[0].localeCompare(b[0]))]);
  return normalize(previous) !== normalize(next);
}
