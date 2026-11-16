import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// A closed <dialog> is display: none (UA dialog:not([open])); an author display rule on it overrides that, so the
// closed dialog renders over the page (as the UA's position: absolute box): W_LAYOUT_DIALOG_CLOSED_SHOWN.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const run = (dialog, css = '') => analyzeHTML(`<html lang="en"><body><main class="p">${dialog}<div class="n"></div></main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g}}.n{height:10px}.k{height:40px}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
const shown = r => (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DIALOG_CLOSED_SHOWN').map(w => w.box);

test('a closed dialog does not render', () => {
  const r = run('<dialog class="d"><div class="k"></div></dialog>');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.ok(!r.sizes.some(s => s.box === '.d' && s.rect));
  assert.equal(r.sizes.find(s => s.box === '.n').rect.blockStart.constant, '0');
  assert.deepEqual(shown(r), []);
});

test('an author display on a closed dialog shows it (reported; its UA position is Unknown)', () => {
  for (const css of ['.d{display:flex}', 'dialog{display:grid}', '.d{display:block}']) {
    const r = run('<dialog class="d"><div class="k"></div></dialog>', css);
    assert.deepEqual(shown(r), ['.d'], css);
    assert.equal(r.status, 'unknown', css);
  }
  // Only the open state's display: nothing renders while closed.
  assert.deepEqual(shown(run('<dialog class="d"><div class="k"></div></dialog>', '.d{visibility:visible}')), []);
});

test('an open or dynamic dialog stays Unknown', () => {
  assert.equal(run('<dialog class="d" open><div class="k"></div></dialog>').status, 'unknown');
});
