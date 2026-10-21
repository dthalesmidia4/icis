import { createRoot } from 'react-dom/client';
import './index.css';
import OfficeIsoScene from './components/office/OfficeIsoScene';
const counts=[0,4,30,59];
const mk=(i:number)=>({id:`c${i}`,title:`Card ${i}`,stageLabel:'Criar arte',isLate:i%7===0} as any);
const stations=counts.map((n,i)=>({collaborator:{userId:`u${i}`,fullName:['Ana Lima','Bruno Reis','Carla Dias','Davi Melo'][i]},current:n?mk(0):null,next:null,queue:Array.from({length:n},(_,j)=>mk(j+i*100)),queueCount:n,awaitingClientCount:0,loadRatio:0,presence:{state:'working_now'},cardAreaMismatch:false})) as any;
const people=stations.map((s:any,i:number)=>({userId:s.collaborator.userId,name:s.collaborator.fullName,anchorKey:i===0?'coffee:0':`desk:${s.collaborator.userId}`,working:!!s.current,caption:''})) as any;
createRoot(document.getElementById('r')!).render(<OfficeIsoScene stations={stations} people={people} myId="u0" mobile={false} onQueue={(id)=>console.log('queue',id)} onCard={(id)=>console.log('card',id)} startPress={()=>{}} consumeClickSuppression={()=>false} registerStack={()=>{}} />);
