import type {OfficeStationData} from '@/hooks/useOfficeOverview';
import {appearance} from './appearance';
const c=(s:string)=>`hsl(var(--iso-c-${s}))`;
export default function DeskCounter({station:s,x,y,active}:{station:OfficeStationData;x:number;y:number;active:boolean}){const theme=appearance(s.collaborator.userId);return <g transform={`translate(${x-76} ${y-23})`}>
 <rect y="4" width="152" height="52" rx="10" fill={c('2b688b')} opacity=".11"/>
 <rect width="152" height="50" rx="10" fill={c('ffffff')} stroke={active?c('167fbf'):theme.color} strokeWidth={active?4:1.8}/>
 <rect x="1.5" y="7" width="3" height="36" rx="2" fill={theme.color}/>
 <text x="13" y="17" fontSize="13.5" fontWeight="900" fill={c('24445e')}>{s.collaborator.fullName.split(' ').slice(0,2).join(' ').slice(0,15)}</text>
 <circle cx="14" cy="31" r="3.5" fill={c('35aadf')}/><text x="22" y="34.5" fontSize="10.3" fontWeight="700" fill={c('7590a3')}>{s.current?'1 produzindo':`${s.queueCount} na fila`}</text>
 <rect x="110" y="5" width="36" height="40" rx="8" fill={c('e9f6ff')}/><text x="128" y="28" textAnchor="middle" fontSize="23" fontWeight="900" fill={c('167fbf')}>{String(s.queueCount).padStart(2,'0')}</text><text x="128" y="39" textAnchor="middle" fontSize="6.9" fontWeight="900" fill={c('678da5')}>DEMANDAS</text>
 {s.queue.some(card=>card.isLate)&&<circle cx="141" cy="5" r="6.5" fill={c('f17468')} stroke={c('ffffff')} strokeWidth="2"/>}
 </g>}
