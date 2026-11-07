import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {init,killThreads} from 'z3-solver';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
import {createLayoutModel,verifyLayoutModel} from '../lib/layout-z3.mjs';
import {readFile} from 'node:fs/promises';

const api=await init();after(()=>killThreads(api.em));
const ir=requireIR(compile('component Four(){<main class="row"><div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/></main>}'));
const css='*{box-sizing:border-box;margin:0}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.cell{min-width:40px}';
const run=(sheet=css,viewport={min:100,max:640})=>createLayoutModel(analyzeLayout(ir,{css:sheet,viewport}));

test('Z3 finds a counterexample below 160px, while 160px and above is UNSAT',async()=>{
  const broken=run(),result=await verifyLayoutModel(broken,api);
  assert.ok(broken.sourceObligations>broken.obligations.length,'identical formulas are shared across boxes');
  assert.equal(result.status,'violated');assert.equal(result.solver.result,'sat');
  assert.ok(result.witness.viewport>=100 && result.witness.viewport<160);
  assert.ok(result.witness.required>result.witness.available);
  const fixed=await verifyLayoutModel(run(css,{min:160,max:640}),api);
  assert.equal(fixed.status,'verified');assert.equal(fixed.solver.result,'unsat');
});

test('two-dimensional region constraints remain coupled rather than becoming independent ranges',async()=>{
  const report=analyzeLayout(ir,{css,viewport:{min:160,max:640,height:{min:80,max:640}}});
  const check={...report.checks[0],range:report.scope.viewport,heightRange:report.scope.viewport.height,
    available:{coefficient:'1',constant:'0'},required:{coefficient:'0',heightCoefficient:'1',constant:'0'},
    region:{vertices:[],constraints:[{coefficient:'1',heightCoefficient:'-1',constant:'0',strict:false}]}};
  const safe=createLayoutModel({...report,checks:[check]});
  assert.equal((await verifyLayoutModel(safe,api)).status,'verified');
  check.region.constraints[0]={coefficient:'-1',heightCoefficient:'1',constant:'0',strict:false};
  const broken=await verifyLayoutModel(createLayoutModel({...report,checks:[check]}),api);
  assert.equal(broken.status,'violated');assert.ok(broken.witness.viewportHeight>broken.witness.viewport);
});

test('empty viewport domains and solver timeouts cannot become vacuous success',async()=>{
  const model=run(css,{min:160,max:640});
  const empty={...model,domain:model.domain+'(assert (< width 0))\n'};
  assert.equal((await verifyLayoutModel(empty,api)).status,'unknown');
  let checks=0;
  const timeoutAPI={Context:class {Solver=class {
    set(){} fromString(){} release(){}
    async check(){return ++checks===1 ? 'sat' : 'unknown';}
    reasonUnknown(){return 'timeout';}
  };}};
  const result=await verifyLayoutModel(model,timeoutAPI);
  assert.equal(result.status,'unknown');assert.equal(result.solver.result,'unknown');
  assert.match(result.diagnostics[0].message,/timeout/);
});

test('shared Z3 APIs serialize complete checks, including synchronous context setup',async()=>{
  let busy=false;
  const guarded={Context:class {
    constructor(){if(busy) throw new Error('unsafe concurrent Z3 API call');}
    Solver=class {
      set(){} release(){}
      fromString(script){this.result=script.includes('(assert (or') ? 'unsat' : 'sat';}
      async check(){busy=true;await new Promise(resolve=>setTimeout(resolve,5));busy=false;return this.result;}
    };
  }};
  const results=await Promise.all([verifyLayoutModel(run(css,{min:160,max:640}),guarded),verifyLayoutModel(run(css,{min:160,max:640}),guarded)]);
  assert.ok(results.every(r=>r.status==='verified'),JSON.stringify(results));
});

test('strict media boundaries and rational coefficients survive SMT translation',async()=>{
  const two='.row{grid-template-columns:repeat(2,minmax(0,1fr))}';
  assert.equal((await verifyLayoutModel(run(css+`@media(width < 160px){${two}}`,{min:80,max:640}),api)).status,'verified');
  const broken=await verifyLayoutModel(run(css+`@media(width < 159px){${two}}`,{min:80,max:640}),api);
  assert.equal(broken.status,'violated');assert.ok(broken.witness.viewport>=159 && broken.witness.viewport<160);
});

