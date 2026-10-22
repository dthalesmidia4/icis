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
  if (zone === 'coffee') return coffeeRugSpot(Number(seat || 0));
  const p = ZONE_SPOTS[zone as keyof typeof ZONE_SPOTS] || ZONE_SPOTS.coffee;
  return { x: p.x + Number(seat || 0) * .65, y: p.y + 1.3 };
}
/** Tapete do café: x 10.48–12.73, y .65–2.65; balcão ocupa y até ~1.66. Pessoas ficam na faixa livre do tapete. */
export const COFFEE_RUG = { x0: 10.48, y0: .65, x1: 12.73, y1: 2.65 };
export function coffeeRugSpot(seat: number): GridPoint {
  const col = seat % 3, row = Math.floor(seat / 3) % 2;
  return { x: 10.85 + col * .7, y: 2.0 + row * .45 };
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

export type WalkZone = keyof typeof ZONE_SPOTS | 'floor';
export const walkSignatureKey = (s: WalkSignature) => JSON.stringify([s.presenceZone, s.demands.map(d => [d.id, d.stage]).sort((a,b) => a[0].localeCompare(b[0]))]);
/** Interaction anchors match the existing furniture, not the decorative zone labels. */
export function interactionSpot(zone: WalkZone, seat = 0): GridPoint {
  switch (zone) {
    case 'coffee': return coffeeRugSpot(seat);
    case 'waiting': return { x: 2.7 + (seat % 2 ? 1.19 : .34), y: 2.6 };
    case 'meeting': return { x: 7.6 + (seat % 2 ? 1.03 : -.18), y: 6.26 };
    case 'planning': return { x: .7, y: 5.3 };
    case 'review': return { x: ZONE_SPOTS.review.x, y: 8.65 };
    default: return ZONE_SPOTS.waiting;
  }
}
/** Physical tops only; seats remain reachable from the side. */
export function walkObstacles(count: number): GridRect[] {
  return [
    ...Array.from({ length: count }, (_, i) => { const p = deskGrid(i); return { x0:p.x-.08, y0:p.y-.08, x1:p.x+2.33, y1:p.y+1.66 }; }),
    { x0:7.52, y0:6.97, x1:9.78, y1:8.35 },
    { x0:11.1, y0:.7, x1:12.91, y1:1.74 },
    { x0:1, y0:2.82, x1:2.09, y1:3.42 },
    { x0:1, y0:7.18, x1:3.11, y1:8.36 },
    { x0:2.62, y0:2.02, x1:4.38, y1:2.4 },
  ];
}
const inside = (p: GridPoint, r: GridRect) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
export function freeWalkPoint(p: GridPoint, count: number): GridPoint {
  const floor = floorForDesks(count), rects = walkObstacles(count);
  let q = { x:Math.max(.15,Math.min(floor.width-.15,p.x)), y:Math.max(.15,Math.min(floor.height-.15,p.y)) };
  for (let i=0;i<rects.length;i++) {
    const hit=rects.find(r=>inside(q,r)); if (!hit) break;
    const candidates=[{x:hit.x0-.12,y:q.y},{x:hit.x1+.12,y:q.y},{x:q.x,y:hit.y0-.12},{x:q.x,y:hit.y1+.12}]
      .filter(v=>v.x>=.15&&v.x<=floor.width-.15&&v.y>=.15&&v.y<=floor.height-.15&&!rects.some(r=>inside(v,r)));
    candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
    q=candidates[0]||avoidFurniture(q,[hit]);
  }
  return q;
}
/** Short grid route prevents manual walks (including returns) from crossing furniture. */
export function walkRoute(from: GridPoint, to: GridPoint, count: number): GridPoint[] {
  const floor=floorForDesks(count), rects=walkObstacles(count), step=.2;
  const cols=Math.round(floor.width/step), rows=Math.round(floor.height/step);
  const index=(p:GridPoint)=>Math.round(p.y/step)*(cols+1)+Math.round(p.x/step);
  const point=(i:number)=>({x:(i%(cols+1))*step,y:Math.floor(i/(cols+1))*step});
  const start=index(from), goal=index(to), open=new Set([start]), prev=new Map<number,number>(), costs=new Map([[start,0]]);
  const h=(i:number)=>{const p=point(i);return Math.abs(p.x-to.x)+Math.abs(p.y-to.y);};
  while(open.size) {
    let best=-1, score=Infinity;
    for(const i of open) {const s=(costs.get(i)||0)+h(i);if(s<score){best=i;score=s;}}
    if(best===goal) {
      const path:GridPoint[]=[to];let i=goal;
      while(i!==start){path.unshift(point(i));const parent=prev.get(i);if(parent===undefined)break;i=parent;}
      return [from,...path];
    }
    open.delete(best);const p=point(best);
    for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const q={x:p.x+dx,y:p.y+dy};if(q.x<0||q.y<0||q.x>cols*step||q.y>rows*step)continue;
      const n=index(q);if(n!==goal&&rects.some(r=>inside(q,r)))continue;
      const cost=(costs.get(best)||0)+step;
      if(cost<(costs.get(n)??Infinity)){costs.set(n,cost);prev.set(n,best);open.add(n);}
    }
  }
  return [from]; // No route: never fall back to walking through a table.
}
export interface OfficeWalkEvent {
  target: GridPoint | null; zone: WalkZone; timestamp: number; sequence: number;
  expiresAt: number; instance: string; signature: string;
}
export const officeWalkEventKey = (e:OfficeWalkEvent) => `${e.instance}:${e.timestamp}:${e.sequence}`;
/** Shared payload never carries the local queue signature (demand ids stay local). */
export const sharedOfficeWalk = (e:OfficeWalkEvent):OfficeWalkEvent => ({target:e.target?{x:e.target.x,y:e.target.y}:null,zone:e.zone,timestamp:e.timestamp,sequence:e.sequence,expiresAt:e.expiresAt,instance:e.instance,signature:''});
/** Remote actions are accepted for any visible person with a desk; queue/filter state never rejects them. */
export function acceptRemoteWalk(event:OfficeWalkEvent|undefined, hasStation:boolean):OfficeWalkEvent|null {
  return event&&event.target&&hasStation?event:null;
}
/** Own avatar: the newest action wins between this tab and other tabs of the same account; an explicit return (target null) can win. */
export function newestOwnWalk(local:OfficeWalkEvent|null, remote:OfficeWalkEvent|undefined|null):OfficeWalkEvent|null {
  const winner=!remote?local:!local?remote:(remote.timestamp>local.timestamp||(remote.timestamp===local.timestamp&&remote.sequence>local.sequence))?remote:local;
  return winner&&winner.target?winner:null;
}
export function latestOfficeWalk(metas: unknown[], now:number, count:number): OfficeWalkEvent | null {
  const floor=floorForDesks(count);
  const valid=metas.filter((value):value is OfficeWalkEvent=>{
    if(!value||typeof value!=='object')return false;
    const e=value as OfficeWalkEvent;
    return Number.isFinite(e.timestamp)&&e.timestamp<=now+30000&&Number.isSafeInteger(e.sequence)&&e.sequence>=0
      &&Number.isFinite(e.expiresAt)&&e.expiresAt>now&&e.expiresAt<=e.timestamp+manualStayMs({idle:true})
      &&typeof e.instance==='string'&&typeof e.signature==='string'
      &&(e.zone==='floor'||Object.prototype.hasOwnProperty.call(ZONE_SPOTS,e.zone))
      &&(e.target===null||!!e.target&&Number.isFinite(e.target.x)&&Number.isFinite(e.target.y)&&e.target.x>=0&&e.target.x<=floor.width&&e.target.y>=0&&e.target.y<=floor.height);
  });
  valid.sort((a,b)=>b.timestamp-a.timestamp||b.sequence-a.sequence||b.instance.localeCompare(a.instance));
  return valid[0]||null;
}
