// @property: where the analysis decides what var() of a registered custom property reads (inherits, initial-value,
// initial, unset, invalid values), the box is as tall in the browser as the analysis says.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const g = 'display:grid;grid-template-columns:minmax(0,1fr)';
const reg = (inherits, initial = '10px', syntax = '<length>') => `@property --h{syntax:"${syntax}";inherits:${inherits};${initial === null ? '' : `initial-value:${initial}`}}`;
const cases = [
  reg(false) + '.m{--h:40px}.k{height:var(--h)}',
  reg(true) + '.m{--h:40px}.k{height:var(--h)}',
  reg(false) + '.k{--h:30px;height:var(--h)}',
  reg(true, '15px') + '.k{height:var(--h)}',
  reg(true, '15px') + '.m{--h:40px}.k{--h:initial;height:var(--h)}',
  reg(false, '15px') + '.m{--h:40px}.k{--h:inherit;height:var(--h)}',
  reg(false, '15px') + '.m{--h:40px}.k{--h:unset;height:var(--h)}',
  reg(true, '15px') + '.m{--h:40px}.k{--h:unset;height:var(--h)}',
  // A value invalid at computed-value time (a reference without a value, a cycle): the property is unset.
  reg(true, '15px', '*') + '.k{--h:var(--missing);height:var(--h)}',
  reg(false, '15px', '*') + '.m{--h:40px}.k{--h:var(--missing);height:var(--h)}',
  reg(true, '15px', '*') + '.m{--h:40px}.k{--h:var(--missing);height:var(--h)}',
  reg(false, '12px', '*') + '.k{--h:var(--h);height:var(--h)}',
  reg(false, null, '*') + '.m{--h:40px}.k{height:var(--h,5px)}',
  reg(true, null, '*') + '.m{--h:40px}.k{height:var(--h,5px)}',
  reg(false) + '.m{--h:40px}.k{--a:var(--h);height:var(--a)}',
];

test('registered custom properties: the analysis gives the browser\'s height', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const c of cases) {
    const css = `*{margin:0}html,body,.m{${g}}${c}`;
    const r = analyzeHTML('<html lang="en"><body><div class="m"><div class="k"></div></div></body></html>', {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${c}: ${JSON.stringify(r.diagnostics.map(d => d.message))}`).not.toBe('unknown');
    const model = Number(r.sizes.find(s => s.box === '.k' && s.rect).rect.blockSize.constant);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="m"><div class="k"></div></div></body></html>`);
    expect(await page.evaluate(() => document.querySelector('.k').getBoundingClientRect().height), c).toBe(model);
  }
});
