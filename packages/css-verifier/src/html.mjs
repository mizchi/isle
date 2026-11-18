import {accessibilityFacts} from './tree.mjs';
// The tags whose elements inside a text-bearing element are its inline content (no boxes of their own).
export {phrasingTags} from './tree.mjs';
import {parse,parseFragment} from 'parse5';
import {analyzeInput} from './analyze.mjs';

/** A deliberately small static-HTML adapter, with no DOM or browser dependency. */
export function analyzeHTML(html,options) {
  const {tree,diagnostics}=htmlBoxTree(html);
  return analyzeInput(tree,options,diagnostics);
}

/** The box tree of a single-root HTML fragment (or a body root), and its adapter diagnostics. */
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
export function htmlBoxTree(html) {
  if(typeof html!=='string' || html.length>1_000_000) throw new TypeError('Invalid HTML input');
  const diagnostics=[];
  const unknown=message=>diagnostics.push({code:'U_LAYOUT_HTML',severity:'unknown',message});
  // A body element as the root: parse as a document and check from body (its attributes, such as aria-hidden, count).
  // An html element as the root (a whole document): its font-size is what rem resolves against. The head
  // (with no boxes) is dropped.
  const asHtml=/^\s*(?:<!doctype html>\s*)?<html[\s>]/i.test(html);
  const asBody=asHtml || /^\s*<body[\s>]/i.test(html);
  const documentNode=asBody ? parse(asHtml ? (/^\s*<!doctype/i.test(html) ? html.trim() : `<!doctype html>${html.trim()}`) : `<!doctype html><html><head></head>${html.trim()}</html>`,{sourceCodeLocationInfo:true,onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)}).childNodes.find(n=>n.tagName==='html') : null;
  if(asHtml) {
    if(documentNode.childNodes.some(n=>n.tagName==='head' && n.childNodes.some(c=>c.tagName && !['meta','title'].includes(c.tagName)))) unknown('A head with elements other than meta and title is not modeled (pass styles as the css option)');
    // The viewport meta tag (zoom restrictions: the meta-viewport rule) is kept as a fact of the html root.
    const meta=documentNode.childNodes.find(n=>n.tagName==='head')?.childNodes.find(c=>c.tagName==='meta' && c.attrs.some(a=>a.name==='name' && a.value.trim().toLowerCase()==='viewport'));
    var metaViewport=meta?.attrs.find(a=>a.name==='content')?.value;
    documentNode.childNodes=documentNode.childNodes.filter(n=>n.tagName!=='head');
  }
  const fragment=asHtml ? documentNode : asBody ? documentNode.childNodes.find(n=>n.tagName==='body') : parseFragment(html,{sourceCodeLocationInfo:true,onParseError:error=>unknown(`HTML parse recovery: ${error.code}`)});
  const roots=asBody ? [fragment] : fragment.childNodes.filter(node=>node.tagName);
  if(roots.length!==1 || !asBody && fragment.childNodes.some(n=>n.nodeName==='#text' && n.value.trim())) throw new TypeError('Static HTML adapter requires a single root element');
  let count=0;
  function convert(node,depth=0) {
    if(++count>2048 || depth>64) throw new TypeError('HTML box tree limit exceeded');
    const attrs=Object.fromEntries(node.attrs.map(a=>[a.name,a.value]));
    for(const attr of node.attrs) {
      // An img's or source's size and selection attributes are modeled (width/height hints and aspect-ratio).
      if(['details','dialog'].includes(node.tagName) && attr.name==='open') continue;
      if(node.tagName==='svg' && !attr.namespace && /^(?:width|height|viewbox|xmlns|version|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|fill-rule|clip-rule|fill-opacity|stroke-opacity|opacity|preserveaspectratio|focusable)$/i.test(attr.name)) continue;
      if(node.tagName==='svg' && attr.namespace==='http://www.w3.org/2000/xmlns/') continue;
      if(!attr.namespace && ((['img','source'].includes(node.tagName) && /^(?:width|height|srcset|sizes|media|loading|decoding)$/.test(attr.name)) || (node.tagName==='video' && /^(?:width|height|preload)$/.test(attr.name)) || (node.tagName==='iframe' && /^(?:width|height)$/.test(attr.name)))) continue;
      if(attr.namespace || !/^(?:class|id|style|dir|target|title|role|lang|tabindex|href|disabled|alt|src|type|for|name|value|placeholder|required|readonly|checked|autocomplete|headers|scope|controls|autoplay|muted|loop|playsinline|poster|kind|srclang|label|accesskey|ismap|colspan|rowspan|hidden|inert|autofocus|popover|popovertarget|popovertargetaction|aria-[\w-]+|data-[\w-]+)$/.test(attr.name)) unknown(`HTML rendering attribute needs an adapter: ${attr.name}`);
    }
    // An inline svg is one replaced box: its content is SVG, not CSS boxes, so its children are not converted.
    const inlineSvg=node.tagName==='svg' && node.namespaceURI==='http://www.w3.org/2000/svg';
    if(node.namespaceURI!=='http://www.w3.org/1999/xhtml' && !inlineSvg) unknown('Foreign element needs a size adapter');
    // Its <title> child names it (SVG accessibility API mappings), like an aria-label.
    const svgTitle=inlineSvg ? node.childNodes.find(n=>n.tagName==='title')?.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join('').trim() : undefined;
    // The colors it draws with: its fill/stroke attributes and those of its shapes (one value each across the shapes,
    // 'mixed' otherwise; a style attribute on a shape is not read, so it is 'dynamic').
    const svgPaint=(()=>{
      if(!inlineSvg) return undefined;
      // Leaf shapes with their ancestor chain inside the svg (a g's attributes inherit to its shapes).
      const shapes=[], leaves=[]; (function walk(n,chain){ for(const c of n.childNodes ?? []) if(c.tagName && c.tagName!=='title' && c.tagName!=='desc'){ shapes.push(c); const next=[...chain,c]; if(c.childNodes?.some(k=>k.tagName)) walk(c,next); else leaves.push(next); } })(node,[]);
      const own=Object.fromEntries(['fill','stroke'].filter(k=>attrs[k]!==undefined).map(k=>[k,attrs[k].trim().toLowerCase()]));
      const translucent=[node,...shapes].some(c=>c.attrs.some(a=>/^(?:opacity|fill-opacity|stroke-opacity)$/.test(a.name) && Number(a.value)!==1));
      const of=key=>{
        if(translucent || shapes.some(c=>c.attrs.some(a=>a.name==='style'))) return 'dynamic';
        const values=leaves.map(chain=>[...chain].reverse().map(c=>c.attrs.find(a=>a.name===key)?.value.trim().toLowerCase()).find(v=>v!==undefined));
        if(values.every(v=>v===undefined)) return undefined;
        return new Set(values).size===1 ? values[0] : 'mixed';
      };
      return {...own,...(of('fill')!==undefined ? {shapeFill:of('fill')} : {}),...(of('stroke')!==undefined ? {shapeStroke:of('stroke')} : {}),shapes:shapes.length};
    })();
    if(inlineSvg) { const facts=accessibilityFacts('svg',attrs); facts.svgSize={...(facts.svgSize ?? {}),paint:svgPaint}; return {tag:'svg',attributes:attrs,...(attrs.id!==undefined ? {id:attrs.id} : {}),...facts,...(svgTitle ? {named:true} : {}),classes:(attrs.class ?? '').split(/\s+/).filter(Boolean),text:false,runs:[],children:[]}; }
    // (A table section or row the parser inserted — no start tag in the source — is marked implied: checklist F26.)
    // Checklist F27: the parser changed the structure written in the source — an element with no source location at all
    // (an empty <p> made from a stray </p>, after a block closed the open paragraph), or one whose required end tag the
    // parser supplied early (a nested <a>, a <div> inside a <button>…). Optional end tags (p, li, td, …), void and
    // foreign (SVG, MathML) elements are left alone.
    const html5=node.namespaceURI==='http://www.w3.org/1999/xhtml';
    const optionalEnd=new Set(['html','head','body','p','li','dt','dd','option','optgroup','rt','rp','tr','td','th','thead','tbody','tfoot','colgroup','caption']);
    const restructured=!html5 || !node.sourceCodeLocation && ['tbody','tr','colgroup','html','head','body'].includes(node.tagName) ? undefined : !node.sourceCodeLocation ? 'implied' : node.sourceCodeLocation.startTag && !node.sourceCodeLocation.endTag && !optionalEnd.has(node.tagName) && !voidTags.has(node.tagName) ? 'unclosed' : undefined;
    return {...(['tbody','tr','colgroup'].includes(node.tagName) && !node.sourceCodeLocation ? {implied:true} : {}),...(restructured ? {restructured} : {}),tag:node.tagName,attributes:attrs,...(attrs.id!==undefined ? {id:attrs.id} : {}),...(attrs.lang!==undefined ? {lang:attrs.lang.trim()} : {}),...accessibilityFacts(node.tagName,attrs),classes:(attrs.class ?? '').split(/\s+/).filter(Boolean),
      text:node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value)) ? {textContent:node.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join(' ').replace(/[\t\n\r ]+/g,' ').trim()} : {}),
      ...(node.childNodes.some(n=>n.nodeName==='#text' && n.value && !/[^\t\n\r ]/.test(n.value)) ? {whitespace:true} : {}),
      // DOM order of text and child elements: text strings and child indices.
      runs:(()=>{ let i=0; return node.childNodes.flatMap(n=>n.tagName ? [i++] : n.nodeName==='#text' && /[^\t\n\r ]/.test(n.value) ? [n.value.replace(/[\t\n\r ]+/g,' ').trim()] : []); })(),
      // Component boundaries an adapter marks (<!--isle-boundary:component Item-->, slot, children, html): content
      // rendered here comes from another component or the caller.
      ...(node.childNodes.some(n=>n.nodeName==='#comment' && /^isle-boundary:/.test(n.data)) ? {boundaries:node.childNodes.filter(n=>n.nodeName==='#comment' && /^isle-boundary:/.test(n.data)).map(n=>{ const m=/^isle-boundary:(\w+)(?: ([^\s=]+))?/.exec(n.data); return {kind:m?.[1] ?? 'component',...(m?.[2] ? {name:m[2]} : {})}; })} : {}),
      children:node.childNodes.filter(n=>n.tagName).map(child=>convert(child,depth+1))};
  }
  const tree=convert(roots[0]);
  if(asHtml && metaViewport!==undefined) tree.metaViewport=metaViewport;
  return {tree,diagnostics};
}
