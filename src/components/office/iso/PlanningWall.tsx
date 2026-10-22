// @ts-nocheck — portado do HTML de referência v8.
import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {rug} from './Rug';
export function planningGlassWall(){
  // Painel de planejamento FIXADO NA PAREDE lateral, entre a janela e o logotipo.
  // Texto, post-its e divisorias existem no vidro; nao ha placa/balao flutuante.
  const a=p(0,6.0),bx=a.x,by=a.y-125;
  let out=`<g class="interactive station zone-landmark" data-zone="planning" data-team="all" role="button" tabindex="0" aria-label="Abrir área Planejamento">
  <title>Planejamento — painel de vidro com post-its</title>
  <g transform="translate(${bx} ${by}) matrix(1 -.4615 0 1 0 0)">
   <rect x="-7" y="-2" width="150" height="106" rx="8" fill="hsl(var(--iso-c-4f9fc6))" opacity=".12"/>
   <rect x="0" y="0" width="137" height="98" rx="7" fill="hsl(var(--iso-c-d0ecf6))" fill-opacity=".68" stroke="hsl(var(--iso-c-83b6d2))" stroke-width="5"/>
   <rect x="5" y="5" width="127" height="88" rx="4" fill="hsl(var(--iso-c-eefaff))" fill-opacity=".49" stroke="hsl(var(--iso-c-ffffff))" stroke-opacity=".86" stroke-width="1.2"/>
   <path d="M8 6H38L9 43Z" fill="hsl(var(--iso-c-ffffff))" opacity=".42"/>
   <path d="M99 6H123L77 92H60Z" fill="hsl(var(--iso-c-ffffff))" opacity=".22"/>
   <text x="68" y="24" text-anchor="middle" font-family="Trebuchet MS,system-ui,sans-serif" font-weight="1000" font-size="11.3" letter-spacing="1.1" fill="hsl(var(--iso-c-345f80))">PLANEJAMENTO</text>
   <path d="M21 32H116" stroke="hsl(var(--iso-c-8dbbd2))" stroke-opacity=".75" stroke-width="1"/>
   <rect x="13" y="38" width="31" height="40" rx="2" fill="hsl(var(--iso-c-ffeaa2))" stroke="hsl(var(--iso-c-e6cc81))" stroke-width="1"/>
   <rect x="53" y="38" width="31" height="40" rx="2" fill="hsl(var(--iso-c-c5f0e3))" stroke="hsl(var(--iso-c-9ed0c3))" stroke-width="1"/>
   <rect x="93" y="38" width="31" height="40" rx="2" fill="hsl(var(--iso-c-e6d8fb))" stroke="hsl(var(--iso-c-c5afe7))" stroke-width="1"/>
   <g stroke-width="1.5" stroke-linecap="round" opacity=".8">
    <path d="M19 51H36M19 57H34M19 63H30" stroke="hsl(var(--iso-c-ba9c45))"/>
    <path d="M59 51H76M59 57H73M59 63H68" stroke="hsl(var(--iso-c-5da995))"/>
    <path d="M99 51H117M99 57H113M99 63H109" stroke="hsl(var(--iso-c-9b80cf))"/>
   </g>
   <circle cx="28" cy="41" r="2" fill="hsl(var(--iso-c-f2bc73))"/><circle cx="68" cy="41" r="2" fill="hsl(var(--iso-c-82c5b9))"/><circle cx="108" cy="41" r="2" fill="hsl(var(--iso-c-b49bdb))"/>
   <rect x="54" y="84" width="28" height="3" rx="1.5" fill="hsl(var(--iso-c-83bbd2))" opacity=".8"/>
   <circle cx="7" cy="7" r="2" fill="hsl(var(--iso-c-ffffff))"/><circle cx="130" cy="7" r="2" fill="hsl(var(--iso-c-ffffff))"/>
  </g>
  <ellipse cx="${a.x+67}" cy="${a.y-17}" rx="58" ry="4" fill="hsl(var(--iso-c-407e9d))" opacity=".04"/>
  </g>`;
  return out;
}
export default function PlanningWall(){return <g dangerouslySetInnerHTML={{__html:planningGlassWall()}} />;}
