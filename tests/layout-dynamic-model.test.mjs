import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

test('veri finite model checks bounded transitions and replays a missing-gutter witness in the analyzer',()=>{
  const model=JSON.parse(execFileSync('moon',['run','cmd/layout-dynamic-model','--target','js'],{encoding:'utf8'}));
  assert.ok(model.complete && model.bounded_safe && model.gutter_safe);
  assert.equal(model.states,240);
  assert.equal(model.unbounded_witness.at(-1).count,5);
  const witness=model.ignored_gutter_witness.at(-1);
  assert.equal(witness.gutter,15);assert.ok(witness.width>=160 && witness.width<175);
  const source='client component C(){state items=[0];<main class="root">on click {items=items.length<4 ? items.concat([items.length]):items;}on dblclick {items=[];}<For each={items}>{(item) => <Fragment key={item}><div class="cell"></div></Fragment>}</For></main>}';
  const ir=requireIR(compile(source));
  const css='*{box-sizing:border-box;margin:0}.root{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);grid-auto-rows:40px;block-size:100px;overflow:auto;scrollbar-gutter:stable}.cell{min-width:40px}';
  const run=breakpoint=>analyzeLayout(ir,{css:css+`@media(width < ${breakpoint}px){.root{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}`,viewport:{min:95,max:200,height:{min:200,max:400}},boxes:{'.root':{overflowBlock:'scroll'}},scrollbars:[{name:'classic',inlineSize:15,blockSize:15}]});
  assert.equal(run(175).status,'verified');
  const broken=run(160);
  assert.equal(broken.status,'violated');
  assert.ok(broken.diagnostics.some(d=>d.range.min<=witness.width && d.range.max>witness.width));
});
