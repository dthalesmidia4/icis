import { useEffect, useRef, useState, useCallback } from 'react';
import { manualStayMs, shouldCancelManualWalk, type GridPoint, type WalkSignature } from '@/lib/officeIso';
export function useMyManualWalk(anchor: GridPoint | null, signature: WalkSignature, idle: boolean) {
  const [walk, setWalk] = useState<{ target: GridPoint; signature: WalkSignature } | null>(null);
  const [position, setPosition] = useState<GridPoint | null>(anchor);
  const current = useRef(position);
  const valid = walk && !shouldCancelManualWalk(walk.signature, signature);
  const target = valid ? walk.target : anchor;
  useEffect(() => {
    if (walk && !valid) setWalk(null);
  }, [walk, valid]);
  useEffect(() => {
    if (!walk) return;
    const timer = window.setTimeout(() => setWalk(null), manualStayMs({ idle }));
    return () => clearTimeout(timer);
  }, [walk, idle]);
  useEffect(() => {
    if (!target) { current.current = null; setPosition(null); return; }
    const from = current.current || target;
    let frame: number; const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 950); const ease = t * t * (3 - 2 * t);
      const p = { x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease };
      current.current = p; setPosition(p);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [target?.x, target?.y]);
  const move = useCallback((target: GridPoint) => { if (anchor) setWalk({ target, signature }); }, [anchor, signature]);
  return { position, move, manual: !!valid, target };
}
