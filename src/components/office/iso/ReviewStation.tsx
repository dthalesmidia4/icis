// @ts-nocheck — portado do HTML de referência v8.
import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {rug} from './Rug';
export function reviewStation(){
  const x=.8,y=7.1;
  let out=`<g class="interactive station zone-landmark" data-zone="review" data-team="all" role="button" tabindex="0" aria-label="Abrir bancada de Revisão">
   <title>Revisão — documentos, conferência e validação</title>
   ${rug(x,y,2.5,1.7,'hsl(var(--iso-c-d6c5ef))')}
   ${isoBox(x+.28,y+.16,1.95,1.02,29,'hsl(var(--iso-c-fcfcff))','hsl(var(--iso-c-d7c9ee))','hsl(var(--iso-c-bdacdf))')}`;
  // Bancada de verificação: etiqueta gravada NA FRENTE do movel, sem balão.
  const center=p(x+1.27,y+1.15,17);
  out+=`<g transform="translate(${center.x} ${center.y}) rotate(25)">
     <rect x="-35" y="-7" width="70" height="15" rx="3" fill="hsl(var(--iso-c-ede4fa))" stroke="hsl(var(--iso-c-c7b5e3))" stroke-width="1"/>
     <circle cx="-26" cy=".5" r="3" fill="hsl(var(--iso-c-947aca))"/>
     <text x="5" y="4.3" text-anchor="middle" font-weight="1000" font-size="9" letter-spacing="1" fill="hsl(var(--iso-c-765ea7))">REVISÃO</text>
   </g>`;
  // Prancheta inclinada sobre o tampo, com checklists visíveis.
  const clip=p(x+1.07,y+.54,33);
  out+=`<g transform="translate(${clip.x} ${clip.y}) rotate(25)">
    <rect x="-42" y="-27" width="79" height="54" rx="5" fill="hsl(var(--iso-c-fafcff))" stroke="hsl(var(--iso-c-a6bbd2))" stroke-width="3"/>
    <rect x="-12" y="-32" width="19" height="8" rx="3" fill="hsl(var(--iso-c-84b5cf))" stroke="hsl(var(--iso-c-5e9fbf))" stroke-width="1.5"/>
    <rect x="-32" y="-12" width="10" height="10" rx="2" fill="hsl(var(--iso-c-cfede5))" stroke="hsl(var(--iso-c-80cbb3))"/>
    <path d="M-30 -8L-27 -5L-24 -11" stroke="hsl(var(--iso-c-48a58a))" stroke-width="2.2" fill="none"/>
    <path d="M-16 -8H25M-16 -2H17" stroke="hsl(var(--iso-c-aac7d5))" stroke-width="2" stroke-linecap="round"/>
    <rect x="-32" y="7" width="10" height="10" rx="2" fill="hsl(var(--iso-c-cfede5))" stroke="hsl(var(--iso-c-80cbb3))"/>
    <path d="M-30 11L-27 14L-24 8" stroke="hsl(var(--iso-c-48a58a))" stroke-width="2.2" fill="none"/>
    <path d="M-16 11H23M-16 17H12" stroke="hsl(var(--iso-c-aac7d5))" stroke-width="2" stroke-linecap="round"/>
  </g>`;
  // Três bandejas reais de conferência, não alertas flutuantes.
  const tray=p(x+.52,y+.93,37);
  out+=`<g transform="translate(${tray.x} ${tray.y})">
   <path d="M-19 0L1 -10L25 -4L4 7Z" fill="hsl(var(--iso-c-c8e8fb))" stroke="hsl(var(--iso-c-88bad5))" stroke-width="1.6"/>
   <path d="M-19 0V10L4 18V7Z" fill="hsl(var(--iso-c-d8f0fc))" stroke="hsl(var(--iso-c-8fbed7))" stroke-width="1.5"/>
   <path d="M4 7L25 -4V6L4 18Z" fill="hsl(var(--iso-c-a7d4e9))" stroke="hsl(var(--iso-c-8fbed7))" stroke-width="1.5"/>
   <path d="M-9 -1L2 -5L11 -2" fill="none" stroke="hsl(var(--iso-c-ffffff))" stroke-width="2"/>
  </g>`;
  // Selo de revisão incorporado à prancheta, nunca solto no piso.
  const chk=p(x+1.60,y+.54,35);
  out+=`<g transform="translate(${chk.x} ${chk.y})">
    <circle r="10" fill="hsl(var(--iso-c-f7f0ff))" stroke="hsl(var(--iso-c-aa8ed0))" stroke-width="1.6"/>
    <path d="M-5 0L-1 4L6 -5" fill="none" stroke="hsl(var(--iso-c-8d71be))" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  </g></g>`;
  return out;
}
export default function ReviewStation(){return <g dangerouslySetInnerHTML={{__html:reviewStation()}} />;}
