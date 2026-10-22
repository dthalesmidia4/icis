import {p,isoBox} from './geometry';
type Spec={top:string;side:string;edge:string;paper:string};
import {monitorBack} from './MonitorBack';
export {monitorBack};
/** Corpo da mesa: 4 pés, gaveteiro lateral, tampo fino, monitor de costas e caneca. */
export function deskFront(x:number,y:number,spec:Spec){
 let out='';const shadow=p(x+1.12,y+.8);
 out+=`<ellipse cx="${shadow.x}" cy="${shadow.y+4}" rx="110" ry="31" fill="hsl(var(--iso-c-326c91))" opacity=".09" filter="url(#itemShadow)"/>`;
 for(const [lx,ly] of [[.1,.12],[1.94,.12],[.1,1.31],[1.94,1.31]])out+=isoBox(x+lx,y+ly,.18,.19,43,'hsl(var(--iso-c-a6c3d5))',spec.side,spec.edge);
 out+=isoBox(x+.08,y+.81,.48,.49,37,'hsl(var(--iso-c-f9fcff))',spec.side,spec.edge);
 const drawer=p(x+.35,y+1.21,36);out+=`<g transform="translate(${drawer.x} ${drawer.y})"><path d="M-11 -5L10 -5" stroke="hsl(var(--iso-c-ffffff))" stroke-width="3" stroke-linecap="round"/></g>`;
 out+=isoBox(x,y,2.25,1.58,7,spec.top,spec.side,spec.edge,43);
 const A=p(x,y,50),B=p(x+2.25,y,50),C=p(x+2.25,y+1.58,50),D=p(x,y+1.58,50);
 out+=`<path d="M${A.x} ${A.y}L${B.x} ${B.y}L${C.x} ${C.y}L${D.x} ${D.y}Z" fill="none" stroke="hsl(var(--iso-c-ffffff))" stroke-opacity=".95" stroke-width="2.3" stroke-linejoin="round"/>`;
 out+=monitorBack(x+.72,y+.60,spec.paper);
 const mug=p(x+.30,y+.73,55);
 out+=`<g><ellipse cx="${mug.x}" cy="${mug.y}" rx="11" ry="6" fill="${spec.paper}"/><path d="M${mug.x-8} ${mug.y-6}V${mug.y-17}Q${mug.x} ${mug.y-21} ${mug.x+8} ${mug.y-17}V${mug.y-6}" fill="hsl(var(--iso-c-ffffff))" stroke="${spec.paper}" stroke-width="2"/><path d="M${mug.x+8} ${mug.y-15}q13 0 2 10" fill="none" stroke="${spec.paper}" stroke-width="2"/></g>`;
 return out;
}
export default function Desk({x,y,spec}:{x:number;y:number;spec:Spec}){return <g dangerouslySetInnerHTML={{__html:deskFront(x,y,spec)}} />;}
