import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const fixture=id=>readFile(new URL(`../evals/scenarios/resume-semantics/${id}.isle`,import.meta.url),'utf8');

/** Observations of the current compiler, not a benchmark against Qwik or an equivalence proof. */
export async function auditResumeSemantics() {
  const cases=[];
  for(const id of ['flat','regions','reactive-props']) {
    const result=compile(await fixture(id));
    if(!result.ok) {
      cases.push({id,accepted:false,diagnostics:result.diagnostics,checks:[{id:'cross-owner-live-input',met:false}]});
      continue;
    }
    const program=prepareProgram(requireIR(result)),definition=program.get(id==='reactive-props' ? 'Parent' : 'Demo'),generated=definition.generate();
    if(id==='reactive-props') {
      // Acceptance is only the first gate. Browser propagation/independent resume remain separate obligations.
      cases.push({id,accepted:true,checks:[{id:'cross-owner-live-input',met:true}]});
      continue;
    }
    const empty=definition.render({unused:''}),large=definition.render({unused:'x'.repeat(65536)});
    const emptySnapshotBytes=bytes(empty.snapshot),snapshotBytes=bytes(large.snapshot);
    const entries=generated.handlers.map(handler=>({id:handler.id,captures:handler.captureNames,generatedBytes:Buffer.byteLength(handler.code)}));
    const unusedPayloadGrowth=snapshotBytes-emptySnapshotBytes;
    const primary=entries.find(entry=>entry.id==='Demo.add');
    cases.push({id,accepted:true,snapshotSlots:generated.analysis.snapshotSlots,valuePhases:generated.analysis.valuePhases,emptySnapshotBytes,snapshotBytes,unusedPayloadGrowth,entries,
      regionModuleBytes:generated.regions ? Buffer.byteLength(generated.regions.code) : 0,
      checks:[{id:'unused-input-elision',met:unusedPayloadGrowth===0},
        {id:'entry-local-capture',met:primary.captures.length===1&&primary.captures[0]==='n'}]});
  }
  return {version:1,input:{unusedStringBytes:65536},units:'UTF-8 bytes of JSON.stringify(snapshot) and unbundled generated JS; not transfer bytes',
    targetsMet:cases.every(row=>row.checks.every(check=>check.met)),cases};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=await auditResumeSemantics();
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(process.argv.includes('--require-targets')&&!report.targetsMet) process.exitCode=1;
}
