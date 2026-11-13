import {accessibilityFacts} from './tree.mjs';
import {parseFragment} from 'parse5';
import {analyzeInput} from './analyze.mjs';

/** A deliberately small static-HTML adapter, with no DOM or browser dependency. */
export function analyzeHTML(html,options) {
  if(typeof html!=='string' || html.length>1_000_000) throw new TypeError('Invalid HTML input');
  const diagnostics=[];
  const unknown=message=>diagnostics.push({code:'U_LAYOUT_HTML',severity:'unknown',message});
  const fragment=parseFragment(html,{onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)});
  const roots=fragment.childNodes.filter(node=>node.tagName);
  if(roots.length!==1 || fragment.childNodes.some(n=>n.nodeName==='#text' && n.value.trim())) throw new TypeError('Static HTML adapter requires a single root element');
  let count=0;
  function convert(node,depth=0) {
    if(++count>2048 || depth>64) throw new TypeError('HTML box tree limit exceeded');
    const attrs=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    for(const attr of node.attrs) {
      if(attr.namespace || !/^(?:class|id|title|role|lang|tabindex|href|disabled|aria-[\w-]+|data-[\w-]+)$/.test(attr.name)) unknown(`HTML rendering attribute needs an adapter: ${attr.name}`);
    }
    if(node.namespaceURI!=='http://www.w3.org/1999/xhtml') unknown('Foreign element needs a size adapter');
    return {tag:node.tagName,...(attrs.id!==undefined ? {id:attrs.id} : {}),...(attrs.lang!==undefined ? {lang:attrs.lang.trim()} : {}),...accessibilityFacts(node.tagName,attrs),classes:(attrs.class ?? '').split(/\s+/).filter(Boolean),
      text:node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && n.value && !/[^\t\n\r ]/.test(n.value)) ? {whitespace:true} : {}),
      children:node.childNodes.filter(n=>n.tagName).map(child=>convert(child,depth+1))};
  }
  return analyzeInput(convert(roots[0]),options,diagnostics);
}
