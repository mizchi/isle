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
