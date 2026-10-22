import WallWindow from './iso/WallWindow';
import RoomDefs from './iso/RoomDefs';
import MakeRoom from './iso/MakeRoom';
import Desk from './iso/Desk';
import { ChairBehind } from './iso/Chair';
import { useOfficeWalkers } from '@/hooks/useOfficeWalkers';
import Plant from './iso/Plant';
import ReviewStation from './iso/ReviewStation';
import CoffeeStation from './iso/CoffeeStation';
import MeetingRoom from './iso/MeetingRoom';
import CreativeShelf from './iso/CreativeShelf';
import Sofa from './iso/Sofa';
import PlanningWall from './iso/PlanningWall';
import FloorDecors from './iso/FloorDecors';
import AvatarSvg from './iso/AvatarSvg';
import NameTag from './iso/NameTag';
import { appearance } from './iso/appearance';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OfficeStationData } from '@/hooks/useOfficeOverview';
import type { OfficePerson } from './OfficePeopleLayer';
import { anchorGrid, deskSeatGrid, deskGrid, paperSheets, type GridPoint, floorForDesks, inverseIso, iso, ZONE_SPOTS, COFFEE_RUG, interactionSpot, freeWalkPoint, walkSignatureKey, officeWalkEventKey, type WalkZone, type OfficeWalkEvent } from '@/lib/officeIso';
import { useOfficeWalkSync } from '@/hooks/useOfficeWalkSync';
import DeskCustomizeDialog from './DeskCustomizeDialog';
import { useOfficeDeskPreferences } from '@/hooks/useOfficeDeskPreferences';
import type { DeskObjectKey } from '@/lib/officeDeskObjects';
import { resolveOfficeZone } from '@/lib/officeZone';
import { useMyManualWalk } from '@/hooks/useMyManualWalk';
import type { useOfficeCardDrag } from '@/hooks/useOfficeCardDrag';
const color = (name: string) => `hsl(var(--iso-${name}))`;
const hx = (h: string) => `hsl(var(--iso-c-${h}))`;
const isoZ = (x: number, y: number, z: number) => { const q = iso(x, y); return { x: q.x, y: q.y - z }; };
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
  const canWalk=!!tenantId&&!!myId&&!!myPerson&&!!me&&me.presence.state!=='off_shift';
  const walk=useMyManualWalk(anchor,signature,!me?.current||signature.presenceZone.includes('coffee'),canWalk);
  const {remote:remoteWalks,received}=useOfficeWalkSync(tenantId,myId,walk.event,stations.length);
  const actions:Record<string,OfficeWalkEvent>={};
  people.forEach(pp=>{
    const event=pp.userId===myId?walk.event:remoteWalks[pp.userId],station=stations.find(s=>s.collaborator.userId===pp.userId);
    if(!event?.target||!station)return;
    const sig={demands:station.queue.map(c=>({id:c.id,stage:`${c.functionKey}:${c.stageLabel}`})),presenceZone:`${station.presence.state}:${resolveOfficeZone({state:station.presence.state,current:station.current})}`};
    if(event.signature===walkSignatureKey(sig))actions[pp.userId]=event;
  });
  const targets:Record<string,GridPoint>={};people.forEach(pp=>{targets[pp.userId]=actions[pp.userId]?.target||anchorGrid(pp.anchorKey,users);});
  const walkers=useOfficeWalkers(targets,stations.length);
  const [notice,setNotice]=useState('');
  const noticed=useRef(new Set<string>());
  const pendingNotices=useRef<Record<string,string>>({});
  const announce=(uid:string,event:OfficeWalkEvent)=>{
    const k=officeWalkEventKey(event);if(noticed.current.has(k)||!event.target)return;
    noticed.current.add(k);pendingNotices.current[uid]=k;
    const person=people.find(p=>p.userId===uid);if(person)setNotice(`${person.name.split(' ')[0]} está explorando o escritório`);
  };
  useEffect(()=>{if(myId&&walk.event)announce(myId,walk.event);},[myId,walk.event]);
  useEffect(()=>{if(received)announce(received.userId,received.event);},[received]);
  useEffect(()=>{
    const labels:Partial<Record<WalkZone,string>>={coffee:'foi ao Cantinho do Café',waiting:'está descansando',meeting:'está em reunião',planning:'foi ao Planejamento',review:'foi à Revisão'};
    for(const [uid,k] of Object.entries(pendingNotices.current)){
      const event=actions[uid],w=walkers[uid];
      if(!event||officeWalkEventKey(event)!==k){delete pendingNotices.current[uid];continue;}
      if(!w||w.walking||!event.target||Math.hypot(w.pos.x-event.target.x,w.pos.y-event.target.y)>.1)continue;
      delete pendingNotices.current[uid];const label=labels[event.zone],person=people.find(p=>p.userId===uid);
      if(label&&person)setNotice(`${person.name.split(' ')[0]} ${label}`);
    }
  },[walkers,actions,people]);
  useEffect(()=>{if(!notice)return;const t=window.setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(t);},[notice]);
  const visit=(zone:WalkZone)=>{
    if(!canWalk||!myId)return;
    const seat=Math.max(0,people.findIndex(p=>p.userId===myId));
    walk.move(freeWalkPoint(interactionSpot(zone,seat),stations.length),zone);
    setSelected(zone==='floor'?null:zone);
  };
  const point=(x:number,y:number)=>{const s=svg.current,matrix=s?.getScreenCTM();if(!matrix)return {x:0,y:0};return new DOMPoint(x,y).matrixTransform(matrix.inverse());};
 const zoomAt=(factor:number,x:number,y:number)=>{const p=point(x,y);setCamera(old=>{const zoom=Math.max(.75,Math.min(1.9,old.zoom*factor));const ratio=old.zoom/zoom;return {zoom,x:p.x-base.x-(p.x-base.x-old.x)*ratio,y:p.y-base.y-(p.y-base.y-old.y)*ratio};});};
 const zoomRef=useRef(zoomAt); zoomRef.current=zoomAt;
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();zoomRef.current(Math.exp(-e.deltaY*(e.deltaMode===1?.025:.0015)),e.clientX,e.clientY);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const pan=useRef<{id:number;x:number;y:number;px:number;py:number;cx:number;cy:number;moved:boolean}|null>(null);
 const interactive=(action:()=>void,label:string)=>({role:'button',tabIndex:0,'aria-label':label,onClick:action,onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action();}},'data-interactive':true});
 const entities:{depth:number;key:string;node:ReactNode}[]=[];
 const overlays:ReactNode[]=[];
 const deskPeople=new Set<string>();
 stations.forEach((s,i)=>{
 const loc=deskGrid(i),id=s.collaborator.userId,theme=appearance(id),seatG=deskSeatGrid(i);
 const person=people.find(pp=>pp.userId===id),w=walkers[id];
 const seated=!!person&&!!w&&!w.walking&&person.anchorKey===`desk:${id}`&&Math.hypot(w.pos.x-seatG.x,w.pos.y-seatG.y)<.34;
 if(seated)deskPeople.add(id);
 const open=()=>{if(!consumeClickSuppression())onQueue(id);};
  const deskClick=()=>{if(consumeClickSuppression())return;if(id===myId&&canSavePrefs){if(walk.manual&&canWalk)walk.move(seatG);else setCustomizing(true);}else onQueue(id);};
 const seat=iso(seatG.x,seatG.y),obj=isoZ(loc.x+1.83,loc.y+.45,58),st=isoZ(loc.x+1.7,loc.y+.72,51);
 const count=s.queueCount,sheets=paperSheets(count),late=s.queue.filter(c=>c.isLate).length;
 const objectKey=(prefs.byUser[id]||[])[0];
 // Faixa de etapa no tampo (geometria do HTML v8) — sem percentual inventado: só o estado real.
 const px=loc.x+.18,py=loc.y+1.24,bw=.70,bh=.17,P=(dx:number,dy:number,z:number)=>{const q=isoZ(px+dx,py+dy,z);return `${q.x},${q.y}`;};
 const tone=!s.current?'c8dbe6':late?'f17468':'50b7ac';
 entities.push({depth:loc.x+loc.y+2,key:id,node:<g data-office-desk-user={id} data-user-id={id}>
 <ChairBehind x={seat.x} y={seat.y} color={theme.color} dark={theme.dark}/>
 {seated&&person&&<g transform={`translate(${seat.x} ${seat.y-19})`} data-user-id={id} {...interactive(()=>onQueue(id),`Abrir fila de ${person.name}`)} className="iso-interactive"><AvatarSvg args={[id,{...appearance(id),name:person.name,team:''},id===myId,{seated:true}]}/></g>}
 <g {...interactive(deskClick,id===myId?'Personalizar minha mesa':`Mesa de ${s.collaborator.fullName}`)} className="iso-interactive"><Desk x={loc.x} y={loc.y} spec={theme}/></g>
 {objectKey&&<g pointerEvents="none" transform={`translate(${obj.x} ${obj.y})`}><title>{objectKey}</title>{deskGlyph(objectKey,theme.paper)}</g>}
 <g pointerEvents="none" className="desk-progress"><title>{s.current?`Etapa atual: ${s.current.stageLabel}`:'Sem demanda ativa'}</title>
  <polygon points={`${P(0,0,52)} ${P(bw,0,52)} ${P(bw,bh,52)} ${P(0,bh,52)}`} fill={hx('eff7fb')} stroke={hx('8fb8cd')} strokeWidth="1.1"/>
  {s.current&&<polygon points={`${P(.035,.04,53)} ${P(bw-.035,.04,53)} ${P(bw-.035,.13,53)} ${P(.035,.13,53)}`} fill={hx(tone)} opacity=".75"/>}</g>
 {sheets>0&&<g ref={el=>registerStack(id,el)} transform={`translate(${st.x} ${st.y})`}>
  <title>{`${count} demandas ativas de ${s.collaborator.fullName}`}</title>
  <ellipse cx="0" cy="7" rx="28" ry="10" fill={hx('2d7395')} opacity=".13"/>
  {Array.from({length:sheets},(_,j)=>{const card=s.queue[sheets-1-j];const dx=[0,-.9,.7,-.5,.9][j%5];const tr=['a3c7d8','97bbd2','bad5e4'][j%3];
   const sheet=<g transform={`translate(${dx} ${-j*3})`}><path d="M-22 3L-4 -6L25 2L7 13Z" fill={hx(['f9fdff','eaf6ff','ffffff','edf5fc','f5fbff'][j%5])} stroke={hx(tr)} strokeWidth="1.2" strokeLinejoin="round"/><path d="M-22 3L7 13V15L-22 5Z" fill={hx('c6dfec')} stroke={hx(tr)} strokeWidth=".65"/><path d="M7 13L25 2V4L7 15Z" fill={hx('a9cddd')} stroke={hx(tr)} strokeWidth=".65"/></g>;
   return card&&j<sheets-1?<g key={card.id} data-interactive="true" onPointerDown={e=>{e.stopPropagation();startPress(e,{id:card.id,title:card.title,fromUserId:id});}} onClick={e=>{e.stopPropagation();if(!consumeClickSuppression())onCard(card.id);}} className="iso-interactive"><title>{card.title}</title>{sheet}</g>:<g key={`f${j}`} pointerEvents="none">{sheet}</g>;})}
  {(()=>{const top=s.queue[0];return <g transform={`translate(0 ${-3*(sheets-1)})`} data-interactive="true" className="iso-interactive" role="button" tabIndex={0} aria-label={`${count} demandas na mesa de ${s.collaborator.fullName}`}
   onPointerDown={top?e=>{e.stopPropagation();startPress(e,{id:top.id,title:top.title,fromUserId:id});}:undefined}
   onClick={e=>{e.stopPropagation();if(consumeClickSuppression())return;if(count>1||!top)onQueue(id);else onCard(top.id);}}>
   <path d="M-24 1L-6 -9L1 -8L6 -13L14 -11L10 -6L27 0L8 12Z" fill={hx(late?'f8dfdd':'aedff6')} stroke={hx(late?'e78986':'6caed1')} strokeWidth="1.5" strokeLinejoin="round"/>
   <path d="M-21 1L-4 -7L21 0L4 8Z" fill={hx('e4f5fd')} opacity=".87"/><path d="M-12 0L8 6" stroke={hx('86bcd8')} strokeWidth="1.8" strokeLinecap="round"/>
   <text x="8" y="4.4" fontSize="9.1" fontWeight="900" fill={hx('265975')} textAnchor="middle" transform="rotate(-14 8 4)">{count}</text></g>;})()}
 </g>}
 {(()=>{const n=(dx:number,dy:number)=>{const q=isoZ(loc.x+dx,loc.y+dy,53);return `${q.x},${q.y}`;};const nt=isoZ(loc.x+1.69,loc.y+1.27,54);const hot=targetUserId===id;return <g className="desk-nameplate iso-interactive" {...interactive(open,`Fila de ${s.collaborator.fullName}, ${count} demandas`)}><polygon points={`${n(1.28,1.13)} ${n(2.13,1.13)} ${n(2.13,1.37)} ${n(1.28,1.37)}`} fill={hx('ffffff')} stroke={hot?hx('167fbf'):hx('bad6e7')} strokeWidth={hot?2.5:1.2}/><text x={nt.x} y={nt.y+2.5} transform={`rotate(25 ${nt.x} ${nt.y})`} textAnchor="middle" fontSize="9" fontWeight="900" fill={hx('3b7797')}>{s.collaborator.fullName.split(' ')[0].slice(0,12)}</text></g>;})()}
 </g>});
 });
 const zoneLabels={planning:'Planejamento',review:'Revisão',coffee:'Cantinho do Café',meeting:'Reunião',waiting:'Espera'};
 const zoneObjects={planning:<CreativeShelf/>,review:<ReviewStation/>,coffee:<CoffeeStation/>,meeting:<MeetingRoom/>,waiting:<Sofa/>};
 Object.entries(ZONE_SPOTS).forEach(([key,p])=>{
 const label=zoneLabels[key as keyof typeof zoneLabels];
  entities.push({depth:p.x+p.y,key,node:<g {...interactive(()=>visit(key as WalkZone),label)} className="iso-interactive">{zoneObjects[key as keyof typeof zoneObjects]}</g>});
 });
  entities.push({depth:2.7,key:'planning-wall',node:<g {...interactive(()=>visit('planning'),'Planejamento')} className="iso-interactive"><PlanningWall/></g>});
 [{x:.7,y:3.4,s:.85},{x:4.6,y:1.6,s:1.05},{x:.42,y:7,s:.8},{x:11.45,y:floor.height-1.2,s:.9},{x:12.52,y:floor.height-1.2,s:.7}].forEach((p,i)=>entities.push({depth:p.x+p.y,key:`plant-${i}`,node:<g className="iso-plant"><Plant args={[p.x,p.y,p.s]}/></g>}));
 people.filter(person=>!deskPeople.has(person.userId)).forEach(person=>{const w=walkers[person.userId];if(!w)return;const p=w.pos,q=iso(p.x,p.y);
  const action=actions[person.userId],arrived=!!action?.target&&!w.walking&&Math.hypot(p.x-action.target.x,p.y-action.target.y)<.1;
  const seated=arrived&&(action.zone==='waiting'||action.zone==='meeting');
  const cup=p.x>=COFFEE_RUG.x0&&p.x<=COFFEE_RUG.x1&&p.y>=COFFEE_RUG.y0&&p.y<=COFFEE_RUG.y1+.3&&!w.walking;
  const depth=seated&&action.zone==='meeting'?ZONE_SPOTS.meeting.x+ZONE_SPOTS.meeting.y+.01:p.x+p.y+2.2;
  entities.push({depth,key:`person-${person.userId}`,node:<g data-user-id={person.userId} transform={`translate(${q.x} ${q.y+w.bob-(seated?19:0)})`} {...interactive(()=>onQueue(person.userId),`Abrir fila de ${person.name}`)} className="iso-interactive"><AvatarSvg args={[person.userId,{...appearance(person.userId),name:person.name,team:''},person.userId===myId,{walking:w.walking,cup,seated}]}/><NameTag x={0} y={0} name={person.name} working={person.working}/></g>});
 });
 return <><svg ref={svg} className="office-iso-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="Escritório virtual isométrico" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('[data-interactive]'))return;const p=point(e.clientX,e.clientY);pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,px:p.x,py:p.y,cx:camera.x,cy:camera.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>=6)p.moved=true;if(p.moved){const q=point(e.clientX,e.clientY);setCamera(c=>({...c,x:c.x+p.px-q.x,y:c.y+p.py-q.y}));}}} onPointerUp={e=>{const p=pan.current;pan.current=null;if(!p)return;if(!p.moved&&myPerson){const q=point(e.clientX,e.clientY);const raw={x:(q.x/52+q.y/24)/2,y:(q.y/24-q.x/52)/2};if(raw.x>=0&&raw.x<=floor.width&&raw.y>=0&&raw.y<=floor.height)walk.move(avoidFurniture(inverseIso(q,floor),rects));}e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{pan.current=null;}}><RoomDefs/><MakeRoom args={[floor.height]}/><FloorDecors/><WallWindow args={[.65,0,'right']}/>{entities.sort((a,b)=>a.depth-b.depth).map(e=><g key={e.key}>{e.node}</g>)}<g className="iso-overlays">{overlays}</g></svg>
 {myId&&canSavePrefs&&<DeskCustomizeDialog open={customizing} onOpenChange={setCustomizing} value={prefs.byUser[myId]||[]} onSave={(o)=>prefs.save(myId,o)}/>}
 <div className="iso-controls absolute bottom-4 left-4 flex gap-2 rounded-2xl border bg-card p-2">{[['−',.85],['+',1.18]].map(([label,factor])=><button key={label} aria-label={label==='+'?'Ampliar':'Reduzir'} className="px-3 py-1" onClick={()=>{const r=svg.current!.getBoundingClientRect();zoomAt(Number(factor),r.x+r.width/2,r.y+r.height/2);}}>{label}</button>)}<button onClick={()=>setCamera({x:0,y:0,zoom:1})}>Recentralizar</button></div>
 {selected&&<div className="absolute bottom-20 left-4 max-w-xs rounded-xl border bg-card p-4 text-sm shadow-lg"><button className="float-right ml-4" onClick={()=>setSelected(null)} aria-label="Fechar zona">×</button><strong>{zoneLabels[selected as keyof typeof zoneLabels]}</strong><p>{people.filter(p=>p.anchorKey.startsWith(`${selected}:`)).map(p=>p.name).join(', ')||'Ninguém aqui no momento'}</p></div>}</>;
}
