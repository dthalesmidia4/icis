export interface GridPoint { x: number; y: number }
export const FLOOR = { width: 18, height: 16 };
export const iso = (x: number, y: number): GridPoint => ({ x: (x - y) * 52, y: (x + y) * 24 });
export function inverseIso(pt: GridPoint, floor = FLOOR): GridPoint {
  return { x: Math.max(0, Math.min(floor.width, (pt.x / 52 + pt.y / 24) / 2)), y: Math.max(0, Math.min(floor.height, (pt.y / 24 - pt.x / 52) / 2)) };
}
// Reference spacing: two staggered rows, extended by pairs for larger teams.
export const deskGrid = (index: number): GridPoint => {
 const sites=[{x:2.05,y:4.12},{x:6.12,y:2.22},{x:3.65,y:6.6},{x:9.3,y:3.75},{x:6.7,y:5.65},{x:9.8,y:6.7}];
 return index<6?sites[index]:{x:2.05+(index-6)%3*3.3,y:10+Math.floor((index-6)/3)*2.9};
};
export const floorForDesks = (count: number) => ({ width: 13, height: Math.max(10, count>6?13+Math.floor((count-7)/3)*2.9:10) });
export const ZONE_SPOTS = { planning: { x: 1.2, y: 2.9 }, review: { x: 1.95, y: 7.1 }, coffee: { x: 11.85, y: 2.4 }, meeting: { x: 8.25, y: 9.4 }, waiting: { x: 3.4, y: 2.4 } };
export function anchorGrid(key: string, users: string[]): GridPoint {
  const [zone, seat] = key.split(':');
  if (zone === 'desk') return deskSeatGrid(Math.max(0, users.indexOf(seat)));
  const p = ZONE_SPOTS[zone as keyof typeof ZONE_SPOTS] || ZONE_SPOTS.coffee;
  return { x: p.x + Number(seat || 0) * .65, y: p.y + 1.3 };
}
export const manualStayMs = ({ idle }: { idle: boolean }) => idle ? 600000 : 45000;
export interface WalkSignature { demands: { id: string; stage: string | null }[]; presenceZone: string }
export function shouldCancelManualWalk(previous: WalkSignature, next: WalkSignature): boolean {
  const normalize = (s: WalkSignature) => JSON.stringify([s.presenceZone, s.demands.map(d => [d.id, d.stage]).sort((a,b) => a[0].localeCompare(b[0]))]);
  return normalize(previous) !== normalize(next);
}
/** Cadeira atrás do tampo (lado da parede), sem invadir o tampo 2.25×1.58. */
export const deskChairGrid = (index: number): GridPoint => { const p = deskGrid(index); return { x: p.x + 0.8, y: p.y - 0.78 }; };
/** Altura física (px) da pilha: cresce com a fila real, comprimida nas grandes. */
export const stackHeight = (count: number) => count <= 0 ? 0 : Math.min(48, Math.round(3 + 7 * Math.sqrt(count)));
export interface GridRect { x0: number; y0: number; x1: number; y1: number }
export const furnitureRects = (deskCount: number): GridRect[] => [
  ...Array.from({ length: deskCount }, (_, i) => { const p = deskGrid(i); return { x0: p.x - .1, y0: p.y - .85, x1: p.x + 2.35, y1: p.y + 1.68 }; }),
  { x0: 6.8, y0: 6.2, x1: 10, y1: 8.4 },
];
/** Destino manual nunca fica sobre mesa ou reunião: empurra para a frente do móvel. */
export function avoidFurniture(pt: GridPoint, rects: GridRect[]): GridPoint {
  const hit = rects.find(r => pt.x > r.x0 && pt.x < r.x1 && pt.y > r.y0 && pt.y < r.y1);
  return hit ? { x: pt.x, y: hit.y1 + 0.25 } : pt;
}
/** Assento do dono: atrás do tampo, centralizado na tela (stationAnchors do HTML = mesa + (-.195,-.53)). */
export const deskSeatGrid = (index: number): GridPoint => { const p = deskGrid(index); return { x: p.x - .195, y: p.y - .53 }; };
/** Duração da caminhada, como no HTML: 290ms por unidade, entre 280ms e 2,2s. */
export const walkDurationMs = (a: GridPoint, b: GridPoint) => Math.max(280, Math.min(2200, Math.hypot(b.x - a.x, b.y - a.y) * 290));
/** Pilha física: até 5 uma folha por demanda, depois compressão controlada (máx. 20). */
export const paperSheets = (count: number) => count <= 0 ? 0 : count <= 5 ? count : Math.min(20, 5 + Math.ceil((count - 5) * .23));
