import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// picture: in each condition region the first source with a matching media (and a decodable type) is selected;
// its width/height (else the img's) reserve the box, and its file's size is the loaded size.
const css = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}picture{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:100%;height:auto}';
const images = {'/wide.png': {width: 1600, height: 600}, '/narrow.png': {width: 800, height: 800}};
const run = (inner, extra = {}) => analyzeHTML(`<div class="page"><picture>${inner}</picture></div>`, {name: 'P', css, viewport: {min: 320, max: 1280, height: {min: 2000, max: 2000}}, images, ...extra});
const image = report => report.diagnostics.filter(d => /^E_LAYOUT_IMAGE_/.test(d.code));
const heightAt = (report, w) => { const row = report.sizes.find(r => r.box.startsWith('img') && w >= r.range.min && w <= r.range.max); const v = s => { const [n, d = '1'] = String(s ?? '0').split('/'); return Number(n) / Number(d); }; return v(row.blockSize.constant) + v(row.blockSize.coefficient) * w; };

test('picture sources reserve per media region', () => {
  const sized = run('<source media="(min-width: 800px)" srcset="/wide.png" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">');
  assert.equal(sized.status, 'verified', JSON.stringify(sized.diagnostics));
  assert.equal(heightAt(sized, 1280), 480); // 1600/600
  assert.equal(heightAt(sized, 400), 400);  // the img's 800/800
  // The wide source without width/height: the img's 800×800 reserves it, so wide.png changes the height from 800px.
  const [mismatch] = image(run('<source media="(min-width: 800px)" srcset="/wide.png"><img src="/narrow.png" width="800" height="800" alt="">'));
  assert.equal(mismatch.code, 'E_LAYOUT_IMAGE_RATIO');
  assert.match(mismatch.message, /\/wide\.png/);
  assert.ok(mismatch.range.min >= 800, JSON.stringify(mismatch.range));
  // A source without media is always selected; one without srcset is skipped.
  assert.equal(heightAt(run('<source srcset="/wide.png" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">'), 400), 150);
  assert.equal(heightAt(run('<source media="(min-width: 1px)" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">'), 400), 400);
});

test('picture sources whose selection or file is not known stay Unknown', () => {
  for (const inner of [
    '<source type="image/jxl" srcset="/wide.png" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">',
    '<source media="(prefers-color-scheme: dark)" srcset="/wide.png" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">',
    '<source media="(min-resolution: 2dppx)" srcset="/wide.png" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">',
    // Several candidates: which file loads depends on the device pixel ratio.
    '<source srcset="/wide.png 1x, /narrow.png 2x"><img src="/narrow.png" alt="">',
  ]) assert.equal(run(inner).status, 'unknown', inner);
  // A decodable type is selected like any source.
  assert.equal(run('<source type="image/webp" srcset="/wide.png" width="1600" height="600"><img src="/narrow.png" width="800" height="800" alt="">').status, 'verified');
});

test('video: width/height attributes and aspect-ratio reserve its box like an img', () => {
  const vcss = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}video{display:block;width:100%;height:auto}';
  const video = (attrs, extra = {}) => analyzeHTML(`<div class="page"><video src="/clip.mp4" ${attrs}></video></div>`, {name: 'P', css: vcss, viewport: {min: 320, max: 1280, height: {min: 2000, max: 2000}}, ...extra});
  const sized = video('width="1600" height="900"');
  assert.equal(sized.status, 'verified', JSON.stringify(sized.diagnostics));
  assert.equal(sized.sizes.find(r => r.path === 'P/0').blockSize.coefficient, '9/16');
  // Its natural size, when known (from the file's metadata at build time), is checked like an image's.
  assert.equal(video('width="1600" height="900"', {images: {'/clip.mp4': {width: 640, height: 480}}}).diagnostics[0].code, 'E_LAYOUT_IMAGE_RATIO');
  // No reservation: the natural size arrives with the metadata, so the height is not decided.
  assert.equal(video('').status, 'unknown');
});

test('a sizes width below the layout width is a W_LAYOUT_SIZES_SMALL warning in those regions', () => {
  const scss = '*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}img{display:block;width:100%;height:auto}@media (min-width:900px){.page{grid-template-columns:600px}}';
  const regions = sizes => (analyzeHTML(`<div class="page"><img src="/a.png" srcset="/a.png 400w, /b.png 800w" sizes="${sizes}" width="400" height="200" alt=""></div>`, {name: 'P', css: scss, viewport: {min: 320, max: 1280}}).layoutWarnings ?? [])
    .filter(w => w.code === 'W_LAYOUT_SIZES_SMALL').map(w => [w.range.min, w.range.max]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(regions('100vw'), []);
  assert.deepEqual(regions('(min-width: 900px) 600px, 100vw'), []);
  assert.deepEqual(regions('50vw'), [[320, 900], [900, 1200]]); // 50vw < W below 900px, < 600px up to 1200px
  assert.deepEqual(regions('(min-width: 900px) 500px, 100vw'), [[900, 1280]]);
  assert.deepEqual(regions('calc(100vw - 20px)'), [[320, 900]]);
  // Density descriptors and sizes=auto are not sized by the attribute.
  assert.equal(analyzeHTML('<div class="page"><img src="/a.png" srcset="/b.png 2x" sizes="10vw" width="400" height="200" alt=""></div>', {name: 'P', css: scss, viewport: {min: 320, max: 1280}}).layoutWarnings, undefined);
});

test('a w-descriptor srcset without sizes (sizes defaults to 100vw) on an image at most half the viewport wide is W_LAYOUT_SIZES_MISSING', () => {
  const css = cols => `*{box-sizing:border-box;margin:0}.page{display:grid;grid-template-columns:${cols}}img{display:block;width:100%;height:auto}`;
  const regions = (cols, attrs = '') => (analyzeHTML(`<div class="page"><img src="/a.png" srcset="/a.png 400w, /b.png 800w" ${attrs} width="400" height="200" alt=""></div>`, {name: 'P', css: css(cols), viewport: {min: 320, max: 1280}}).layoutWarnings ?? [])
    .filter(w => w.code === 'W_LAYOUT_SIZES_MISSING').map(w => [w.range.min, w.range.max]);
  assert.deepEqual(regions('minmax(0,1fr)'), []);
  assert.deepEqual(regions('repeat(3,minmax(0,1fr))'), [[320, 1280]]);
  assert.deepEqual(regions('300px minmax(0,1fr)'), [[600, 1280]]); // the image is 300px: half the viewport from 600px
  assert.deepEqual(regions('repeat(3,minmax(0,1fr))', 'sizes="33vw"'), []);
  // Density descriptors do not use sizes.
  assert.equal(analyzeHTML('<div class="page"><img src="/a.png" srcset="/b.png 2x" width="400" height="200" alt=""></div>', {name: 'P', css: css('repeat(3,minmax(0,1fr))'), viewport: {min: 320, max: 1280}}).layoutWarnings, undefined);
});
