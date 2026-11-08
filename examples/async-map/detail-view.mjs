/** Optional view chunk. Data and instance state stay in the owning map session. */
export function renderDetails(container,state){
  const document=container.ownerDocument,make=(tag,css,text)=>{const node=document.createElement(tag);node.className=css;node.textContent=text;return node;};
  const header=make('div','detail-top',''),title=make('h3','',state.detail?.name??state.places.find(p=>p.id===state.selected)?.name??'Place details');
  const close=make('button','detail-close','×');close.type='button';close.dataset.mapCommand='close-details';close.setAttribute('aria-label','Close place details');header.append(title,close);
  const description=make('p','detail-description',state.detailPhase==='loading'?'Opening this local favorite…':state.detailPhase==='error'?state.detailError:state.detail?.description??'');
  const nodes=[header,description];
  if(state.detailPhase==='ready'){
    const address=make('p','detail-address',state.detail.address),save=make('button','detail-save',state.saved.includes(state.selected)?'Saved to your places':'Save this place');
    save.type='button';save.dataset.mapCommand='save';save.dataset.place=state.selected;save.setAttribute('aria-pressed',String(state.saved.includes(state.selected)));nodes.push(address,save);
  }
  if(state.detailPhase==='error'){
    const retry=make('button','detail-save','Try opening again');retry.type='button';retry.dataset.mapCommand='retry-details';nodes.push(retry);
  }
  container.setAttribute('aria-busy',String(state.detailPhase==='loading'));container.replaceChildren(...nodes);
}
