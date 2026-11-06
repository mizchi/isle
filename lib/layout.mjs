// Compile-time / playground adapter. Never imported by emitted app runtimes.
import {analyzeLayout as analyzeStatic} from './layout/engine.mjs';
import {hasDynamicStructure,expandStructure} from './layout/structure.mjs';
import {extractBoxes,validateOptions} from './layout/input.mjs';
import {matches} from './layout/css.mjs';
import {collectStyles} from './styles.mjs';

export function analyzeLayout(ir,options) {
  validateOptions(options);
  const component=options.component ?? ir.components[0]?.name;
  const sheets=collectStyles(ir,component).map(style=>({css:style.css,file:`<inline:${style.component}>`,kind:'app'}));
  const dynamic=hasDynamicStructure(ir,component);
  if (!dynamic && !options.scrollbars) return analyzeStatic(ir,options,undefined,undefined,sheets);
  let structure;
  try {structure=dynamic ? expandStructure(ir,component,options.props) : {variants:[{id:0,root:ir.components.find(c=>c.name===component).root,choices:[]}],bounds:[]};}
  catch(error) {
    if (!error.code?.startsWith('U_LAYOUT_')) throw error;
    const selected=ir.components.find(c=>c.name===component);
    const safe={...ir,components:ir.components.map(c=>c!==selected ? c : {...c,root:{kind:'element',tag:'div',attributes:[],children:[],handlers:[]}})};
    const report=analyzeStatic(safe,{...options,boxes:{}},undefined,undefined,sheets);
    return {...report,ok:false,status:'unknown',structure:{complete:false,variants:[],bounds:[]},diagnostics:[{code:error.code,severity:'unknown',message:error.message}]};
  }
  const matched=new Set(),reports=[],identities=[],budget={remaining:2_000_000};
  variants: for (const variant of structure.variants) {
    const program={...ir,components:ir.components.map(c=>c.name!==component ? c : {...c,root:variant.root})};
    const root=extractBoxes(program,component,()=>{}),boxes=[];
    const collect=box=>{if(box){boxes.push(box);box.children.forEach(collect);}};collect(root);
    const contracts=Object.fromEntries(Object.entries(options.boxes ?? {}).filter(([selector])=>{if(!boxes.some(box=>matches(selector,box))) return false;matched.add(selector);return true;}));
    for(const profile of options.scrollbars ?? [undefined]) {
      reports.push(analyzeStatic(program,{...options,boxes:contracts},profile,budget,sheets));
      identities.push({...(dynamic ? {variant:variant.id} : {}),...(profile ? {scrollbarProfile:profile.name} : {})});
      if(budget.remaining<0) break variants;
    }
  }
  for(const selector of Object.keys(options.boxes ?? {})) if(!matched.has(selector) && budget.remaining>=0) throw new Error(`Layout contract does not match a box: ${selector}`);
  const report={...reports[0],...(dynamic ? {structure:{complete:budget.remaining>=0,variants:structure.variants.map(({id,choices})=>({id,choices})),bounds:structure.bounds}} : {})};
  for(const key of ['diagnostics','policies','checks','sizes','queries','subgrids','scrollbars']) {
    if(key==='scrollbars' && !reports.some(r=>r.scrollbars)) continue;
    report[key]=reports.flatMap((r,index)=>(r[key] ?? []).map(row=>({...row,...identities[index]})));
  }
  if(options.scrollbars) {
    report.scope={...report.scope,scrollbarProfiles:options.scrollbars};
    report.assumptions=[...report.assumptions,'Native scrollbar geometry must match one of the declared exact platform profiles; auto visibility states are conservatively combined.'];
  }
  report.status=reports.some(r=>r.status==='unknown') ? 'unknown' : reports.some(r=>r.status==='violated') ? 'violated' : 'verified';report.ok=report.status==='verified';
  return report;
}
