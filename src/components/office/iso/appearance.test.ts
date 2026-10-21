import {describe,it,expect} from 'vitest';
import {appearance} from './appearance';
import {deskGrid,floorForDesks,iso,inverseIso} from '@/lib/officeIso';
describe('reference office presentation',()=>{
 it('keeps appearance stable across ordering',()=>{const before=appearance('user-42');appearance('different');expect(appearance('user-42')).toEqual(before);expect(before.hairStyle).toBeLessThan(4);});
 it('fits additional desk rows inside the expanded room',()=>{for(const n of [4,6,7,12,24]){const floor=floorForDesks(n);expect(floor.width).toBe(13);for(let i=0;i<n;i++){const p=deskGrid(i);expect(p.x+2.25).toBeLessThanOrEqual(floor.width);expect(p.y+1.58).toBeLessThanOrEqual(floor.height);expect(inverseIso(iso(p.x,p.y),floor).x).toBeCloseTo(p.x);}}});
});
