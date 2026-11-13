import assert from 'node:assert/strict';
import {analyzeHTML} from '@mizchi/css-verifier/html';
import {verifyLayoutReport} from '@mizchi/css-verifier/z3/node';

const html='<main class="row">'+'<div class="cell"></div>'.repeat(4)+'</main>';
for(const breakpoint of [184,183]) {
  const report=analyzeHTML(html,{
    name:'Four',viewport:{min:100,max:640},
    css:`
      *{box-sizing:border-box}
      .row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .cell{min-width:40px}
      @media(width >= ${breakpoint}px){.row{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `,
  });
  const proof=await verifyLayoutReport(report);
  assert.equal(proof.status,breakpoint===184 ? 'verified' : 'violated');
  const failure=report.diagnostics.find(d=>d.witness);
  if(breakpoint===183) {
    assert.equal(failure.range.minExact,'183');
    assert.equal(failure.range.maxExact,'184');
    assert.equal(failure.range.maxInclusive,false);
  }
  console.log(JSON.stringify({breakpoint,status:proof.status,...(failure ? {range:failure.range,witness:failure.witness} : {})}));
}
