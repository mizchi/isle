// Checklist D1: position: relative with px offsets. Every box (the offset one, its children, an absolute box inside it,
// its siblings) is where the browser puts it, in ltr, and in rtl for block offsets (an rtl inline offset is Unknown).
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const body = '<div class="a"><div class="k"></div><div class="x"></div></div><div class="b"></div>';
const base = `*{margin:0}html,body{${g}}.a{display:grid;grid-template-columns:minmax(0,1fr);height:40px;padding:4px;position:relative}.k{height:10px}.b{height:20px}.x{position:absolute;top:2px;left:5px;width:6px;height:6px}`;
const cases = ['.a{top:7px;left:3px}', '.a{bottom:5px;right:2px}', '.a{top:7px;bottom:100px}', '.a{left:3px;right:100px}', '.a{top:-4px;left:-9px}', '.a{top:0;left:0}', '.b{position:relative;top:12px}', '.k{position:relative;left:6px;top:1px}'];

for (const dir of ['ltr', 'rtl']) test(`relative px offsets (${dir}): every box is where the browser puts it`, async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const c of cases) {
    // In rtl an inline offset stays Unknown (the children are placed mirrored); the block offsets are checked.
    if (dir === 'rtl' && /(?:left|right):(?!0[;}])/.test(c)) continue;
    const css = base + c;
    const r = analyzeHTML(`<html lang="en" dir="${dir}"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, accessibility: true});
    expect(r.status === 'unknown', `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).toBe(false);
    const model = Object.fromEntries(r.sizes.filter(s => s.rect && /^\.(?:a|b|k|x)$/.test(s.box)).map(s => [s.box, [Number(s.rect.inlineStart.constant), Number(s.rect.blockStart.constant)]]));
    await page.setContent(`<!doctype html><html lang="en" dir="${dir}"><head><style>${css}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => Object.fromEntries(['.a', '.b', '.k', '.x'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.top]]; })));
    for (const box of Object.keys(model)) expect(model[box], `${dir} ${c} ${box}`).toEqual(browser[box]);
    expect(Object.keys(model).length, `${c}: boxes with a rectangle`).toBeGreaterThanOrEqual(3);
  }
});
