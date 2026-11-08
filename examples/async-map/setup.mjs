import {createMapSession} from './model.mjs';
import {createLocalTransport} from './transport.mjs';
import {createRenderer} from './renderer.mjs';

/** @param {import('@isle/prototype/resources').ClientChannelContext} context
 * Trusted SDK adapter. Canvas and optional detail DOM belong to the adapter; result rows belong to Isle. */
export function setup({root,owner,channel}) {
  const document=root.ownerDocument,stage=root.querySelector('[data-map-surface]'),detail=root.querySelector('[data-map-detail]');
  const coordinate=root.querySelector('[data-map-coordinate]');
  /** @type {import('@isle/prototype/resources').ResourceChannel<{query:string,category:import('./model.mjs').Category},{places:readonly import('./model.mjs').Place[],status:string,message:string,selection:string}>} */
  const results=channel('results');
  const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Interactive neighborhood map. Arrow keys move, plus and minus zoom, Home resets, Escape closes details.');stage.append(canvas);
  owner.own(canvas,value=>value.remove());
  const image=new Image(),renderer=createRenderer(canvas,image),pointers=new Map();
  owner.own(image,value=>{value.src='';});
  let frame=0,timer=0,draws=0,dragDistance=0,detailView,detailLoad,currentTask,lastPublished,lastData,lastSelected,lastSaved,lastDetail,lastDetailPhase,lastDetailError;
  const alive=()=>!owner.disposed&&root.isConnected;
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  const make=(tag,css,value='')=>{const node=document.createElement(tag);node.className=css;node.textContent=value;return node;};
  function queueDraw(){if(frame||!alive())return;frame=requestAnimationFrame(()=>{
    frame=0;if(!alive())return;const state=session.state;renderer.draw(state);draws++;
    root.dataset.mapDraws=String(draws);root.dataset.mapCenter=`${state.view.x.toFixed(1)},${state.view.y.toFixed(1)}`;root.dataset.mapZoom=state.view.scale.toFixed(2);
    text(coordinate,`Local map · ${state.view.scale.toFixed(2)}×`);
    root.querySelector('[data-map-command="zoom-in"]').disabled=state.view.scale>=4;
    root.querySelector('[data-map-command="zoom-out"]').disabled=state.view.scale<=.6;
  });}
  function loadDetailView(){
    if(detailLoad||detailView)return;
    root.dataset.mapDetailCode='loading';
    detailLoad=import('./detail-view.mjs').then(module=>{
      if(!alive())return;detailView=module;lastData=undefined;lastDetailPhase=undefined;root.dataset.mapDetailCode='ready';renderData(session.state);
    }).catch(()=>{
      if(!alive())return;detailLoad=undefined;root.dataset.mapDetailCode='error';
      const message=make('p','detail-description','The details view could not be loaded.'),button=make('button','detail-save','Try loading details again');
      button.type='button';button.dataset.mapCommand='reload-details-code';detail.replaceChildren(message,button);
    });
  }
  function renderData(state){
    if(!alive()||state.disposed)return;
    if(lastData&&['places','phase','error','selected','detail','detailPhase','detailError','saved','stats'].every(key=>state[key]===lastData[key])){queueDraw();return;}
    lastData=state;
    if(currentTask&&(!lastPublished||['places','phase','error','selected'].some(key=>state[key]!==lastPublished[key]))){
      lastPublished=state;void currentTask.publish({places:state.places,status:state.phase,message:state.error,selection:state.selected}).catch(error=>console.error(error));
    }
    root.dataset.mapIssued=String(state.stats.issued);root.dataset.mapPublished=String(state.stats.published);root.dataset.mapAborted=String(state.stats.aborted);
    root.dataset.mapDetailPhase=state.detailPhase;root.dataset.mapSelected=state.selected;
    detail.hidden=!state.selected;
    if(state.selected){
      loadDetailView();
      if(detailView&&(state.detail!==lastDetail||state.detailPhase!==lastDetailPhase||state.detailError!==lastDetailError||state.selected!==lastSelected||state.saved!==lastSaved||!detail.children.length)){
        const focus=detail.contains(document.activeElement)?document.activeElement.dataset.mapCommand:undefined;
        detailView.renderDetails(detail,state);
        if(focus)detail.querySelector(`[data-map-command="${focus}"]`)?.focus({preventScroll:true});
      }else if(!detailView&&!detail.children.length)detail.append(make('p','detail-description','Opening place details…'));
    }
    lastSelected=state.selected;lastSaved=state.saved;lastDetail=state.detail;lastDetailPhase=state.detailPhase;lastDetailError=state.detailError;queueDraw();
  }
  const transport=createLocalTransport({placesURL:new URL('./data/places.json',import.meta.url),detailsURL:new URL('./data/details.json',import.meta.url)});
  const session=createMapSession({...transport,search:(params,signal)=>transport.search(params,AbortSignal.any([signal,currentTask.signal])),onChange:renderData});
  owner.own(session,async value=>{value.dispose();await value.settled();});
  owner.own(null,()=>{
    cancelAnimationFrame(frame);clearTimeout(timer);pointers.clear();
    root.dataset.mapDisposed='true';root.dataset.mapCleanups=String(Number(root.dataset.mapCleanups??0)+1);
  });
  const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:owner.signal});
  image.addEventListener('load',queueDraw,{signal:owner.signal});image.src=new URL('./data/neighborhood.svg',import.meta.url).href;
  function resize(){if(!alive())return;const width=stage.clientWidth,height=stage.clientHeight;if(width&&height&&(width!==session.state.view.width||height!==session.state.view.height)){session.resize(width,height);if(session.state.phase!=='idle')void results.refresh();}}
  const observer=new ResizeObserver(resize);owner.own(observer,value=>value.disconnect());observer.observe(stage);resize();
  root.querySelectorAll('[data-map-command]').forEach(button=>{button.disabled=false;});
  const refreshLater=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(alive())void results.refresh();},160);};
  const point=event=>{const box=canvas.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};};
  listen(canvas,'pointerdown',event=>{
    if(event.button!==0||pointers.size>=2)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,point(event));dragDistance=0;canvas.dataset.dragging='true';
  });
  listen(canvas,'pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    const before=[...pointers.values()],old=pointers.get(event.pointerId),next=point(event);pointers.set(event.pointerId,next);dragDistance+=Math.hypot(next.x-old.x,next.y-old.y);
    if(pointers.size===1)session.pan(next.x-old.x,next.y-old.y);
    else{
      const after=[...pointers.values()],mid=values=>({x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2}),a=mid(before),b=mid(after),distance=values=>Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
      session.pan(b.x-a.x,b.y-a.y);if(distance(before)>0)session.zoom(distance(after)/distance(before),b);
    }
  });
  const release=event=>{
    if(!pointers.has(event.pointerId))return;
    if(event.type==='pointerup'&&pointers.size===1&&dragDistance<5){const id=renderer.hit(point(event),session.state);if(id)void session.select(id);}
    pointers.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    canvas.dataset.dragging=String(pointers.size>0);refreshLater();
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,release);
  listen(canvas,'wheel',event=>{event.preventDefault();session.zoom(event.deltaY<0?1.2:1/1.2,point(event));refreshLater();},{passive:false});
  listen(canvas,'keydown',event=>{
    const moves={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]};
    if(moves[event.key])session.pan(...moves[event.key]);
    else if(event.key==='+'||event.key==='=')session.zoom(1.25);
    else if(event.key==='-')session.zoom(1/1.25);
    else if(event.key==='Home')session.reset();
    else if(event.key==='Escape'){session.closeDetails();return;}
    else return;
    event.preventDefault();refreshLater();
  });
  listen(root,'click',event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button)||button.disabled)return;
    const command=button.dataset.mapCommand;
    if(command==='zoom-in')session.zoom(1.25);
    else if(command==='zoom-out')session.zoom(1/1.25);
    else if(command==='reset')session.reset();
    else if(command==='retry'){void results.refresh();return;}
    else if(command==='close-details'){const id=session.state.selected;session.closeDetails();[...root.querySelectorAll('.place-card')].find(button=>button.dataset.place===id)?.focus({preventScroll:true});return;}
    else if(command==='save'){session.toggleSaved(button.dataset.place);return;}
    else if(command==='retry-details'){void session.select(session.state.selected);return;}
    else if(command==='reload-details-code'){detail.replaceChildren();loadDetailView();return;}
    else if(button.dataset.place){void session.select(button.dataset.place);return;}
    else return;
    refreshLater();
  });
  root.dataset.mapActive='true';
  results.subscribe(task=>{currentTask=task;lastPublished=undefined;clearTimeout(timer);void session.search(task.key.query,task.key.category);});
}
