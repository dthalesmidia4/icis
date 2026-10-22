// @ts-nocheck — portado do HTML de referência v8.
import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {rug} from './Rug';
function meetingChair(x,y,accent){
 const v=p(x,y),rear=accent==='hsl(var(--iso-c-a8bee9))'?'hsl(var(--iso-c-7997d7))':'hsl(var(--iso-c-c58f8f))';
 return `<g class="meeting-chair" transform="translate(${v.x} ${v.y})">
  <ellipse cx="0" cy="5" rx="18" ry="6" fill="hsl(var(--iso-c-447d97))" opacity=".1"/>
  <path d="M-12 -22L-11 -2M12 -22L11 -2" fill="none" stroke="hsl(var(--iso-c-91aabd))" stroke-width="4" stroke-linecap="round"/>
  <path d="M-17 -48Q-17 -55 -10 -55H10Q17 -55 17 -48V-20H-17Z" fill="${accent}" stroke="${rear}" stroke-width="2.4"/>
  <path d="M-10 -45H10" stroke="hsl(var(--iso-c-ffffff))" stroke-opacity=".55" stroke-width="2"/>
  <ellipse cx="0" cy="-18" rx="21" ry="8" fill="${accent}" stroke="${rear}" stroke-width="1.8"/>
 </g>`;
}
export function meetingRoom(){
 const x=7.6,y=7.05;
 let out=`<g class="interactive station zone-landmark" data-zone="meeting" data-team="all" aria-label="Abrir sala de reunião">
  <title>Sala de reunião — mesa, assentos e materiais</title>
  ${rug(6.6,6.6,3.3,2.55,'hsl(var(--iso-c-badbe9))')}`;
 // Assentos atrás do tampo: apresentam escala coerente, sem blocos nas extremidades.
 out+=meetingChair(x-.18,y-.79,'hsl(var(--iso-c-a8bee9))');
 out+=meetingChair(x+1.03,y-.79,'hsl(var(--iso-c-dab5d7))');
 // Quatro pernas geométricas, ligadas exatamente à face inferior do tampo.
 const legs=[[.14,.13],[1.82,.13],[.14,.97],[1.82,.97]];
 for(const [dx,dy] of legs){out+=isoBox(x+dx,y+dy,.16,.16,42,'hsl(var(--iso-c-ead2b8))','hsl(var(--iso-c-cba381))','hsl(var(--iso-c-bd9374))');}
 // Tampo fino com cerca de 8 unidades de espessura, apoiado a z=42.
 out+=isoBox(x,y,2.1,1.22,8,'hsl(var(--iso-c-fffbf2))','hsl(var(--iso-c-d4b79d))','hsl(var(--iso-c-c79f80))',42);
 // Pauta apoiada realmente SOBRE o tampo e em perspectiva isométrica.
 const A=p(x+.65,y+.34,51),B=p(x+1.38,y+.34,51),C=p(x+1.38,y+.87,51),D=p(x+.65,y+.87,51);
 const square=p(x+.76,y+.49,52),line1=p(x+1.02,y+.53,52),line2=p(x+1.10,y+.64,52);
 out+=`<g class="meeting-workbook"><path d="M${A.x} ${A.y}L${B.x} ${B.y}L${C.x} ${C.y}L${D.x} ${D.y}Z" fill="hsl(var(--iso-c-e6f1f9))" stroke="hsl(var(--iso-c-afc9da))" stroke-width="1.4"/>
 <path d="M${square.x-5} ${square.y-3}l8 4l-6 8l-8 -4Z" fill="hsl(var(--iso-c-5ba8d8))"/>
 <path d="M${line1.x} ${line1.y}l17 7M${line2.x} ${line2.y}l14 6" stroke="hsl(var(--iso-c-92b3c8))" stroke-width="2" stroke-linecap="round"/></g>`;
 // Única identificação da sala, gravada discretamente no tapete.
 const label=p(x+1.06,y+1.77,2);
 out+=`<text x="${label.x}" y="${label.y}" transform="rotate(25 ${label.x} ${label.y})" text-anchor="middle" font-size="11" font-weight="900" letter-spacing="1.5" fill="hsl(var(--iso-c-6996ae))" opacity=".87">REUNIÃO</text></g>`;
 return out;
}
export default function MeetingRoom(){return <g dangerouslySetInnerHTML={{__html:meetingRoom()}} />;}
