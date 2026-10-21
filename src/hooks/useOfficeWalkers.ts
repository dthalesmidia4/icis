import { useEffect, useRef, useState } from 'react';
import { walkDurationMs, type GridPoint } from '@/lib/officeIso';
export interface Walker { pos: GridPoint; walking: boolean; bob: number }
/** Interpola todos os personagens até o alvo real (presença) ou manual, como o movePerson do HTML. */
export function useOfficeWalkers(targets: Record<string, GridPoint>): Record<string, Walker> {
  const anim = useRef<Record<string, { from: GridPoint; to: GridPoint; start: number; dur: number; pos: GridPoint }>>({});
  const [state, setState] = useState<Record<string, Walker>>({});
  const key = Object.entries(targets).map(([id, p]) => `${id}:${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|');
  useEffect(() => {
    const now = performance.now();
    const next: typeof anim.current = {};
    for (const [id, to] of Object.entries(targets)) {
      const a = anim.current[id];
      if (!a) { next[id] = { from: to, to, start: now, dur: 0, pos: to }; continue; }
      if (a.to.x === to.x && a.to.y === to.y) { next[id] = a; continue; }
      next[id] = { from: a.pos, to, start: now, dur: walkDurationMs(a.pos, to), pos: a.pos };
    }
    anim.current = next;
    let frame = 0;
    const tick = (ts: number) => {
      let active = false; const out: Record<string, Walker> = {};
      for (const [id, a] of Object.entries(anim.current)) {
        const t = a.dur ? Math.min(1, (ts - a.start) / a.dur) : 1;
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        a.pos = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e };
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
