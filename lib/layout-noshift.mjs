// Isle-only bridge: authored selectors and finite state cases -> generic relations.
import {createLayoutIR} from './layout-contract.mjs';
import {layoutInstances,caseKey,directInstances,localLayout} from './layout/composition.mjs';
import {matches} from './layout/css.mjs';
import {createNoShiftContract,createTransitionIR,createTransitionObligation,verifyTransitionObligation} from './layout-transition.mjs';

const limit=256;
const freeze=value=>{if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const snapshot=value=>freeze(structuredClone(value));
const same=(row,scenario)=>caseKey(row)===caseKey(scenario);
export function hasDeclaredNoShift(ir,report) {
  const owners=new Set([report.component,...(report.layoutBindings ?? []).map(row=>row.declaration.contract.component)]);
  return ir.components.some(component=>owners.has(component.name) && component.layout?.noshift?.length);
}
function oneCase(report,scenario) {
  const result={...report,scope:{...report.scope}};
  if(report.structure) result.structure={...report.structure,variants:report.structure.variants.filter(row=>row.id===scenario.variant)};
  if(report.scope.scrollbarProfiles) result.scope.scrollbarProfiles=report.scope.scrollbarProfiles.filter(row=>row.name===scenario.scrollbarProfile);
  for(const key of ['elements','diagnostics','policies','checks','sizes','queries','subgrids','scrollbars','layoutBindings']) {
    if(report[key]) result[key]=report[key].filter(row=>same(row,scenario));
  }
  return result;
}

// Geometry paths may move on reorder. Keep physical instances for ownership
// boundaries, and group comparison lifetimes by the producer's logical identity.
function identityInstances(report,instances) {
  if(!report.structure?.variants.every(v=>Array.isArray(v.instances) && Array.isArray(v.requirements))) return instances;
  for(const variant of report.structure.variants) {
    const ids=new Set();
    for(const row of variant.requirements) {
      if(typeof row.owner!=='string' || typeof row.nodeId!=='string' || typeof row.id!=='string' || !Array.isArray(row.keys) || ids.has(row.id)) throw new Error('Invalid or ambiguous target lifetime inventory');
      ids.add(row.id);
    }
    for(const element of report.elements ?? []) if(element.variant===variant.id && element.targets?.some(id=>!ids.has(id))) throw new Error('A live target is missing from the lifetime inventory');
  }
  const groups=new Map();
  for(const instance of instances) for(const scenario of instance.cases) {
    const metadata=report.structure.variants.find(v=>v.id===scenario.variant);
    const bindings=metadata.instances.filter(row=>row.path===instance.path && row.component===instance.contract.component && JSON.stringify(row.source)===JSON.stringify(instance.declaration.source));
    if(bindings.length!==1 || !bindings[0].identity) throw new Error('Missing or ambiguous logical layout instance identity');
    const identity=bindings[0].identity,key=JSON.stringify([identity,instance.contract.component,instance.declaration.source]);
    if(!groups.has(key)) groups.set(key,{...instance,identity,cases:[]});
    groups.get(key).cases.push({...scenario,path:instance.path});
  }
  return [...groups.values()];
}

/** Equality is transitive: N states need N anchor comparisons, not N² pairs. */
export function createNoShiftPlan(ir,report) {
  const diagnostics=[],checks=[];
  const problem=(code,message,instance,target)=>diagnostics.push({code,severity:'unknown',message,
    ...(instance ? {path:instance.path,source:target?.source ?? instance.declaration.source} : {})});
  if(report.status!=='verified' || report.structure?.complete===false) problem('U_NOSHIFT_LAYOUT','Finite structure and every endpoint layout must verify before noshift checking');
  const implementation=createLayoutIR(report);
  const definitions=new Map(ir.components.map(c=>[c.name,c]));
  const instances=layoutInstances(implementation);
  let logicalInstances=[];
  try {logicalInstances=identityInstances(report,instances);} catch(error) {problem('U_NOSHIFT_IDENTITY',error.message);}
  const root=definitions.get(report.component);
  if(root?.layout?.noshift?.length && !instances.some(instance=>instance.contract.component===root.name)) problem('U_NOSHIFT_BINDING','Root noshift declaration has no native instance binding');
  instances: for(const instance of logicalInstances) {
    const component=instance.contract.component,targets=definitions.get(component)?.layout?.noshift;
    if(!targets?.length) continue;
    const platforms=new Map();
    for(const scenario of instance.cases) {
      const key=scenario.scrollbarProfile ?? '';
      if(!platforms.has(key)) platforms.set(key,[]);
      platforms.get(key).push(scenario);
    }
    for(const cases of platforms.values()) {
      const tracks=new Map();
      const append=(id,target,endpoint,identity)=>{
        if(!tracks.has(id)) tracks.set(id,{target,identity,endpoints:[]});
        tracks.get(id).endpoints.push(endpoint);
      };
      for(const scenario of cases) {
        const path=scenario.path ?? instance.path,selected=oneCase(report,scenario);
        const boundaries=directInstances(instances,path,[scenario]),publicRoots=new Set(boundaries.map(boundary=>boundary.path));
        const elements=localLayout(implementation,boundaries).elements.filter(row=>same(row,scenario));
        const inventory=report.structure?.variants.find(v=>v.id===scenario.variant)?.requirements;
        for(const [i,target] of targets.entries()) {
          if(target.nodeId) {
            if(instance.identity) {
              if(inventory.some(row=>typeof row.owner!=='string')) problem('U_NOSHIFT_IDENTITY','Target has no declared owner identity',instance,target);
              const active=inventory.filter(row=>row.owner===instance.identity && row.nodeId===target.nodeId);
              for(const row of active) append(row.id,target,{report:selected,path:{id:row.id,within:path},scenario},{id:row.id,nodeId:target.nodeId,keys:row.keys});
            } else append(target.nodeId,target,{report:selected,path:{id:target.nodeId,within:path},scenario},{id:target.nodeId,nodeId:target.nodeId,keys:[]});
            continue;
          }
          const candidates=elements.filter(box=>(box.path===path || publicRoots.has(box.path) || box.path.startsWith(path+'/') && box.owner===component) && matches(target.selector,box));
          if(candidates.length!==1) problem('U_NOSHIFT_TARGET',`${component} noshift ${JSON.stringify(target.selector)} needs exactly one owned native box in each live case; found ${candidates.length} in ${caseKey(scenario)}`,instance,target);
          append(`selector${i}`,target,{report:selected,path:candidates[0]?.path,scenario});
        }
      }
      // Targets with the same live cases share an anchor. Cap each generic
      // contract at 32 expanded targets, independently of source-site count.
      const groups=new Map();
      for(const track of tracks.values()) {
        if(track.endpoints.some(e=>!e.path)) continue;
        const coverage=JSON.stringify(track.endpoints.map(e=>caseKey(e.scenario)));
        if(!groups.has(coverage)) groups.set(coverage,[]);
        groups.get(coverage).push(track);
      }
      for(const group of groups.values()) for(let offset=0;offset<group.length;offset+=32) {
        const batch=group.slice(offset,offset+32),endpoints=batch[0].endpoints,anchor=endpoints[0];
        for(const [index,endpoint] of endpoints.entries()) {
          if(checks.length>=limit) {problem('U_NOSHIFT_LIMIT',`Noshift comparison limit exceeded (${limit})`,instance);break instances;}
          try {
            const contract=createNoShiftContract({name:'IsleNoShift',targets:batch.map((track,i)=>({name:`target${i}`,before:track.endpoints[0].path,after:track.endpoints[index].path}))});
            const obligation=createTransitionObligation(contract,createTransitionIR({before:anchor.report,after:endpoint.report}));
            checks.push({component,path:anchor.scenario.path ?? instance.path,source:instance.declaration.source,targets:batch.map(t=>t.target),identities:batch.flatMap((t,i)=>t.identity ? [{target:`target${i}`,...t.identity}] : []),from:anchor.scenario,to:endpoint.scenario,obligation});
          } catch(error) {problem(error instanceof RangeError ? 'U_NOSHIFT_LIMIT' : 'U_NOSHIFT_MODEL',error.message,instance);}
        }
      }
    }
  }
  return snapshot({version:1,kind:'isle-noshift-plan',complete:!diagnostics.length,coverage:'all-finite-cases',diagnostics,checks});
}

export async function verifyNoShiftPlan(plan,api,options) {
  if(plan?.version!==1 || plan.kind!=='isle-noshift-plan' || !Array.isArray(plan.checks) || plan.checks.length>limit) throw new TypeError('Invalid Isle noshift plan');
  const checks=[];
  if(plan.complete) for(const {obligation,...context} of plan.checks) {
    checks.push({...context,...await verifyTransitionObligation(obligation,api,options)});
    if(checks.at(-1).status!=='verified') break;
  }
  const status=!plan.complete || checks.some(row=>row.status==='unknown') ? 'unknown' : checks.some(row=>row.status==='violated') ? 'violated' : 'verified';
  return {version:1,status,coverage:plan.complete ? 'all-finite-cases' : 'incomplete',comparisons:{planned:plan.checks.length,checked:checks.length},diagnostics:plan.diagnostics,checks};
}

/** Preserve Unknown precedence when composing different independent checks. */
export function noShiftVerification(verification,result) {
  if(result.status==='verified' || verification.status==='unknown' && result.status==='violated') return verification;
  const failed=result.checks.find(row=>row.status==='unknown') ?? result.checks.find(row=>row.status==='violated');
  return failed?.proof ?? {...verification,status:'unknown',complete:false,diagnostics:[...verification.diagnostics,...result.diagnostics]};
}
