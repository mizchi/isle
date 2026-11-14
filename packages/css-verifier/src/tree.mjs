import {boxTags} from './layout/input.mjs';
import {validateTargetMetadata} from './layout/target-metadata.mjs';

/**
 * DOM facts for the accessibility rules from an element's attributes
 * ({name: value}; a value of undefined means dynamic). named: a non-empty
 * aria-label, aria-labelledby or title ('dynamic' when only a dynamic value
 * names it); focusable: a link with href, an enabled button, or tabindex >= 0.
 */
export function accessibilityFacts(tag, attributes) {
  const has = name => Object.hasOwn(attributes, name), value = name => attributes[name];
  // aria-labelledby names through the referenced elements' text (resolved by the rules).
  const names = ['aria-label', 'title'].filter(has);
  const labelledBy = has('aria-labelledby') ? (value('aria-labelledby') === undefined ? 'dynamic' : value('aria-labelledby').trim().split(/\s+/).filter(Boolean)) : undefined;
  const named = names.some(name => value(name) !== undefined && value(name).trim()) ? true : names.some(name => value(name) === undefined) ? 'dynamic' : undefined;
  const inputType = tag === 'input' ? (has('type') ? (value('type') === undefined ? 'dynamic' : value('type').trim().toLowerCase()) : 'text') : undefined;
  let focusable = tag === 'a' ? has('href') : ['button', 'select', 'textarea'].includes(tag) ? !has('disabled') : tag === 'input' ? !has('disabled') && inputType !== 'hidden' : undefined;
  if (has('tabindex')) { const index = value('tabindex'); focusable = index === undefined ? 'dynamic' : /^\s*-/.test(index) ? false : /^\s*\d+\s*$/.test(index) ? true : focusable; }
  // id references (aria-labelledby, aria-describedby, aria-controls); 'dynamic' when any is dynamic.
  const referenceNames = ['aria-labelledby', 'aria-describedby', 'aria-controls'].filter(has);
  const references = referenceNames.some(name => value(name) === undefined) ? 'dynamic' : referenceNames.flatMap(name => value(name).trim().split(/\s+/).filter(Boolean));
  const tabIndex = has('tabindex') && value('tabindex') !== undefined && /^\s*-?\d+\s*$/.test(value('tabindex')) ? Number(value('tabindex')) : undefined;
  // SC 2.5.8 exceptions declared in the DOM: an equivalent control (id), or an essential presentation (reason).
  const equivalent = has('data-a11y-equivalent') ? (value('data-a11y-equivalent') === undefined ? 'dynamic' : value('data-a11y-equivalent').trim() || undefined) : undefined;
  const essential = has('data-a11y-essential') ? (value('data-a11y-essential') === undefined ? 'dynamic' : value('data-a11y-essential').trim() || undefined) : undefined;
  // Images and form fields: alt (text, '' for decorative, 'dynamic'), label[for], placeholder.
  const alt = (tag === 'img' || (tag === 'input' && value('type')?.trim().toLowerCase() === 'image')) && has('alt') ? (value('alt') === undefined ? 'dynamic' : value('alt').trim()) : undefined;
  const labelFor = tag === 'label' && has('for') ? (value('for') === undefined ? 'dynamic' : value('for').trim()) : undefined;
  const placeholder = has('placeholder') && (value('placeholder') === undefined || value('placeholder').trim()) ? true : undefined;
  const role = has('role') ? (value('role') === undefined ? 'dynamic' : value('role').trim().toLowerCase()) : undefined;
  const inputName = tag === 'input' && has('name') ? (value('name') === undefined ? 'dynamic' : value('name')) : undefined;
  const headers = (tag === 'td' || tag === 'th') && has('headers') ? (value('headers') === undefined ? 'dynamic' : value('headers').trim().split(/\s+/).filter(Boolean)) : undefined;
  // Text values for comparisons (label-in-name, link purpose, landmark names).
  const ariaLabel = has('aria-label') ? (value('aria-label') === undefined ? 'dynamic' : value('aria-label')) : undefined;
  const href = tag === 'a' && has('href') ? (value('href') === undefined ? 'dynamic' : value('href')) : undefined;
  // All aria-* attributes (names checked against ARIA 1.2, values by type), the name source, and form values.
  const ariaNames = Object.keys(attributes).filter(name => name.startsWith('aria-'));
  const aria = ariaNames.length ? Object.fromEntries(ariaNames.map(name => [name, value(name) === undefined ? 'dynamic' : value(name)])) : undefined;
  const nameSource = named === true && !(has('aria-label') && value('aria-label')?.trim()) && has('title') ? 'title' : undefined;
  const formValue = tag === 'input' && has('value') ? (value('value') === undefined ? 'dynamic' : value('value')) : undefined;
  const autocomplete = has('autocomplete') ? (value('autocomplete') === undefined ? 'dynamic' : value('autocomplete')) : undefined;
  const scope = has('scope') ? (value('scope') === undefined ? 'dynamic' : value('scope')) : undefined;
  // Media: controls, autoplay, muted (boolean attributes), and a track's kind.
  const media = ['video', 'audio'].includes(tag) ? Object.fromEntries(['controls', 'autoplay', 'muted'].filter(has).map(name => [name, true])) : {};
  const trackKind = tag === 'track' ? (has('kind') ? (value('kind') === undefined ? 'dynamic' : value('kind').trim().toLowerCase()) : 'subtitles') : undefined;
  // accesskey (keyboard shortcut) and a server-side image map (img ismap).
  const accessKey = has('accesskey') ? (value('accesskey') === undefined ? 'dynamic' : value('accesskey').trim().toLowerCase() || undefined) : undefined;
  const ismap = tag === 'img' && has('ismap') ? true : undefined;
  // Table spans (HTML: a non-integer or 0 colspan/rowspan is 1).
  const span = name => ['td', 'th'].includes(tag) && has(name) ? (value(name) === undefined ? 'dynamic' : /^\s*\d+\s*$/.test(value(name)) && Number(value(name)) > 0 ? Number(value(name)) : 1) : undefined;
  const colSpan = span('colspan'), rowSpan = span('rowspan');
  // hidden (UA display: none, author CSS may override; until-found is content-visibility, not modeled) and inert.
  const hiddenAttr = has('hidden') ? (value('hidden') === undefined ? 'dynamic' : value('hidden').trim().toLowerCase() === 'until-found' ? 'until-found' : true) : undefined;
  // popover: closed in the static state, so the UA rule [popover]:not(:popover-open) { display: none } applies.
  // The style attribute: declarations attached to this element (a dynamic value is not modeled).
  const inlineStyle = has('style') ? (value('style') === undefined ? 'dynamic' : value('style')) : undefined;
  const popover = has('popover') ? (value('popover') === undefined ? 'dynamic' : true) : undefined;
  const inert = has('inert') ? (value('inert') === undefined ? 'dynamic' : true) : undefined;
  const ariaHidden = has('aria-hidden') ? (value('aria-hidden') === undefined ? 'dynamic' : value('aria-hidden').trim() === 'true' || undefined) : undefined;
  return {...media, ...(hiddenAttr !== undefined ? {hiddenAttr} : {}), ...(inert !== undefined ? {inert} : {}), ...(popover !== undefined ? {popover} : {}), ...(inlineStyle !== undefined ? {inlineStyle} : {}), ...(colSpan !== undefined ? {colSpan} : {}), ...(rowSpan !== undefined ? {rowSpan} : {}), ...(accessKey ? {accessKey} : {}), ...(ismap ? {ismap} : {}), ...(trackKind ? {trackKind} : {}), ...(aria ? {aria} : {}), ...(nameSource ? {nameSource} : {}), ...(formValue !== undefined ? {value: formValue} : {}), ...(autocomplete !== undefined ? {autocomplete} : {}), ...(scope !== undefined ? {scope} : {}), ...(ariaLabel !== undefined ? {ariaLabel} : {}), ...(href !== undefined ? {href} : {}), ...(headers ? {headers} : {}), ...(role ? {role} : {}), ...(inputName !== undefined ? {inputName} : {}), ...(alt !== undefined ? {alt} : {}), ...(inputType ? {inputType} : {}), ...(labelFor !== undefined ? {labelFor} : {}), ...(placeholder ? {placeholder} : {}), ...(equivalent ? {equivalent} : {}), ...(essential ? {essential} : {}), ...(labelledBy === 'dynamic' || labelledBy?.length ? {labelledBy} : {}), ...(references === 'dynamic' || references.length ? {references} : {}), ...(tabIndex !== undefined ? {tabIndex} : {}), ...(named ? {named} : {}), ...(ariaHidden ? {ariaHidden} : {}), ...(focusable !== undefined ? {focusable} : {})};
}

