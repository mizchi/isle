// The Svelte adapter against the real component: Svelte's SSR markup and scoped CSS for each state, laid out in
// Chromium, compared with the static analysis of the expanded state.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {analyzeSvelte} from '../packages/svelte-adapter/src/index.mjs';
import {renderSSR} from '../packages/svelte-adapter/test/ssr.mjs';

const fixture = name => readFileSync(new URL(`../packages/svelte-adapter/fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{margin:0}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const propsOf = choices => ({...choices, ...(choices['#each items'] !== undefined ? {items: Array.from({length: choices['#each items']}, (_, i) => i)} : {})});

test('Card.svelte: every state\'s box heights agree with Chromium on the server-rendered component', async ({page}) => {
  const source = fixture('Card.svelte');
  const report = analyzeSvelte(source, {pageCSS, viewport});
  expect(report.status).toBe('verified');
  let compared = 0;
  for (const state of report.states) {
    const {html, css} = await renderSSR(source, propsOf(state.choices));
    await page.setViewportSize({width: 480, height: 700});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${css}</style></head><body>${html}</body></html>`);
    for (const row of state.report.sizes.filter(r => r.blockSize?.coefficient === '0' && r.box.startsWith('.'))) {
      const heights = await page.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect().height), row.box.split('.').filter(Boolean).map(c => `.${c}`).join(''));
      expect(heights.length, `${JSON.stringify(state.choices)} ${row.box}`).toBeGreaterThan(0);
      for (const h of heights) { expect(h, `${JSON.stringify(state.choices)} ${row.box}`).toBe(Number(row.blockSize.constant)); compared++; }
    }
  }
  expect(compared).toBeGreaterThan(12);
});

test('Wide.svelte: the state the analysis calls violated overflows the page in Chromium, the others do not', async ({page}) => {
  const source = fixture('Wide.svelte');
  const report = analyzeSvelte(source, {pageCSS, viewport});
  expect(report.status).toBe('violated');
  for (const state of report.states) {
    const {html, css} = await renderSSR(source, propsOf(state.choices));
    await page.setViewportSize({width: 320, height: 700});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${css}</style></head><body>${html}</body></html>`);
    const overflows = await page.evaluate(() => { const bar = document.querySelector('.bar').getBoundingClientRect(), main = document.querySelector('.page').getBoundingClientRect(); return bar.right > main.right + 0.5; });
    expect(overflows, JSON.stringify(state.choices)).toBe(state.report.status === 'violated');
  }
});
