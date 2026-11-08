import {validValue} from './value.mjs';

/** Copy the closed wire algebra once for deeply frozen inputs. Mutable ancestors
 * still get fresh copies; memoized descendants are detached and frozen as well. */
export function createResourceInput() {
  const cache=new Map();
  const invalid=()=>{throw new Error('Invalid resource input');};
  const copyMutable=(type,input)=>{if(!validValue(type,input))invalid();return structuredClone(input);};
  function snapshot(type,input) {
    if(typeof type==='string'){if(!validValue(type,input))invalid();return input;}
    if(!input||typeof input!=='object')invalid();
    let typed=cache.get(type);const previous=typed?.get(input);if(previous)return previous;
    const array=!!type?.array;
    if(array){
      if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)invalid();
      if(!Object.isFrozen(input))return copyMutable(type,input);
    }else if(!type?.record||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))invalid();
    const descriptors=Object.getOwnPropertyDescriptors(input),own=Reflect.ownKeys(descriptors);
    const keys=array?own.slice(0,-1):own;
    if(array){
      if(own.at(-1)!=='length'||keys.length!==input.length||keys.some((key,i)=>key!==String(i)))invalid();
    }else if(keys.length!==Object.keys(type.record).length||keys.some(key=>typeof key!=='string'||!Object.hasOwn(type.record,key)))invalid();
    // A shallowly frozen array cannot be retained. Avoid copying every mutable
    // row in JavaScript when the native JSON copy path is sufficient.
    if(array&&keys.some(key=>{const d=descriptors[key];return Object.hasOwn(d,'value')&&d.value&&typeof d.value==='object'&&!Object.isFrozen(d.value);}))return copyMutable(type,input);
    let immutable=Object.isFrozen(input);
    const values=keys.map(key=>{
      const descriptor=descriptors[key];if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))invalid();
      const value=descriptor.value,field=array?type.array:type.record[key],copy=snapshot(field,value);
      if(typeof value==='object'&&!cache.get(field)?.has(value))immutable=false;
      return copy;
    });
    const copy=Object.freeze(array?values:Object.fromEntries(keys.map((key,i)=>[key,values[i]])));
    if(immutable){if(!typed)cache.set(type,typed=new WeakMap());typed.set(input,copy);}
    return copy;
  }
  return snapshot;
}
