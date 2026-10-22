import { useEffect, useRef, useState, useCallback } from 'react';
import { manualStayMs, walkSignatureKey, type GridPoint, type WalkSignature, type OfficeWalkEvent, type WalkZone } from '@/lib/officeIso';
export function useMyManualWalk(anchor: GridPoint | null, signature: WalkSignature, idle: boolean, enabled = true) {
  const [walk, setWalk] = useState<OfficeWalkEvent | null>(null);
  const instance = useRef(crypto.randomUUID());
  const sequence = useRef(0);
  const key = walkSignatureKey(signature);
  const valid = enabled && walk?.target && walk.signature === key && walk.expiresAt > Date.now();
  const event = valid ? walk : null;
  useEffect(() => { if (walk && !valid) setWalk(null); }, [walk, !!valid]);
  useEffect(() => {
    if (!walk) return;
    const timer = window.setTimeout(() => setWalk(null), Math.max(0, walk.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [walk]);
  const move = useCallback((target: GridPoint, zone: WalkZone = 'floor') => {
    if (!anchor || !enabled) return;
    const timestamp = Date.now();
    setWalk({ target, zone, timestamp, sequence: ++sequence.current, expiresAt: timestamp + manualStayMs({ idle }), instance: instance.current, signature: key });
  }, [anchor?.x, anchor?.y, enabled, idle, key]);
  return { move, manual: !!valid, target: event?.target || anchor, event };
}
