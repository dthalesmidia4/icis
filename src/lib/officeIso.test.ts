import { describe, it, expect } from 'vitest';
import { iso, inverseIso, manualStayMs, shouldCancelManualWalk } from './officeIso';
describe('office isometric geometry', () => {
  it('roundtrips floor points', () => { for (const [x,y] of [[0,0],[5,8],[18,16],[1.25,4.75]]) { const p = inverseIso(iso(x,y)); expect(p.x).toBeCloseTo(x); expect(p.y).toBeCloseTo(y); } });
  it('clamps to the floor', () => { expect(inverseIso(iso(-4,40))).toEqual({x:0,y:16}); });
  it('uses local idle and active expiry', () => { expect(manualStayMs({idle:true})).toBe(600000); expect(manualStayMs({idle:false})).toBe(45000); });
  it('cancels on demand, stage or presence changes, not ordering', () => {
    const a = { demands: [{id:'1',stage:'create'},{id:'2',stage:'review'}], presenceZone:'desk' };
    expect(shouldCancelManualWalk(a,{...a,demands:[...a.demands].reverse()})).toBe(false);
    expect(shouldCancelManualWalk(a,{...a,demands:[...a.demands,{id:'3',stage:'create'}]})).toBe(true);
    expect(shouldCancelManualWalk(a,{...a,demands:[{id:'1',stage:'review'}]})).toBe(true);
    expect(shouldCancelManualWalk(a,{...a,presenceZone:'coffee'})).toBe(true);
  });
});