export const phrasingTags = new Set(['a', 'span', 'strong', 'em', 'b', 'i', 'small', 'img', 'output']);
const phrasing = box => phrasingTags.has(box.tag) && (box.children ?? []).every(phrasing) && !(box.inline ?? []).length;

const fields=new Set(['tag','id','lang','named','ariaHidden','focusable','references','labelledBy','tabIndex','equivalent','essential','alt','inputType','labelFor','placeholder','role','inputName','headers','ariaLabel','href','textContent','aria','nameSource','value','autocomplete','scope','controls','autoplay','muted','trackKind','accessKey','ismap','colSpan','rowSpan','hiddenAttr','inert','popover','inlineStyle','classes','children','text','whitespace','path','source','owner','documentRoot','layoutContracts','targets','targetIdentity']);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);

/** Clone the supplied model: analysis must never attach facts to caller state. */
export function normalizeTree(tree,name) {
  const seen=new Set(), paths=new Set(), diagnostics=[];
  function visit(input,parent,index,depth) {
    if(!object(input) || Object.keys(input).some(key=>!fields.has(key)) || typeof input.tag!=='string' || !/^[a-z][a-z0-9-]*$/.test(input.tag)) throw new TypeError('Invalid box tree node');
    if(seen.has(input)) throw new TypeError('Box tree must not contain cycles or shared nodes');
    if(depth>64 || seen.size>=2048) throw new TypeError('Box tree limit exceeded');
    seen.add(input);
    for(const key of ['id','lang','owner','path','equivalent','essential','alt','inputType','labelFor','role','inputName','ariaLabel','href','nameSource','value','autocomplete','scope','trackKind','accessKey','inlineStyle']) if(input[key]!==undefined && (typeof input[key]!=='string' || input[key].length>4096)) throw new TypeError(`Invalid box ${key}`);
    for(const key of ['text','whitespace','documentRoot','controls','autoplay','muted','ismap']) if(input[key]!==undefined && typeof input[key]!=='boolean') throw new TypeError(`Invalid box ${key}`);
    if(input.references!==undefined && input.references!=='dynamic' && (!Array.isArray(input.references) || input.references.some(id=>typeof id!=='string' || !id))) throw new TypeError('Invalid box references');
    if(input.aria!==undefined && (!input.aria || typeof input.aria!=='object' || Array.isArray(input.aria) || Object.entries(input.aria).some(([k,v])=>!/^aria-[a-z]+$/.test(k) || typeof v!=='string'))) throw new TypeError('Invalid box aria');
    if(input.textContent!==undefined && (typeof input.textContent!=='string' || input.textContent.length>65536)) throw new TypeError('Invalid box textContent');
    if(input.headers!==undefined && input.headers!=='dynamic' && (!Array.isArray(input.headers) || input.headers.some(id=>typeof id!=='string' || !id))) throw new TypeError('Invalid box headers');
    if(input.labelledBy!==undefined && input.labelledBy!=='dynamic' && (!Array.isArray(input.labelledBy) || input.labelledBy.some(id=>typeof id!=='string' || !id))) throw new TypeError('Invalid box labelledBy');
    if(input.tabIndex!==undefined && !Number.isSafeInteger(input.tabIndex)) throw new TypeError('Invalid box tabIndex');
    if(input.hiddenAttr!==undefined && ![true,'until-found','dynamic'].includes(input.hiddenAttr)) throw new TypeError('Invalid box hiddenAttr');
    for(const key of ['inert','popover']) if(input[key]!==undefined && ![true,'dynamic'].includes(input[key])) throw new TypeError(`Invalid box ${key}`);
    for(const key of ['colSpan','rowSpan']) if(input[key]!==undefined && input[key]!=='dynamic' && !(Number.isSafeInteger(input[key]) && input[key]>0 && input[key]<=1000)) throw new TypeError(`Invalid box ${key}`);
    for(const key of ['named','ariaHidden','focusable']) if(input[key]!==undefined && typeof input[key]!=='boolean' && input[key]!=='dynamic') throw new TypeError(`Invalid box ${key}`);
    if(input.classes!==undefined && (!Array.isArray(input.classes) || input.classes.some(c=>typeof c!=='string' || !c || /\s/.test(c)))) throw new TypeError('Invalid box classes');
    if(input.children!==undefined && !Array.isArray(input.children)) throw new TypeError('Invalid box children');
    if(input.source!==undefined && (!object(input.source) || !Number.isSafeInteger(input.source.start) || !Number.isSafeInteger(input.source.end) || input.source.start<0 || input.source.end<input.source.start)) throw new TypeError('Invalid box source span');
    if(input.layoutContracts!==undefined && !Array.isArray(input.layoutContracts)) throw new TypeError('Invalid layout declarations');
    validateTargetMetadata(input);
    const path=input.path ?? (parent ? `${parent}/${index}` : name);
    if(!path || paths.has(path) || (parent && !path.startsWith(parent+'/'))) throw new TypeError('Box paths must be unique and nested below their parent');
    paths.add(path);
    const box={tag:input.tag,classes:[...(input.classes ?? [])],id:input.id,...(input.lang!==undefined ? {lang:input.lang} : {}),...(input.named ? {named:input.named} : {}),...(input.ariaHidden ? {ariaHidden:input.ariaHidden} : {}),...(input.focusable!==undefined ? {focusable:input.focusable} : {}),...(input.references!==undefined ? {references:input.references==='dynamic' ? 'dynamic' : [...input.references]} : {}),...(input.tabIndex!==undefined ? {tabIndex:input.tabIndex} : {}),...(input.labelledBy!==undefined ? {labelledBy:input.labelledBy==='dynamic' ? 'dynamic' : [...input.labelledBy]} : {}),...(input.equivalent!==undefined ? {equivalent:input.equivalent} : {}),...(input.essential!==undefined ? {essential:input.essential} : {}),...(input.alt!==undefined ? {alt:input.alt} : {}),...(input.inputType!==undefined ? {inputType:input.inputType} : {}),...(input.labelFor!==undefined ? {labelFor:input.labelFor} : {}),...(input.placeholder ? {placeholder:true} : {}),...(input.role!==undefined ? {role:input.role} : {}),...(input.inputName!==undefined ? {inputName:input.inputName} : {}),...(input.headers!==undefined ? {headers:input.headers==='dynamic' ? 'dynamic' : [...input.headers]} : {}),...(input.ariaLabel!==undefined ? {ariaLabel:input.ariaLabel} : {}),...(input.href!==undefined ? {href:input.href} : {}),...(input.textContent!==undefined ? {textContent:input.textContent} : {}),...(input.aria!==undefined ? {aria:{...input.aria}} : {}),...(input.nameSource!==undefined ? {nameSource:input.nameSource} : {}),...(input.value!==undefined ? {value:input.value} : {}),...(input.autocomplete!==undefined ? {autocomplete:input.autocomplete} : {}),...(input.scope!==undefined ? {scope:input.scope} : {}),...(input.controls ? {controls:true} : {}),...(input.autoplay ? {autoplay:true} : {}),...(input.muted ? {muted:true} : {}),...(input.trackKind!==undefined ? {trackKind:input.trackKind} : {}),...(input.accessKey!==undefined ? {accessKey:input.accessKey} : {}),...(input.ismap ? {ismap:true} : {}),...(input.colSpan!==undefined ? {colSpan:input.colSpan} : {}),...(input.hiddenAttr!==undefined ? {hiddenAttr:input.hiddenAttr} : {}),...(input.inert!==undefined ? {inert:input.inert} : {}),...(input.popover!==undefined ? {popover:input.popover} : {}),...(input.inlineStyle!==undefined ? {inlineStyle:input.inlineStyle} : {}),...(input.rowSpan!==undefined ? {rowSpan:input.rowSpan} : {}),owner:input.owner ?? name,path,
      ...(input.source ? {source:{...input.source}} : {}),children:[],text:input.text ?? false,
      ...(input.whitespace ? {whitespace:true} : {}),
      ...(input.targets?.length ? {targets:[...input.targets]} : {}),...(input.targetIdentity ? {targetIdentity:input.targetIdentity} : {}),
      documentRoot:input.documentRoot ?? (!parent && input.tag==='html'),
      ...(input.layoutContracts ? {layoutContracts:structuredClone(input.layoutContracts)} : {})};
    box.label=box.id ? `#${box.id}` : box.classes.length ? box.classes.map(c=>`.${c}`).join('') : `${box.tag}@${path}`;
    const unknown=(code,message)=>diagnostics.push({code,severity:'unknown',message,box:box.label,path,source:box.source});
    if(!boxTags.has(box.tag)) unknown('U_LAYOUT_ELEMENT',`Native or foreign element needs a size adapter: ${box.tag}`);
    box.children=(input.children ?? []).map((child,i)=>visit(child,path,i,depth+1));
    // Phrasing children of a text leaf are inline content of that leaf (not layout children).
    if(box.text && box.children.length && box.children.every(phrasing)) { box.inline=box.children; box.children=[]; }
    if(box.text && box.children.length) unknown('U_LAYOUT_STRUCTURE','Wrap text in an explicit leaf instead of creating anonymous grid items');
    return box;
  }
  const root=visit(tree,undefined,0,0);
  // inert: the subtree takes no focus and is hidden from assistive technology (Chromium: skipped by Tab, ignored in the AX tree).
  (function walk(box,inert) {
    if(box.inert==='dynamic') diagnostics.push({code:'U_LAYOUT_ELEMENT',severity:'unknown',message:`${box.tag}: a dynamic inert attribute decides focus and exposure`});
    const now=inert || box.inert===true;
    if(now) { box.focusable=false; delete box.tabIndex; box.inertSubtree=true; if(box.inert===true) box.ariaHidden=true; }
    for(const child of [...(box.children ?? []),...(box.inline ?? [])]) walk(child,now);
  })(root,false);
  return {root,diagnostics};
}
