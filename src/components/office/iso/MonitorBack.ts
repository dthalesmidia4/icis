// @ts-nocheck — portado do HTML de referência v8.
import {p} from './geometry';
export function monitorBack(x,y,accent:string='hsl(var(--iso-c-57b8e8))'){
 // Painel traseiro com leve inclinacao para a direita, acompanhando a perspectiva.
 // Haste alinhada ao centro geometrico inferior da tela e a base oval.
 const v=p(x,y,52);
 return `<g class="monitor-back" transform="translate(${v.x} ${v.y})">
   <ellipse cx="1.8" cy="7.3" rx="15.3" ry="4.9" fill="hsl(var(--iso-c-477b96))" opacity=".10"/>
   <!-- Haste unica: entra por tras da borda inferior e termina no centro da base -->
   <path d="M-2.3 -17.0L3.7 -16.2L5.0 4.4L-1.5 4.4Z" fill="hsl(var(--iso-c-8daec2))" stroke="hsl(var(--iso-c-7194aa))" stroke-width="1.2" stroke-linejoin="round"/>
   <path d="M0 -14L2.0 -13.5L2.8 2.8" fill="none" stroke="hsl(var(--iso-c-d9eaf4))" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
   <ellipse cx="1.8" cy="5.7" rx="12.6" ry="4.1" fill="hsl(var(--iso-c-a3c3d5))" stroke="hsl(var(--iso-c-769bb2))" stroke-width="1.3"/>
   <ellipse cx="1.8" cy="5.0" rx="9.6" ry="2.1" fill="hsl(var(--iso-c-e4f1f8))" opacity=".78"/>
   <!-- Moldura em perspectiva leve para a direita, sem conteudo de tela -->
   <path d="M-25 -49L-21.7 -50.7L25.1 -44.7L21.8 -43.0Z" fill="hsl(var(--iso-c-eaf4f9))" stroke="hsl(var(--iso-c-88aabe))" stroke-width=".85"/>
   <path d="M21.8 -43.0L25.1 -44.7L27.5 -13L24.2 -11.2Z" fill="hsl(var(--iso-c-83a4b7))" stroke="hsl(var(--iso-c-688ca2))" stroke-width="1.0"/>
   <path d="M-25 -49L21.8 -43L24.2 -11.2L-22.6 -17.2Z" fill="hsl(var(--iso-c-bfd5e2))" stroke="hsl(var(--iso-c-749aaf))" stroke-width="1.9" stroke-linejoin="round"/>
   <path d="M-21 -45.4L17.7 -40.4" stroke="hsl(var(--iso-c-f6fbff))" stroke-width="1.35" stroke-linecap="round" opacity=".54"/>
   <circle cx="-0.4" cy="-30.1" r="3.5" fill="hsl(var(--iso-c-b3cedd))" stroke="hsl(var(--iso-c-96b7c9))" stroke-width=".9"/>
   <circle cx="-0.4" cy="-30.1" r="1.35" fill="${accent}" opacity=".62"/>
 </g>`
}
