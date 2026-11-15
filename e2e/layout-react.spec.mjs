// The React adapter against the real styles: StyleX's own compiled CSS (atomic classes) and Linaria's templates
// (kept nested, for the browser's native CSS nesting), with react-dom/server's markup for each state, laid out in
// Chromium and compared box by box (by tree path: the class names differ) with the static analysis.
import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {analyzeReact} from '../packages/react-adapter/src/index.mjs';
import {compileStylex, compileLinaria, render} from '../packages/react-adapter/test/ssr.mjs';

const fixture = name => readFileSync(new URL(`../packages/react-adapter/fixtures/${name}`, import.meta.url), 'utf8');
const pageCSS = '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}body{margin:0}';
const viewport = {min: 320, max: 800, height: {min: 600, max: 900}};
const propsOf = c => Object.fromEntries(Object.entries(c).map(([k, v]) => k.startsWith('#map ') ? [k.slice(5), Array.from({length: v}, (_, i) => i)] : [k, v]));
const n = t => { const [a, b = '1'] = String(t ?? '0').split('/'); return Number(a) / Number(b); };

for (const [file, compile] of [['StylexCard.jsx', compileStylex], ['LinariaCard.jsx', compileLinaria]]) {
  test(`${file}: every state's boxes (position and size) agree with Chromium on the real styles`, async ({page}) => {
    const source = fixture(file), {code, css} = compile(source);
    const report = analyzeReact(source, {pageCSS, viewport});
    let compared = 0;
    for (const width of [360, 700]) {
      await page.setViewportSize({width, height: 700});
      for (const state of report.states) {
        await page.setContent(`<!doctype html><html lang="en"><head><style>${pageCSS}${css}</style></head><body>${await render(code, propsOf(state.choices))}</body></html>`);
        for (const row of state.report.sizes.filter(r => r.rect && r.path.split('/').length > 2)) {
          const v = x => n(x.constant) + width * n(x.coefficient) + 700 * n(x.heightCoefficient);
          if (!(width >= row.range.min && width <= row.range.max)) continue;
          const box = await page.evaluate(path => { let e = document.body; for (const i of path.split('/').slice(2)) e = e.children[Number(i)]; const r = e?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height]; }, row.path);
          expect(box, `${file} ${JSON.stringify(state.choices)} ${row.path} at ${width}`).toEqual([v(row.rect.inlineStart), v(row.rect.blockStart), v(row.rect.inlineSize), v(row.rect.blockSize)]);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(20);
  });
}
