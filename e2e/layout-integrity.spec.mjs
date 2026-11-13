// Differential eval: static integrity rules (whole viewport domain) versus
// `vlmkit check integrity` (runtime DOM + pixels at 1280/768/375). The static
// verdict for a rule at a width is "some finding's region holds that width".
// Browser runs only cross-check the model; they never accept source.
import {test, expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

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
  {name: 'badge-over-title', html: '<main class="card"><p class="title">Quarterly revenue report for every region and product line</p><span class="badge">NEW</span></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:38px;position:relative;block-size:40px;${paint}font:16px/20px sans-serif}.title{white-space:nowrap;overflow:hidden}.badge{display:block;position:absolute;top:4px;right:4px;inline-size:48px;block-size:20px;white-space:nowrap;background:#fd0}`,
    boxes: {'.title': {minInlineSize: 10, overflow: 'clip', overflowBlock: 'clip'}, '.badge': {minInlineSize: 10, overflow: 'clip', overflowBlock: 'clip'}}, soundOnly: ['text-collision']},
];
const rules = ['page-overflow-x', 'container-protrusion', 'clipped-content', 'text-collision'];
const holds = (row, width) => row.range && (row.range.minInclusive === false ? width > row.range.min : width >= row.range.min) && (row.range.maxInclusive === false ? width < row.range.max : width <= row.range.max)
  && (!row.heightRange || (height >= row.heightRange.min && height <= row.heightRange.max));

const table = [];
test.afterAll(() => {
  mkdirSync(results, {recursive: true});
  writeFileSync(new URL('report.json', results), JSON.stringify({version: 1, widths, height, rules, scope: 'Static integrity rules vs vlmkit check integrity (runtime). text-collision compares boxes statically and glyphs at runtime, so only runtime ⇒ static is required for it.', cases: table}, null, 2) + '\n');
});

for (const sample of cases) {
  test(`${sample.name}: static integrity agrees with vlmkit`, async () => {
    const css = reset + sample.css;
    const report = analyzeHTML(sample.html, {name: 'Case', css, viewport: {min: 375, max: 1280, height: {min: 600, max: 1000}}, integrity: true, ...(sample.boxes ? {boxes: sample.boxes} : {})});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    const staticRows = [...report.diagnostics, ...report.integrity.warnings].filter(row => row.rule);
    mkdirSync(results, {recursive: true});
    const file = new URL(`${sample.name}.html`, results);
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}${css}</style></head><body>${sample.html}</body></html>`);
    const run = spawnSync('pnpm', ['exec', 'vlmkit', 'check', 'integrity', file.pathname, '--viewports', widths.join(','), '--json'], {encoding: 'utf8', env: process.env});
    const runtime = JSON.parse(run.stdout).report.findings;
    const row = {name: sample.name, static: {}, runtime: {}};
    for (const rule of rules) for (const width of widths) {
      const s = staticRows.some(r => r.rule === rule && holds(r, width));
      const v = runtime.some(f => f.kind === rule && (f.viewports ?? [f.viewport]).includes(width));
      (row.static[rule] ??= []).push(s); (row.runtime[rule] ??= []).push(v);
      if (sample.soundOnly?.includes(rule)) { if (v) expect(s, `${rule} at ${width}: vlmkit reports it, the static check must too`).toBe(true); }
      else expect(s, `${rule} at ${width}: static ${s} vs vlmkit ${v}`).toBe(v);
    }
    table.push(row);
  });
}
