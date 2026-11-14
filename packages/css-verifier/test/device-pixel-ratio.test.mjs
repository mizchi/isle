import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// devicePixelRatios: each ratio is a case; resolution media queries are constants in it, and density srcset
// candidates select the file it loads (the smallest density at least the ratio, else the densest).
const images = {'/a.png': {width: 2, height: 1}, '/b.png': {width: 1, height: 1}, '/c.png': {width: 4, height: 1}};
const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:400px;height:auto}.b{height:10px}';
const run = (html, extra = '', options = {}) => analyzeHTML(`<div class="page">${html}<div class="b"></div></div>`, {name: 'P', css: css + extra, viewport: {min: 800, max: 800, height: {min: 600, max: 600}}, images, ...options});
const img = srcset => `<img src="/a.png" srcset="${srcset}" width="400" height="200" alt="">`;
const flagged = report => [...new Set(report.diagnostics.filter(d => /^E_LAYOUT_IMAGE_/.test(d.code)).map(d => d.devicePixelRatio))];

test('resolution media queries branch on each device pixel ratio', () => {
  const extra = '@media (min-resolution: 2dppx){.b{height:30px}}@media (max-resolution: 96dpi){.b{height:20px}}@media (-webkit-min-device-pixel-ratio: 3){.b{height:40px}}';
  const report = run('', extra, {devicePixelRatios: [1, 1.5, 2, 3]});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.scope.devicePixelRatios, [1, 1.5, 2, 3]);
  assert.deepEqual(report.sizes.filter(r => r.box === '.b').map(r => [r.devicePixelRatio, r.blockSize.constant]), [[1, '20'], [1.5, '10'], [2, '30'], [3, '40']]);
  // Without the option a resolution query has no value: Unknown.
  assert.match(run('', extra).diagnostics.find(d => d.severity === 'unknown').message, /devicePixelRatios/);
});

test('density srcset candidates select the loaded file per device pixel ratio', () => {
  assert.deepEqual(flagged(run(img('/b.png 2x'), '', {devicePixelRatios: [1, 1.5, 2, 3]})), [1.5, 2, 3]);
  assert.deepEqual(flagged(run(img('/a.png 1x, /c.png 3x'), '', {devicePixelRatios: [1, 1.5, 2, 3]})), [1.5, 2, 3]);
  assert.deepEqual(flagged(run(img('/b.png 1.5x, /a.png 3x'), '', {devicePixelRatios: [1, 1.5, 2, 3]})), [1.5]);
  // One candidate needs no ratio; several do, and w descriptors (they need sizes) are not modeled.
  assert.deepEqual(flagged(run(img('/b.png'))), [undefined]);
  // Several candidates without a ratio: Unknown when their files' ratios differ, decided when they agree.
  assert.match(run(img('/b.png 2x')).diagnostics.find(d => d.severity === 'unknown').message, /device pixel ratio/);
  assert.equal(run(img('/a.png 2x'), '', {images: {...images}}).status, 'verified');
  assert.deepEqual(flagged(run(img('/b.png 400w'), '', {devicePixelRatios: [1]})), []);
  // A picture source's density candidates branch the same way.
  const picture = '<picture><source srcset="/a.png 1x, /b.png 2x"><img src="/a.png" width="400" height="200" alt=""></picture>';
  assert.deepEqual(flagged(run(picture, 'picture{display:grid;grid-template-columns:minmax(0,1fr)}', {devicePixelRatios: [1, 2]})), [2]);
});

test('devicePixelRatios is validated', () => {
  for (const devicePixelRatios of [[], [0], [1, 1], ['2'], [1.2345], Array.from({length: 9}, (_, i) => i + 1)]) assert.throws(() => run('', '', {devicePixelRatios}), /devicePixelRatios/);
  assert.throws(() => run('', '', {$devicePixelRatio: 2}), /Invalid layout options/);
});
