// Endpoint relations over extracted CSS geometry, independent of UI syntax.
import {createLayoutIR} from './layout-contract.mjs';
import {verifyLayoutModel} from './layout-z3.mjs';
import {affine,and,or,interval,region,rational} from './layout/smt.mjs';
import {sub,number,exact} from './layout/linear.mjs';
import {obligationModel} from './layout/model.mjs';

const fields=['inlineStart','blockStart','inlineSize','blockSize'];
const codes={inlineStart:'E_NOSHIFT_INLINE_START',blockStart:'E_NOSHIFT_BLOCK_START',inlineSize:'E_NOSHIFT_INLINE_SIZE',blockSize:'E_NOSHIFT_BLOCK_SIZE'};
const object=(value,keys)=>value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key));
const identifier=value=>typeof value==='string' && /^[A-Za-z_][\w.-]{0,127}$/.test(value);
const path=value=>typeof value==='string' && value.length>0 && value.length<=4096 && !/[\x00-\x1f]/.test(value);
function reference(value) {
  if(typeof value==='string' && path(value)) return value;
  if(object(value,['id','within']) && path(value.id) && value.id.length<=256 && (value.within===undefined || path(value.within))) return {id:value.id,...(value.within!==undefined ? {within:value.within} : {})};
  throw new TypeError('Invalid noshift target reference');
}
const freeze=value=>{if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const snapshot=value=>freeze(structuredClone(value));
const unknown=(code,message)=>({code,severity:'unknown',message});

/** Intent only: exact border-rectangle equality for explicitly matched targets. */
export function createNoShiftContract(input) {
  if(!object(input,['name','targets']) || !identifier(input.name) || !Array.isArray(input.targets) || !input.targets.length || input.targets.length>256) throw new TypeError('Invalid noshift contract');
  const names=new Set(),before=new Set(),after=new Set();
  const targets=input.targets.map(target=>{
    if(!object(target,['name','before','after']) || !identifier(target.name)) throw new TypeError('Invalid noshift target');
    const result={name:target.name,before:reference(target.before),after:reference(target.after)};
    const left=JSON.stringify(result.before),right=JSON.stringify(result.after);
    if(names.has(target.name) || before.has(left) || after.has(right)) throw new TypeError('Ambiguous noshift target correspondence');
    names.add(target.name);before.add(left);after.add(right);return result;
  });
  return snapshot({version:1,kind:'noshift-contract',profile:'noshift/1',name:input.name,targets});
}

function environment(scope) {
  const range=value=>value && [value.minExact,value.maxExact,value.minInclusive,value.maxInclusive];
  return JSON.stringify([scope.axis,range(scope.viewport),range(scope.viewport.height),scope.hostInset,scope.hostBlockInset ?? 0,scope.scrollbarProfiles ?? []]);
}

/** Extract both states before consulting any target contract. */
export function createTransitionIR(input) {
  if(!object(input,['before','after'])) throw new TypeError('Invalid transition input');
  const before=createLayoutIR(input.before),after=createLayoutIR(input.after);
  const diagnostics=[...before.diagnostics,...after.diagnostics];
  if(input.before.status!=='verified' || input.after.status!=='verified') diagnostics.push(unknown('U_NOSHIFT_LAYOUT','Both endpoint layouts must satisfy their static layout checks'));
  if(before.cases.length!==1 || after.cases.length!==1) diagnostics.push(unknown('U_NOSHIFT_CASES','Supply one concrete structural/platform case per endpoint; case correspondence is not inferred'));
  if(environment(before.scope)!==environment(after.scope)) diagnostics.push(unknown('U_NOSHIFT_ENVIRONMENT','Endpoint viewport ranges and host/platform environments must be identical'));
  const assumptions=[...new Set([...before.assumptions,...after.assumptions,
    'Both endpoints share the viewport, root border origin, host allocation and unscrolled environment.',
    'Target correspondence and this endpoint transition are supplied by the adapter; intermediate frames, text/paint and browser CLS are outside noshift/1.'])];
  return snapshot({version:1,kind:'transition',before,after,complete:before.complete && after.complete && !diagnostics.length,diagnostics,assumptions});
}

/** Coverage and equality are separate queries; missing geometry never proves equality. */
export function createTransitionObligation(contract,transition) {
  if(!object(contract,['version','kind','profile','name','targets']) || contract.version!==1 || contract.kind!=='noshift-contract' || contract.profile!=='noshift/1') throw new TypeError('Invalid NoShiftContract');
  contract=createNoShiftContract({name:contract.name,targets:contract.targets});
  if(!object(transition,['version','kind','before','after','complete','diagnostics','assumptions']) || transition.version!==1 || transition.kind!=='transition' ||
    typeof transition.complete!=='boolean' || !Array.isArray(transition.diagnostics) || !Array.isArray(transition.assumptions)) throw new TypeError('Invalid TransitionIR');
  const diagnostics=[...transition.diagnostics],{before,after}=transition;
  for(const state of [before,after]) {
    if(state?.kind!=='layout' || !Array.isArray(state.boxes) || !Array.isArray(state.elements) || state.boxes.length+state.elements.length>32768) throw new TypeError('Invalid transition layout facts');
  }
  const scope=before.scope;
  const domain=and([...interval(scope.viewport,'width'),...(scope.viewport.height ? interval(scope.viewport.height,'height') : ['(= height 0)'])]);
  const coverage=[],obligations=[];
  const append=row=>{if(obligations.length>=8192) throw new RangeError('Noshift obligation limit exceeded');obligations.push(row);};
  for(const target of contract.targets) {
    const sets=[];
    for(const [side,state] of [['before',before],['after',after]]) {
      const ref=target[side];let selected,rows;
      if(typeof ref==='string') {
        selected=ref;rows=state.boxes.filter(row=>row.path===selected);
        if(!state.elements.some(row=>row.path===selected)) diagnostics.push(unknown('U_NOSHIFT_TARGET',`No native box mapping for ${target.name} in ${side}: ${selected}`));
      } else {
        const elements=state.elements.filter(row=>!ref.within || row.path===ref.within || row.path.startsWith(ref.within+'/'));
        if(!elements.length) diagnostics.push(unknown('U_NOSHIFT_TARGET',`No structural inventory for target ${ref.id} in ${side}`));
        const candidates=elements.filter(row=>row.targets?.includes(ref.id));
        if(candidates.length>1) diagnostics.push(unknown('U_NOSHIFT_TARGET',`Ambiguous target ID ${ref.id} in ${side}`));
        if(candidates.some(row=>row.targetIdentity==='unknown')) diagnostics.push(unknown('U_NOSHIFT_IDENTITY',`Target ${ref.id} needs a proven key/lifetime correspondence in ${side}`));
        selected=candidates.length===1 ? candidates[0].path : `${ref.within ?? ''}/[target:${ref.id}]`;
        rows=candidates.length===1 ? state.boxes.filter(row=>row.path===selected) : [];
      }
      const measured=rows.filter(row=>row.rect && fields.every(field=>row.rect[field]));
      // Validate all compared affine expressions at the strict SMT boundary.
      for(const row of measured) for(const field of fields) affine(row.rect[field]);
      const visible=or(rows.map(region));
      coverage.push({code:'U_NOSHIFT_GEOMETRY',box:target.name,path:selected,domain:visible,failure:`(not ${or(measured.map(region))})`});
      append({code:'E_NOSHIFT_PRESENCE',box:target.name,path:selected,domain:'true',failure:`(not ${visible})`});
      sets.push({rows:measured,path:selected});
    }
    for(const left of sets[0].rows) for(const right of sets[1].rows) for(const field of fields) {
      append({code:codes[field],box:target.name,path:sets[0].path,axis:field.startsWith('inline') ? 'inline' : 'block',
        target:target.name,beforePath:sets[0].path,afterPath:sets[1].path,field,
        domain:and([region(left),region(right)]),failure:`(not (= ${affine(left.rect[field])} ${affine(right.rect[field])}))`,available:left.rect[field],required:right.rect[field]});
    }
  }
  const base={component:contract.name,scope,complete:transition.complete && !diagnostics.length,diagnostics,assumptions:transition.assumptions};
  return snapshot({version:1,kind:'transition-obligation',contract,transition,coverage:obligationModel(base,domain,coverage),model:obligationModel(base,domain,obligations)});
}

export async function verifyTransitionObligation(obligation,api,options) {
  if(obligation?.version!==1 || obligation.kind!=='transition-obligation') throw new TypeError('Invalid transition obligation');
  const coverage=await verifyLayoutModel(obligation.coverage,api,options);
  if(coverage.status!=='verified') {
    const proof={...coverage,status:'unknown',complete:false,diagnostics:[...coverage.diagnostics,
      ...(coverage.status==='violated' ? [unknown('U_NOSHIFT_GEOMETRY','Visible target geometry does not cover the full endpoint domain')] : [])]};
    return {version:1,status:'unknown',contract:obligation.contract,coverage,proof};
  }
  const proof=await verifyLayoutModel(obligation.model,api,options);
  const row=proof.witness && obligation.model.obligations[proof.witness.obligationIndex];
  const change=row?.field && proof.witness.availableExact!==undefined ? {
    target:row.target,field:row.field,beforePath:row.beforePath,afterPath:row.afterPath,
    before:{value:proof.witness.available,exact:proof.witness.availableExact},after:{value:proof.witness.required,exact:proof.witness.requiredExact},
    delta:{value:number(sub(rational(proof.witness.requiredExact),rational(proof.witness.availableExact))),exact:exact(sub(rational(proof.witness.requiredExact),rational(proof.witness.availableExact)))},
  } : null;
  return {version:1,status:proof.status,contract:obligation.contract,coverage,proof,...(change ? {change} : {})};
}
