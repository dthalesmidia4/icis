import { useEffect, useRef, useState } from 'react';
import { walkDurationMs, walkRoute, type GridPoint } from '@/lib/officeIso';
export interface Walker { pos: GridPoint; walking: boolean; bob: number }
/** Interpola todos os personagens até o alvo real (presença) ou manual, como o movePerson do HTML. */
export function useOfficeWalkers(targets: Record<string, GridPoint>, deskCount = 0): Record<string, Walker> {
  const anim = useRef<Record<string, { from: GridPoint; to: GridPoint; start: number; dur: number; pos: GridPoint; path:GridPoint[]; length:number }>>({});
  const [state, setState] = useState<Record<string, Walker>>({});
  const key = `${deskCount}|` + Object.entries(targets).sort(([a],[b])=>a.localeCompare(b)).map(([id, p]) => `${id}:${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|');
  useEffect(() => {
    const now = performance.now();
    const next: typeof anim.current = {};
    for (const [id, to] of Object.entries(targets)) {
      const a = anim.current[id];
      if (!a) { next[id] = { from: to, to, start: now, dur: 0, pos: to, path:[to],length:0 }; continue; }
      if (a.to.x === to.x && a.to.y === to.y) { next[id] = a; continue; }
      const path=walkRoute(a.pos,to,deskCount);
      const length=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
      next[id] = { from: a.pos, to, start: now, dur: length ? walkDurationMs({x:0,y:0},{x:length,y:0}) : 0, pos: a.pos, path,length };
    }
    anim.current = next;
    let frame = 0;
    const tick = (ts: number) => {
      let active = false; const out: Record<string, Walker> = {};
      for (const [id, a] of Object.entries(anim.current)) {
        const t = a.dur ? Math.min(1, (ts - a.start) / a.dur) : 1;
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        let remaining=a.length*e;
        a.pos=a.path[0];
        for(let i=1;i<a.path.length;i++) {
          const from=a.path[i-1],to=a.path[i],len=Math.hypot(to.x-from.x,to.y-from.y);
          if(remaining<=len&&len){const ratio=remaining/len;a.pos={x:from.x+(to.x-from.x)*ratio,y:from.y+(to.y-from.y)*ratio};break;}
          remaining-=len;a.pos=to;
        }
        const walking = t < 1; if (walking) active = true;
        out[id] = { pos: a.pos, walking, bob: walking ? -1.4 * Math.sin(t * Math.PI * 12) : 0 };
      }
      setState(out);
      if (active) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
