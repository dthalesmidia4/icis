// @ts-nocheck — portado do HTML de referência v8.
import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {rug} from './Rug';
export function coffeeStation(){
  const x=11.18,y=.78;
  let out=`<g class="interactive station zone-landmark" data-zone="coffee" data-team="all" aria-label="Abrir Cantinho do Café">
    <title>Cantinho do Café — espaço de descanso</title>
    ${rug(10.48,.65,2.25,2.0,'hsl(var(--iso-c-f8e1c6))')}
    ${isoBox(x,y,1.65,.88,61,'hsl(var(--iso-c-fff8ed))','hsl(var(--iso-c-dfa982))','hsl(var(--iso-c-c18d69))')}`;
  // A identificação agora pertence à FACHADA DO BALCÃO, sem placas sobre o quadro da agência.
  const ident=p(x+.80,y+.87,30);
  out+=`<g transform="translate(${ident.x} ${ident.y}) rotate(25)">
     <rect x="-39" y="-17" width="78" height="32" rx="5" fill="hsl(var(--iso-c-f7e4cc))" stroke="hsl(var(--iso-c-c89470))" stroke-width="1.8"/>
     <path d="M-30 -12H30" stroke="hsl(var(--iso-c-ffffff))" stroke-width="1" opacity=".65"/>
     <text x="0" y="-2.8" font-size="8.3" text-anchor="middle" font-weight="1000" letter-spacing="1" fill="hsl(var(--iso-c-a36f50))">CANTINHO DO</text>
     <text x="0" y="10" font-size="14" text-anchor="middle" font-weight="1000" letter-spacing="1.1" fill="hsl(var(--iso-c-7f513c))">CAFÉ</text>
   </g>`;
  const m=p(x+.78,y+.33,66);
  out+=`<g transform="translate(${m.x} ${m.y})">
    <ellipse cx="0" cy="10" rx="30" ry="9" fill="hsl(var(--iso-c-31799b))" opacity=".1"/>
    <rect x="-29" y="-58" width="59" height="53" rx="10" fill="hsl(var(--iso-c-415f77))" stroke="hsl(var(--iso-c-7599b4))" stroke-width="3.5"/>
    <rect x="-22" y="-48" width="44" height="22" rx="5" fill="hsl(var(--iso-c-b5e3ee))"/>
    <circle cx="-15" cy="-38" r="4" fill="hsl(var(--iso-c-36c9a8))"/><circle cx="-1" cy="-38" r="4" fill="hsl(var(--iso-c-ffc15a))"/>
    <path d="M-17 -18H17" stroke="hsl(var(--iso-c-99c5d7))" stroke-width="4" stroke-linecap="round"/>
    <path d="M1 -7V5" stroke="hsl(var(--iso-c-b1d5e6))" stroke-width="3"/>
    <rect x="-10" y="0" width="20" height="14" rx="3" fill="hsl(var(--iso-c-ffffff))" stroke="hsl(var(--iso-c-9ebccc))" stroke-width="2"/>
    <path d="M10 3q10 2 3 8" fill="none" stroke="hsl(var(--iso-c-9ebccc))" stroke-width="2"/>
  </g>`;
  // Xícaras repousam na bancada (não são ícones/balões flutuantes).
  const mug=p(x+.30,y+.48,65);
  out+=`<g transform="translate(${mug.x} ${mug.y})">
    <ellipse cx="0" cy="9" rx="22" ry="7" fill="hsl(var(--iso-c-bd9b85))" opacity=".12"/>
    <path d="M-14 -11V3Q-8 10 0 4V-11" fill="hsl(var(--iso-c-f5e4d5))" stroke="hsl(var(--iso-c-b98d75))" stroke-width="2"/>
    <path d="M0 -7q13 -3 7 12" fill="none" stroke="hsl(var(--iso-c-b98d75))" stroke-width="2.4"/>
    <path d="M6 -15V-6Q10 -1 14 -6V-15" fill="hsl(var(--iso-c-b9e9ef))" stroke="hsl(var(--iso-c-8fbdc8))" stroke-width="1.6"/>
    <path d="M14 -12q9 1 3 10" fill="none" stroke="hsl(var(--iso-c-8fbdc8))" stroke-width="1.7"/>
  </g></g>`;
  return out;
}
export default function CoffeeStation(){return <g dangerouslySetInnerHTML={{__html:coffeeStation()}} />;}
