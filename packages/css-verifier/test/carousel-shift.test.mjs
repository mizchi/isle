import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';

// Carousels (aria-roledescription carousel/slide): each slide is shown in turn, and anything outside the slides that
// moves is a layout shift of switching slides.
const viewport = {min: 320, max: 800, height: {min: 400, max: 900}};
const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const base = `*{box-sizing:border-box;margin:0}.page{${g}}.c{${g}}.s1{height:100px}.s2{height:150px}.s3{height:100px}.below{height:40px}`;
const carousel = slides => `<div class="page"><section class="c" aria-roledescription="carousel" aria-label="News">${slides}</section><div class="below"></div></div>`;
const run = (html, css = '') => analyzeHTML(html, {name: 'P', css: base + css, viewport});
const shifts = report => report.diagnostics.filter(d => d.code === 'E_LAYOUT_CAROUSEL_SHIFT');

test('slides of different heights shift the content below', () => {
  const hidden = carousel('<div class="s1" aria-roledescription="slide"></div><div class="s2" aria-roledescription="slide" hidden></div><div class="s3" aria-roledescription="slide" hidden></div>');
  const [shift] = shifts(run(hidden));
  assert.deepEqual([shift.box, shift.carousel, shift.from, shift.to, shift.field, shift.delta], ['.below', '.c', '.s1', '.s2', 'blockStart', '50']);
  // A fixed carousel height (tall enough), or equal slides: nothing moves.
  assert.equal(run(hidden, '.c{height:160px}').status, 'verified');
  assert.equal(run(carousel('<div class="s1" aria-roledescription="slide"></div><div class="s3" aria-roledescription="slide" hidden></div>')).status, 'verified');
  // A state class marks the shown slide.
  const classed = carousel('<div class="s1 slide is-active" aria-roledescription="slide"></div><div class="s2 slide" aria-roledescription="slide"></div>');
  assert.equal(shifts(run(classed, '.slide{display:none}.is-active{display:grid}')).length, 1);
  // Stacked in one grid cell, only visibility switches: the carousel keeps the tallest slide's height (the overlap
  // itself is the separate overlay-contract rule).
  assert.equal(shifts(run(classed, '.slide{grid-row:1;grid-column:1;visibility:hidden}.is-active{visibility:visible}')).length, 0);
});

test('a shown slide that cannot be identified is Unknown', () => {
  // The one slide without hidden is the shown one, wherever it is.
  assert.equal(run(carousel('<div class="s1" aria-roledescription="slide" hidden></div><div class="s3" aria-roledescription="slide"></div>')).status, 'verified');
  // Two slides without hidden and no state class: which one is shown is not known.
  const report = run(carousel('<div class="s1 a" aria-roledescription="slide"></div><div class="s2" aria-roledescription="slide"></div><div class="s3" aria-roledescription="slide" hidden></div>'));
  assert.equal(report.status, 'unknown');
  assert.match(report.diagnostics.find(d => d.severity === 'unknown').message, /shown slide is not identified/);
});
