import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { latestOfficeWalk, officeWalkEventKey, type OfficeWalkEvent } from '@/lib/officeIso';

/** Private, ephemeral tenant Presence. Publish actions, never animation frames. */
export function useOfficeWalkSync(tenantId: string | null | undefined, myId: string | undefined, myEvent: OfficeWalkEvent | null, deskCount: number) {
  const [remote, setRemote] = useState<Record<string, OfficeWalkEvent>>({});
  const [received, setReceived] = useState<{ userId:string; event:OfficeWalkEvent } | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const eventRef = useRef(myEvent); eventRef.current = myEvent;
  const countRef = useRef(deskCount); countRef.current = deskCount;
  const readyRef = useRef(false);
  const publishRef = useRef<(() => void) | null>(null);
  const instance = useRef(crypto.randomUUID());
  const sequence = useRef(0);
  const eventKey = myEvent ? officeWalkEventKey(myEvent) : 'return';

  useEffect(() => {
    setRemote({}); setReceived(null);
    if (!tenantId || !myId) return;
    let disposed=false, ch:ReturnType<typeof supabase.channel>|null=null, initialized=false;
    let pending:OfficeWalkEvent|null=null;
    const seen=new Map<string,string>();
    const publish=()=>{
      if (!ch || !readyRef.current || disposed) return;
      const now=Date.now();
      void ch.track(pending);
    };
    publishRef.current=publish;
    const sync=(notify:boolean)=>{
      if(!ch||disposed)return;
      const out:Record<string,OfficeWalkEvent>={};
      for(const [uid,metas] of Object.entries(ch.presenceState())) {
        if(uid===myId)continue;
        const e=latestOfficeWalk(metas,Date.now(),countRef.current);
        if(!e)continue;
        out[uid]=e;
        const k=officeWalkEventKey(e), old=seen.get(uid);
        // First sync and reconnect seed the baseline silently; only a new live action emits.
        if(notify&&initialized&&old!==k&&e.target&&Date.now()-e.timestamp<10000) setReceived({userId:uid,event:e});
        if(notify)seen.set(uid,k);
      }
      setRemote(out);
      if(notify)initialized=true;
    };
    const start=async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      if(disposed||!session||session.user.id!==myId)return;
      await supabase.realtime.setAuth(session.access_token);
      if(disposed)return;
      ch=supabase.channel(`office-walk:${tenantId}`,{config:{private:true,presence:{key:myId}}});
      channelRef.current=ch;
      ch.on('presence',{event:'sync'},()=>sync(true)).subscribe(status=>{
        if(disposed)return;
        readyRef.current=status==='SUBSCRIBED';
        if(status==='SUBSCRIBED'){initialized=false;publish();}
        else initialized=false;
      });
    };
    void start();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(disposed)return;
      if(!session||session.user.id!==myId){readyRef.current=false;setRemote({});if(ch)void supabase.removeChannel(ch);}
      else void supabase.realtime.setAuth(session.access_token);
    });
    const expiry=window.setInterval(()=>{
      sync(false);
      // A return tombstone wins over still-open tabs until their older action expires.
      if(pending&&pending.expiresAt<=Date.now()&&readyRef.current)publish();
    },1000);
    return ()=>{
      disposed=true;readyRef.current=false;publishRef.current=null;channelRef.current=null;
      subscription.unsubscribe();clearInterval(expiry);
      if(ch)void supabase.removeChannel(ch);
    };
  },[tenantId,myId]);
  useEffect(()=>{publishRef.current?.();},[eventKey]);
  return {remote,received};
}
