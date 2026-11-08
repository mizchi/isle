// Compile-time contracts. No CSS/parser/solver implementation is imported here.
import {q,exact,serializeRange} from './layout/linear.mjs';
import {affine,and,or,interval,region} from './layout/smt.mjs';
import {createLayoutModel,verifyLayoutModel} from './layout-z3.mjs';

const freeze=value=>{if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const snapshot=value=>freeze(structuredClone(value));
export const SafeGrid=freeze({id:'safe-grid/1',containers:'grid',positioning:'in-flow',boxSizing:'border-box',geometry:'piecewise-affine',overflowPolicies:['fit']});
const object=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key));
const identity=row=>JSON.stringify([row.variant ?? null,row.scrollbarProfile ?? null]);
const metadata=row=>({box:row.box,path:row.path,...(row.variant!==undefined ? {variant:row.variant} : {}),...(row.scrollbarProfile!==undefined ? {scrollbarProfile:row.scrollbarProfile} : {})});
const unknown=(code,message)=>({code,severity:'unknown',message});

function range(input) {
  if(!object(input,['min','max']) || ![input.min,input.max].every(v=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=1_000_000) || input.min>input.max) throw new TypeError('Invalid nonempty layout contract interval');
  return serializeRange({min:q(input.min),max:q(input.max),minInclusive:true,maxInclusive:true});
}
export function createContractIR(input) {
  if(!object(input,['component','profile','requires','ensures']) || typeof input.component!=='string' || !/^[A-Z][A-Za-z0-9_]{0,127}$/.test(input.component) ||
    input.profile!==undefined && input.profile!==SafeGrid.id || !object(input.requires,['inlineSize','blockSize']) ||
    input.ensures!==undefined && (!object(input.ensures,['inline','block']) || input.ensures.inline!=='fit' || input.ensures.block!=='fit')) throw new TypeError('Invalid layout contract; use the safe-grid/1 grammar');
  return snapshot({version:1,kind:'contract',component:input.component,profile:SafeGrid,
    requires:{inlineSize:range(input.requires.inlineSize),blockSize:range(input.requires.blockSize)},ensures:{inline:'fit',block:'fit'}});
}

/** Extract implementation facts without consulting a ContractIR. */
export function createLayoutIR(report) {
  createLayoutModel(report); // Validate the existing exact SMT boundary too.
  if(!Array.isArray(report.sizes) || !Array.isArray(report.policies) || report.sizes.length+report.checks.length+report.policies.length>32768) throw new TypeError('Invalid layout fact count');
  const diagnostics=report.diagnostics.filter(d=>d.severity==='unknown');
  if(report.scope.axis!=='both' || !report.scope.blockSizing) diagnostics.push(unknown('U_LAYOUT_AXES','SafeGrid contracts require both dimensions'));
  if(report.policies.some(row=>row.overflow!=='fit') || report.checks.some(row=>!row.enforced)) diagnostics.push(unknown('U_LAYOUT_PROFILE','safe-grid/1 cannot import weakened overflow policies'));
  const variants=report.structure?.variants.map(({id})=>({variant:id})) ?? [{}];
  const platforms=report.scope.scrollbarProfiles?.map(({name})=>({scrollbarProfile:name})) ?? [{}];
  const cases=variants.flatMap(variant=>platforms.map(platform=>({...variant,...platform})));
  if(!cases.length || cases.length>2048) diagnostics.push(unknown('U_LAYOUT_COVERAGE','No complete finite layout cases'));
  // Unknown structural analysis can contain a diagnostic placeholder tree.
  // It is not an implementation case and must not become geometry evidence.
  const boxes=(cases.length ? report.sizes : []).map(row=>({...metadata(row),range:row.range,heightRange:row.heightRange,region:row.region,boxSizing:row.boxSizing,
    allocated:{inline:row.allocatedInlineSize,...(row.allocatedBlockSize ? {block:row.allocatedBlockSize} : {})},
    border:{inline:row.inlineSize,...(row.blockSize ? {block:row.blockSize} : {})},
    content:{inline:row.contentInlineSize,...(row.contentBlockSize ? {block:row.contentBlockSize} : {})}}));
  return snapshot({version:1,kind:'layout',component:report.component,scope:report.scope,cases,boxes,presence:cases.length ? report.policies : [],
    checks:cases.length ? report.checks : [],errors:cases.length ? report.diagnostics.filter(d=>d.severity==='error' && !d.witness) : [],
    complete:report.status!=='unknown' && report.structure?.complete!==false && !diagnostics.length,diagnostics,assumptions:report.assumptions});
}

