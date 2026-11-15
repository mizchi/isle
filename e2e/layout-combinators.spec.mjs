// Complex selectors (>, descendant, +, ~) against Chromium: random trees and rules, compare every box's height.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
function random(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

test('complex selectors match the same boxes as Chromium (random trees and rules)', async ({page}) => {
  test.setTimeout(600_000);
  const classes = ['a', 'b', 'c', 'd'];
  let checked = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const r = random(seed), pick = list => list[Math.floor(r() * list.length)];
    let n = 0;
    const node = depth => { const cls = `${pick(classes)} n${n++}`; const kids = depth < 3 ? Array.from({length: 1 + Math.floor(r() * 3)}, () => node(depth + 1)) : []; return {cls, kids}; };
    const root = {cls: 'root n' + n++, kids: [node(1), node(1)]};
    const html = t => t.kids.length ? `<div class="${t.cls}">${t.kids.map(html).join('')}</div>` : `<div class="${t.cls} leaf"></div>`;
    const combinators = ['>', ' ', '+', '~'];
    const rules = Array.from({length: 6}, (_, i) => `.${pick(classes)} ${pick(combinators)} .${pick(classes)}.leaf{height:${10 + i * 5}px}`).join('');
    const css = `*{box-sizing:border-box;margin:0}html,body,div{${g}}.leaf{height:4px}${rules}`;
    const doc = `<html lang="en"><body>${html(root)}</body></html>`;
    const report = analyzeHTML(doc, {name: 'P', css, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}});
    expect(report.status, `${seed}: ${report.diagnostics.map(d => d.message).join(' | ')}`).toBe('verified');
    const statics = Object.fromEntries(report.sizes.filter(row => row.box.includes('.leaf')).map(row => [row.box.match(/\.n\d+/)[0].slice(1), Number(row.blockSize.constant)]));
    await page.setContent(`<!doctype html><style>${css}</style>${doc}`);
    const browser = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.leaf')].map(e => [[...e.classList].find(c => /^n\d+$/.test(c)), e.getBoundingClientRect().height])));
    expect(statics, `seed ${seed}: ${rules}`).toEqual(browser);
    checked += Object.keys(browser).length;
  }
  expect(checked).toBeGreaterThan(120);
});
