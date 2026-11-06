import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHeavyCase } from '../benchmarks/heavy-render/build.mjs';
import { createHeavyServer } from '../benchmarks/heavy-render/serve.mjs';
import { checkHeavyCase } from '../benchmarks/heavy-render/check.mjs';

test('catalog work predictions match native DOM mutations without restoring sibling owners', async ({ browser }) => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-heavy-browser-'));
  let server;
  try {
    const entry = await buildHeavyCase(32, { directory });
    server = await createHeavyServer([entry]);
    const report = await checkHeavyCase(browser, server, entry);
    expect(report.pass).toBe(true);
    expect(report.operations[0].textMutations).toBe(97);
    expect(report.operations[0].attributeMutations).toBe(32);
    expect(report.operations[0].bindingQueries).toBe(32);
    expect(report.operations[1].bindingQueryMs).toBe(0);
  } finally { await server?.close(); await rm(directory, { recursive: true, force: true }); }
});
