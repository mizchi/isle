import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// An img with object-fit: fill (the initial value) is scaled to its box on each axis: a box whose ratio differs from
// the image's natural ratio (its file's size, else the width/height attributes) stretches the picture.
const images = {'/photo.jpg': {width: 1200, height: 800}};
const run = (img, css, extra = {}) => analyzeHTML(`<div class="page">${img}</div>`, {name: 'P', css: `*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block}${css}`, viewport: {min: 320, max: 1280, height: {min: 2000, max: 2000}}, images, ...extra});
const distorted = report => (report.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED');

test('a fixed height with a fluid width stretches a fill image (W_LAYOUT_IMAGE_DISTORTED)', () => {
  const img = '<img src="/photo.jpg" width="1200" height="800" alt="A photo">';
  const [w] = distorted(run(img, 'img{width:100%;height:240px}'));
  assert.ok(w, 'warned');
  assert.equal(w.box.startsWith('img'), true);
  assert.equal(w.natural, '1200/800');
  // 240px tall at 1.5:1 is 360px wide: narrower and wider viewports both distort, and 360±2% does not.
  assert.deepEqual(distorted(run(img, 'img{width:100%;height:240px}')).map(w => w.stretched), ['wider', 'taller']);
  // object-fit cover/contain keeps the ratio; height:auto follows it.
  assert.deepEqual(distorted(run(img, 'img{width:100%;height:240px;object-fit:cover}')), []);
  assert.deepEqual(distorted(run(img, 'img{width:100%;height:240px;object-fit:contain}')), []);
  assert.deepEqual(distorted(run(img, 'img{width:100%;height:auto}')), []);
  // An explicit aspect-ratio equal to the image's: no warning; a different one: warning.
  assert.deepEqual(distorted(run(img, 'img{width:100%;height:auto;aspect-ratio:3/2}')), []);
  assert.deepEqual(distorted(run(img, 'img{width:100%;height:auto;aspect-ratio:3 / 2}')), []);
  assert.equal(distorted(run(img, 'img{width:100%;height:auto;aspect-ratio:1}')).length >= 1, true);
  // The width attribute alone overridden: the height hint (800px) stays, the classic stretched hero.
  assert.equal(distorted(run(img, 'img{width:100%}')).length >= 1, true);
});

test('the file size wins over the attributes, and an unknown file falls back to the attributes', () => {
  // The attributes say square, the file is 3:2: a square box (the attributes' ratio) stretches the 3:2 file.
  assert.equal(distorted(run('<img src="/photo.jpg" width="800" height="800" alt="A photo">', 'img{width:100%;height:auto;aspect-ratio:1}')).at(0)?.natural, '1200/800');
  assert.equal(distorted(run('<img src="/other.jpg" width="800" height="800" alt="A photo">', 'img{width:100%;height:200px}')).at(0)?.natural, '800/800');
  // No ratio known at all: nothing to compare.
  assert.deepEqual(distorted(run('<img src="/other.jpg" alt="A photo">', 'img{width:100%;height:200px}')), []);
});
