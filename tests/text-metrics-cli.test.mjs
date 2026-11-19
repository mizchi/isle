// Font-derived text contracts through the isle CLI (the measurement itself is tested in @mizchi/veriss).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const fixtures = new URL('../node_modules/@mizchi/veriss/text-metrics/fixtures/', import.meta.url).pathname;
const layout = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', 'layout', ...args], {encoding: 'utf8'});

test('the CLI example reports the overflow interval and how many characters still fit', () => {
  const result = layout('examples/layout-contracts/text-fonts.isle', 'examples/layout-contracts/text-fonts.json');
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'violated');
  const name = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.name');
  assert.equal(name.range.maxExact, '17921/64'); // 48 + 8 + 32 + 12 × 16 + 1/64
  assert.equal(name.text.maxLength, 12);
  assert.ok(name.text.fitsUpTo < 12);
  const summary = layout('examples/layout-contracts/text-fonts.isle', 'examples/layout-contracts/text-fonts.json', '--summary').stdout;
  assert.match(summary, /text: up to \d+ of 12 characters fit here \(widest "日"\)/);
  assert.match(summary, /derived from Noto Sans JP 16px\/400 12 × "日"/);
});

test('CSS that does not use the measured font makes the result unknown, not verified', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-text-fonts-'));
  try {
    for (const file of ['text-fonts.isle', 'text-fonts.json']) await copyFile(`examples/layout-contracts/${file}`, join(directory, file));
    const config = JSON.parse(await readFile(join(directory, 'text-fonts.json'), 'utf8'));
    config.fonts['Noto Sans JP'].file = fixtures + 'japanese-variable.ttf';
    config.viewport.min = 300;
    await writeFile(join(directory, 'text-fonts.json'), JSON.stringify(config));
    const css = await readFile('examples/layout-contracts/text-fonts.css', 'utf8');
    await writeFile(join(directory, 'text-fonts.css'), css);
    const run = () => JSON.parse(layout(join(directory, 'text-fonts.isle'), join(directory, 'text-fonts.json')).stdout);
    assert.equal(run().status, 'verified');
    await writeFile(join(directory, 'text-fonts.css'), css.replace('font-size: 16px;', 'font-size: 18px;'));
    const report = run();
    assert.equal(report.status, 'unknown');
    assert.ok(report.diagnostics.some(d => d.code === 'U_LAYOUT_TEXT_FONT' && /font-size 18px differs/.test(d.message)));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('the wrapping CLI example reports where the body needs a third line', () => {
  const result = layout('examples/layout-contracts/text-wrap.isle', 'examples/layout-contracts/text-wrap.json');
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  const body = report.diagnostics.find(d => d.code === 'E_LAYOUT_CONTENT' && d.box === '.body');
  assert.equal(body.axis, 'block');
  assert.equal(body.range.maxExact, '14247/64');
  assert.deepEqual(body.text, {lines: 3, fitsLines: 2});
  assert.equal(report.diagnostics.filter(d => d.severity === 'error').length, 1); // the auto title row grows with its lines
  assert.match(layout('examples/layout-contracts/text-wrap.isle', 'examples/layout-contracts/text-wrap.json', '--summary').stdout, /text: wraps into 3 lines at this width; 2 fit/);
});
