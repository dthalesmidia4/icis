import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {laptop} from './Laptop';
export function desk(x,y,theme,who){const spec=theme;let out=`<g class="interactive station" data-person="${who}"  aria-label="Mesa de ${esc(who)}">`;
const shadow=p(x+1.03,y+.83);out+=`<ellipse cx="${shadow.x}" cy="${shadow.y+13}" rx="113" ry="37" fill="hsl(var(--iso-c-326c91))" opacity=".12" filter="url(#itemShadow)"/>`;
out+=isoBox(x+.14,y+.15,.25,.28,47,'hsl(var(--iso-c-8eb8c9))','hsl(var(--iso-c-769bb9))','hsl(var(--iso-c-83a7c7))');out+=isoBox(x+1.83,y+.15,.25,.28,47,'hsl(var(--iso-c-93c3d2))','hsl(var(--iso-c-779eb8))','hsl(var(--iso-c-89b2c5))');
out+=isoBox(x+.14,y+1.18,.25,.28,47,'hsl(var(--iso-c-8eb8c9))','hsl(var(--iso-c-779eb8))','hsl(var(--iso-c-89b2c5))');out+=isoBox(x+1.83,y+1.18,.25,.28,47,'hsl(var(--iso-c-8eb8c9))','hsl(var(--iso-c-779eb8))','hsl(var(--iso-c-89b2c5))');
out+=isoBox(x,y,2.25,1.58,56,spec.top,spec.side,spec.edge);
out+=laptop(x+.75,y+.45);
const mug=p(x+.45,y+.6,62);out+=`<g><ellipse cx="${mug.x}" cy="${mug.y}" rx="12" ry="6" fill="${spec.paper}"/><path d="M${mug.x-9} ${mug.y-7}V${mug.y-20}Q${mug.x} ${mug.y-24} ${mug.x+9} ${mug.y-20}V${mug.y-7}" fill="hsl(var(--iso-c-fff))" stroke="${spec.paper}" stroke-width="3"/><path d="M${mug.x+9} ${mug.y-18}q16 0 3 11" stroke="${spec.paper}" stroke-width="3" fill="none"/></g>`;
const pap=p(x+1.75,y+.87,56);out+=`<g transform="translate(${pap.x} ${pap.y}) rotate(26)"><rect width="34" height="22" x="-17" y="-11" rx="3" fill="${spec.paper}" opacity=".67"/><rect x="-11" y="-6" width="22" height="3" rx="1" fill="hsl(var(--iso-c-ffffff))"/><rect x="-11" y="1" width="16" height="3" rx="1" fill="hsl(var(--iso-c-ffffff))"/></g>`;
out+=`</g>`;return out}
export default function Desk({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(desk as (...args:any[])=>string)(...args)}} />;}
