// @scope: where the analysis applies scoped rules (inside the root only; at equal specificity the nearer root wins,
// and a scoped declaration beats a later unscoped one; limits exclude their elements and what is inside them), every box is as tall in the browser as the analysis says.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const body = '<div class="card"><div class="k"></div><div class="card"><div class="k in"></div><p class="k"></p></div></div><div class="k out"></div><section><div class="k"></div></section>';
const cases = [
  '.k{height:10px}@scope (.card){.k{height:30px}}',
  '@scope (.card){.k{height:30px}}.k{height:10px}',
  '@scope (.card){.k{height:30px}}div.k{height:10px}',
  '@scope (.card){.k{height:30px}}@scope (body){.k{height:20px}}',
  '@scope (body){.k{height:20px}}@scope (.card){.k{height:30px}}',
  '@scope (section){.k{height:40px}}.k{height:10px}',
  '@scope (.card){p{height:25px}.in{height:35px}}.k{height:10px}',
  '@scope (div.card){.k{height:30px}}@scope (.card){.k{height:15px}}',
  '@scope (.card){@media (min-width: 1px){.k{height:30px}}}',
  '.k{height:10px !important}@scope (.card){.k{height:30px}}',
  // Limits (to …): the limit elements and what is inside them are out of that root's scope.
  '.k{height:10px}@scope (.card) to (.in){.k{height:30px}}',
  '.k{height:10px}@scope (.card) to (.card){.k{height:30px}}',
  '.k{height:10px}@scope (body) to (.card){.k{height:30px}}',
  '.k{height:10px}@scope (body) to (section){.k{height:30px}}',
  '.k{height:10px}@scope (.card) to (p){.k{height:30px}}',
  '.k{height:10px}@scope (.card) to (.k){.k{height:30px}}',
  // :scope and & (checklist C2): the root itself, its children and descendants, with their specificities.
  '.k{height:10px}@scope (.card){:scope > .k{height:30px}}', '.k{height:10px}@scope (.card){& > .k{height:30px}}', '.k{height:10px}@scope (.card){& .k{height:30px}}',
  '.k{height:10px}@scope (div.card){:scope > .k{height:30px}}.card > .k{height:15px}', '.k{height:10px}@scope (div.card){& > .k{height:30px}}.card > .k{height:15px}', '@scope (div.card){& > .k{height:30px}}.k{height:15px}', '.k{height:10px}@scope (div.card){:scope > .k{height:30px}}div.card > .k{height:15px}',
  '.k{height:10px}@scope (.card){:scope{padding-top:5px}}', '.k{height:10px}@scope (.card) to (.in){:scope > .k{height:30px}}',
];

test('scoped rules: the analysis gives the browser\'s heights', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const c of cases) {
    const css = `*{margin:0}html,body,.card,section{${g}}${c}`;
    const r = analyzeHTML(`<html lang="en"><body>${body}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const model = r.sizes.filter(s => /\.k|\bp\b/.test(s.box) && s.rect && !/card|section/.test(s.box.split(' ').at(-1))).map(s => Number(s.rect.blockSize.constant));
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${body}</body></html>`);
    const browser = await page.evaluate(() => [...document.querySelectorAll('.k')].map(e => e.getBoundingClientRect().height));
    expect(model, c).toEqual(browser);
  }
});
