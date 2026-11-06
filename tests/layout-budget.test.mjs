import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout/engine.mjs';

test('structural/profile passes share a work budget and cannot silently skip exhausted checks',()=>{
  const ir=requireIR(compile('component C(){<div/>}'));
  const options={css:'*{margin:0;box-sizing:border-box}',viewport:{min:100,max:200}};
  const budget={remaining:1};
  const first=analyzeLayout(ir,options,undefined,budget);
  const second=analyzeLayout(ir,options,undefined,budget);
  for(const report of [first,second]) {
    assert.equal(report.status,'unknown');
    assert.ok(report.diagnostics.some(d=>d.code==='U_LAYOUT_LIMIT'));
  }
});
