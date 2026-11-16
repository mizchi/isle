import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// content-visibility: auto skips an offscreen box's layout and sizes it by contain-intrinsic-size alone: with none
// and an auto height it is 0px tall offscreen, so the page's scroll height changes as the reader scrolls into it
// (W_LAYOUT_CONTENT_VISIBILITY_SIZE). On screen it lays out as usual, which is the geometry checked.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (css, parent = 'display:block') => analyzeHTML('<html lang="en"><body><main class="p"><section class="s"><div class="k"></div></section></main></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${parent}}.k{height:300px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const warned = r => (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_CONTENT_VISIBILITY_SIZE').map(w => w.box);

test('content-visibility: auto with no intrinsic size and an auto height is reported', () => {
  const r = run('.s{content-visibility:auto}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual(warned(r), ['.s']);
  assert.equal(r.sizes.find(s => s.box === '.s').blockSize.constant, '300');
  for (const css of ['.s{content-visibility:auto;contain-intrinsic-size:auto 300px}', '.s{content-visibility:auto;contain-intrinsic-height:300px}', '.s{content-visibility:auto;contain-intrinsic-block-size:300px}', '.s{content-visibility:auto;contain-intrinsic-size:200px 300px}', '.s{content-visibility:auto;height:300px}', '.s{content-visibility:visible}'])
    assert.deepEqual(warned(run(css)), [], css);
  // An intrinsic size for the width only leaves the height at 0.
  assert.deepEqual(warned(run('.s{content-visibility:auto;contain-intrinsic-width:300px}')), ['.s']);
});

test('content-visibility: auto where the width depends on the content, and hidden, stay Unknown', () => {
  assert.equal(run('.s{content-visibility:auto}', 'display:flex').status, 'unknown');
  assert.equal(run('.s{content-visibility:auto}', `${g}`).status, 'verified');
  assert.equal(run('.s{content-visibility:auto}', 'display:grid;grid-template-columns:auto').status, 'unknown');
  assert.equal(run('.s{content-visibility:hidden}').status, 'unknown');
});
