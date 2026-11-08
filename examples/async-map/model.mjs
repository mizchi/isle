export const WORLD=Object.freeze({width:2048,height:1536});
const categories=new Set(['all','cafe','food','park','museum']);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const identity=id=>typeof id==='string'&&/^[a-z0-9-]{1,64}$/.test(id);
export const project=(point,view)=>({x:(point.x-view.x)*view.scale+view.width/2,y:(point.y-view.y)*view.scale+view.height/2});
export const unproject=(point,view)=>({x:(point.x-view.width/2)/view.scale+view.x,y:(point.y-view.height/2)/view.scale+view.y});
export function zoomAt(view,factor,point={x:view.width/2,y:view.height/2}) {
  if(!finite(factor)||factor<=0)throw new Error('Invalid zoom');
  const world=unproject(point,view),scale=clamp(view.scale*factor,0.6,4);
  return {...view,scale,x:clamp(world.x-(point.x-view.width/2)/scale,0,WORLD.width),y:clamp(world.y-(point.y-view.height/2)/scale,0,WORLD.height)};
}

export function validatePlaces(input) {
  if(!Array.isArray(input)||input.length>256)throw new Error('Invalid places');
  const entries=Object.getOwnPropertyDescriptors(input);
  if(Object.getPrototypeOf(input)!==Array.prototype||Reflect.ownKeys(entries).length!==input.length+1||Array.from({length:input.length},(_,i)=>!entries[i]||!Object.hasOwn(entries[i],'value')).some(Boolean))throw new Error('Invalid places array');
  const ids=new Set(),keys=['id','name','category','x','y','rating','address','description'];
  return Object.freeze(input.map(place=>{
    if(!place||Object.getPrototypeOf(place)!==Object.prototype)throw new Error('Invalid place');
    const fields=Object.getOwnPropertyDescriptors(place);
    if(Reflect.ownKeys(fields).length!==keys.length||keys.some(key=>!fields[key]||!Object.hasOwn(fields[key],'value')))throw new Error('Invalid place fields');
    if(!identity(place.id)||ids.has(place.id)||!categories.has(place.category)||place.category==='all'||
      !['name','address','description'].every(key=>typeof place[key]==='string'&&place[key].length<=1000)||
      !finite(place.x)||place.x<0||place.x>WORLD.width||!finite(place.y)||place.y<0||place.y>WORLD.height||
      !finite(place.rating)||place.rating<0||place.rating>5)throw new Error('Invalid place value');
    ids.add(place.id);return Object.freeze({...place});
  }));
}

/** Application state, independent of Canvas/DOM and of the Isle runtime. */
export function createMapSession({search,details,onChange=()=>{}}) {
  let disposed=false;
  const channels={search:{version:0,controller:null},details:{version:0,controller:null}},cache=new Map(),pending=new Set();
  const stats={issued:0,aborted:0,stale:0,published:0};
  let state=Object.freeze({view:Object.freeze({x:1024,y:768,scale:1,width:880,height:640}),query:'',category:'all',places:Object.freeze([]),
    phase:'idle',error:'',selected:'',detail:null,detailPhase:'idle',detailError:'',saved:Object.freeze([]),disposed:false,stats:Object.freeze({...stats})});
  function update(patch,notify=true) {const changed=Object.keys(stats).some(key=>stats[key]!==state.stats[key]);state=Object.freeze({...state,...patch,stats:changed?Object.freeze({...stats}):state.stats});if(notify)onChange(state);}
  function invalidate(channel) {
    channel.version++;
    if(channel.controller&&!channel.controller.signal.aborted){stats.aborted++;channel.controller.abort();}
    channel.controller=null;return channel.version;
  }
  function request(name,operation,adopt,fail,start) {
    if(disposed)return Promise.resolve(false);
    const channel=channels[name],version=invalidate(channel),controller=channel.controller=new AbortController();stats.issued++;
    update(start);
    const promise=(async()=>{
      try {
        const value=await operation(controller.signal);
        if(disposed||version!==channel.version){if(!disposed){stats.stale++;update({},false);}return false;}
        channel.controller=null;adopt(value);return true;
      }catch(error){
        if(disposed||version!==channel.version){if(!disposed){stats.stale++;update({},false);}return false;}
        channel.controller=null;fail(error);return false;
      }
    })();
    pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;
  }
  const api={
    get state(){return state;},
    resize(width,height){if(disposed)return;if(!finite(width)||!finite(height)||width<=0||height<=0)throw new Error('Invalid map size');update({view:Object.freeze({...state.view,width,height})});},
    pan(dx,dy){if(disposed)return;if(!finite(dx)||!finite(dy))throw new Error('Invalid movement');update({view:Object.freeze({...state.view,x:clamp(state.view.x-dx/state.view.scale,0,WORLD.width),y:clamp(state.view.y-dy/state.view.scale,0,WORLD.height)})});},
    zoom(factor,point){if(!disposed)update({view:Object.freeze(zoomAt(state.view,factor,point))});},
    reset(){if(!disposed)update({view:Object.freeze({...state.view,x:1024,y:768,scale:1})});},
    search(query,category){
      if(disposed)return Promise.resolve(false);
      if(typeof query!=='string'||query.length>80||!categories.has(category))throw new Error('Invalid search');
      return request('search',signal=>search({query,category,view:state.view},signal),value=>{
        const places=validatePlaces(value);stats.published++;update({places,phase:'ready'});
      },error=>update({phase:'error',error:error.message||'Search failed'}),{query,category,phase:'loading',error:''});
    },
    refresh(){return api.search(state.query,state.category);},
    select(id){
      if(disposed)return Promise.resolve(false);if(!identity(id))throw new Error('Invalid selection');
      const place=state.places.find(place=>place.id===id)??cache.get(id),view=place?Object.freeze({...state.view,x:place.x,y:place.y}):state.view;
      if(cache.has(id)){invalidate(channels.details);update({selected:id,view,detail:cache.get(id),detailPhase:'ready',detailError:''});return Promise.resolve(true);}
      return request('details',signal=>details(id,signal),value=>{
        const [detail]=validatePlaces([value]);if(detail.id!==id)throw new Error('Wrong place response');
        cache.set(id,detail);stats.published++;update({detail,detailPhase:'ready'});
      },error=>update({detailPhase:'error',detailError:error.message||'Details failed'}),{selected:id,view,detail:null,detailPhase:'loading',detailError:''});
    },
    closeDetails(){if(!disposed){invalidate(channels.details);update({selected:'',detail:null,detailPhase:'idle',detailError:''});}},
    toggleSaved(id){if(disposed||!identity(id))return;update({saved:Object.freeze(state.saved.includes(id)?state.saved.filter(value=>value!==id):[...state.saved,id])});},
    dispose(){if(disposed)return false;disposed=true;Object.values(channels).forEach(invalidate);cache.clear();update({disposed:true,phase:'disposed',places:Object.freeze([]),selected:'',detail:null,detailPhase:'idle',saved:Object.freeze([])});return true;},
    async settled(){while(pending.size)await Promise.allSettled([...pending]);},
  };
  return api;
}
