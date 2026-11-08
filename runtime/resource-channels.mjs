import {validValue} from './value.mjs';

/** Local async capabilities. No task identity or callback enters the wire snapshot. */
export function createResourceChannels(owner,plans,read,load,commit,onError) {
  const entries=new Map(),pending=new Set();
  const report=error=>{try{onError(error);}catch{}};
  for(const plan of plans) {
    let subscriber,key,taskOwner,epoch=0,sequence=0;
    const active=(version,publication)=>!owner.disposed&&!taskOwner?.disposed&&epoch===version&&sequence===publication;
    const keys=()=>plan.keys.map(([,slot])=>read()[slot]);
    function start(force=false) {
      if(owner.disposed||!subscriber)return;
      const next=keys();if(!force&&key&&next.every((value,i)=>Object.is(value,key[i])))return;
      const version=++epoch;taskOwner?.dispose();
      if(owner.disposed||!subscriber||version!==epoch)return;
      key=next;taskOwner=owner.fork();const localOwner=taskOwner;
      const task=Object.freeze({key:Object.freeze(Object.fromEntries(plan.keys.map(([name],i)=>[name,next[i]]))),owner:localOwner,signal:localOwner.signal,
        async publish(input) {
          if(owner.disposed||localOwner.disposed||version!==epoch)return false;
          if(!validValue(plan.input,input))throw new Error('Invalid resource input');
          const data=structuredClone(input),publication=++sequence,guard=()=>active(version,publication);
          const work=(async()=>{const run=await load(plan.handler);return guard()?commit(run,data,guard,plan.handler):false;})();
          pending.add(work);try{return await work;}finally{pending.delete(work);}
        }});
      try{
        const result=subscriber(task);
        if(result!==undefined){
          if(result&&typeof result.then==='function'){
            const work=Promise.resolve(result).catch(report).finally(()=>pending.delete(work));pending.add(work);
          }
          throw new Error('Resource subscriptions must be synchronous; use task.owner.acquire');
        }
      }catch(error){localOwner.dispose();report(error);}
    }
    const api=Object.freeze({
      subscribe(callback) {
        if(owner.disposed)throw new Error('Resource component disposed');
        if(subscriber||typeof callback!=='function')throw new Error('Resource channel requires one subscriber');
        subscriber=callback;queueMicrotask(()=>start());
        const stop=()=>{if(subscriber!==callback)return;epoch++;subscriber=undefined;key=undefined;taskOwner?.dispose();};
        owner.own(null,stop);return stop;
      },
      refresh:()=>start(true),
    });
    entries.set(plan.name,{api,start});
  }
  return {
    get(name){const entry=entries.get(name);if(!entry)throw new Error('Unknown resource channel');return entry.api;},
    notify(){for(const entry of entries.values())entry.start();},
    async settled(){while(pending.size)await Promise.allSettled([...pending]);},
  };
}
