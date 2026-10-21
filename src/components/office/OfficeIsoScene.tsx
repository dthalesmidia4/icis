import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OfficeStationData } from '@/hooks/useOfficeOverview';
import type { OfficePerson } from './OfficePeopleLayer';
import { anchorGrid, deskGrid, floorForDesks, inverseIso, iso, ZONE_SPOTS, type GridPoint } from '@/lib/officeIso';
import { resolveOfficeZone } from '@/lib/officeZone';
import { useMyManualWalk } from '@/hooks/useMyManualWalk';
import type { useOfficeCardDrag } from '@/hooks/useOfficeCardDrag';
const color = (name: string) => `hsl(var(--iso-${name}))`;
const pts = (points: GridPoint[]) => points.map(p => `${p.x},${p.y}`).join(' ');
function Tile({x,y,w=1,h=1,z=0,fill='tile'}: {x:number;y:number;w?:number;h?:number;z?:number;fill?:string}) {
  return <polygon points={pts([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([a,b]) => {const p=iso(a,b);return {...p,y:p.y-z};}))} fill={color(fill)} stroke={color('line')} strokeWidth="1" />;
}
function Box({x,y,w=1,h=1,z=35,tone='wood'}: {x:number;y:number;w?:number;h?:number;z?:number;tone?:string}) {
 const a=iso(x+w,y), b=iso(x+w,y+h), c=iso(x,y+h);
 return <g><polygon points={pts([a,b,{...b,y:b.y-z},{...a,y:a.y-z}])} fill={color('edge')}/><polygon points={pts([b,c,{...c,y:c.y-z},{...b,y:b.y-z}])} fill={color(tone)}/><Tile x={x} y={y} w={w} h={h} z={z} fill={tone}/></g>;
}
function Plant({x,y}: GridPoint) { const p=iso(x,y);return <g transform={`translate(${p.x} ${p.y})`}><ellipse rx="20" ry="8" fill={color('shadow')}/><path d="M-13 -27L-9 0H9L13 -27Z" fill={color('wood')}/><path d="M0 -24V-76M0 -48L-20 -65M0 -55L20 -77" stroke={color('leaf')} strokeWidth="4"/><ellipse cx="-18" cy="-64" rx="16" ry="9" fill={color('leaf')}/><ellipse cx="16" cy="-76" rx="17" ry="9" fill={color('leaf')}/></g>; }
const Room = memo(function Room({height}: {height:number}) {
 const a=iso(0,0),b=iso(18,0),d=iso(0,height),c=iso(18,height);
 return <g><polygon points={pts([d,c,{...c,y:c.y+22},{...d,y:d.y+22}])} fill={color('edge')}/>{[b,d].map((p,i)=><polygon key={i} points={pts([a,p,{...p,y:p.y-140},{...a,y:a.y-140}])} fill={color(i?'wall':'wall-light')} stroke={color('line')} strokeWidth="3"/>)}
 {[4,10].map(x=>{const p=iso(x,0);return <g key={x} transform={`translate(${p.x} ${p.y}) skewY(27.6)`}><rect y="-120" width="155" height="90" rx="7" fill={color('glass')} stroke={color('paper')} strokeWidth="8"/><path d="M77 -118V-32M0 -72H155" stroke={color('paper')} strokeWidth="5"/></g>;})}
 {Array.from({length:18*height},(_,i)=><Tile key={i} x={i%18} y={Math.floor(i/18)} fill={i%2?'tile':'tile-alt'}/>)}
 {Object.values(ZONE_SPOTS).map((p,i)=><Tile key={i} x={p.x-1} y={p.y-1} w={2.8} h={2.4} fill={i%2?'rug':'rug-alt'}/>)}
 <Plant x={1} y={1}/><Plant x={17} y={1}/><Plant x={1} y={height-1}/><Plant x={17} y={height-1}/></g>;
});
type DragAPI = ReturnType<typeof useOfficeCardDrag>;
interface Props { stations:OfficeStationData[]; people:OfficePerson[]; myId?:string; mobile:boolean; onQueue:(id:string)=>void; onCard:(id:string)=>void; startPress:DragAPI['startPress']; consumeClickSuppression:DragAPI['consumeClickSuppression']; targetUserId?:string; registerStack:(id:string,el:SVGElement|null)=>void }
export default function OfficeIsoScene({stations,people,myId,mobile,onQueue,onCard,startPress,consumeClickSuppression,targetUserId,registerStack}:Props) {
 const svg=useRef<SVGSVGElement>(null); const floor=floorForDesks(stations.length);
 const base={x:-floor.height*42-70,y:-190,w:(18+floor.height)*42+140,h:(18+floor.height)*22+310};
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
 stations.forEach((s,i)=>{const p=deskGrid(i),id=s.collaborator.userId,screen=iso(p.x,p.y);entities.push({depth:p.x+p.y,key:id,node:<g data-office-desk-user={id} data-user-id={id} {...interactive(()=>{if(!consumeClickSuppression())onQueue(id);},`Fila de ${s.collaborator.fullName}`)} className="iso-interactive">
 <Box x={p.x+.7} y={p.y+1.2} w={.65} h={.65} z={30} tone={`accent-${i%4}`}/><Box x={p.x} y={p.y} w={2.1} h={1.1} z={52} tone={`accent-${i%4}`}/>
 <g transform={`translate(${screen.x+22} ${screen.y-38})`}><path d="M-21 -38H21L26 -8H-25Z" fill={color('ink')} stroke={color('paper')} strokeWidth="3"/><path d="M-18 -29H15M-18 -21H7M-28 -6H29" stroke={color('glass')} strokeWidth="3"/></g>
 <g ref={el=>registerStack(id,el)} transform={`translate(${screen.x-23} ${screen.y-35})`}>
 {s.queue.slice(0,8).map((card,j)=><g key={card.id} data-interactive="true" onPointerDown={e=>{e.stopPropagation();startPress(e,{id:card.id,title:card.title,fromUserId:id});}} onClick={e=>{e.stopPropagation();if(!consumeClickSuppression())onCard(card.id);}} className="iso-interactive"><title>{card.title}</title><rect x={-18+j%2*3} y={-12-j*4} width="34" height="19" rx="2" fill={color('paper')} stroke={color('edge')}/><path d={`M-12 ${-5-j*4}H7`} stroke={color('ink')} strokeWidth="1"/></g>)}
 <text y="22" textAnchor="middle" fontSize="12" fontWeight="800">{s.queueCount}</text></g>
 <rect x={screen.x-62} y={screen.y+36} width="124" height="23" rx="7" fill={color('paper')} stroke={color(targetUserId===id?'ink':'line')} strokeWidth={targetUserId===id?4:1}/><text x={screen.x} y={screen.y+51} textAnchor="middle" fontSize="11" fontWeight="800">{s.collaborator.fullName.split(' ').slice(0,2).join(' ')}</text></g>});});
 const zoneLabels={planning:'Planejamento',review:'Revisão',coffee:'Café',meeting:'Reunião',waiting:'Espera'};
 if(!mobile)Object.entries(ZONE_SPOTS).forEach(([key,p])=>{const q=iso(p.x,p.y);entities.push({depth:p.x+p.y,key,node:<g><Box x={p.x-.7} y={p.y-.6} w={1.7} h={1} z={key==='waiting'?22:48} tone={key==='waiting'?'accent-1':'wood'}/>{key==='planning'||key==='review'?<g transform={`translate(${q.x} ${q.y-45})`}><rect x="-45" y="-80" width="90" height="56" rx="5" fill={color('paper')} stroke={color('edge')} strokeWidth="4"/><path d="M-30 -64H28M-30 -52H12M-30 -40H23" stroke={color('accent-2')} strokeWidth="5"/></g>:key==='coffee'?<g transform={`translate(${q.x} ${q.y-60})`}><rect x="-18" y="-35" width="36" height="35" rx="4" fill={color('ink')}/><rect x="-8" y="-16" width="16" height="14" fill={color('paper')}/></g>:null}
 <g {...interactive(()=>setSelected(selected===key?null:key),zoneLabels[key as keyof typeof zoneLabels])}><rect x={q.x-65} y={q.y-150} width="130" height="25" rx="8" fill={color(selected===key?'glass':'paper')} stroke={color('edge')}/><text x={q.x} y={q.y-133} textAnchor="middle" fontSize="12" fontWeight="800">{zoneLabels[key as keyof typeof zoneLabels]}</text></g></g>});});
 people.forEach((person,i)=>{const p=person.userId===myId&&walk.position?walk.position:anchorGrid(person.anchorKey,users),q=iso(p.x,p.y);entities.push({depth:p.x+p.y+.2,key:`person-${person.userId}`,node:<g transform={`translate(${q.x} ${q.y})`} {...interactive(()=>onQueue(person.userId),`Abrir fila de ${person.name}`)} className="iso-interactive"><ellipse rx="22" ry="9" fill={color('shadow')}/><path d="M-10 -24L-12 -4M9 -24L12 -4" stroke={color('ink')} strokeWidth="9" strokeLinecap="round"/><rect x="-17" y="-48" width="34" height="29" rx="12" fill={color(`accent-${i%4}`)}/><ellipse cy="-64" rx="19" ry="22" fill={color('skin')}/><path d="M-19 -68Q-23 -96 8 -87Q24 -83 19 -66L9 -77L-16 -68" fill={color('hair')}/><circle cx="-7" cy="-65" r="2" fill={color('ink')}/><circle cx="7" cy="-65" r="2" fill={color('ink')}/><path d="M-5 -55Q0 -51 5 -55" fill="none" stroke={color('hair')} strokeWidth="2"/>{person.userId===myId&&walk.manual?<g><rect x="-63" y="-121" width="126" height="25" rx="10" fill={color('paper')}/><text y="-104" textAnchor="middle" fontSize="12">Indo até lá...</text></g>:<text y="-96" textAnchor="middle" fontSize="11" fontWeight="700">{person.caption|| (person.working?'Trabalhando':person.name.split(' ')[0])}</text>}</g>});});
 return <><svg ref={svg} className="office-iso-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="Escritório virtual isométrico" onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('[data-interactive]'))return;const p=point(e.clientX,e.clientY);pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,px:p.x,py:p.y,cx:camera.x,cy:camera.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>=6)p.moved=true;if(p.moved){const q=point(e.clientX,e.clientY);setCamera(c=>({...c,x:c.x+p.px-q.x,y:c.y+p.py-q.y}));}}} onPointerUp={e=>{const p=pan.current;pan.current=null;if(!p)return;if(!p.moved&&myPerson){const q=point(e.clientX,e.clientY);const raw={x:(q.x/42+q.y/22)/2,y:(q.y/22-q.x/42)/2};if(raw.x>=0&&raw.x<=floor.width&&raw.y>=0&&raw.y<=floor.height)walk.move(inverseIso(q,floor));}e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{pan.current=null;}}><Room height={floor.height}/>{entities.sort((a,b)=>a.depth-b.depth).map(e=><g key={e.key}>{e.node}</g>)}</svg>
 <div className="absolute bottom-4 left-4 flex gap-2 rounded-xl border bg-card p-2 shadow-lg">{[['−',.85],['+',1.18]].map(([label,factor])=><button key={label} aria-label={label==='+'?'Ampliar':'Reduzir'} className="px-3 py-1" onClick={()=>{const r=svg.current!.getBoundingClientRect();zoomAt(Number(factor),r.x+r.width/2,r.y+r.height/2);}}>{label}</button>)}<button onClick={()=>setCamera({x:0,y:0,zoom:1})}>Recentralizar</button></div>
 {selected&&<div className="absolute bottom-20 left-4 max-w-xs rounded-xl border bg-card p-4 text-sm shadow-lg"><button className="float-right ml-4" onClick={()=>setSelected(null)} aria-label="Fechar zona">×</button><strong>{zoneLabels[selected as keyof typeof zoneLabels]}</strong><p>{people.filter(p=>p.anchorKey.startsWith(`${selected}:`)).map(p=>p.name).join(', ')||'Ninguém aqui no momento'}</p></div>}</>;
}
