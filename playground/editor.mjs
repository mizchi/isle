import {tokenize} from './highlight.mjs';

/** Keep the textarea as the only input, scrollport and accessibility surface. */
export function mountEditor(input,language) {
  const editor=document.createElement('div'),viewport=document.createElement('pre'),content=document.createElement('code');
  editor.className='code-editor';viewport.className='code-editor__highlight';content.className='code-editor__content';
  viewport.setAttribute('aria-hidden','true');viewport.inert=true;viewport.append(content);
  input.before(editor);editor.append(viewport,input);input.wrap='off';
  let previous;
  function sync() {
    // Native scrollbars and the resize handle belong to the textarea. The paint
    // viewport uses its client area, so classic scrollbar gutters cannot drift.
    viewport.style.width=input.clientWidth+'px';viewport.style.height=input.clientHeight+'px';
    content.style.transform=`translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  }
  function refresh() {
    if(previous!==input.value) {
      previous=input.value;
      const fragment=document.createDocumentFragment();
      for(const {kind,text} of tokenize(previous,language)) {
        const node=kind==='plain' ? document.createTextNode(text) : document.createElement('span');
        if(kind!=='plain') {node.className='syntax-token--'+kind;node.textContent=text;}
        fragment.append(node);
      }
      content.replaceChildren(fragment);
    }
    sync();
  }
  input.addEventListener('input',refresh);
  input.addEventListener('scroll',sync,{passive:true});
  input.addEventListener('compositionstart',()=>{editor.dataset.composing='';});
  input.addEventListener('compositionend',()=>{refresh();delete editor.dataset.composing;});
  const size=new ResizeObserver(sync);size.observe(input);
  refresh();
  return {refresh};
}
