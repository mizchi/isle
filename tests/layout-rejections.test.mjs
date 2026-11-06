import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../evals/scenarios/layout-rejections/cases.mjs';
import { evaluateLayoutRejections } from '../tools/layout-rejections.mjs';

test('rejection examples exercise real CLI diagnostics and a verified counterpart for every case', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-rejections-'));
  try {
    const report = await evaluateLayoutRejections(cases, directory);
    assert.equal(report.pass, true, JSON.stringify(report.cases.filter(c => !c.pass)));
    assert.equal(report.cases.length, 14);
    assert.equal(report.cases.filter(c => c.reject.status === 'violated').length, 6);
    assert.equal(report.cases.filter(c => c.reject.status === 'unknown').length, 8);
    for (const result of report.cases) {
      assert.equal(result.reject.exitCode, 1);
      assert.equal(result.accept.exitCode, 0);
      assert.equal(result.accept.status, 'verified');
      const config = JSON.parse(await readFile(join(directory, result.id, 'reject/layout.json'), 'utf8'));
      assert.equal(config.css, './app.css');
      assert.ok(result.reject.diagnostics.some(d => d.code === result.expected.code));
    }
    const container = report.cases.find(c => c.id === 'container-breakpoint');
    assert.equal(container.reject.matched.range.minExact, '632');
    assert.equal(container.reject.matched.range.maxExact, '648');
    assert.equal(container.reject.matched.range.maxInclusive, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the example runner fails when the expected category, code or counterpart drifts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-rejection-drift-'));
  try {
    const original = cases[0];
    for (const changed of [
      { ...original, expected: { ...original.expected, status: 'unknown' } },
      { ...original, expected: { ...original.expected, code: 'E_LAYOUT_WRONG' } },
      { ...original, accept: original.reject },
      { ...original, reject: { ...original.reject, source: 'component Broken() { await nope(); }' } },
    ]) assert.equal((await evaluateLayoutRejections([changed], directory)).pass, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('case identifiers cannot collide or escape the generated example directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-rejection-ids-'));
  try {
    await assert.rejects(evaluateLayoutRejections([cases[0], cases[0]], directory), /duplicate/i);
    await assert.rejects(evaluateLayoutRejections([{ ...cases[0], id: '../escape' }], directory), /identifier/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
