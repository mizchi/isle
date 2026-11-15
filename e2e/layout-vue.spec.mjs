// The Vue adapter against the real component: Vue's server rendering of each state, laid out in Chromium with the
// SFC's styles, compared with the static analysis of the expanded state.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {analyzeVue} from '../packages/vue-adapter/src/index.mjs';
import {renderSSR, sfcCSS} from '../packages/vue-adapter/test/ssr.mjs';

const fixture = name => readFileSync(new URL(`../packages/vue-adapter/fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{margin:0}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const ssr = renderSSR, css = sfcCSS;
const dataOf = c => Object.fromEntries(Object.entries(c).map(([k, v]) => k.startsWith('#for ') ? [k.split(' in ')[1], Array.from({length: v}, (_, i) => i)] : [k, v]));

test('Card.vue: every state\'s box heights agree with Chromium on the server-rendered component', async ({page}) => {
  const source = fixture('Card.vue');
  const report = analyzeVue(source, {pageCSS, viewport});
  expect(report.status).toBe('verified');
  let compared = 0;
  for (const state of report.states) {
    await page.setViewportSize({width: 480, height: 700});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${css(source)}</style></head><body>${await ssr(source, dataOf(state.choices))}</body></html>`);
    for (const row of state.report.sizes.filter(r => r.blockSize?.coefficient === '0' && r.box.startsWith('.'))) {
      const heights = await page.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect().height), row.box.split('.').filter(Boolean).map(c => `.${c}`).join(''));
      for (const h of heights) { expect(h, `${JSON.stringify(state.choices)} ${row.box}`).toBe(Number(row.blockSize.constant)); compared++; }
    }
  }
  expect(compared).toBeGreaterThan(12);
});

test('Wide.vue: the state the analysis calls violated overflows the page in Chromium, the other does not', async ({page}) => {
  const source = fixture('Wide.vue');
  const report = analyzeVue(source, {pageCSS, viewport});
  for (const state of report.states) {
    await page.setViewportSize({width: 320, height: 700});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${css(source)}</style></head><body>${await ssr(source, dataOf(state.choices))}</body></html>`);
    const overflows = await page.evaluate(() => document.querySelector('.bar').getBoundingClientRect().right > document.querySelector('.page').getBoundingClientRect().right + 0.5);
    expect(overflows, JSON.stringify(state.choices)).toBe(state.report.status === 'violated');
  }
});
