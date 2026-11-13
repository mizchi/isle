import {boxTags} from './layout/input.mjs';
import {validateTargetMetadata} from './layout/target-metadata.mjs';

const fields=new Set(['tag','id','classes','children','text','whitespace','path','source','owner','documentRoot','layoutContracts','targets','targetIdentity']);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);

/** Clone the supplied model: analysis must never attach facts to caller state. */
export function normalizeTree(tree,name) {
  const seen=new Set(), paths=new Set(), diagnostics=[];
  function visit(input,parent,index,depth) {
    if(!object(input) || Object.keys(input).some(key=>!fields.has(key)) || typeof input.tag!=='string' || !/^[a-z][a-z0-9-]*$/.test(input.tag)) throw new TypeError('Invalid box tree node');
    if(seen.has(input)) throw new TypeError('Box tree must not contain cycles or shared nodes');
    if(depth>64 || seen.size>=2048) throw new TypeError('Box tree limit exceeded');
    seen.add(input);
    for(const key of ['id','owner','path']) if(input[key]!==undefined && (typeof input[key]!=='string' || input[key].length>4096)) throw new TypeError(`Invalid box ${key}`);
    for(const key of ['text','whitespace','documentRoot']) if(input[key]!==undefined && typeof input[key]!=='boolean') throw new TypeError(`Invalid box ${key}`);
    if(input.classes!==undefined && (!Array.isArray(input.classes) || input.classes.some(c=>typeof c!=='string' || !c || /\s/.test(c)))) throw new TypeError('Invalid box classes');
    if(input.children!==undefined && !Array.isArray(input.children)) throw new TypeError('Invalid box children');
    if(input.source!==undefined && (!object(input.source) || !Number.isSafeInteger(input.source.start) || !Number.isSafeInteger(input.source.end) || input.source.start<0 || input.source.end<input.source.start)) throw new TypeError('Invalid box source span');
    if(input.layoutContracts!==undefined && !Array.isArray(input.layoutContracts)) throw new TypeError('Invalid layout declarations');
    validateTargetMetadata(input);
    const path=input.path ?? (parent ? `${parent}/${index}` : name);
    if(!path || paths.has(path) || (parent && !path.startsWith(parent+'/'))) throw new TypeError('Box paths must be unique and nested below their parent');
    paths.add(path);
    const box={tag:input.tag,classes:[...(input.classes ?? [])],id:input.id,owner:input.owner ?? name,path,
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