function validateContract(contract) {
  const validProfile=object(contract?.profile,Object.keys(SafeGrid)) && Object.entries(SafeGrid).every(([key,value])=>Array.isArray(value) ?
    Array.isArray(contract.profile[key]) && contract.profile[key].length===value.length && value.every((entry,i)=>contract.profile[key][i]===entry) : contract.profile[key]===value);
  if(!object(contract,['version','kind','component','profile','requires','ensures']) || contract.kind!=='contract' || contract.version!==1 || !validProfile ||
    !object(contract.requires,['inlineSize','blockSize']) || !object(contract.ensures,['inline','block']) || contract.ensures.inline!=='fit' || contract.ensures.block!=='fit') throw new TypeError('Invalid ContractIR');
  for(const key of ['inlineSize','blockSize']) {
    const value=contract.requires[key],canonical=range({min:value?.min,max:value?.max});
    if(!object(value,Object.keys(canonical)) || Object.keys(canonical).some(key=>canonical[key]!==value[key])) throw new TypeError('Invalid ContractIR interval');
  }
}
function requires(contract,inputs) {
  return and([...interval(contract.requires.inlineSize,affine(inputs.inline)),...interval(contract.requires.blockSize,affine(inputs.block))]);
}
const fullBox=box=>box.border.inline && box.border.block && box.content.inline && box.content.block && box.allocated.inline;
function makeModel(base,domain,obligations) {
  if(obligations.length>8192) throw new RangeError('Layout contract obligation limit exceeded');
  const prelude=`(set-logic QF_LRA)\n(declare-const width Real)\n(declare-const height Real)\n(declare-const isle_case Real)\n(assert ${domain})\n`;
  const smt2=prelude+`(assert ${or(obligations.map((o,i)=>and([`(= isle_case ${i})`,o.domain,o.failure])))})\n`;
  if(smt2.length>2_000_000) throw new RangeError('Layout contract model size limit exceeded');
  return {...base,version:1,sourceObligations:obligations.length,domain:prelude,smt2,obligations};
}

