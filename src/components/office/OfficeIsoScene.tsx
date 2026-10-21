import WallWindow from './iso/WallWindow';
import RoomDefs from './iso/RoomDefs';
import MakeRoom from './iso/MakeRoom';
import Desk from './iso/Desk';
import Chair from './iso/Chair';
import Plant from './iso/Plant';
import ReviewStation from './iso/ReviewStation';
import CoffeeStation from './iso/CoffeeStation';
import MeetingRoom from './iso/MeetingRoom';
import CreativeShelf from './iso/CreativeShelf';
import Sofa from './iso/Sofa';
import ServerRack from './iso/ServerRack';
import FloorDecors from './iso/FloorDecors';
import AvatarSvg from './iso/AvatarSvg';
import ZoneSign from './iso/ZoneSign';
import NameTag from './iso/NameTag';
import { appearance } from './iso/appearance';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OfficeStationData } from '@/hooks/useOfficeOverview';
import type { OfficePerson } from './OfficePeopleLayer';
import { anchorGrid, avoidFurniture, deskChairGrid, deskGrid, floorForDesks, furnitureRects, inverseIso, iso, stackHeight, ZONE_SPOTS } from '@/lib/officeIso';
import DeskCustomizeDialog from './DeskCustomizeDialog';
import { useOfficeDeskPreferences } from '@/hooks/useOfficeDeskPreferences';
import type { DeskObjectKey } from '@/lib/officeDeskObjects';
import { resolveOfficeZone } from '@/lib/officeZone';
import { useMyManualWalk } from '@/hooks/useMyManualWalk';
import type { useOfficeCardDrag } from '@/hooks/useOfficeCardDrag';
const color = (name: string) => `hsl(var(--iso-${name}))`;
function deskGlyph(key: DeskObjectKey, accent: string): ReactNode {
  const c = (h: string) => `hsl(var(--iso-c-${h}))`;
  switch (key) {
    case 'plant': return <><path d="M-7 -10H7L5 0H-5Z" fill={c('f39e84')}/><ellipse cx="-4" cy="-16" rx="5" ry="8" fill={c('49ba8c')}/><ellipse cx="4" cy="-17" rx="5" ry="8" fill={c('36966f')}/></>;
    case 'lamp': return <><ellipse rx="9" ry="3" fill={c('546b82')}/><path d="M0 0V-22L10 -28" stroke={c('546b82')} strokeWidth="2.5" fill="none"/><path d="M4 -32L18 -26L12 -20Z" fill={c('f6c568')}/></>;
    case 'notebook': return <rect x="-11" y="-6" width="22" height="9" rx="2" transform="skewX(-20)" fill={accent}/>;
    case 'photo_frame': return <><rect x="-8" y="-20" width="16" height="18" rx="2" fill={c('ffffff')} stroke={accent} strokeWidth="2.5"/><circle cy="-12" r="3" fill={c('86c9f2')}/></>;
    case 'headphones': return <><path d="M-9 -4Q-10 -20 0 -20Q10 -20 9 -4" stroke={c('32485a')} strokeWidth="3" fill="none"/><rect x="-12" y="-8" width="6" height="9" rx="3" fill={accent}/><rect x="6" y="-8" width="6" height="9" rx="3" fill={accent}/></>;
    case 'pen_holder': return <><path d="M-6 -12H6V0H-6Z" fill={accent}/><path d="M-3 -12V-22M1 -12V-24M4 -12V-19" stroke={c('32485a')} strokeWidth="1.6"/></>;
    case 'mini_calendar': return <><rect x="-9" y="-18" width="18" height="17" rx="2" fill={c('ffffff')} stroke={c('93b6ca')}/><rect x="-9" y="-18" width="18" height="5" rx="2" fill={c('f17468')}/></>;
    default: return <><ellipse rx="8" ry="4" fill={accent}/><path d="M-6 -2V-14H6V-2Z" fill={c('ffffff')} stroke={accent} strokeWidth="2"/><path d="M6 -12q7 1 0 8" stroke={accent} strokeWidth="2" fill="none"/></>;
  }
}
type DragAPI = ReturnType<typeof useOfficeCardDrag>;
interface Props { stations:OfficeStationData[]; people:OfficePerson[]; myId?:string; mobile:boolean; onQueue:(id:string)=>void; onCard:(id:string)=>void; startPress:DragAPI['startPress']; consumeClickSuppression:DragAPI['consumeClickSuppression']; targetUserId?:string; registerStack:(id:string,el:SVGElement|null)=>void; tenantId?:string|null }
export default function OfficeIsoScene({stations,people,myId,mobile,onQueue,onCard,startPress,consumeClickSuppression,targetUserId,registerStack,tenantId}:Props) {
 const prefs=useOfficeDeskPreferences(tenantId); const canSavePrefs=!!tenantId&&!!myId; const [customizing,setCustomizing]=useState(false);
 const svg=useRef<SVGSVGElement>(null); const floor=floorForDesks(stations.length);
 const base={x:-floor.height*52-55,y:-165,w:(13+floor.height)*52+110,h:(13+floor.height)*24+240};
 const [camera,setCamera]=useState({x:0,y:0,zoom:1}); const [selected,setSelected]=useState<string|null>(null);
 const view={x:base.x+camera.x,y:base.y+camera.y,w:base.w/camera.zoom,h:base.h/camera.zoom};
 const users=useMemo(()=>stations.map(s=>s.collaborator.userId),[stations]);
 const me=stations.find(s=>s.collaborator.userId===myId); const myPerson=people.find(p=>p.userId===myId);
 const anchor=myPerson?anchorGrid(myPerson.anchorKey,users):null;
 const signature={demands:(me?.queue||[]).map(c=>({id:c.id,stage:`${c.functionKey}:${c.stageLabel}`})),presenceZone:me?`${me.presence.state}:${resolveOfficeZone({state:me.presence.state,current:me.current})}`:'absent'};
 const walk=useMyManualWalk(anchor,signature,!me?.current||signature.presenceZone.includes('coffee'));
 const point=(x:number,y:number)=>{const s=svg.current!;const p=new DOMPoint(x,y);return p.matrixTransform(s.getScreenCTM()!.inverse());};
 const zoomAt=(factor:number,x:number,y:number)=>{const p=point(x,y);setCamera(old=>{const zoom=Math.max(.75,Math.min(1.9,old.zoom*factor));const ratio=old.zoom/zoom;return {zoom,x:p.x-base.x-(p.x-base.x-old.x)*ratio,y:p.y-base.y-(p.y-base.y-old.y)*ratio};});};
 const zoomRef=useRef(zoomAt); zoomRef.current=zoomAt;
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();zoomRef.current(Math.exp(-e.deltaY*(e.deltaMode===1?.025:.0015)),e.clientX,e.clientY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const pan=useRef<{id:number;x:number;y:number;px:number;py:number;cx:number;cy:number;moved:boolean}|null>(null);
 const interactive=(action:()=>void,label:string)=>({role:'button',tabIndex:0,'aria-label':label,onClick:action,onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action();}},'data-interactive':true});
 const entities:{depth:number;key:string;node:ReactNode}[]=[];
 const overlays:ReactNode[]=[];
 const rects=furnitureRects(stations.length);
 const deskPeople=new Set<string>();
 stations.forEach((s,i)=>{
 const p=deskGrid(i),id=s.collaborator.userId,theme=appearance(id),ch=deskChairGrid(i);
 const person=people.find(pp=>pp.userId===id);
 const seated=!!person&&person.anchorKey===`desk:${id}`&&!(id===myId&&walk.manual);
 if(seated)deskPeople.add(id);
 const open=()=>{if(!consumeClickSuppression())onQueue(id);};
 const deskClick=()=>{if(consumeClickSuppression())return;if(id===myId&&canSavePrefs)setCustomizing(true);else onQueue(id);};
 const seat=iso(ch.x+.32,ch.y+.32),mon=iso(p.x+1.12,p.y+.4),obj=iso(p.x+.42,p.y+.62),st=iso(p.x+1.78,p.y+.95),plate=iso(p.x+1.12,p.y+1.58);
 const a0=iso(p.x+.2,p.y+1.58),a1=iso(p.x+2.05,p.y+1.58);
 const count=s.queueCount,h=stackHeight(count),n=Math.min(count,10),late=s.queue.filter(c=>c.isLate).length;
 const objectKey=(prefs.byUser[id]||[])[0];
 entities.push({depth:p.x+p.y+1,key:id,node:<g data-office-desk-user={id} data-user-id={id}>
 <Chair args={[ch.x,ch.y,theme.chair]}/>
 {seated&&person&&<g transform={`translate(${seat.x} ${seat.y-20})`} data-user-id={id} {...interactive(()=>onQueue(id),`Abrir fila de ${person.name}`)} className="iso-interactive"><AvatarSvg args={[id,{...appearance(id),name:person.name,team:''},id===myId]}/></g>}
 <g {...interactive(deskClick,id===myId?'Personalizar minha mesa':`Fila de ${s.collaborator.fullName}`)} className="iso-interactive"><Desk args={[p.x,p.y,theme,id]}/></g>
 <g pointerEvents="none" transform={`translate(${mon.x} ${mon.y-56})`}><rect x="-5" y="-9" width="10" height="9" fill={color('c-8eb8ce')}/><ellipse cy="0" rx="16" ry="5" fill={color('c-7daece')}/><rect x="-29" y="-35" width="58" height="27" rx="5" fill={color('c-546b82')} stroke={color('c-364d68')} strokeWidth="2"/><circle cy="-21" r="3" fill={color('c-8fb9d1')}/>{s.current&&<circle cx="22" cy="-29" r="2.4" fill={color('c-49e4b4')}/>}</g>
 <polygon pointerEvents="none" points={`${a0.x},${a0.y-50} ${a1.x},${a1.y-50} ${a1.x},${a1.y-54} ${a0.x},${a0.y-54}`} fill={color('c-e3eff6')}/>
 {s.current&&<polygon pointerEvents="none" points={`${a0.x},${a0.y-50} ${a1.x},${a1.y-50} ${a1.x},${a1.y-54} ${a0.x},${a0.y-54}`} fill={color(late?'c-f17468':'c-29b0ff')}><title>{`Etapa atual: ${s.current.stageLabel}`}</title></polygon>}
 {objectKey&&<g pointerEvents="none" transform={`translate(${obj.x} ${obj.y-56})`}><title>{objectKey}</title>{deskGlyph(objectKey,theme.paper)}</g>}
 <g ref={el=>registerStack(id,el)} transform={`translate(${st.x} ${st.y-56})`}>
 {Array.from({length:n},(_,j)=>{const card=s.queue[n-1-j];const y=-(j+1)*(h/Math.max(1,n));const sheet=<><rect x={-17+(j%2)*2} y={y-4} width="34" height="12" rx="2" transform={`skewX(-20)`} fill={color('paper')} stroke={theme.paper} strokeWidth="1.2"/></>;
  return card&&j>=n-8?<g key={card.id} data-interactive="true" onPointerDown={e=>{e.stopPropagation();startPress(e,{id:card.id,title:card.title,fromUserId:id});}} onClick={e=>{e.stopPropagation();if(!consumeClickSuppression())onCard(card.id);}} className="iso-interactive"><title>{card.title}</title>{sheet}</g>:<g key={`f${j}`} pointerEvents="none">{sheet}</g>;})}
 {count>0&&<g {...interactive(open,`Fila de ${s.collaborator.fullName}, ${count} demandas`)} className="iso-interactive" transform={`translate(26 ${-h-6})`}><rect x="-2" y="-9" width={count>9?24:18} height="14" rx="7" fill={color('c-ffffff')} stroke={theme.paper}/><text x={count>9?10:7} y="1.5" textAnchor="middle" fontSize="9" fontWeight="900" fill={color(count>15?'c-f17468':'c-24445e')}>{count}</text></g>}
 </g>
 </g>});
 overlays.push(<g key={`plate-${id}`}>
 <g transform={`translate(${plate.x-66} ${plate.y-30})`} {...interactive(open,`Fila de ${s.collaborator.fullName}, ${count} demandas`)} className="iso-interactive" data-user-id={id}>
 <title>{`${s.collaborator.fullName}: ${count} demandas${late?`, ${late} atrasadas`:''}`}</title>
 <rect width="132" height="28" rx="7" fill={color('c-ffffff')} stroke={targetUserId===id?color('c-167fbf'):theme.color} strokeWidth={targetUserId===id?3:1.4}/>
 <circle cx="9" cy="10" r="3" fill={color(s.current?'c-22c3a0':s.presence.state==='working_now'?'c-ffb744':'c-97acba')}/>
 <text x="16" y="13" fontSize="10" fontWeight="900" fill={color('c-24445e')}>{s.collaborator.fullName.split(' ').slice(0,2).join(' ').slice(0,18)}</text>
 <text x="8" y="23" fontSize="7.5" fontWeight="700" fill={color('c-7590a3')}>{(s.current?s.current.stageLabel:'Sem demanda ativa').slice(0,26)}</text>
 <text x="125" y="13" textAnchor="end" fontSize="10" fontWeight="900" fill={color(late?'c-f17468':'c-167fbf')}>{count}</text>
 {late>0&&<text x="125" y="23" textAnchor="end" fontSize="7" fontWeight="900" fill={color('c-f17468')}>{`${late} atras.`}</text>}
 </g>
 </g>);
 });
 const zoneLabels={planning:'Planejamento',review:'Revisão',coffee:'Café',meeting:'Reunião',waiting:'Espera'};
 const zoneObjects={planning:<CreativeShelf/>,review:<ReviewStation/>,coffee:<CoffeeStation/>,meeting:<MeetingRoom/>,waiting:<Sofa/>};
 Object.entries(ZONE_SPOTS).forEach(([key,p])=>{
 entities.push({depth:p.x+p.y,key,node:zoneObjects[key as keyof typeof zoneObjects]});
 overlays.unshift(<g key={`sign-${key}`} {...interactive(()=>setSelected(selected===key?null:key),zoneLabels[key as keyof typeof zoneLabels])} className="iso-interactive"><ZoneSign args={[p.x,p.y,zoneLabels[key as keyof typeof zoneLabels],{review:'✓',meeting:'◈',coffee:'☕',planning:'✎',waiting:'◷'}[key],key]}/></g>);
 });
 [{x:.7,y:3.4,s:.85},{x:4.6,y:1.6,s:1.05},{x:.42,y:7,s:.8},{x:11.45,y:floor.height-1.2,s:.9},{x:12.52,y:floor.height-1.2,s:.7}].forEach((p,i)=>entities.push({depth:p.x+p.y,key:`plant-${i}`,node:<g className="iso-plant"><Plant args={[p.x,p.y,p.s]}/></g>}));
 entities.push({depth:15,key:'server',node:<ServerRack/>});
 people.filter(person=>!deskPeople.has(person.userId)).forEach(person=>{const p=person.userId===myId&&walk.position?walk.position:anchorGrid(person.anchorKey,users),q=iso(p.x,p.y);
 entities.push({depth:p.x+p.y+.2,key:`person-${person.userId}`,node:<g data-user-id={person.userId} transform={`translate(${q.x} ${q.y})`} {...interactive(()=>onQueue(person.userId),`Abrir fila de ${person.name}`)} className="iso-interactive"><AvatarSvg args={[person.userId,{...appearance(person.userId),name:person.name,team:''},person.userId===myId]}/>{person.anchorKey.startsWith('coffee:')&&<g transform="translate(24 -16)" pointerEvents="none"><path d="M-5 -9H5V2Q0 5 -5 2Z" fill={color('c-ffffff')} stroke={color('c-806556')} strokeWidth="1.5"/><path d="M5 -6q5 1 0 6" stroke={color('c-806556')} fill="none" strokeWidth="1.5"/></g>}</g>});
 overlays.push(<g key={`name-${person.userId}`} data-user-id={person.userId} {...interactive(()=>onQueue(person.userId),`Abrir fila de ${person.name}`)} className="iso-interactive"><NameTag x={q.x} y={q.y} name={person.name} working={person.working} caption={person.userId===myId&&walk.manual?'Indo até lá...':person.caption}/></g>);
 });
 return <><svg ref={svg} className="office-iso-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="Escritório virtual isométrico" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('[data-interactive]'))return;const p=point(e.clientX,e.clientY);pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,px:p.x,py:p.y,cx:camera.x,cy:camera.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>=6)p.moved=true;if(p.moved){const q=point(e.clientX,e.clientY);setCamera(c=>({...c,x:c.x+p.px-q.x,y:c.y+p.py-q.y}));}}} onPointerUp={e=>{const p=pan.current;pan.current=null;if(!p)return;if(!p.moved&&myPerson){const q=point(e.clientX,e.clientY);const raw={x:(q.x/52+q.y/24)/2,y:(q.y/24-q.x/52)/2};if(raw.x>=0&&raw.x<=floor.width&&raw.y>=0&&raw.y<=floor.height)walk.move(avoidFurniture(inverseIso(q,floor),rects));}e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{pan.current=null;}}><RoomDefs/><MakeRoom args={[floor.height]}/><FloorDecors/><WallWindow args={[.65,0,'right']}/>{entities.sort((a,b)=>a.depth-b.depth).map(e=><g key={e.key}>{e.node}</g>)}<g className="iso-overlays">{overlays}</g></svg>
 {myId&&canSavePrefs&&<DeskCustomizeDialog open={customizing} onOpenChange={setCustomizing} value={prefs.byUser[myId]||[]} onSave={(o)=>prefs.save(myId,o)}/>}
 <div className="iso-controls absolute bottom-4 left-4 flex gap-2 rounded-2xl border bg-card p-2">{[['−',.85],['+',1.18]].map(([label,factor])=><button key={label} aria-label={label==='+'?'Ampliar':'Reduzir'} className="px-3 py-1" onClick={()=>{const r=svg.current!.getBoundingClientRect();zoomAt(Number(factor),r.x+r.width/2,r.y+r.height/2);}}>{label}</button>)}<button onClick={()=>setCamera({x:0,y:0,zoom:1})}>Recentralizar</button></div>
 {selected&&<div className="absolute bottom-20 left-4 max-w-xs rounded-xl border bg-card p-4 text-sm shadow-lg"><button className="float-right ml-4" onClick={()=>setSelected(null)} aria-label="Fechar zona">×</button><strong>{zoneLabels[selected as keyof typeof zoneLabels]}</strong><p>{people.filter(p=>p.anchorKey.startsWith(`${selected}:`)).map(p=>p.name).join(', ')||'Ninguém aqui no momento'}</p></div>}</>;
}
