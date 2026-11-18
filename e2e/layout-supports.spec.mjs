// @supports: every condition the analysis decides (packages/css-verifier/src/layout/supports.mjs) has the same answer
// as CSS.supports in this browser, and a guarded rule applies (or not) as the analysis says.
import {test, expect} from '@playwright/test';
import {supportsCondition, supportedSelectors} from '../packages/css-verifier/src/layout/supports.mjs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const samples = {
  display: ['grid', 'inline-grid', 'flex', 'inline-flex', 'contents', 'flow-root', 'block', 'inline-block', 'none'],
  gap: ['0', '1rem', '8px', '2%'], 'row-gap': ['4px'], 'column-gap': ['1em', '2ch'],
  'aspect-ratio': ['16 / 9', '1', '1.5'], position: ['sticky', 'relative', 'absolute', 'fixed'], inset: ['0', '10px'],
  'object-fit': ['cover', 'contain', 'fill', 'none', 'scale-down'], 'container-type': ['inline-size', 'size', 'normal'],
  overflow: ['clip', 'hidden', 'auto', 'scroll', 'visible'], width: ['fit-content', 'min-content', 'max-content'],
  height: ['100dvh', '100svh', '50lvh'], 'grid-template-columns': ['subgrid'], 'grid-template-rows': ['subgrid'],
  translate: ['10px', '10px -4px'], 'text-wrap': ['balance', 'wrap', 'nowrap'], 'accent-color': ['auto', '#c00', 'red'],
};
const conditions = [
  ...Object.entries(samples).flatMap(([p, values]) => values.map(v => `(${p}: ${v})`)),
  ...supportedSelectors.map(s => `selector(${s})`),
  'not (display: grid)', '(display: flex) and (gap: 1rem)', 'not ((display: grid) and (position: sticky))', '(aspect-ratio: 1) or (foo: bar)',
];

test('every decided @supports condition matches CSS.supports in this browser', async ({page}) => {
  await page.setContent('<!doctype html><html lang="en"><body></body></html>');
  for (const c of conditions) {
    const decided = supportsCondition(c);
    expect(decided, `${c}: decided`).not.toBe(undefined);
    expect(await page.evaluate(c => CSS.supports(c), c), c).toBe(decided);
  }
});

test('a rule inside @supports applies in the browser exactly where the analysis applies it', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.m{height:20px}';
  for (const c of ['(display: grid)', 'not (display: grid)', '(display: flex) and (gap: 1rem)', 'selector(:has(a))']) {
    const css = `${base}@supports ${c}{.m{height:30px}}`;
    const r = analyzeHTML('<html lang="en"><body><div class="m"></div></body></html>', {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    const model = Number(r.sizes.find(s => s.box === '.m' && s.rect).rect.blockSize.constant);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="m"></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.m').getBoundingClientRect().height), c).toBe(model);
  }
});
