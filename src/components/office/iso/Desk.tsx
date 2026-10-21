import {p,isoBox,esc} from './geometry';
import {laptop} from './Laptop';
export function desk(x,y,theme,who){const spec=theme;let out=`<g class="interactive station" data-person="${who}"  aria-label="Mesa de ${esc(who)}">`;
const shadow=p(x+1.03,y+.83);out+=`<ellipse cx="${shadow.x}" cy="${shadow.y+13}" rx="113" ry="37" fill="hsl(var(--iso-c-326c91))" opacity=".12" filter="url(#itemShadow)"/>`;
out+=isoBox(x+.14,y+.15,.25,.28,47,'hsl(var(--iso-c-8eb8c9))','hsl(var(--iso-c-769bb9))','hsl(var(--iso-c-83a7c7))');out+=isoBox(x+1.83,y+.15,.25,.28,47,'hsl(var(--iso-c-93c3d2))','hsl(var(--iso-c-779eb8))','hsl(var(--iso-c-89b2c5))');
out+=isoBox(x+.14,y+1.18,.25,.28,47,'hsl(var(--iso-c-8eb8c9))','hsl(var(--iso-c-779eb8))','hsl(var(--iso-c-89b2c5))');out+=isoBox(x+1.83,y+1.18,.25,.28,47,'hsl(var(--iso-c-8eb8c9))','hsl(var(--iso-c-779eb8))','hsl(var(--iso-c-89b2c5))');
out+=isoBox(x,y,2.25,1.58,56,spec.top,spec.side,spec.edge);
out+=`</g>`;return out}
export default function Desk({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(desk as (...args:any[])=>string)(...args)}} />;}
