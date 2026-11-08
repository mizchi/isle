import test from 'node:test';
import assert from 'node:assert/strict';
import {auditResumeSemantics} from '../tools/audit-resume-semantics.mjs';

test('resume semantics audit separates measured capture/code facts from unimplemented targets',async()=>{
  const report=await auditResumeSemantics();
  assert.equal(report.version,1);
  assert.deepEqual(report.cases.map(row=>row.id),['flat','regions','reactive-props']);
  for(const row of report.cases.filter(row=>row.accepted&&row.id!=='reactive-props')) {
    assert.ok(row.entries.length>0);
    assert.ok(row.snapshotBytes>=0);
    assert.equal(row.unusedPayloadGrowth,row.snapshotBytes-row.emptySnapshotBytes);
    assert.equal(row.checks.find(check=>check.id==='unused-input-elision').met,row.unusedPayloadGrowth===0);
  }
  assert.equal(report.targetsMet,report.cases.every(row=>row.checks.every(check=>check.met)));
  const owner=report.cases.find(row=>row.id==='reactive-props');
  assert.equal(owner.checks[0].met,owner.accepted);
  if(!owner.accepted) assert.ok(owner.diagnostics.some(d=>d.code==='E_COMPONENT_CAPTURE'));
});