export function createObligationIR(contract,implementation,{children=[]}={}) {
  validateContract(contract);
  if(implementation?.kind!=='layout' || implementation.version!==1 || implementation.component!==contract.component) throw new TypeError('Contract and implementation component must match');
  if(!Array.isArray(implementation.cases) || !implementation.cases.length && implementation.complete || implementation.cases.length>2048 || new Set(implementation.cases.map(identity)).size!==implementation.cases.length) throw new TypeError('Invalid LayoutIR cases');
  if(['boxes','presence','checks','errors'].some(key=>!Array.isArray(implementation[key])) || ['boxes','presence','checks','errors'].reduce((n,key)=>n+implementation[key].length,0)>32768) throw new TypeError('Invalid LayoutIR fact count');
  if(!Array.isArray(children) || children.length>256) throw new TypeError('Invalid child contract bindings');
  const inputs={inline:{coefficient:'1',constant:exact(q(-(implementation.scope.hostInset ?? 0)))},block:{coefficient:'0',heightCoefficient:'1',constant:exact(q(-(implementation.scope.hostBlockInset ?? 0)))}};
  const domain=requires(contract,inputs),base={component:contract.component,scope:implementation.scope,complete:implementation.complete,diagnostics:implementation.diagnostics,assumptions:implementation.assumptions};
  const obligations=implementation.checks.filter(row=>row.code!=='E_LAYOUT_ITEM_SIZE').map(row=>({...metadata(row),code:row.code,axis:row.axis,domain:region(row),failure:`(> ${affine(row.required)} ${affine(row.available)})`,available:row.available,required:row.required}));
  for(const row of implementation.errors) obligations.push({...metadata(row),code:row.code,axis:row.axis,domain:row.range ? region(row) : 'true',failure:'true'});
  for(const box of implementation.boxes) {
    if(box.boxSizing!=='border-box') obligations.push({...metadata(box),code:'E_LAYOUT_PROFILE',domain:region(box),failure:'true'});
    for(const axis of ['inline','block']) if(box.border[axis] && box.allocated[axis]) obligations.push({...metadata(box),code:'E_LAYOUT_FIT',axis,
      domain:region(box),failure:`(> ${affine(box.border[axis])} ${affine(box.allocated[axis])})`,available:box.allocated[axis],required:box.border[axis]});
  }
  const coverage=[],groups=new Map(implementation.cases.map(item=>[identity(item),{boxes:[],presence:[]}]));
  for(const key of ['boxes','presence','checks','errors']) for(const row of implementation[key]) {
    const group=groups.get(identity(row));if(!group) throw new TypeError('Layout facts contain an undeclared case');if(key in group) group[key].push(row);
  }
  const extractedDomain=and([...interval(implementation.scope.viewport,'width'),...(implementation.scope.viewport.height ? interval(implementation.scope.viewport.height,'height') : ['false'])]);
  for(const [key,group] of groups) {
    const [variant,scrollbarProfile]=JSON.parse(key),caseMetadata={...(variant!==null ? {variant} : {}),...(scrollbarProfile!==null ? {scrollbarProfile} : {})};
    const paths=new Map();for(const box of group.boxes) {if(!paths.has(box.path)) paths.set(box.path,[]);if(fullBox(box)) paths.get(box.path).push(region(box));}
    const root=group.boxes.filter(box=>box.path===contract.component && fullBox(box) && box.allocated.block);
    coverage.push({...caseMetadata,code:'U_LAYOUT_COVERAGE',path:contract.component,domain:'true',failure:`(not ${and([extractedDomain,or(root.map(region))])})`});
    for(const row of group.presence) coverage.push({...metadata(row),code:'U_LAYOUT_COVERAGE',domain:region(row),failure:`(not ${or(paths.get(row.path) ?? [])})`});
  }
  for(const binding of children) {
    if(!object(binding,['path','contract']) || typeof binding.path!=='string') throw new TypeError('Invalid child path binding');
    validateContract(binding.contract);
    const boxes=implementation.boxes.filter(box=>box.path===binding.path);
    if(!boxes.length) throw new TypeError(`Child contract path does not exist: ${binding.path}`);
    for(const box of boxes) {
      if(!box.allocated.inline || !box.allocated.block) {coverage.push({...metadata(box),code:'U_LAYOUT_COVERAGE',domain:region(box),failure:'true'});continue;}
      for(const [axis,key] of [['inline','inlineSize'],['block','blockSize']]) {
        const value=box.allocated[axis],range=binding.contract.requires[key];
        for(const [failure,available,required] of [
          [`(< ${affine(value)} ${affine(scalarRange(range.minExact))})`,value,scalarRange(range.minExact)],
          [`(> ${affine(value)} ${affine(scalarRange(range.maxExact))})`,scalarRange(range.maxExact),value],
        ]) obligations.push({...metadata(box),code:'E_LAYOUT_CHILD_REQUIRES',axis,domain:region(box),failure,available,required});
      }
    }
  }
  return snapshot({version:1,kind:'obligation',operation:'conformance',contract,implementation,children,
    coverage:makeModel(base,domain,coverage),model:makeModel(base,domain,obligations)});
}
const scalarRange=constant=>({coefficient:'0',constant});

/** Both v1 contracts guarantee Fit; replacement must accept every old input. */
export function createRefinementObligationIR(previous,next) {
  validateContract(previous);validateContract(next);
  if(previous.component!==next.component) throw new TypeError('Refinement component must match');
  const inputs={inline:{coefficient:'1',constant:'0'},block:{coefficient:'0',heightCoefficient:'1',constant:'0'}};
  const scope={axis:'both',viewport:{...previous.requires.inlineSize,height:previous.requires.blockSize},hostInset:0,hostBlockInset:0,closedCSS:true,browserRounding:false,blockSizing:true};
  const base={component:next.component,scope,complete:true,diagnostics:[],assumptions:[]};
  return snapshot({version:1,kind:'obligation',operation:'refinement',contract:next,previous,
    model:makeModel(base,requires(previous,inputs),[{code:'E_LAYOUT_REFINEMENT',domain:'true',failure:`(not ${requires(next,inputs)})`}])});
}

export async function verifyObligationIR(obligation,api,options) {
  if(obligation?.kind!=='obligation' || obligation.version!==1 || !['conformance','refinement'].includes(obligation.operation)) throw new TypeError('Invalid ObligationIR');
  let coverage;
  if(obligation.coverage) {
    coverage=await verifyLayoutModel(obligation.coverage,api,options);
    if(coverage.status!=='verified') return {version:1,status:'unknown',operation:obligation.operation,contract:obligation.contract,coverage,
      proof:{...coverage,status:'unknown',complete:false,diagnostics:[...coverage.diagnostics,...(coverage.status==='violated' ? [unknown('U_LAYOUT_COVERAGE','Implementation facts do not cover every required input, box and case')] : [])]}};
  }
  const proof=await verifyLayoutModel(obligation.model,api,options);
  return {version:1,status:proof.status,operation:obligation.operation,contract:obligation.contract,...(coverage ? {coverage} : {}),proof};
}
