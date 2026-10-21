import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import './index.css';
import OfficeIsoScene from './components/office/OfficeIsoScene';
const counts=[0,4,30,59];
const mk=(i:number)=>({id:`c${i}`,title:`Card ${i}`,stageLabel:'Criar arte',isLate:i%7===0} as any);
const stations=counts.map((n,i)=>({collaborator:{userId:`u${i}`,fullName:['Ana Lima','Bruno Reis','Carla Dias','Davi Melo'][i]},current:n?mk(i*100):null,next:null,queue:Array.from({length:n},(_,j)=>mk(j+i*100)),queueCount:n,awaitingClientCount:0,loadRatio:0,presence:{state:'working_now'},cardAreaMismatch:false})) as any;
function App(){const [k,setK]=useState('desk');useEffect(()=>{(window as any).go=setK;},[]);
const people=stations.map((s:any,i:number)=>({userId:s.collaborator.userId,name:s.collaborator.fullName,anchorKey:i===0?'coffee:0':i===1?`${k}:${k==='desk'?'u1':'0'}`:`desk:${s.collaborator.userId}`,working:!!s.current,caption:''})) as any;
return <OfficeIsoScene stations={stations} people={people} myId="u0" mobile={false} onQueue={(id)=>console.log('queue',id)} onCard={(id)=>console.log('card',id)} startPress={()=>{}} consumeClickSuppression={()=>false} registerStack={()=>{}} />;}
createRoot(document.getElementById('r')!).render(<App/>);
