// Logical inline sides (padding-inline-start/end, padding-inline) resolve by the box's direction, mixed in the
// cascade with physical sides: random rules under dir=rtl and ltr, every leaf's position against Chromium.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
function random(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

test('logical and physical paddings in rtl and ltr boxes agree with Chromium (random rules)', async ({page}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({width: 400, height: 300});
  const props = ['padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end', 'padding-inline'];
  let compared = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = random(seed), pick = list => list[Math.floor(r() * list.length)];
    const dir = pick(['rtl', 'ltr']);
    const decls = Array.from({length: 1 + Math.floor(r() * 3)}, () => { const p = pick(props); return p === 'padding-inline' ? `${p}:${Math.floor(r() * 4) * 10}px ${Math.floor(r() * 4) * 10}px` : `${p}:${Math.floor(r() * 5) * 10}px`; });
    // One declaration per rule, of different specificity, so the cascade mixes logical and physical sides.
    const selectors = ['.x', '.c .x', '.c > .x', 'div.x'];
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.c{display:grid;grid-template-columns:200px}.x{${g}}${decls.map((d, i) => `${selectors[i]}{${d}}`).join('')}.y{height:20px}`;
    const html = `<div class="c" dir="${dir}"><div class="x"><div class="y"></div></div></div>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(report.status, `${seed}: ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    const row = report.sizes.find(s => s.box === '.y');
    const at = v => Number(v.constant) + 400 * Number(v.coefficient);
    await page.setContent(`<!doctype html><style>${css}</style>${html}`);
    const box = await page.evaluate(() => { const b = document.querySelector('.y').getBoundingClientRect(); return [b.x, b.width]; });
    expect([at(row.rect.inlineStart), at(row.rect.inlineSize)], `seed ${seed} dir=${dir}: ${decls.join('; ')}`).toEqual(box);
    compared++;
  }
  expect(compared).toBe(40);
});

test('physical sides in rtl: Chromium does not mirror the ltr layout exactly where the static check warns', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [decl, warn] of [['padding-left:30px', true], ['padding-right:10px', true], ['padding-inline-start:30px', false], ['padding-inline:30px 10px', false], ['padding-left:20px;padding-right:20px', false]]) {
    const css = `*{box-sizing:border-box;margin:0}html,body{${g}}body{margin:0}.c{display:grid;grid-template-columns:150px}.x{${g};${decl}}.y{height:20px}`;
    const at = async dir => { await page.setContent(`<!doctype html><style>${css}</style><div class="c" dir="${dir}"><div class="x"><div class="y"></div></div></div>`); return page.evaluate(() => { const b = document.querySelector('.y').getBoundingClientRect(), c = document.querySelector('.x').getBoundingClientRect(); return [b.x - c.x, b.width, c.width]; }); };
    const [[lx, w, cw], [rx]] = [await at('ltr'), await at('rtl')];
    const mirrored = rx === cw - lx - w;
    const report = analyzeHTML(`<html lang="en"><body><div class="c" dir="rtl"><div class="x"><div class="y"></div></div></div></body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    const warned = (report.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_PHYSICAL_IN_RTL');
    expect(warned, `${decl}: mirrored ${mirrored}`).toBe(!mirrored);
    expect(warned, decl).toBe(warn);
  }
});

test('absolute boxes with both insets of an axis agree with Chromium (random insets, sizes, box-sizing, direction)', async ({page}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({width: 400, height: 600});
  const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };
  const len = r => [`${Math.floor(r() * 4) * 10}px`, `${Math.floor(r() * 3) * 5}%`, '0'][Math.floor(r() * 3)];
  for (let seed = 1; seed <= 40; seed++) {
    const r = random(seed), pick = list => list[Math.floor(r() * list.length)];
    const inline = pick([`left:${len(r)};right:${len(r)}`, `left:${len(r)}`, `right:${len(r)}`]);
    const blockAxis = pick([`top:${len(r)};bottom:${len(r)}`, `top:${len(r)}`]);
    const both = inline.includes(';'), bothBlock = blockAxis.includes(';');
    const width = both && r() < 0.5 ? '' : 'width:120px;', height = bothBlock && r() < 0.5 ? '' : 'height:40px;';
    const sizing = pick(['border-box', 'content-box']), pad = pick(['', 'padding:4px 8px;']), dir = pick(['ltr', 'rtl']);
    const css = `*{margin:0}html,body,.page,.card{${g}}body{margin:0}.card{position:relative;height:200px}.o{position:absolute;box-sizing:${sizing};${pad}${width}${height}${inline};${blockAxis}}`;
    const html = `<main class="page"><div class="card" dir="${dir}"><div class="o"></div></div></main>`;
    const report = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 600, max: 600}}});
    expect(report.status, `${seed}: ${css} ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    const rect = report.sizes.find(s => s.box === '.o').rect, v = x => n(x.constant) + 400 * n(x.coefficient) + 600 * n(x.heightCoefficient);
    await page.setContent(`<!doctype html><style>${css}</style>${html}`);
    const box = await page.evaluate(() => { const b = document.querySelector('.o').getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; });
    expect([v(rect.inlineStart), v(rect.blockStart), v(rect.inlineSize), v(rect.blockSize)], `seed ${seed} dir=${dir}: ${css}`).toEqual(box);
  }
});
