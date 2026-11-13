import {normalizeTree} from './tree.mjs';
import {analyzeBoxTree} from './layout/engine.mjs';
import {validateOptions} from './layout/input.mjs';

// Shared with the HTML adapter; not part of the package export surface.
export function analyzeInput(tree,options,adapterDiagnostics=[]) {
  if(!options || Object.hasOwn(options,'component') || Object.hasOwn(options,'props')) throw new TypeError('Invalid CSS verifier options: use name and a finite box tree');
  const {name='Document',...configuration}=options;
  if(typeof name!=='string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(name)) throw new TypeError('Invalid CSS verification subject name');
  validateOptions({...configuration,name});
  const {root,diagnostics}=normalizeTree(tree,name);
  const inputDiagnostics=[...diagnostics,...adapterDiagnostics],budget={remaining:2_000_000};
  const reports=[];
  for(const profile of configuration.scrollbars ?? [undefined]) {
    // Contracts are attached by the engine; each case owns its tree.
    reports.push(analyzeBoxTree(structuredClone(root),{...configuration,name},profile,budget,[],inputDiagnostics));
    if(budget.remaining<0) break;
  }
  const report=reports[0];
  if(!configuration.scrollbars) return report;
  for(const key of ['diagnostics','policies','checks','sizes','queries','subgrids','elements','scrollbars','layoutBindings']) {
    if(!reports.some(r=>r[key])) continue;
    report[key]=reports.flatMap((r,i)=>(r[key] ?? []).map(row=>({...row,scrollbarProfile:configuration.scrollbars[i].name})));
  }
  report.scope={...report.scope,scrollbarProfiles:configuration.scrollbars};
  report.assumptions=[...report.assumptions,'Native scrollbar geometry must match one of the declared exact platform profiles; auto visibility states are conservatively combined.'];
  report.status=reports.some(r=>r.status==='unknown') ? 'unknown' : reports.some(r=>r.status==='violated') ? 'violated' : 'verified';
  report.ok=report.status==='verified';
  return report;
}
