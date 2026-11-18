// Checklist D2: em box lengths compute to px against the element's own px font-size (as rem does against the root's),
// and a flex item's percentage width with flex-basis: auto is a share of the container like a percentage basis.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const box = (c, html = '<div class="p"><div class="a"></div><div class="b"></div></div>') => { const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html{font-size:16px}body{${g}}.a,.b{height:20px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? `unknown: ${r.diagnostics.find(d => d.severity === 'unknown')?.message}` : Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b)$/.test(s.box)).map(s => [s.box, [s.rect.inlineStart.constant, s.rect.inlineSize.constant]])); };

test('em lengths compute against the element\'s px font-size', () => {
  assert.deepEqual(box('.p{display:flex;width:300px}.a{font-size:20px;width:5em;flex:none}.b{width:50px;flex:none}'), {'.a': ['0', '100'], '.b': ['100', '50']});
  assert.deepEqual(box('.p{display:block;width:300px}.a{font-size:10px;width:6.5em;padding-left:1em}')['.a'], ['0', '65']);
  // A font-size that is not px: the em length stays Unknown.
  assert.match(String(box('.p{display:flex;width:300px}.a{font-size:larger;width:5em;flex:none}')), /^unknown/);
});

test('a flex item\'s percentage width with flex-basis auto is a share of the container', () => {
  assert.deepEqual(box('.p{display:flex;width:300px}.a{width:40%;flex:none}.b{width:50px;flex:none}'), {'.a': ['0', '120'], '.b': ['120', '50']});
  assert.deepEqual(box('.p{display:flex;width:300px}.a{width:40%;flex-grow:1;flex-shrink:0}.b{width:50px;flex:none}')['.a'], ['0', '250']);
  // Shrinking with an automatic minimum: the specified-size suggestion caps the minimum, which is not modeled.
  assert.match(String(box('.p{display:flex;width:300px}.a{width:40%}.b{width:50px}')), /^unknown/);
});

test('a percentage height in block flow resolves against the parent\'s declared height', () => {
  const tall = (c, html = '<div class="p"><div class="a"></div><div class="b"></div></div>') => { const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}body{${g}}.b{height:20px}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? `unknown: ${r.diagnostics.find(d => d.severity === 'unknown')?.message}` : Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b)$/.test(s.box)).map(s => [s.box, [s.rect.blockStart.constant, s.rect.blockSize.constant]])); };
  assert.deepEqual(tall('.p{height:200px}.a{height:50%}'), {'.a': ['0', '100'], '.b': ['100', '20']});
  // Against the content box (padding taken out), and clamped by max-height: the used height.
  assert.deepEqual(tall('.p{height:200px;padding-top:40px}.a{height:50%}')['.a'], ['40', '80']);
  assert.deepEqual(tall('.p{height:200px;max-height:120px}.a{height:50%}')['.a'], ['0', '60']);
  // px and % mixed in calc().
  assert.deepEqual(tall('.p{height:200px}.a{height:calc(50% - 10px)}')['.a'], ['0', '90']);
  // An auto-height parent: the percentage computes to auto there, which is not modeled in a grid item; Unknown.
  assert.match(String(tall('.p{}.a{height:50%}')), /^unknown/);
});

test('a flex item\'s calc() or vw width or basis is evaluated against the container (checklist D2)', () => {
  assert.deepEqual(box('.p{display:flex;width:300px}.a{width:calc(50% - 10px);flex:none}.b{width:50px;flex:none}'), {'.a': ['0', '140'], '.b': ['140', '50']});
  assert.deepEqual(box('.p{display:flex;width:300px}.a{flex:0 0 calc(25% + 5px)}.b{width:50px;flex:none}')['.a'], ['0', '80']);
  // Growing from a calc() basis: 140px + 50px leave 110px, all to .a.
  assert.deepEqual(box('.p{display:flex;width:300px}.a{flex:1 1 calc(40% + 20px);min-width:0}.b{width:50px;flex:none}')['.a'], ['0', '250']);
  // vw: an affine width (W/5), not a constant.
  assert.equal(box('.p{display:flex;width:300px}.a{width:20vw;flex:none}.b{width:50px;flex:none}')['.b'][0], '0');
  // Shrinking items whose bases are not shares of one width: their weights are not modeled; Unknown.
  assert.match(String(box('.p{display:flex;width:300px}.a{flex:1 1 calc(70% + 20px);min-width:10px}.b{width:50px;flex:none}.c{flex:1 1 30%;min-width:0}', '<div class="p"><div class="a"></div><div class="b"></div><div class="c"></div></div>')), /^unknown/);
  // min() / max() in a flex width stay Unknown.
  assert.match(String(box('.p{display:flex;width:300px}.a{width:min(50%, 100px);flex:none}.b{width:50px;flex:none}')), /^unknown/);
});

test('percentage grid tracks and gaps against a constant container size (checklist D2)', () => {
  assert.deepEqual(box('.p{width:300px;display:grid;grid-template-columns:25% minmax(0,1fr);column-gap:5%}'), {'.a': ['0', '75'], '.b': ['90', '210']});
  const rows = c => { const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="a"></div><div class="b"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}body{${g}}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.filter(s => /^\.[ab]$/.test(s.box)).map(s => [s.rect.blockStart.constant, s.rect.blockSize.constant]); };
  assert.deepEqual(rows('.p{height:200px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:50% minmax(0,1fr);row-gap:10%}'), [['0', '100'], ['120', '80']]);
  // A container whose width follows the viewport, or an auto height: the percentage is not one constant; Unknown.
  assert.match(String(box('.p{display:grid;grid-template-columns:25% minmax(0,1fr)}')), /^unknown/);
  assert.equal(rows('.p{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:50% 20px}'), 'unknown');
});

test('percentage heights and bases in a column flex container of a declared height (checklist D2)', () => {
  const col = c => { const r = analyzeHTML('<html lang="en"><body><div class="p"><div class="a"></div><div class="b"></div></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}body{${g}}.p{display:flex;flex-direction:column}${c}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}); return r.status === 'unknown' ? 'unknown' : r.sizes.filter(s => /^\.[ab]$/.test(s.box)).map(s => [s.rect.blockStart.constant, s.rect.blockSize.constant]); };
  assert.deepEqual(col('.p{height:200px}.a{height:25%;flex:none}.b{flex:0 0 10%}'), [['0', '50'], ['50', '20']]);
  // An auto-height column: the percentage is not a share of anything known; Unknown.
  assert.equal(col('.a{height:25%;flex:none}.b{height:10px;flex:none}'), 'unknown');
});
