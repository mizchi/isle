import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const ir = requireIR(compile('component Panel() { <main class="panel"><p class="copy">Content</p></main> }'));
const app = '.panel {display:grid;grid-template-columns:minmax(0,1fr);} .copy {width:100%;padding:16px;}';
const options = { css: app, viewport: { min: 320, max: 640 }, boxes: { '.copy': { minInlineSize: 100 } } };
const ancestors = [{ tag: 'html' }, { tag: 'body' }];
const inheritedReset = `html {box-sizing:border-box;}
  *, *::before, *::after {box-sizing:inherit;margin:0;padding:0;}`;
const run = extra => analyzeLayout(ir, { ...options, ...extra });
const sizing = report => report.sizes.find(size => size.box === '.copy');

test('explicit reset sheets precede application CSS and change actual content-box overflow', () => {
  assert.equal(run({}).status, 'violated');
  const report = run({ reset: [{ css: '* {box-sizing:border-box;}', file: 'reset.css' }] });
  assert.equal(report.status, 'verified');
  assert.equal(sizing(report).boxSizing, 'border-box');
  assert.equal(sizing(report).boxSizingSource.file, 'reset.css');
  assert.equal(report.styleSources[0].kind, 'reset');
  assert.equal(run({ reset: [{ css: '* {box-sizing:border-box;}' }], css: app + '.copy {box-sizing:content-box;}' }).status, 'violated');
});

test('root-to-body inheritance resolves the common inherited box-sizing reset', () => {
  const report = run({ reset: [{ css: inheritedReset, file: 'inherit-reset.css' }], ancestors });
  assert.equal(report.status, 'verified');
  assert.equal(sizing(report).boxSizing, 'border-box');
  assert.equal(sizing(report).boxSizingSource.specified, 'inherit');
  assert.equal(run({ reset: [{ css: inheritedReset }] }).status, 'unknown');
  assert.equal(run({ reset: [{ css: inheritedReset }], ancestors: [{ tag: 'div' }] }).status, 'unknown');
});

test(':root and :where retain specificity and never treat the selected component as document root', () => {
  const reset = ':root {box-sizing:border-box;} :where(*, *::before, *::after) {box-sizing:inherit;margin:0;}';
  assert.equal(run({ reset: [{ css: reset }], ancestors }).status, 'verified');
  assert.equal(run({ css: ':root {box-sizing:border-box;}' + app }).status, 'violated');
  const report = run({ reset: [{ css: ':where(#never, .copy) {box-sizing:border-box;}' }], css: app + '.copy {box-sizing:content-box;}' });
  assert.equal(report.status, 'violated');
  // :is retains the highest argument specificity, including a branch that never matches.
  assert.equal(run({ reset: [{ css: ':is(#never, .copy) {box-sizing:border-box;}' }], css: app + '.copy {box-sizing:content-box;}' }).status, 'verified');
});

test('layers resolve before specificity and important declarations reverse layer order', () => {
  const reset = '@layer reset, app; @layer reset {#never, .copy {box-sizing:border-box;}}';
  assert.equal(run({ reset: [{ css: reset }], css: app + '@layer app {* {box-sizing:content-box;}}' }).status, 'violated');
  const important = reset.replace('border-box;', 'border-box!important;');
  const report = run({ reset: [{ css: important }], css: app + '@layer app {.copy {box-sizing:content-box!important;}} .copy {box-sizing:content-box!important;}' });
  assert.equal(report.status, 'verified');
  assert.equal(sizing(report).boxSizingSource.layer, 'reset');
  assert.equal(run({ reset: [{ css: reset }], css: app + '* {box-sizing:content-box;}' }).status, 'violated');
});

test('initial, unset and revert use property semantics rather than a universal border-box assumption', () => {
  for (const keyword of ['initial', 'unset', 'revert']) {
    assert.equal(run({ reset: [{ css: '* {box-sizing:border-box;}' }], css: app + `.copy {box-sizing:${keyword};}` }).status, 'violated', keyword);
  }
  const report = run({ reset: [{ css: inheritedReset }], ancestors, css: app + '.copy {padding:initial;}' });
  assert.equal(report.status, 'verified');
  assert.equal(run({ reset: [{ css: inheritedReset }], ancestors, css: app + '.copy {box-sizing:inherit;}' }).status, 'verified');
});

test('reset margins and padding participate in block checking and inherited geometry', () => {
  const vertical = { ...options, ancestors, block: true, viewport: { min: 320, max: 640, height: { min: 100, max: 500 } },
    boxes: { '.copy': { minInlineSize: 100, intrinsicBlockSize: 24, minBlockSize: 24 } },
  };
  assert.equal(analyzeLayout(ir, { ...vertical, reset: [{ css: inheritedReset }] }).status, 'verified');
  assert.equal(analyzeLayout(ir, { ...vertical, reset: [{ css: inheritedReset.replace('margin:0;', '') }] }).status, 'unknown');
  assert.equal(run({ reset: [{ css: '* {box-sizing:border-box;}' }], css: app + '.panel {padding:8px;} .copy {padding:inherit;}' }).status, 'verified');
});

test('reset syntax errors retain the originating file and unsupported generated boxes fail closed', () => {
  const report = run({ reset: [{ css: '* {padding:var(--unknown)}', file: 'bad-reset.css' }] });
  assert.equal(report.status, 'unknown');
  assert.equal(report.diagnostics[0].css.file, 'bad-reset.css');
  for (const css of [
    '*::before {content:"generated";}', '@import "external.css";',
    '@layer outer {@layer inner {*{box-sizing:border-box;}}}',
    '@media (width > 400px) {@layer conditional {*{box-sizing:border-box;}}}',
    '.copy {box-sizing:revert-layer;}',
  ]) assert.equal(run({ reset: [{ css }] }).status, 'unknown', css);
});

test('ordered reset inputs and ancestry validate their closed contracts', () => {
  assert.equal(run({ reset: [{ css: '* {box-sizing:content-box;}' }, { css: '* {box-sizing:border-box;}' }] }).status, 'verified');
  for (const extra of [
    { reset: 'reset.css' }, { reset: [{ css: '*{}', guessed: true }] },
    { ancestors: ['html'] }, { ancestors: [{ tag: 'html', style: 'unknown' }] }, { ancestors: [{ tag: 'button' }] },
  ]) assert.throws(() => run(extra), /reset|ancestor/i);
});

test('ancestor media states, all resets and native margin inheritance remain explicit', () => {
  const report = run({ ancestors, reset: [{ css: inheritedReset + '@media (width < 400px) {html {box-sizing:content-box;}}' }] });
  const failed = report.diagnostics.find(d => d.code === 'E_LAYOUT_ITEM_SIZE');
  assert.equal(failed.range.min, 320); assert.equal(failed.range.max, 400); assert.equal(failed.range.maxInclusive, false);
  assert.equal(run({ reset: [{ css: inheritedReset }], ancestors, css: '.panel {display:grid;grid-template-columns:minmax(0,1fr);} .copy {all:unset;width:100%;padding:16px;}' }).status, 'violated');
  assert.equal(run({ reset: [{ css: inheritedReset.replace('margin:0;', '') }], ancestors, css: app + '.panel {margin:inherit;}' }).status, 'unknown');
  assert.equal(run({ reset: [{ css: '@layer {* {box-sizing:border-box;}}' }] }).status, 'verified');
  assert.equal(run({ reset: [{ css: inheritedReset }], ancestors, css: app + 'body {display:none;}' }).status, 'unknown');
});
