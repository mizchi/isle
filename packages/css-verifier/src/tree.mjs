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
  let focusable = tag === 'a' ? has('href') : tag === 'button' ? !has('disabled') : undefined;
  if (has('tabindex')) { const index = value('tabindex'); focusable = index === undefined ? 'dynamic' : /^\s*-/.test(index) ? false : /^\s*\d+\s*$/.test(index) ? true : focusable; }
  // id references (aria-labelledby, aria-describedby, aria-controls); 'dynamic' when any is dynamic.
  const referenceNames = ['aria-labelledby', 'aria-describedby', 'aria-controls'].filter(has);
  const references = referenceNames.some(name => value(name) === undefined) ? 'dynamic' : referenceNames.flatMap(name => value(name).trim().split(/\s+/).filter(Boolean));
  const tabIndex = has('tabindex') && value('tabindex') !== undefined && /^\s*-?\d+\s*$/.test(value('tabindex')) ? Number(value('tabindex')) : undefined;
  // SC 2.5.8 exceptions declared in the DOM: an equivalent control (id), or an essential presentation (reason).
  const equivalent = has('data-a11y-equivalent') ? (value('data-a11y-equivalent') === undefined ? 'dynamic' : value('data-a11y-equivalent').trim() || undefined) : undefined;
  const essential = has('data-a11y-essential') ? (value('data-a11y-essential') === undefined ? 'dynamic' : value('data-a11y-essential').trim() || undefined) : undefined;
  const ariaHidden = has('aria-hidden') ? (value('aria-hidden') === undefined ? 'dynamic' : value('aria-hidden').trim() === 'true' || undefined) : undefined;
  return {...(equivalent ? {equivalent} : {}), ...(essential ? {essential} : {}), ...(labelledBy === 'dynamic' || labelledBy?.length ? {labelledBy} : {}), ...(references === 'dynamic' || references.length ? {references} : {}), ...(tabIndex !== undefined ? {tabIndex} : {}), ...(named ? {named} : {}), ...(ariaHidden ? {ariaHidden} : {}), ...(focusable !== undefined ? {focusable} : {})};
}

const fields=new Set(['tag','id','lang','named','ariaHidden','focusable','references','labelledBy','tabIndex','equivalent','essential','classes','children','text','whitespace','path','source','owner','documentRoot','layoutContracts','targets','targetIdentity']);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);

/** Clone the supplied model: analysis must never attach facts to caller state. */
export function normalizeTree(tree,name) {
  const seen=new Set(), paths=new Set(), diagnostics=[];
  function visit(input,parent,index,depth) {
    if(!object(input) || Object.keys(input).some(key=>!fields.has(key)) || typeof input.tag!=='string' || !/^[a-z][a-z0-9-]*$/.test(input.tag)) throw new TypeError('Invalid box tree node');
    if(seen.has(input)) throw new TypeError('Box tree must not contain cycles or shared nodes');
    if(depth>64 || seen.size>=2048) throw new TypeError('Box tree limit exceeded');
    seen.add(input);
    for(const key of ['id','lang','owner','path','equivalent','essential']) if(input[key]!==undefined && (typeof input[key]!=='string' || input[key].length>4096)) throw new TypeError(`Invalid box ${key}`);
    for(const key of ['text','whitespace','documentRoot']) if(input[key]!==undefined && typeof input[key]!=='boolean') throw new TypeError(`Invalid box ${key}`);
    if(input.references!==undefined && input.references!=='dynamic' && (!Array.isArray(input.references) || input.references.some(id=>typeof id!=='string' || !id))) throw new TypeError('Invalid box references');
    if(input.labelledBy!==undefined && input.labelledBy!=='dynamic' && (!Array.isArray(input.labelledBy) || input.labelledBy.some(id=>typeof id!=='string' || !id))) throw new TypeError('Invalid box labelledBy');
    if(input.tabIndex!==undefined && !Number.isSafeInteger(input.tabIndex)) throw new TypeError('Invalid box tabIndex');
    for(const key of ['named','ariaHidden','focusable']) if(input[key]!==undefined && typeof input[key]!=='boolean' && input[key]!=='dynamic') throw new TypeError(`Invalid box ${key}`);
    if(input.classes!==undefined && (!Array.isArray(input.classes) || input.classes.some(c=>typeof c!=='string' || !c || /\s/.test(c)))) throw new TypeError('Invalid box classes');
    if(input.children!==undefined && !Array.isArray(input.children)) throw new TypeError('Invalid box children');
    if(input.source!==undefined && (!object(input.source) || !Number.isSafeInteger(input.source.start) || !Number.isSafeInteger(input.source.end) || input.source.start<0 || input.source.end<input.source.start)) throw new TypeError('Invalid box source span');
    if(input.layoutContracts!==undefined && !Array.isArray(input.layoutContracts)) throw new TypeError('Invalid layout declarations');
    validateTargetMetadata(input);
    const path=input.path ?? (parent ? `${parent}/${index}` : name);
    if(!path || paths.has(path) || (parent && !path.startsWith(parent+'/'))) throw new TypeError('Box paths must be unique and nested below their parent');
    paths.add(path);
    const box={tag:input.tag,classes:[...(input.classes ?? [])],id:input.id,...(input.lang!==undefined ? {lang:input.lang} : {}),...(input.named ? {named:input.named} : {}),...(input.ariaHidden ? {ariaHidden:input.ariaHidden} : {}),...(input.focusable!==undefined ? {focusable:input.focusable} : {}),...(input.references!==undefined ? {references:input.references==='dynamic' ? 'dynamic' : [...input.references]} : {}),...(input.tabIndex!==undefined ? {tabIndex:input.tabIndex} : {}),...(input.labelledBy!==undefined ? {labelledBy:input.labelledBy==='dynamic' ? 'dynamic' : [...input.labelledBy]} : {}),...(input.equivalent!==undefined ? {equivalent:input.equivalent} : {}),...(input.essential!==undefined ? {essential:input.essential} : {}),owner:input.owner ?? name,path,
      ...(input.source ? {source:{...input.source}} : {}),children:[],text:input.text ?? false,
      ...(input.whitespace ? {whitespace:true} : {}),
      ...(input.targets?.length ? {targets:[...input.targets]} : {}),...(input.targetIdentity ? {targetIdentity:input.targetIdentity} : {}),
      documentRoot:input.documentRoot ?? (!parent && input.tag==='html'),
      ...(input.layoutContracts ? {layoutContracts:structuredClone(input.layoutContracts)} : {})};
    box.label=box.id ? `#${box.id}` : box.classes.length ? box.classes.map(c=>`.${c}`).join('') : `${box.tag}@${path}`;
    const unknown=(code,message)=>diagnostics.push({code,severity:'unknown',message,box:box.label,path,source:box.source});
    if(!boxTags.has(box.tag)) unknown('U_LAYOUT_ELEMENT',`Native or foreign element needs a size adapter: ${box.tag}`);
    box.children=(input.children ?? []).map((child,i)=>visit(child,path,i,depth+1));
    if(box.text && box.children.length) unknown('U_LAYOUT_STRUCTURE','Wrap text in an explicit leaf instead of creating anonymous grid items');
    return box;
  }
  return {root:visit(tree,undefined,0,0),diagnostics};
}
