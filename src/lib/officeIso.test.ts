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
import { stackHeight, avoidFurniture, furnitureRects, deskGrid, deskChairGrid } from './officeIso';
describe('office stations', () => {
  it('stack grows with real queue and compresses large ones', () => {
    expect(stackHeight(0)).toBe(0);
    expect(stackHeight(4)).toBeLessThan(stackHeight(30));
    expect(stackHeight(30)).toBeLessThan(stackHeight(59));
    expect(stackHeight(59)).toBeLessThanOrEqual(48);
  });
  it('never leaves a walker on a desk or the meeting table', () => {
    const d = deskGrid(0); const p = avoidFurniture({ x: d.x + 1, y: d.y + .5 }, furnitureRects(4));
    expect(p.y).toBeGreaterThan(d.y + 1.68);
    expect(avoidFurniture({ x: 8.5, y: 7.5 }, furnitureRects(4)).y).toBeGreaterThan(8.4);
  });
  it('chair sits behind the desk top without overlapping it', () => {
    const d = deskGrid(2), c = deskChairGrid(2); expect(c.y + .64).toBeLessThanOrEqual(d.y);
  });
});
