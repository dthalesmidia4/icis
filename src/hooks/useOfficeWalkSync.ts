import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { latestOfficeWalk, officeWalkEventKey, sharedOfficeWalk, type OfficeWalkEvent } from '@/lib/officeIso';

export type OfficeWalkSyncStatus = 'connecting' | 'live' | 'error' | 'off';
const DEBOUNCE_MS = 400;
const log = (...a: unknown[]) => { if (import.meta.env.DEV) console.info('[office-walk]', ...a); };

/**
 * Private, ephemeral tenant Presence. Key = userId (one avatar per person); each tab/device is a
 * separate meta tagged with a stable per-mount viewId. Only this tab's own metas are ignored, so
 * other tabs of the same account are mirrored. Publishes actions (debounced), never frames.
 */
export function useOfficeWalkSync(tenantId: string | null | undefined, myId: string | undefined, myEvent: OfficeWalkEvent | null, deskCount: number) {
  const [remote, setRemote] = useState<Record<string, OfficeWalkEvent>>({});
  const [received, setReceived] = useState<{ userId:string; event:OfficeWalkEvent } | null>(null);
  const [status, setStatus] = useState<OfficeWalkSyncStatus>('off');
  const eventRef = useRef(myEvent); eventRef.current = myEvent;
  const countRef = useRef(deskCount); countRef.current = deskCount;
  const publishRef = useRef<(() => void) | null>(null);
  const viewId = useRef(crypto.randomUUID());
  const sequence = useRef(0);
  const eventKey = myEvent ? officeWalkEventKey(myEvent) : 'return';

  useEffect(() => {
    setRemote({}); setReceived(null);
    if (!tenantId || !myId) { setStatus('off'); return; }
    setStatus('connecting');
    const view = viewId.current;
    let disposed=false, ch:ReturnType<typeof supabase.channel>|null=null, initialized=false, ready=false;
    // current: what this tab publishes (null = nothing, i.e. a watching tab never sends anyone home).
    let current:OfficeWalkEvent|null=null, currentSrc='', lastTracked='', inFlight=false, timer:number|undefined;
    const seen=new Map<string,string>();
    const othersOf=(uid:string)=>{
      const metas=(ch?.presenceState()[uid]||[]) as unknown as OfficeWalkEvent[];
      return metas.filter(m=>m&&m.instance!==view);
    };
    // Only a real local transition changes the desired payload.
    const desired=():OfficeWalkEvent|null=>{
      const e=eventRef.current;
      if(e){
        const src=officeWalkEventKey(e);
        if(!current||current.target===null||currentSrc!==src){ current={...sharedOfficeWalk(e),instance:view}; currentSrc=src; }
      } else if(current&&current.target!==null){
        // Our walk ended: send the return only if this tab still authored the account's latest action.
        const other=latestOfficeWalk(othersOf(myId),Date.now(),countRef.current);
        const newer=!!other&&(other.timestamp>current.timestamp||(other.timestamp===current.timestamp&&other.sequence>current.sequence));
        if(newer){ current=null; }
        else { const now=Date.now(); current={target:null,zone:'floor',timestamp:now,sequence:++sequence.current,expiresAt:now+600000,instance:view,signature:''}; }
        currentSrc='';
      }
      return current;
    };
    const flush=async()=>{
      timer=undefined;
      if(!ch||!ready||disposed||inFlight)return;
      const payload=desired(), k=payload?officeWalkEventKey(payload):'';
      if(k===lastTracked)return;
      inFlight=true;
      try{
        if(!payload){ await ch.untrack(); lastTracked=''; log('untrack (superseded by another tab)'); }
        else {
          const res=await ch.track(payload);
          if(res==='ok'){lastTracked=k;log('track ok',payload.target?payload.zone:'return');}
          else log('track failed',res);
        }
      }catch(err){log('track error',err);}
      finally{inFlight=false;}
      if(!disposed&&ready){const d=desired();if((d?officeWalkEventKey(d):'')!==lastTracked)schedule();}
    };
    const schedule=()=>{if(timer===undefined)timer=window.setTimeout(()=>{void flush();},DEBOUNCE_MS);};
    publishRef.current=schedule;
    const sync=(notify:boolean)=>{
      if(!ch||disposed)return;
      const out:Record<string,OfficeWalkEvent>={};
      for(const uid of Object.keys(ch.presenceState())) {
        // Includes uid===myId: other tabs of this account are mirrored; only this tab's echo is dropped.
        const e=latestOfficeWalk(othersOf(uid),Date.now(),countRef.current);
        if(!e)continue;
        out[uid]=e;
        const k=officeWalkEventKey(e), old=seen.get(uid);
        // First sync and reconnect seed the baseline silently; only a new live action emits.
        if(notify&&initialized&&old!==k&&e.target&&Date.now()-e.timestamp<15000) setReceived({userId:uid,event:e});
        if(notify)seen.set(uid,k);
      }
      setRemote(prev=>{const a=Object.keys(prev),b=Object.keys(out);if(a.length===b.length&&b.every(u=>prev[u]&&officeWalkEventKey(prev[u])===officeWalkEventKey(out[u])))return prev;return out;});
      if(notify)initialized=true;
    };
    const start=async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      if(disposed)return;
      if(!session||session.user.id!==myId){setStatus('error');log('no session');return;}
      await supabase.realtime.setAuth(session.access_token);
      if(disposed)return;
      ch=supabase.channel(`office-walk:${tenantId}`,{config:{private:true,presence:{key:myId}}});
      ch.on('presence',{event:'sync'},()=>sync(true)).subscribe((st,err)=>{
        if(disposed)return;
        log('channel',st,err?.message||'');
        ready=st==='SUBSCRIBED';
        initialized=false;
        if(ready){lastTracked='';setStatus('live');schedule();}
        else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT')setStatus('error');
        else if(st==='CLOSED')setStatus('connecting');
      });
    };
    void start();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(disposed)return;
      if(!session||session.user.id!==myId){ready=false;setRemote({});setStatus('off');if(ch){void supabase.removeChannel(ch);ch=null;}}
      else void supabase.realtime.setAuth(session.access_token);
    });
    // Local expiry only — reads presence state, never tracks.
    const expiry=window.setInterval(()=>sync(false),1000);
    return ()=>{
      disposed=true;ready=false;publishRef.current=null;
      subscription.unsubscribe();clearInterval(expiry);if(timer!==undefined)clearTimeout(timer);
      // Removing the channel drops only this connection's presence meta.
      if(ch)void supabase.removeChannel(ch);
    };
  },[tenantId,myId]);
  useEffect(()=>{publishRef.current?.();},[eventKey]);
  return {remote,received,status};
}
