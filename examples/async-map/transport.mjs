import {validatePlaces} from './model.mjs';
function wait(milliseconds,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},milliseconds);
  signal.addEventListener('abort',abort,{once:true});
});}
/** Local static assets, fetched over HTTP. Latency is controlled; no external service. */
export function createLocalTransport({placesURL,detailsURL,fetcher=fetch,latency=180}){
  async function read(url,signal){
    const [response]=await Promise.all([fetcher(url,{signal}),wait(latency,signal)]);
    if(!response.ok)throw new Error(`The local map service returned ${response.status}.`);
    return validatePlaces(await response.json());
  }
  return {
    async search(request,signal){
      const url=new URL(placesURL);url.searchParams.set('query',request.query);url.searchParams.set('category',request.category);
      url.searchParams.set('view',`${request.view.x.toFixed(1)},${request.view.y.toFixed(1)},${request.view.scale.toFixed(2)}`);
      const places=await read(url,signal),query=request.query.trim().toLowerCase(),v=request.view;
      return places.filter(place=>(request.category==='all'||place.category===request.category)&&
        (!query||`${place.name} ${place.category} ${place.description}`.toLowerCase().includes(query))&&
        Math.abs(place.x-v.x)<=v.width/(2*v.scale)+100&&Math.abs(place.y-v.y)<=v.height/(2*v.scale)+100);
    },
    async details(id,signal){
      const url=new URL(detailsURL);url.searchParams.set('id',id);
      const place=(await read(url,signal)).find(place=>place.id===id);if(!place)throw new Error('Place not found.');return place;
    },
  };
}
