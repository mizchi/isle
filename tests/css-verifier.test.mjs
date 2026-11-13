import '../packages/css-verifier/test/core.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../packages/css-verifier/src/index.mjs';
import {compile, requireIR} from '../lib/compiler.mjs';
import {analyzeLayout as analyzeIsle} from '../lib/layout.mjs';

const tree = () => ({tag:'main', classes:['row'], children:Array.from({length:4}, () => ({tag:'div', classes:['cell']}))});
const css = '*{box-sizing:border-box}.row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.cell{min-width:40px}';
const options = {name:'Four', css, viewport:{min:160,max:1200}};
test('Isle is an adapter to the same geometry and solver model', () => {
  const ir=requireIR(compile('component Four(){<main class="row"><div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div></main>}'));
  const generic=analyzeLayout(tree(),options), isle=analyzeIsle(ir,{component:options.name,css,viewport:options.viewport});
  for(const key of ['status','scope','checks','sizes','policies','queries']) assert.deepEqual(generic[key],isle[key],key);
});
