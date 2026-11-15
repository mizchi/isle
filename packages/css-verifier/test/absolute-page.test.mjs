import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// position: absolute with no positioned ancestor is placed against the initial containing block (the viewport's size
// at the top of the page): W_LAYOUT_ABSOLUTE_PAGE, laid out there (it was Unknown).
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = card => analyzeHTML('<html lang="en"><body><main class="page"><div class="gap"></div><div class="card"><span class="badge"></span></div></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body,.page,.card{${g}}.gap{height:300px}.card{height:100px;${card}}.badge{position:absolute;top:8px;right:8px;width:20px;height:20px;background:red}`, viewport: {min: 320, max: 800, height: {min: 480, max: 900}}});
const at = (report, w) => { const r = report.sizes.find(s => s.box === '.badge').rect; const v = x => Number(x.constant) + w * Number(x.coefficient); return [v(r.inlineStart), v(r.blockStart)]; };

test('an absolute badge without a positioned ancestor sits at the page corner', () => {
  const page = run('');
  assert.equal(page.status, 'verified', JSON.stringify(page.diagnostics.map(d => d.message)));
  assert.deepEqual(page.layoutWarnings.filter(w => w.code === 'W_LAYOUT_ABSOLUTE_PAGE').map(w => [w.box, w.parent]), [['.badge', '.card']]);
  assert.deepEqual(at(page, 400), [400 - 8 - 20, 8]);
  const card = run('position:relative');
  assert.deepEqual((card.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_ABSOLUTE_PAGE'), []);
  assert.deepEqual(at(card, 400), [400 - 8 - 20, 308]);
  // A scrolling ancestor in between stays Unknown.
  assert.equal(run('overflow:hidden').status, 'unknown');
});
