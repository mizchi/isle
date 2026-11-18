// Checklist D3: an inline box inside measured text under text-align center / right / end. The line moves by
// (content width − line width) × 1/2 or 1; the line width is a range (shaping and layout rounding), so the outer bound
// starts where the widest line puts the box and ends where the narrowest does. Wrapping text has no bounds just below a
// line break's widened width, where the browser may already break the other way.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {loadTextMetrics} from '../src/text-node.mjs';

const metrics = await loadTextMetrics({fonts: {Roboto: {file: new URL('../text-metrics/fixtures/roboto-variable.ttf', import.meta.url).pathname}}});
const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
const value = t => { const [n, d = '1'] = String(t).split('/'); return Number(n) / Number(d); };
const at = (a, W) => value(a.coefficient) * W + value(a.constant);
const bounds = (align, content, piece, wrap) => {
  const boxes = metrics.resolveBoxes({'.p': {text: {content, font, inline: {'.u': piece}}, ...(wrap ? {wrap} : {})}});
  const i = content.indexOf(piece);
  const html = `<html lang="en"><body><div class="page"><p class="p">${content.slice(0, i)}<a class="u" href="#x">${piece}</a>${content.slice(i + piece.length)}</p></div></body></html>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}html,body,.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;${wrap ? '' : 'white-space:nowrap;'}text-align:${align}}`;
  return analyzeHTML(html, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 300, max: 300}}, boxes}).inlineBounds ?? [];
};

test('a centred or right-aligned line moves its inline box by the free space', () => {
  const [start] = bounds('start', 'Read the guide first.', 'guide'), [center] = bounds('center', 'Read the guide first.', 'guide'), [right] = bounds('right', 'Read the guide first.', 'guide');
  for (const W of [320, 800]) {
    const s = at(start.outer.inlineStart, W), c = at(center.outer.inlineStart, W), r = at(right.outer.inlineStart, W);
    assert.ok(c > s + 50 && r > c + 50, `${W}: ${s} ${c} ${r}`);
    // The free space grows with the viewport: centred by half, right by all of it (within the line width's spread).
    assert.equal(value(center.outer.inlineStart.coefficient), 0.5);
    assert.equal(value(right.outer.inlineStart.coefficient), 1);
  }
  // The outer bound is wider than the start-aligned one by the spread, and still covers the inner one.
  assert.ok(at(center.outer.inlineSize, 320) >= at(start.outer.inlineSize, 320));
  assert.ok(at(center.inner.inlineStart, 320) >= at(center.outer.inlineStart, 320));
});

test('aligned wrapping text has no bounds within the allowance below a line break', () => {
  const content = 'Read the full installation guide before you start the upgrade of the cluster.';
  const start = bounds('start', content, 'installation guide', 'normal'), center = bounds('center', content, 'installation guide', 'normal');
  assert.ok(start.length && center.length);
  const holds = (row, W) => row.regionConstraints.every(c => { const slack = value(c.coefficient) * W + value(c.constant); return c.strict ? slack > 1e-9 : slack >= -1e-9; });
  let band = 0, both = 0;
  for (let W = 320; W <= 800; W += 0.25) {
    const s = start.some(b => holds(b, W)), c = center.some(b => holds(b, W));
    assert.ok(!c || s, `${W}: centred bounds where start-aligned text has none`);
    if (s && !c) band++; if (s && c) both++;
  }
  // Narrow bands below each break, and bounds everywhere else.
  assert.ok(band > 0 && both > 10 * band, `${band} ${both}`);
  // justify (other than the last line) is not modeled: no bounds.
  assert.equal(bounds('justify', 'Read the guide first.', 'guide').length, 0);
});
