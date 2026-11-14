import {accessibilityFacts} from './tree.mjs';
import {parse,parseFragment} from 'parse5';
import {analyzeInput} from './analyze.mjs';

/** A deliberately small static-HTML adapter, with no DOM or browser dependency. */
export function analyzeHTML(html,options) {
  const {tree,diagnostics}=htmlBoxTree(html);
  return analyzeInput(tree,options,diagnostics);
}

/** The box tree of a single-root HTML fragment (or a body root), and its adapter diagnostics. */
export function htmlBoxTree(html) {
  if(typeof html!=='string' || html.length>1_000_000) throw new TypeError('Invalid HTML input');
  const diagnostics=[];
  const unknown=message=>diagnostics.push({code:'U_LAYOUT_HTML',severity:'unknown',message});
  // A body element as the root: parse as a document and check from body (its attributes, such as aria-hidden, count).
  const asBody=/^\s*<body[\s>]/i.test(html);
  const fragment=asBody ? parse(`<!doctype html><html><head></head>${html.trim()}</html>`,{onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)}).childNodes.find(n=>n.tagName==='html').childNodes.find(n=>n.tagName==='body') : parseFragment(html,{onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)});
  const roots=asBody ? [fragment] : fragment.childNodes.filter(node=>node.tagName);
  if(roots.length!==1 || !asBody && fragment.childNodes.some(n=>n.nodeName==='#text' && n.value.trim())) throw new TypeError('Static HTML adapter requires a single root element');
  let count=0;
  function convert(node,depth=0) {
    if(++count>2048 || depth>64) throw new TypeError('HTML box tree limit exceeded');
    const attrs=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    for(const attr of node.attrs) {
      if(attr.namespace || !/^(?:class|id|style|dir|title|role|lang|tabindex|href|disabled|alt|src|type|for|name|value|placeholder|required|readonly|checked|autocomplete|headers|scope|controls|autoplay|muted|loop|playsinline|poster|kind|srclang|label|accesskey|ismap|colspan|rowspan|hidden|inert|popover|popovertarget|popovertargetaction|aria-[\w-]+|data-[\w-]+)$/.test(attr.name)) unknown(`HTML rendering attribute needs an adapter: ${attr.name}`);
    }
    if(node.namespaceURI!=='http://www.w3.org/1999/xhtml') unknown('Foreign element needs a size adapter');
    return {tag:node.tagName,...(attrs.id!==undefined ? {id:attrs.id} : {}),...(attrs.lang!==undefined ? {lang:attrs.lang.trim()} : {}),...accessibilityFacts(node.tagName,attrs),classes:(attrs.class ?? '').split(/\s+/).filter(Boolean),
      text:node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)) ? {textContent:node.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join(' ').replace(/[\t\n\r ]+/g,' ').trim()} : {}),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && n.value && !/[^\t\n\r ]/.test(n.value)) ? {whitespace:true} : {}),
      // DOM order of text and child elements: text strings and child indices.
      runs:(()=>{ let i=0; return node.childNodes.flatMap(n=>n.tagName ? [i++] : n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value) ? [n.value.replace(/[\t\n\r ]+/g,' ').trim()] : []); })(),
      children:node.childNodes.filter(n=>n.tagName).map(child=>convert(child,depth+1))};
  }
  return {tree:convert(roots[0]),diagnostics};
}
