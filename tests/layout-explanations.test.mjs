// ADR-0002: CLI summaries cite the CSS that produced both sides of a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {formatLayoutSummary, explanationLines} from '../lib/layout-summary.mjs';

const run = (...args) => { try { return execFileSync(process.execPath, ['tools/isle.mjs', 'layout', ...args], {encoding: 'utf8'}); } catch (error) { return error.stdout; } };

test('the overflow example summary separates the parent allocation from the child requirement', () => {
  const summary = run('examples/layout-contracts/app.isle', 'examples/layout-contracts/overflow.json', '--summary');
  const inline = summary.split('\n').findIndex(line => line.includes('on inline axis'));
  const offered = summary.split('\n').slice(inline).find(line => line.startsWith('  offered by:'));
  const required = summary.split('\n').slice(inline).find(line => line.startsWith('  required by:'));
  assert.match(offered, /\.panel grid-template-columns: minmax\(0, 1fr\) \(\S*overflow\.css:4\)/);
  assert.match(offered, /\.panel padding-left: 16px/);
  assert.doesNotMatch(offered, /\.copy (?:inline-size|padding)/);
  assert.match(required, /\.copy box-sizing: content-box \(\S*overflow\.css:14\)/);
  assert.match(required, /\.copy inline-size: 100%/);
});

test('the JSON report is unchanged apart from the added explanation field', () => {
  const report = JSON.parse(run('examples/layout-contracts/app.isle', 'examples/layout-contracts/overflow.json'));
  assert.equal(report.status, 'violated');
  for (const finding of report.diagnostics.filter(d => d.severity === 'error')) assert.equal(finding.explanation?.version, 1, finding.code);
  const verified = JSON.parse(run('examples/layout-contracts/app.isle', 'examples/layout-contracts/layout.json'));
  assert.equal(verified.status, 'verified');
});

test('explanation text is bounded and treats CSS strings as plain text', () => {
  const css = {file: 'a.css', line: 1, selector: '.x', specified: '<img onerror=x>'};
  const facts = Array.from({length: 9}, (_, i) => ({path: 'P', box: '.x', property: `p${i}`, value: '1px', origin: 'author', css}));
  const lines = explanationLines({version: 1, available: {facts}, required: {facts: []}}, 4);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /… 5 more$/);
  assert.ok(lines[0].includes('<img onerror=x>'));
  assert.deepEqual(explanationLines(undefined), []);
  assert.match(formatLayoutSummary({status: 'verified', diagnostics: []}, {file: 'f', source: ''}), /verified/);
});
