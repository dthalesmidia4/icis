import type {OfficeStationData} from '@/hooks/useOfficeOverview';
import {appearance} from './appearance';
const c=(s:string)=>`hsl(var(--iso-c-${s}))`;
// Carga visual: até 5 demandas = leve, até 15 = moderada, acima = pesada.
const loadOf=(n:number)=>n<=5?{label:'Leve',color:'22c3a0',pct:Math.max(.08,n/5*.33)}:n<=15?{label:'Moderada',color:'ffb744',pct:.33+(n-5)/10*.33}:{label:'Pesada',color:'f17468',pct:Math.min(1,.66+(n-15)/30*.34)};
export default function DeskCounter({station:s,x,y,active}:{station:OfficeStationData;x:number;y:number;active:boolean}){
 const theme=appearance(s.collaborator.userId);
 const total=s.queueCount;const producing=s.current?1:0;const waiting=Math.max(0,total-producing);
 const late=s.queue.filter(card=>card.isLate).length;const load=loadOf(total);
 const W=176;
 return <g transform={`translate(${x-W/2} ${y-34})`}>
 <title>{`${s.collaborator.fullName}: ${total} demandas — ${producing} em produção, ${waiting} na fila${late?`, ${late} atrasadas`:''}`}</title>
 <rect y="4" width={W} height="70" rx="10" fill={c('2b688b')} opacity=".11"/>
 <rect width={W} height="68" rx="10" fill={c('ffffff')} stroke={active?c('167fbf'):theme.color} strokeWidth={active?4:1.8}/>
 <rect x="1.5" y="7" width="3" height="54" rx="2" fill={theme.color}/>
 <text x="13" y="17" fontSize="13.5" fontWeight="900" fill={c('24445e')}>{s.collaborator.fullName.split(' ').slice(0,2).join(' ').slice(0,16)}</text>
 <text x="13" y="32" fontSize="10" fontWeight="700" fill={c('7590a3')}>{`${producing} produzindo · ${waiting} na fila`}</text>
 {late>0?<text x="13" y="45" fontSize="10" fontWeight="900" fill={c('f17468')}>{`${late} atrasada${late>1?'s':''}`}</text>:<text x="13" y="45" fontSize="10" fontWeight="700" fill={c('22c3a0')}>Em dia</text>}
 <rect x="13" y="53" width="110" height="7" rx="3.5" fill={c('e9f6ff')}/>
 <rect x="13" y="53" width={110*load.pct} height="7" rx="3.5" fill={c(load.color)}/>
 <rect x="130" y="5" width="40" height="58" rx="8" fill={c('e9f6ff')}/>
 <text x="150" y="32" textAnchor="middle" fontSize="24" fontWeight="900" fill={c(total>15?'f17468':'167fbf')}>{String(total).padStart(2,'0')}</text>
 <text x="150" y="44" textAnchor="middle" fontSize="6.9" fontWeight="900" fill={c('678da5')}>DEMANDAS</text>
 <text x="150" y="56" textAnchor="middle" fontSize="7.5" fontWeight="900" fill={c(load.color)}>{load.label.toUpperCase()}</text>
 </g>}
