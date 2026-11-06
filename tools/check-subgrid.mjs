import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeLayout } from '../lib/layout.mjs';

const directory = new URL('../examples/layout-contracts/', import.meta.url);
const source = await readFile(new URL('subgrid.isle', directory), 'utf8');
const css = await readFile(new URL('subgrid.css', directory), 'utf8');
const options = JSON.parse(await readFile(new URL('subgrid.json', directory), 'utf8'));
const variants = [
  { id: 'both', source, css },
  { id: 'small-gap', source, css: css + '.group { gap: 8px; }' },
  { id: 'large-gap', source, css: css + '.group { gap: 24px; }' },
  { id: 'nested', source: source.replace('<div class="a">A</div><div class="b">B</div>', '<section class="inner"><div class="a">A</div><div class="b">B</div></section>'),
    css: css + '.inner { display:grid; grid-template-columns:subgrid; grid-template-rows:subgrid; grid-column:1 / 3; grid-row:1 / 3; padding:4px; border:1px solid #345; }' },
  { id: 'media', source, css: css + '@media (width < 600px) { .group { grid-template-columns: minmax(0, 1fr); } .a, .b { grid-column: 1; } }' },
  { id: 'container', source, css: css + '.board { container: Board / inline-size; } @container Board (width >= 576px) { .group { gap: 24px; } }' },
  { id: 'height', source, css: css + '.board { block-size:100%; }', height: true },
  { id: 'content-box', source, css: css + '.group { box-sizing:content-box; }' },
];
const independent = { id: 'independent-control', source, css: css + '.group { grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); column-gap:0; }' };
const contained = { id: 'contained-control', source, css: css + '.group { container: Group / inline-size; } @container Group (width >= 390px) { .b { padding:4px; } }', expected:'unknown' };
const html = row => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subgrid layout</title><style>
html { color:#222; background:#fafafa; font:16px/1.5 system-ui,sans-serif; }
body { padding:16px; } h1 { font-size:24px; margin-bottom:16px; } .info { margin-top:16px; }
${row.css}
${row.height ? '.host { block-size:calc(100vh - 160px); }' : ''}
</style></head><body><h1>Subgrid layout</h1><div class="host">${row.html}</div><p class="info">Columns and rows share their parent tracks.</p></body></html>`;
const rational = value => { const [n, d = 1] = value.split('/').map(Number); return n / d; };
const at = (value, width, height) => rational(value.coefficient) * width + rational(value.heightCoefficient ?? '0') * height + rational(value.constant);
const contains = (range, value) => range.min <= value && value <= range.max && (range.min !== value || range.minInclusive) && (range.max !== value || range.maxInclusive);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= .04, `${message}: ${actual} vs ${expected}`);

async function main() {
  const reports = [], observations = [], quality = [];
  const model = JSON.parse(execFileSync('moon', ['run', 'cmd/subgrid-model', '--target', 'js'], { encoding: 'utf8' }));
  assert.ok(model.complete && model.strict_safe && model.independent_counterexample_replayed);
  for (const row of [...variants, independent, contained]) {
    const ir = requireIR(compile(row.source));
    row.report = analyzeLayout(ir, { ...options, css: row.css });
    assert.equal(row.report.status, row.expected ?? 'verified', `${row.id}: ${JSON.stringify(row.report.diagnostics)}`);
    row.html = prepareProgram(ir).render('SubgridBoard', {}, { mode: 'ssr' }).html;
    reports.push({ id: row.id, analysis: row.report });
  }
  const rejected = analyzeLayout(requireIR(compile(source)), { ...options, css: css + '.b { grid-column:3; }' });
  assert.equal(rejected.status, 'violated');
  assert.ok(rejected.diagnostics.some(row => row.code === 'E_LAYOUT_SUBGRID_PLACEMENT'));
  const unknown = analyzeLayout(requireIR(compile(source)), { ...options, css: css + '.board { grid-template-rows:auto auto; }' });
  assert.equal(unknown.status, 'unknown');
  assert.ok(unknown.diagnostics.some(row => row.code === 'U_LAYOUT_SUBGRID'));
  const server = createServer((request, response) => {
    const row = [...variants, independent, contained].find(row => request.url === `/${row.id}/`);
    if (!row) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html(row));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let control;
  let containment;
  let modelWitness;
  let emptyGrid;
  try {
    browser = await chromium.launch();
    for (const row of variants) {
      for (const width of [320, 375, 599, 600, 607, 608, 609, 1280]) for (const height of [600, 900]) {
        const page = await browser.newPage({ viewport: { width, height } }), errors = [], requests = [];
        try {
          page.on('pageerror', error => errors.push(error.message));
          page.on('request', request => { if (request.resourceType() === 'script') requests.push(request.url()); });
          await page.addInitScript(() => {
            window.shifts = []; new PerformanceObserver(list => window.shifts.push(...list.getEntries().map(entry => entry.value))).observe({ type: 'layout-shift', buffered: true });
          });
          await page.goto(`${url}/${row.id}/`);
          await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const geometry = await page.evaluate(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
            const boxes = Object.fromEntries(['.board', '.group', '.inner', '.a', '.b', '.peer'].filter(selector => document.querySelector(selector)).map(selector => [selector, rect(document.querySelector(selector))]));
            const board = getComputedStyle(document.querySelector('.board'));
            const columns = board.gridTemplateColumns.split(' ').map(parseFloat), rows = board.gridTemplateRows.split(' ').map(parseFloat);
            return { boxes, columnGap:parseFloat(board.columnGap), rowGap:parseFloat(board.rowGap), columns, rows, shifts:window.shifts,
              sharedColumns:getComputedStyle(document.querySelector('.group')).gridTemplateColumns.startsWith('subgrid'),
              overflow:document.documentElement.scrollWidth > innerWidth };
          });
          for (const size of row.report.sizes.filter(size => contains(size.range, width) && contains(size.heightRange, height))) {
            const actual = geometry.boxes[size.box]; assert.ok(actual, size.box);
            close(actual.width, at(size.inlineSize, width, height), `${row.id}/${width}/${height}/${size.box}/inline`);
            close(actual.height, at(size.blockSize, width, height), `${row.id}/${width}/${height}/${size.box}/block`);
          }
          const { '.a': a, '.b': b, '.board': parent } = geometry.boxes;
          if (geometry.sharedColumns) close((a.right + b.x) / 2, parent.x + geometry.columns[0] + geometry.columnGap / 2, `${row.id}: shared column line`);
          close((a.bottom + b.y) / 2, parent.y + geometry.rows[0] + geometry.rowGap / 2, `${row.id}: shared row line`);
          assert.deepEqual(errors, []); assert.deepEqual(requests, []); assert.deepEqual(geometry.shifts, []); assert.equal(geometry.overflow, false);
          observations.push({ id: row.id, width, height, ...geometry });
          if ([375, 1280].includes(width) && height === 900) await page.screenshot({ path: `.subgrid/screenshots/${row.id}-${width}.png`, fullPage: true });
        } finally { await page.close(); }
      }
      console.log(`${row.id}: symbolic sizes and shared lines match 16 browser cases; JS=0, shifts=0`);
    }
    const page = await browser.newPage({ viewport: { width:375, height:900 } });
    try {
      await page.goto(`${url}/independent-control/`);
      control = await page.evaluate(() => {
        const a = document.querySelector('.a').getBoundingClientRect(), b = document.querySelector('.b').getBoundingClientRect();
        const parent = document.querySelector('.board'), rect = parent.getBoundingClientRect(), style = getComputedStyle(parent);
        const expected = rect.x + parseFloat(style.gridTemplateColumns) + parseFloat(style.columnGap) / 2;
        return { expected, actual:(a.right + b.x) / 2 };
      });
      assert.ok(Math.abs(control.actual - control.expected) > .04, 'Negative control must expose a nonshared internal line, even if outer width fits');
      console.log(`independent-control: shared-line mismatch detected (${Math.abs(control.actual - control.expected)}px)`);
    } finally { await page.close(); }
    const containedPage = await browser.newPage({ viewport: { width:320, height:600 } });
    try {
      await containedPage.goto(`${url}/contained-control/`);
      containment = await containedPage.evaluate(() => ({ containerType:getComputedStyle(document.querySelector('.group')).containerType,
        firstChildWidth:document.querySelector('.a').getBoundingClientRect().width }));
      // A regression witness for this recorded browser, not an assertion that
      // future engines must keep the older layout-containment behavior.
      containment.sharedWidthWithoutContainment = 71;
      containment.sameAsShared = Math.abs(containment.firstChildWidth - 71) <= .04;
      assert.equal(contained.report.status, 'unknown');
      console.log(`contained-control: unknown; browser first track ${containment.firstChildWidth}px vs shared 71px`);
    } finally { await containedPage.close(); }
    const witnessPage = await browser.newPage();
    try {
      const configuration = model.witness.at(-1);
      const expected = model.cases.find(row => JSON.stringify(row.configuration) === JSON.stringify(configuration)).doubled.map(value => value / 2);
      await witnessPage.setContent(`<style>*{box-sizing:border-box;margin:0}.parent{display:grid;width:14px;grid-template-columns:4px 8px;column-gap:2px}.shared,.independent{display:grid;grid-column:1 / span 2;column-gap:0}.shared{grid-template-columns:subgrid}.independent{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}</style><div class="parent"><div class="shared"><div></div><div></div></div><div class="independent"><div></div><div></div></div></div>`);
      modelWitness = await witnessPage.evaluate(() => Object.fromEntries(['shared','independent'].map(name => [name, [...document.querySelector(`.${name}`).children].map(node => node.getBoundingClientRect().width)])));
      expected.forEach((size, index) => close(modelWitness.shared[index], size, 'Finite model witness in native subgrid'));
      assert.notDeepEqual(modelWitness.independent, expected, 'Native standalone grid must reproduce the model counterexample');
      modelWitness.configuration = configuration;
      console.log('finite model witness: native subgrid 5/9px vs standalone 7/7px reproduced');
      const emptySource = 'component SubgridBoard() { <main class="board"><section class="group"></section></main> }';
      const emptyCSS = '*{box-sizing:border-box;margin:0}.board{display:grid;grid-template-columns:100px}.group{display:grid;grid-template-columns:subgrid;grid-template-rows:100px}';
      const emptyIR = requireIR(compile(emptySource));
      const analysis = analyzeLayout(emptyIR, { component:'SubgridBoard', css:emptyCSS, viewport:{min:1280,max:1280,height:{min:720,max:720}} });
      assert.equal(analysis.status, 'verified', JSON.stringify(analysis.diagnostics));
      await witnessPage.setContent(`<style>${emptyCSS}</style>${prepareProgram(emptyIR).render('SubgridBoard', {}, {mode:'ssr'}).html}`);
      const actual = await witnessPage.locator('.group').evaluate(node => node.getBoundingClientRect().height);
      close(actual, at(analysis.sizes.find(row => row.box === '.group').blockSize, 1280, 720), 'Empty subgrid explicit row');
      emptyGrid = { analysis, actualHeight:actual };
      console.log('empty subgrid: native explicit 100px row contributes to parent auto height');
    } finally { await witnessPage.close(); }
    const binary = fileURLToPath(new URL('../node_modules/.bin/vlmkit', import.meta.url));
    for (const task of [
      ['check', 'integrity'], ['check', 'copy', '--manifest', 'evals/scenarios/layout-subgrid/copy.txt'],
      ['scan', 'scroll'], ['scan', 'handlers'], ['check', 'interactions'],
      ['check', 'responsive', '--min-width', '320', '--max-width', '1280', '--runs', '24'],
    ]) {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(binary, [...task.slice(0, 2), `${url}/both/`, ...task.slice(2), '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = ''; child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
        child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
      });
      const report = JSON.parse(result.stdout); quality.push({ command: task.join(' '), ...report });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      console.log(`${task.join(' ')}: ${report.verdict}`);
    }
    await mkdir('evals/results/layout-subgrid', { recursive: true });
    const result = { measuredAt: new Date().toISOString(), browser: browser.version(), model, reports, rejected, unknown, control, containment, modelWitness, emptyGrid, observations, quality };
    await writeFile('evals/results/layout-subgrid/full.json.gz', gzipSync(JSON.stringify(result)));
    await writeFile('evals/results/layout-subgrid/latest.json', JSON.stringify({ ...result, detail:'summary; complete symbolic checks in full.json.gz',
      reports:reports.map(({ id, analysis }) => ({ id, status:analysis.status, scope:analysis.scope, subgrids:analysis.subgrids, diagnostics:analysis.diagnostics })),
    }, null, 2) + '\n');
  } finally { await browser?.close(); await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
