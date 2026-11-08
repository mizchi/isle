import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {analyzeLayout} from '../lib/layout.mjs';

const ir=requireIR(compile('component Four(){<main class="row"><div class="cell"/><div class="cell"/><div class="cell"/><div class="cell"/></main>}'));
const base='*{box-sizing:border-box;margin:0}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.cell{min-width:var(--cell)}';
const run=(css,options={})=>analyzeLayout(ir,{css:base+css,cssFile:'variables.css',ancestors:[{tag:'html'},{tag:'body'}],viewport:{min:160,max:640},...options});
const status=(report,expected)=>assert.equal(report.status,expected,JSON.stringify(report.diagnostics));

test('custom properties retain case, inherit computed aliases and substitute token lists in shorthands',()=>{
  status(run('.row{--Cell:80px;--cell:40px}'),'verified');
  status(run('.row{--unit:40px;--cell:var(--unit)}.cell{--unit:80px}'),'verified');
  status(run('.row{--cell:var(--missing)}.cell{--missing:80px;min-width:var(--cell,40px)}'),'verified');
  status(run('.row{--cell:40px;--inset:0 0px}.cell{padding:var(--inset)}'),'verified');
  status(run('.row{--count:4;--track:minmax(0,1fr);--cell:40px;grid-template-columns:repeat(var(--count),var(--track))}'),'verified');
  status(run('.row{--cell:40px}',{ancestors:[]}),'verified');
});

test('custom-property cascade preserves layers, important order and explicit defaulting',()=>{
  status(run('@layer a,b;@layer a{.row{--cell:40px!important}}@layer b{.row{--cell:80px!important}}.row{--cell:80px!important}'),'verified');
  for(const keyword of ['inherit','unset','revert']) status(run(`.row{--cell:40px}.cell{--cell:${keyword}}`),'verified');
  status(run('.row{--cell:40px}.cell{--cell:initial;min-width:var(--cell,80px)}'),'violated');
  // Losing pending shorthands must not trigger resolution, and winning longhands remain local.
  status(run('.row{--cell:40px}.cell{padding:var(--missing);padding:0}'),'verified');
  status(run('.row{--cell:40px;--insets:0 8px}.cell{box-sizing:content-box;width:100%;padding:var(--insets)}.cell{padding-left:0}'),'violated');
});

test('nested and empty fallbacks work, while external inherited values stay unknown',()=>{
  status(run('.cell{min-width:var(--missing,var(--backup,40px))}'),'verified');
  status(run('.row{--empty:;--cell:var(--empty)40px}'),'verified');
  status(run('.row{--missing:initial}.cell{min-width:var(--missing,40px)}',{ancestors:[]}),'verified');
  status(run('.cell{min-width:var(--missing,40px)}',{ancestors:[]}),'unknown');
});

test('cycle edges include unused fallback references and cycles never masquerade as values',()=>{
  const cycle='.row{--cell:var(--other);--other:var(--cell)}';
  const invalid=run(cycle);status(invalid,'unknown');
  assert.ok(invalid.diagnostics.some(d=>d.code==='U_LAYOUT_VARIABLE_CYCLE' && /--cell/.test(d.message)));
  status(run(cycle+'.cell{min-width:var(--cell,80px)}'),'violated');
  const dormant='.row{--safe:80px;--cell:var(--safe,var(--other));--other:var(--cell)}';
  status(run(dormant+'.cell{min-width:var(--cell,40px)}'),'unknown');
  status(run('.row{--cell:40px;--unused:var(--unused)}'),'verified');
  status(run('.row{--cell:40px}.cell{--alias:var(--cell);--cell:80px;min-width:var(--alias)}'),'violated');
});

test('media and container branches keep custom-property environments separate',()=>{
  for(const condition of ['@media(width < 320px)','@container cards (width < 320px)']) {
    const report=run('.row{--cell:40px;container:cards/inline-size}'+condition+'{.cell{--cell:80px}}');
    status(report,'violated');
    const witness=report.diagnostics.find(d=>d.code==='E_LAYOUT_ITEM_SIZE');
    assert.equal(witness.range.min,160);assert.equal(witness.range.max,320);assert.equal(witness.range.maxInclusive,false);
  }
  const ancestor=run('html{--cell:40px}@media(width < 320px){html{--cell:80px}}');
  status(ancestor,'violated');assert.equal(ancestor.diagnostics.find(d=>d.code==='E_LAYOUT_ITEM_SIZE').range.max,320);
});

test('invalid substitution cannot reuse an earlier declaration or concatenate CSS tokens',()=>{
  const missing=run('.cell{min-width:40px;min-width:var(--missing)}');
  status(missing,'unknown');assert.equal(missing.diagnostics[0].css.file,'variables.css');
  for(const declaration of ['--cell:40;min-width:var(--cell)px','--cell:4/**/0px','--cell:10deg','--cell:var(--cell)']) status(run('.cell{'+declaration+'}'),'unknown');
  status(run('.row{--cell:40px}@property --cell{syntax:"<length>";inherits:false;initial-value:40px}'),'unknown');
});

test('exponential variable expansion is bounded and fallback cannot hide a work limit',()=>{
  const variables=Array.from({length:24},(_,i)=>`--v${i}:var(--v${i+1}) var(--v${i+1});`).join('');
  const report=run(`.row{${variables}--v24:40px;--cell:var(--v0,40px)}`);
  status(report,'unknown');assert.ok(report.diagnostics.some(d=>d.code==='U_LAYOUT_LIMIT'));
});

test('owned inline CSS inherits custom properties across pure component expansion',()=>{
  const source=`component Cell(){<div class="cell"><style>.cell{min-width:var(--cell)}</style></div>}
    component Grid(){<main class="row"><style>.row{--cell:40px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}</style><Cell/><Cell/><Cell/><Cell/></main>}`;
  const report=analyzeLayout(requireIR(compile(source)),{component:'Grid',css:'',viewport:{min:160,max:640}});
  status(report,'verified');
});