test('generated CSS obligations agree with the independent SMT reference, and a broken spec is detected',async()=>{
  const source=await readFile(new URL('../examples/inline-css/app.isle',import.meta.url),'utf8');
  const spec=await readFile(new URL('../models/css_layout/contract.smt2',import.meta.url),'utf8');
  for(const responsive of [false,true]) {
    const input=responsive ? source.replace('</style>','@media(width < 160px){.row{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>') : source;
    const report=analyzeLayout(requireIR(compile(input)),{css:'',viewport:{min:80,max:640,height:{min:20,max:640}}}),model=createLayoutModel(report);
    assert.equal(model.complete,true,JSON.stringify(report.diagnostics));
    const actual='(or '+model.obligations.map(o=>`(and ${o.domain} ${o.failure})`).join(' ')+')';
    const columns=responsive ? '(ite (< width 160) 2 4)' : '4',rows=responsive ? '(ite (< width 160) 2 1)' : '1';
    for(const broken of [false,true]) {
      const ctx=new api.Context('reference'),solver=new ctx.Solver();
      try {
        solver.fromString(model.domain+(broken ? spec.replace('cell_inline () Real 40','cell_inline () Real 41') : spec)+`\n(assert (xor ${actual} (layout_bad width height ${columns} ${rows})))`);
        assert.equal(await solver.check(),broken ? 'sat' : 'unsat');
      } finally {solver.release();}
    }
  }
});

test('a partial analyzer model can never become verified just because Z3 returns UNSAT',async()=>{
  const model=run(css+'.cell{width:var(--width)}',{min:160,max:640});
  const result=await verifyLayoutModel(model,api);assert.equal(result.status,'unknown');
  assert.equal(result.complete,false);
});

test('resolved CSS variables agree with the independent responsive SMT specification',async()=>{
  const source=await readFile(new URL('../examples/inline-css/variables.isle',import.meta.url),'utf8');
  const spec=await readFile(new URL('../models/css_layout/contract.smt2',import.meta.url),'utf8');
  for(const broken of [false,true]) {
    const report=analyzeLayout(requireIR(compile(broken ? source.replace('--cell: 40px','--cell: 41px') : source)),{css:'',viewport:{min:80,max:640,height:{min:20,max:640}}});
    const model=createLayoutModel(report);assert.equal(model.complete,true,JSON.stringify(report.diagnostics));
    const actual='(or '+model.obligations.map(o=>`(and ${o.domain} ${o.failure})`).join(' ')+')';
    const ctx=new api.Context('variables_reference'),solver=new ctx.Solver();
    try {
      solver.fromString(model.domain+spec+`\n(assert (xor ${actual} (layout_bad width height (ite (< width 160) 2 4) (ite (< width 160) 2 1))))`);
      assert.equal(await solver.check(),broken ? 'sat' : 'unsat');
    } finally {solver.release();}
  }
});

test('structural CSS policies are part of the model rather than a numeric-only proof',async()=>{
  const result=await verifyLayoutModel(run(css+'.cell{float:left}',{min:160,max:640}),api);
  assert.equal(result.status,'violated');assert.equal(result.solver.result,'sat');
  assert.equal(result.witness.code,'E_LAYOUT_FLOAT');
});

test('model timeouts and malformed numeric terms never produce a verified result',async()=>{
  assert.throws(()=>createLayoutModel({...analyzeLayout(ir,{css,viewport:{min:160,max:640}}),checks:[{enforced:true,available:{coefficient:'(assert false)',constant:'0'},required:{coefficient:'0',constant:'0'}}]}));
  const timed=await verifyLayoutModel(run(),{Context:class {constructor(){throw new Error('solver unavailable');}}});
  assert.equal(timed.status,'unknown');assert.match(timed.diagnostics[0].message,/solver unavailable/);
});
