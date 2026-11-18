// Checklist E1: the report says whether the page fits the viewport and whether it overflows it, over the viewport
// range (pageScroll), so a caller that analyses several states can tell when a state change makes the scrollbar appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const scroll = (height, extra = '', vh = {min: 300, max: 300}) => analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{${g}}.a{height:${height}}${extra}`, viewport: {min: 400, max: 400, height: vh}, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}]}).pageScroll;

test('pageScroll tells whether the page fits and whether it overflows', () => {
  assert.deepEqual(scroll('100px'), {fits: true, overflows: false, stable: false});
  assert.deepEqual(scroll('500px'), {fits: false, overflows: true, stable: false});
  // Across a range of viewport heights: both.
  assert.deepEqual(scroll('400px', '', {min: 300, max: 600}), {fits: true, overflows: true, stable: false});
  // scrollbar-gutter: stable or overflow-y: scroll on html keeps the gutter either way.
  assert.equal(scroll('100px', 'html{scrollbar-gutter:stable}').stable, true);
  assert.equal(scroll('100px', 'html{overflow-y:scroll}').stable, true);
  // overflow: hidden never shows one.
  assert.equal(scroll('500px', 'html{overflow:hidden}').stable, true);
});
