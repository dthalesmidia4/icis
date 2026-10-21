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
import DeskCounter from './iso/DeskCounter';
import ZoneSign from './iso/ZoneSign';
import NameTag from './iso/NameTag';
import { appearance } from './iso/appearance';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OfficeStationData } from '@/hooks/useOfficeOverview';
import type { OfficePerson } from './OfficePeopleLayer';
import { anchorGrid, deskGrid, floorForDesks, inverseIso, iso, ZONE_SPOTS, type GridPoint } from '@/lib/officeIso';
import { resolveOfficeZone } from '@/lib/officeZone';
import { useMyManualWalk } from '@/hooks/useMyManualWalk';
import type { useOfficeCardDrag } from '@/hooks/useOfficeCardDrag';
const color = (name: string) => `hsl(var(--iso-${name}))`;
type DragAPI = ReturnType<typeof useOfficeCardDrag>;
interface Props { stations:OfficeStationData[]; people:OfficePerson[]; myId?:string; mobile:boolean; onQueue:(id:string)=>void; onCard:(id:string)=>void; startPress:DragAPI['startPress']; consumeClickSuppression:DragAPI['consumeClickSuppression']; targetUserId?:string; registerStack:(id:string,el:SVGElement|null)=>void }
export default function OfficeIsoScene({stations,people,myId,mobile,onQueue,onCard,startPress,consumeClickSuppression,targetUserId,registerStack}:Props) {
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
 stations.forEach((s,i)=>{
 const p=deskGrid(i),id=s.collaborator.userId,q=iso(p.x+1.4,p.y+.1),theme=appearance(id);
 const open=()=>{if(!consumeClickSuppression())onQueue(id);};
 entities.push({depth:p.x+p.y+1,key:id,node:<g data-office-desk-user={id} data-user-id={id} {...interactive(open,`Fila de ${s.collaborator.fullName}`)} className="iso-interactive">
 <Chair args={[p.x+1.45,p.y+1.83,theme.chair]}/><Desk args={[p.x,p.y,theme,id]}/>
 <g ref={el=>registerStack(id,el)} transform={`translate(${q.x+12} ${q.y-54})`}>
 {s.queue.slice(0,8).map((card,j)=><g key={card.id} data-interactive="true" onPointerDown={e=>{e.stopPropagation();startPress(e,{id:card.id,title:card.title,fromUserId:id});}} onClick={e=>{e.stopPropagation();if(!consumeClickSuppression())onCard(card.id);}} className="iso-interactive"><title>{card.title}</title><rect x={-18+j%2*3} y={-12-j*4} width="34" height="19" rx="2" fill={color('paper')} stroke={theme.paper}/><path d={`M-12 ${-5-j*4}H7`} stroke={theme.paper}/></g>)}
 </g></g>});
 overlays.push(<g key={`counter-${id}`} data-user-id={id} {...interactive(open,`Fila de ${s.collaborator.fullName}, ${s.queueCount} demandas`)} className="iso-interactive"><DeskCounter station={s} x={q.x+32} y={q.y-73} active={targetUserId===id}/></g>);
 });
 const zoneLabels={planning:'Planejamento',review:'Revisão',coffee:'Café',meeting:'Reunião',waiting:'Espera'};
 const zoneObjects={planning:<CreativeShelf/>,review:<ReviewStation/>,coffee:<CoffeeStation/>,meeting:<MeetingRoom/>,waiting:<Sofa/>};
 Object.entries(ZONE_SPOTS).forEach(([key,p])=>{
 entities.push({depth:p.x+p.y,key,node:zoneObjects[key as keyof typeof zoneObjects]});
 overlays.unshift(<g key={`sign-${key}`} {...interactive(()=>setSelected(selected===key?null:key),zoneLabels[key as keyof typeof zoneLabels])} className="iso-interactive"><ZoneSign args={[p.x,p.y,zoneLabels[key as keyof typeof zoneLabels],{review:'✓',meeting:'◈',coffee:'☕',planning:'✎',waiting:'◷'}[key],key]}/></g>);
 });
 [{x:.7,y:3.4,s:.85},{x:4.6,y:1.6,s:1.05},{x:.42,y:7,s:.8},{x:11.45,y:floor.height-1.2,s:.9},{x:12.52,y:floor.height-1.2,s:.7}].forEach((p,i)=>entities.push({depth:p.x+p.y,key:`plant-${i}`,node:<g className="iso-plant"><Plant args={[p.x,p.y,p.s]}/></g>}));
 entities.push({depth:15,key:'server',node:<ServerRack/>});
 people.forEach(person=>{const p=person.userId===myId&&walk.position?walk.position:anchorGrid(person.anchorKey,users),q=iso(p.x,p.y);
 entities.push({depth:p.x+p.y+.2,key:`person-${person.userId}`,node:<g data-user-id={person.userId} transform={`translate(${q.x} ${q.y})`} {...interactive(()=>onQueue(person.userId),`Abrir fila de ${person.name}`)} className="iso-interactive"><AvatarSvg args={[person.userId,{...appearance(person.userId),name:person.name,team:''},person.userId===myId]}/></g>});
 overlays.push(<g key={`name-${person.userId}`} data-user-id={person.userId} {...interactive(()=>onQueue(person.userId),`Abrir fila de ${person.name}`)} className="iso-interactive"><NameTag x={q.x} y={q.y} name={person.name} working={person.working} caption={person.userId===myId&&walk.manual?'Indo até lá...':person.caption}/></g>);
 });
 return <><svg ref={svg} className="office-iso-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="Escritório virtual isométrico" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('[data-interactive]'))return;const p=point(e.clientX,e.clientY);pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,px:p.x,py:p.y,cx:camera.x,cy:camera.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>=6)p.moved=true;if(p.moved){const q=point(e.clientX,e.clientY);setCamera(c=>({...c,x:c.x+p.px-q.x,y:c.y+p.py-q.y}));}}} onPointerUp={e=>{const p=pan.current;pan.current=null;if(!p)return;if(!p.moved&&myPerson){const q=point(e.clientX,e.clientY);const raw={x:(q.x/52+q.y/24)/2,y:(q.y/24-q.x/52)/2};if(raw.x>=0&&raw.x<=floor.width&&raw.y>=0&&raw.y<=floor.height)walk.move(inverseIso(q,floor));}e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{pan.current=null;}}><RoomDefs/><MakeRoom args={[floor.height]}/><FloorDecors/><WallWindow args={[0,0,'left']}/>{entities.sort((a,b)=>a.depth-b.depth).map(e=><g key={e.key}>{e.node}</g>)}<g className="iso-overlays">{overlays}</g></svg>
 <div className="iso-controls absolute bottom-4 left-4 flex gap-2 rounded-2xl border bg-card p-2">{[['−',.85],['+',1.18]].map(([label,factor])=><button key={label} aria-label={label==='+'?'Ampliar':'Reduzir'} className="px-3 py-1" onClick={()=>{const r=svg.current!.getBoundingClientRect();zoomAt(Number(factor),r.x+r.width/2,r.y+r.height/2);}}>{label}</button>)}<button onClick={()=>setCamera({x:0,y:0,zoom:1})}>Recentralizar</button></div>
 {selected&&<div className="absolute bottom-20 left-4 max-w-xs rounded-xl border bg-card p-4 text-sm shadow-lg"><button className="float-right ml-4" onClick={()=>setSelected(null)} aria-label="Fechar zona">×</button><strong>{zoneLabels[selected as keyof typeof zoneLabels]}</strong><p>{people.filter(p=>p.anchorKey.startsWith(`${selected}:`)).map(p=>p.name).join(', ')||'Ninguém aqui no momento'}</p></div>}</>;
}
