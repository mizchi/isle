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
  // justify: the last line (here the only one) is start-aligned, so its bounds are the start-aligned ones.
  assert.deepEqual(bounds('justify', 'Read the guide first.', 'guide'), bounds('start', 'Read the guide first.', 'guide'));
  // Wrapping: only where the piece is on the last line (the earlier lines are stretched).
  const justified = bounds('justify', content, 'installation guide', 'normal');
  for (let W = 320; W <= 800; W += 0.5) assert.ok(!justified.some(b => holds(b, W)) || start.some(b => holds(b, W)), `${W}`);
});

// The inline box's own vertical padding extends its box; vertical-align off the baseline makes the line taller.
const one = extra => {
  const boxes = metrics.resolveBoxes({'.p': {text: {content: 'Read the guide first.', font, inline: {'.u': 'guide'}}}});
  return analyzeHTML('<html lang="en"><body><div class="page"><p class="p">Read the <a class="u" href="#x">guide</a> first.</p></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0;padding:0}html,body,.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}${extra}`, viewport: {min: 320, max: 800, height: {min: 300, max: 300}}, boxes});
};
test('vertical padding extends the inline box; vertical-align off the baseline is Unknown', () => {
  const [plain] = one('').inlineBounds, [padded] = one('.u{padding:4px 0 6px}').inlineBounds;
  assert.equal(value(padded.outer.blockStart.constant), value(plain.outer.blockStart.constant) - 4);
  assert.equal(value(padded.outer.blockSize.constant), value(plain.outer.blockSize.constant) + 10);
  assert.equal(value(padded.inner.blockSize.constant), value(plain.inner.blockSize.constant) + 10);
  for (const v of ['top', 'bottom', 'baseline']) assert.notEqual(one(`.u{vertical-align:${v}}`).status, 'unknown', v);
  for (const v of ['super', 'sub', 'middle', 'text-top', '5px', '20%']) assert.equal(one(`.u{vertical-align:${v}}`).status, 'unknown', v);
});

test('horizontal edges of inline boxes: measured with the contract, else Unknown', () => {
  const run = (css, edges) => {
    const boxes = metrics.resolveBoxes({'.p': {text: {content: 'Read the guide first.', font, inline: {'.u': edges ? {text: 'guide', edges} : 'guide'}}}});
    return {boxes, r: analyzeHTML('<html lang="en"><body><div class="page"><p class="p">Read the <a class="u" href="#x">guide</a> first.</p></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0;padding:0}html,body,.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 300}}, boxes})};
  };
  const plain = run(''), padded = run('.u{padding:0 4px;margin-left:3px}', [3, 4, 4, 0]);
  assert.equal(padded.boxes['.p'].minInlineSize, plain.boxes['.p'].minInlineSize + 11);
  assert.notEqual(padded.r.status, 'unknown');
  const [a] = plain.r.inlineBounds, [b] = padded.r.inlineBounds;
  assert.equal(value(b.outer.inlineStart.constant), value(a.outer.inlineStart.constant) + 3);
  assert.equal(value(b.outer.inlineSize.constant), value(a.outer.inlineSize.constant) + 8);
  // Not measured, or measured with other edges, or measured but not declared: Unknown.
  assert.equal(run('.u{padding:0 4px}').r.status, 'unknown');
  assert.equal(run('.u{padding:0 4px}', [0, 5, 5, 0]).r.status, 'unknown');
  assert.equal(run('', [0, 4, 4, 0]).r.status, 'unknown');
  // Wrapping text with edges is not measured.
  assert.throws(() => metrics.resolveBoxes({'.p': {text: {content: 'Read the guide first.', font, inline: {'.u': {text: 'guide', edges: [0, 4, 4, 0]}}}, wrap: 'normal'}}), /one-line/);
});

test('an inline box in another weight: measured as its own run, else Unknown', () => {
  const run = (css, weight) => {
    const boxes = metrics.resolveBoxes({'.p': {text: {content: 'Read the guide first.', font, inline: {'.u': weight ? {text: 'guide', weight} : 'guide'}}}});
    return {boxes, r: analyzeHTML('<html lang="en"><body><div class="page"><p class="p">Read the <a class="u" href="#x">guide</a> first.</p></div></body></html>', {name: 'P', css: `*{box-sizing:border-box;margin:0;padding:0}html,body,.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p{font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}${css}`, viewport: {min: 320, max: 800, height: {min: 300, max: 300}}, boxes})};
  };
  const plain = run(''), bold = run('.u{font-weight:700}', 700);
  assert.notEqual(bold.r.status, 'unknown');
  assert.ok(bold.boxes['.p'].textMetrics.width > plain.boxes['.p'].textMetrics.width, 'bold is wider');
  assert.equal(run('.u{font-weight:bold}', 700).r.status === 'unknown', false);
  // Not measured, measured in another weight, measured but not set, or a size change: Unknown.
  assert.equal(run('.u{font-weight:700}').r.status, 'unknown');
  assert.equal(run('.u{font-weight:600}', 700).r.status, 'unknown');
  assert.equal(run('', 700).r.status, 'unknown');
  assert.equal(run('.u{font-weight:700;font-size:20px}', 700).r.status, 'unknown');
});
