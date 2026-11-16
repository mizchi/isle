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

test('Settings.svelte: the newer checks\' findings per state agree with the server-rendered component in Chromium', async ({page}) => {
  test.setTimeout(300_000);
  const source = fixture('Settings.svelte');
  const css18 = pageCSS + 'body{font-size:18px}';
  const report = analyzeSvelte(source, {pageCSS: css18, viewport, accessibility: true, integrity: true, scrollbars: [{name: 'overlay', inlineSize: 0, blockSize: 0}], boxes: {'.title': {minInlineSize: 40, intrinsicBlockSize: 24}}, eachCounts: [0, 2]});
  const holds = (code, box, choices) => report.findings.some(f => f.code === code && f.box === box && f.states.includes(choices));
  const props = c => ({...c, rows: Array.from({length: c['#each rows']}, (_, i) => i)});
  await page.setViewportSize({width: 400, height: 300});
  let checked = 0;
  for (const state of report.states.filter(s => s.choices['#each rows'] === 2)) {
    const {html, css} = await renderSSR(source, props(state.choices));
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css18}${css}.tall{height:2000px}</style></head><body>${html}<div class="tall"></div></body></html>`);
    // Hidden checkbox: Tab from the start reaches .reset after .save, never the box.
    const order = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement?.className ?? '')); }
    const reachesBox = order.some(c => c.includes('box'));
    expect(holds('E_A11Y_CONTROL_HIDDEN', '.box.hidden', state.choices), `${JSON.stringify(state.choices)} tab ${order}`).toBe(!reachesBox);
    // Control font: the buttons keep the UA size against the 18px page.
    const [button, page18] = await page.evaluate(() => [getComputedStyle(document.querySelector('.reset')).fontSize, getComputedStyle(document.querySelector('.page')).fontSize]);
    expect(holds('W_LAYOUT_CONTROL_FONT', '.reset', state.choices)).toBe(button !== page18);
    // grid-column on a flex item: the save button is 96px wide with or without .wide.
    expect(await page.evaluate(() => document.querySelector('.save').getBoundingClientRect().width)).toBe(96);
    // The sticky table head scrolls away with the page.
    const top = await page.evaluate(async () => { scrollTo(0, 300); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector('.thead').getBoundingClientRect().top; });
    expect(holds('W_LAYOUT_STICKY_SCROLLER', '.thead', state.choices)).toBe(top < 0);
    checked++;
  }
  expect(checked).toBe(16);
});

// data-noshift: the element's box between the component's states, as Chromium lays them out, against the verdict.
test('data-noshift: E_LAYOUT_NOSHIFT exactly when Chromium moves the marked element between the states', async ({page}) => {
  const g = 'display: grid; grid-template-columns: minmax(0, 1fr);';
  const variants = [
    ['pushes', '.banner { height: 48px; }'],
    ['overlays', '.slot { position: relative; } .banner { position: absolute; top: 0; left: 0; width: 100px; height: 48px; }'],
    ['reserves', '.page { grid-template-rows: 48px auto; } .slot { height: 48px; } .banner { height: 48px; }'],
  ];
  for (const [name, css] of variants) {
    const source = `<script>let { open = false } = $props();</script>\n<div class="page"><div class="slot">{#if open}<div class="banner"></div>{/if}</div><main class="content" data-noshift="content"></main></div>\n<style>.page { ${g} } .slot { display: grid; grid-template-columns: minmax(0, 1fr); } .content { height: 100px; } ${css}</style>`;
    const report = analyzeSvelte(source, {pageCSS, viewport});
    const flagged = report.findings.some(f => f.code === 'E_LAYOUT_NOSHIFT');
    expect(report.unknowns.filter(u => u.code === 'U_LAYOUT_NOSHIFT'), name).toEqual([]);
    let moved = false;
    for (const width of [320, 480, 800]) {
      const rects = [];
      for (const state of report.states) {
        const {html, css: built} = await renderSSR(source, propsOf(state.choices));
        await page.setViewportSize({width, height: 700});
        await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${built}</style></head><body>${html}</body></html>`);
        rects.push(await page.evaluate(() => { const r = document.querySelector('[data-noshift]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
      }
      if (rects.some(r => r.some((v, i) => Math.abs(v - rects[0][i]) > 0.01))) moved = true;
    }
    expect(flagged, name).toBe(moved);
  }
});
