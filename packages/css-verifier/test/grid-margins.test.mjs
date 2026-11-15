import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// px margins on grid items: laid out in the area less the margins; margin boxes size auto rows.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = css => analyzeHTML('<html lang="en"><body><main class="p"><div class="c"></div><div class="d"></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.c{height:10px}.d{height:10px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const rect = (report, box) => { const r = report.sizes.find(s => s.box === box && s.rect); return [r.rect.inlineStart.constant, r.rect.blockStart.constant, `${r.rect.inlineSize.coefficient}w${r.rect.inlineSize.constant}`, r.rect.blockSize.constant]; };

test('margins offset the item and shrink its stretched width; the next row starts after the bottom margin', () => {
  const r = run('.c{margin:8px 16px 12px 4px}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics));
  assert.deepEqual(rect(r, '.c'), ['4', '8', '1w-20', '10']);
  assert.deepEqual(rect(r, '.d').slice(0, 2), ['0', '30']);
  // A fixed width starts after the left margin.
  assert.deepEqual(rect(run('.c{width:100px;margin-left:24px}'), '.c').slice(0, 3), ['24', '0', '0w100']);
});

test('the start margin pushes the item out of its area; an end margin that sticks out hides nothing', () => {
  // 20px + 300px in a 320px area: the border box ends at the edge (the right margin sticks out, measured harmless).
  assert.ok(!run('.c{width:300px;margin:0 20px}').diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE'));
  const r = run('.c{width:300px;margin:0 0 0 30px}');
  const d = r.diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === '.c');
  assert.deepEqual([d.range.min, d.range.max], [320, 330]);
});

test('negative margins, and auto margins without an explicit width, stay Unknown', () => {
  assert.equal(run('.c{margin-top:-4px}').status, 'unknown');
  assert.equal(run('.c{max-width:600px;margin:0 auto}').status, 'unknown');
});

test('inline auto margins with an explicit width center or push the item; none when it does not fit', () => {
  const start = (css, viewport) => { const r = run(css); assert.equal(r.status === 'unknown', false, JSON.stringify(r.diagnostics)); const row = r.sizes.find(s => s.box === '.c' && s.rect && s.range.min <= viewport && viewport <= s.range.max); const v = t => t.split('/').map(Number).reduce((a, b) => a / b); return v(row.rect.inlineStart.coefficient) * viewport + v(row.rect.inlineStart.constant); };
  assert.equal(start('.c{width:400px;margin:0 auto}', 700), 150);
  assert.equal(start('.c{width:400px;margin:0 auto}', 330), 0);
  assert.equal(start('.c{width:400px;margin-left:auto}', 700), 300);
  assert.equal(start('.c{width:50%;margin:0 auto}', 700), 175);
  assert.equal(start('.c{width:200px;margin:0 auto 0 20px}', 700), 20);
  assert.equal(start('.c{width:200px;box-sizing:content-box;padding:0 10px;margin:0 auto}', 700), 240);
});

test('percentages resolve against the grid area, not the area less the margins', () => {
  const r = run('.c{width:50%;margin:0 20px}');
  const row = r.sizes.find(s => s.box === '.c' && s.rect);
  assert.deepEqual([row.rect.inlineStart.constant, row.rect.inlineSize.coefficient, row.rect.inlineSize.constant], ['20', '1/2', '0']);
  // width: 100% plus a start margin pushes the item past its area (Chromium scrolls the page by the margin).
  assert.ok(run('.c{width:100%;margin-left:20px}').diagnostics.some(d => d.code === 'E_LAYOUT_ITEM_SIZE' && d.box === '.c'));
});

test('W_LAYOUT_FULL_WIDTH_MARGIN explains a width: 100% item pushed out by its margin', () => {
  const warned = css => (run(css).layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_FULL_WIDTH_MARGIN').map(w => w.properties.join());
  assert.deepEqual(warned('.c{width:100%;margin-left:20px}'), ['margin-left']);
  assert.deepEqual(warned('.c{margin:0 20px}'), []);
  assert.deepEqual(warned('.c{width:50%;margin-left:20px}'), []);
});
