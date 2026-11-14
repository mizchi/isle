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
