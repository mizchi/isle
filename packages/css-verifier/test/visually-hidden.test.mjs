import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// The visually hidden (sr-only) pattern: an absolute box with no insets at its static position, 1px, clipped.
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const sr = '.sr{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}';
const run = (link, css = '') => analyzeHTML(`<html lang="en"><body><main class="p"><h1 class="t" aria-label="T"></h1>${link}</main></body></html>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}html,body{${g}}.p{${g};background:#fff;color:#222}.t{height:10px}.l{display:grid;grid-template-columns:24px;position:relative;color:#222}svg{display:block}${sr}${css}`, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, accessibility: true, ...(link.includes('class="sr"') ? {boxes: {'.sr': {minInlineSize: 10, intrinsicBlockSize: 24}}} : {})});

test('an icon link named by sr-only text: verified, no content or fixed-height findings for the hidden text', () => {
  const r = run('<a class="l" href="/"><svg width="24" height="24" aria-hidden="true"></svg><span class="sr">Home</span></a>');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  assert.deepEqual((r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT'), []);
});

test('an absolute badge with no insets sits at its positioned grid parent\'s padding start', () => {
  const r = run('<a class="l" href="/" aria-label="Cart"><svg width="24" height="24" aria-hidden="true"></svg><span class="badge"></span></a>', '.l{padding:4px}.badge{position:absolute;width:8px;height:8px;background:#c33}');
  assert.equal(r.status, 'verified', JSON.stringify(r.diagnostics.map(d => d.message)));
  const badge = r.sizes.find(s => s.box === '.badge' && s.rect), link = r.sizes.find(s => s.box === '.l' && s.rect);
  assert.deepEqual([badge.rect.inlineStart.constant, badge.rect.blockStart.constant], [link.rect.inlineStart.constant, link.rect.blockStart.constant]);
});

test('without the text the link has no name; a static position outside a positioned grid parent stays Unknown', () => {
  assert.ok(run('<a class="l" href="/"><svg width="24" height="24" aria-hidden="true"></svg></a>').diagnostics.some(d => d.code === 'E_A11Y_NAME'));
  assert.equal(run('<a class="l" href="/"><svg width="24" height="24" aria-hidden="true"></svg><span class="sr">Home</span></a>', '.l{position:static}.p{position:relative}').status, 'unknown');
});
