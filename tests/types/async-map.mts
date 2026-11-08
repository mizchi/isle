import {createMapSession,type MapState, type Place} from '../../examples/async-map/model.mjs';
const session=createMapSession({search:async()=>[],details:async()=>({}),onChange(state:Readonly<MapState>){void state;}});
session.search('coffee','cafe');session.pan(10,20);
// @ts-expect-error Adapter categories are a closed contract.
session.search('coffee','anything');
// @ts-expect-error Published state is readonly.
session.state.query='mutated';
// @ts-expect-error Place coordinates must be finite numbers, not strings.
const invalid:Place={id:'a',name:'A',category:'cafe',x:'0',y:0,rating:4,address:'',description:''};
void invalid;

import type {ClientResourceContext,ClientChannelContext,ResourceChannel} from '@isle/prototype/resources';
declare const context:ClientChannelContext;
const results:ResourceChannel<{query:string;category:string},{places:readonly Place[];status:string;message:string;selection:string}>=context.channel('results');
results.subscribe(task=>{
 task.key.query.trim();task.signal.throwIfAborted();
 // @ts-expect-error A task key is a readonly snapshot.
 task.key.query='changed';
 // @ts-expect-error Closed receiver input cannot omit declared fields.
 void task.publish({places:[]});
 void task.publish({places:[],status:'ready',message:'',selection:''});
});
// @ts-expect-error Subscriptions register synchronously; async work belongs to task.owner.acquire.
results.subscribe(async()=>{});
declare const ordinary:ClientResourceContext;
// @ts-expect-error No resource declaration means the channel capability can be absent.
ordinary.channel('results');
