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
import { paperSheets, walkDurationMs, deskSeatGrid } from './officeIso';
import { interactionSpot, freeWalkPoint, walkObstacles, walkRoute, latestOfficeWalk, walkSignatureKey, COFFEE_RUG } from './officeIso';
describe('manual multiplayer walk rules', () => {
  const event = { target:{x:11.55,y:2},zone:'coffee',timestamp:1000,sequence:1,expiresAt:46000,instance:'tab-a',signature:'state' };
  it('selects newest tab, not array order, including return tombstones', () => {
    const newer={...event,instance:'tab-b',timestamp:2000};
    expect(latestOfficeWalk([newer,event],3000,4)).toEqual(newer);
    expect(latestOfficeWalk([event,{...newer,target:null}],3000,4)?.target).toBeNull();
  });
  it('ignores expired Presence', () => { expect(latestOfficeWalk([event],46000,4)).toBeNull(); });
  it('rejects invalid coordinates, action and future metadata', () => {
    for(const change of [{target:{x:NaN,y:2}},{target:{x:14,y:2}},{zone:'other'},{timestamp:99000},{expiresAt:700000},{sequence:-1}])
      expect(latestOfficeWalk([{...event,...change}],3000,4)).toBeNull();
  });
  it('uses stable operational identity, not object identity or queue order', () => {
    const s={demands:[{id:'a',stage:'review'},{id:'b',stage:'create'}],presenceZone:'working_now:desk'};
    expect(walkSignatureKey(s)).toBe(walkSignatureKey({...s,demands:[...s.demands].reverse()}));
    expect(walkSignatureKey(s)).not.toBe(walkSignatureKey({...s,presenceZone:'available:coffee'}));
  });
  it('coffee anchors are on the real rug', () => {
    for(let i=0;i<6;i++){const p=interactionSpot('coffee',i);expect(p.x).toBeGreaterThan(COFFEE_RUG.x0);expect(p.x).toBeLessThan(COFFEE_RUG.x1);expect(p.y).toBeGreaterThan(1.74);expect(p.y).toBeLessThanOrEqual(COFFEE_RUG.y1);}
  });
  it('waiting and meeting anchors match existing seats', () => {
    expect(interactionSpot('waiting',0)).toEqual({x:3.04,y:2.6});
    expect(interactionSpot('meeting',0).x).toBeCloseTo(7.42);
    expect(interactionSpot('meeting',1).y).toBe(6.26);
  });
  it('routes to all zones and back without crossing table tops', () => {
    const from=deskSeatGrid(0),rects=walkObstacles(4);
    for(const zone of ['coffee','waiting','meeting','review','planning'] as const){
      const to=freeWalkPoint(interactionSpot(zone),4);
      for(const [a,b] of [[from,to],[to,from]]){
        const path=walkRoute(a,b,4);expect(path.at(-1)).toEqual(b);expect(path.length).toBeGreaterThan(1);
        for(const p of path)expect(rects.some(r=>p.x>r.x0&&p.x<r.x1&&p.y>r.y0&&p.y<r.y1)).toBe(false);
      }
    }
  });
  it('free floor clicks never resolve inside furniture', () => {
    const p=freeWalkPoint({x:11.8,y:1},4);expect(walkObstacles(4).some(r=>p.x>r.x0&&p.x<r.x1&&p.y>r.y0&&p.y<r.y1)).toBe(false);
  });
});
describe('reference parity', () => {
  it('sheets: one per demand up to 5, compressed after', () => { expect([0,4,30,59].map(paperSheets)).toEqual([0,4,11,18]); });
  it('walk duration follows the reference', () => { expect(walkDurationMs({x:0,y:0},{x:0,y:0})).toBe(280); expect(walkDurationMs({x:0,y:0},{x:4,y:0})).toBe(1160); expect(walkDurationMs({x:0,y:0},{x:20,y:0})).toBe(2200); });
  it('seat matches reference station anchor offset', () => { const s = deskSeatGrid(1); expect(s.x).toBeCloseTo(5.925); expect(s.y).toBeCloseTo(1.69); });
});
