// Differential eval: static integrity rules (whole viewport domain) versus
// `vlmkit check integrity` (runtime DOM + pixels at 1280/768/375). The static
// verdict for a rule at a width is "some finding's region holds that width".
// Browser runs only cross-check the model; they never accept source.
import {test, expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {loadTextMetrics} from '../packages/css-verifier/src/text-node.mjs';

// Text with a font-derived contract (ADR-0010) is compared by its painted line.
const fonts = new URL('../packages/css-verifier/text-metrics/fixtures/', import.meta.url);
const face = `@font-face{font-family:"Roboto";src:url(data:font/ttf;base64,${readFileSync(new URL('roboto-variable.ttf', fonts)).toString('base64')})}`;
const roboto = {family: 'Roboto', size: 16, lineHeight: 20, weight: 400};
const type = 'font-family:"Roboto";font-size:16px;line-height:20px;font-weight:400;';

const results = new URL('../evals/results/layout-integrity/', import.meta.url);
const widths = [1280, 768, 375], height = 800;
const reset = '*{box-sizing:border-box;margin:0;padding:0}';
const paint = 'background:#eef;border:1px solid #446;';
const cases = [
  {name: 'rigid-row', html: '<main class="row"><div class="a"></div><div class="b"></div></main>',
    css: `.row{display:flex;padding:0 16px;column-gap:8px;block-size:60px;${paint}}.a{flex:none;width:700px;block-size:40px;background:#cdf}.b{flex:none;width:100px;block-size:40px;background:#fdc}`,
    boxes: {'.row': {overflow: 'visible'}}},
  {name: 'fluid-row', html: '<main class="row"><div class="a"></div><div class="b"></div></main>',
    css: `.row{display:flex;padding:0 16px;column-gap:8px;block-size:60px;${paint}}.a{flex:1 1 0;min-width:0;block-size:40px;background:#cdf}.b{flex:2 1 0;min-width:0;block-size:40px;background:#fdc}`},
  {name: 'wrapping-cards', html: '<main class="row"><div class="c"></div><div class="c"></div><div class="c"></div></main>',
    css: `.row{display:flex;flex-wrap:wrap;gap:12px;padding:8px;${paint}}.c{flex:1 1 240px;min-width:0;block-size:50px;background:#cdf}`},
  {name: 'wide-grid-track', html: '<main class="grid"><div class="cell"></div><div class="cell"></div></main>',
    css: `.grid{display:grid;grid-template-columns:300px 300px;column-gap:20px;grid-template-rows:40px;${paint}}.cell{background:#cdf}`,
    boxes: {'.grid': {overflow: 'visible'}}},
  {name: 'clipped-strip', html: '<main class="frame"><div class="wide"></div></main>',
    css: `.frame{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px;overflow:hidden;${paint}}.wide{inline-size:900px;background:#cdf}`,
    boxes: {'.frame': {overflow: 'clip'}}},
  {name: 'badge-over-title', html: '<main class="card"><p class="title">Hello world office AV To WMW 0123456789 Hello world</p><span class="badge">AV</span></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:38px;position:relative;block-size:40px;${paint}}.title{white-space:nowrap;overflow:hidden;${type}}.badge{display:block;position:absolute;top:4px;right:4px;inline-size:48px;block-size:20px;white-space:nowrap;background:#fd0;${type}}`,
    text: {'.title': {text: {font: roboto, content: 'Hello world office AV To WMW 0123456789 Hello world'}, overflow: 'clip', overflowBlock: 'clip'}, '.badge': {text: {font: roboto, content: 'AV'}, overflow: 'clip', overflowBlock: 'clip'}}},
  {name: 'spilling-label', html: '<main class="row"><p class="a">Hello world office AV To WMW</p><p class="b">office 2019 office office</p></main>',
    css: `.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);${paint}}.a,.b{white-space:nowrap;${type}}`,
    // a (215.7px) spills into b (166.8px) only below 2 × 216.7: partly, so vlmkit's containment skip does not apply.
    text: {'.a': {text: {font: roboto, content: 'Hello world office AV To WMW'}, overflow: 'visible'}, '.b': {text: {font: roboto, content: 'office 2019 office office'}}}},
  {name: 'box-only-label', html: '<main class="card"><p class="title">Hello world</p><span class="badge">AV</span></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:38px;position:relative;block-size:40px;${paint}font:16px/20px sans-serif}.title{white-space:nowrap;overflow:hidden}.badge{display:block;position:absolute;top:4px;right:4px;inline-size:48px;block-size:20px;white-space:nowrap;background:#fd0}`,
    boxes: {'.title': {minInlineSize: 10, overflow: 'clip', overflowBlock: 'clip'}, '.badge': {minInlineSize: 10, overflow: 'clip', overflowBlock: 'clip'}}, soundOnly: ['text-collision']},
];
const rules = ['page-overflow-x', 'container-protrusion', 'clipped-content', 'text-collision'];
const holds = (row, width) => row.range && (row.range.minInclusive === false ? width > row.range.min : width >= row.range.min) && (row.range.maxInclusive === false ? width < row.range.max : width <= row.range.max)
  && (!row.heightRange || (height >= row.heightRange.min && height <= row.heightRange.max));

let metrics;
test.beforeAll(async () => { metrics = await loadTextMetrics({fonts: {Roboto: {file: new URL('roboto-variable.ttf', fonts).pathname}}}); });
const table = [];
test.afterAll(() => {
  mkdirSync(results, {recursive: true});
  writeFileSync(new URL('report.json', results), JSON.stringify({version: 1, widths, height, rules, scope: 'Static integrity rules vs vlmkit check integrity (runtime). Exempted overlays count on both sides; text-clipped counts as clipped-content. Text with a font-derived contract is compared by its painted line and must agree; other text is compared by its border box and only runtime ⇒ static is required.', cases: table}, null, 2) + '\n');
});

for (const sample of cases) {
  test(`${sample.name}: static integrity agrees with vlmkit`, async () => {
    const css = reset + sample.css;
    const boxes = sample.text ? metrics.resolveBoxes(sample.text) : sample.boxes;
    const report = analyzeHTML(sample.html, {name: 'Case', css, viewport: {min: 375, max: 1280, height: {min: 600, max: 1000}}, integrity: true, ...(boxes ? {boxes} : {})});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    // Exempted overlays count as detected on both sides (vlmkit lists them under "exempted").
    const staticRows = [...report.diagnostics, ...report.integrity.warnings, ...report.integrity.exempted].filter(row => row.rule);
    mkdirSync(results, {recursive: true});
    const file = new URL(`${sample.name}.html`, results);
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${sample.text ? face : ''}html,body{margin:0}${css}</style></head><body>${sample.html}</body></html>`);
    const run = spawnSync('pnpm', ['exec', 'vlmkit', 'check', 'integrity', file.pathname, '--viewports', widths.join(','), '--json'], {encoding: 'utf8', env: process.env});
    const parsed = JSON.parse(run.stdout).report;
    const runtime = [...parsed.findings, ...(parsed.exempted ?? []).filter(e => e.kind === 'text-collision')];
    const row = {name: sample.name, static: {}, runtime: {}};
    for (const rule of rules) for (const width of widths) {
      const s = staticRows.some(r => r.rule === rule && holds(r, width));
      const v = runtime.some(f => f.kind === rule && (f.viewports ?? [f.viewport]).includes(width));
      // vlmkit's text-clipped is the text form of clipped-content.
      const clippedText = rule === 'clipped-content' && runtime.some(f => f.kind === 'text-clipped' && (f.viewports ?? [f.viewport]).includes(width));
      (row.static[rule] ??= []).push(s); (row.runtime[rule] ??= []).push(v || clippedText);
      if (sample.soundOnly?.includes(rule)) { if (v) expect(s, `${rule} at ${width}: vlmkit reports it, the static check must too`).toBe(true); }
      else expect(s, `${rule} at ${width}: static ${s} vs vlmkit ${v || clippedText}`).toBe(v || clippedText);
    }
    table.push(row);
  });
}
