import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';

test('cost sidecar adds zero bytes to normal JS/HTML; debug data is inert and references final assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-cost-build-'));
  try {
    const entry = join(directory, 'app.isle');
    await writeFile(entry, `client component Counter(initial: number) { state n = initial;
      <div><button>on click up { n += 1; }{n}</button><button>on click down { n -= 1; }{n}</button></div> }`);
    await writeFile(join(directory, 'index.html'), '<html><head></head><body><!--isle:ssr--></body></html>');
    const compile = options => build({ configFile: false, root: directory, logLevel: 'silent', plugins: [isle({ entry,
      mounts: [{ component: 'Counter', props: { initial: 9382571 }, label: 'Counter' }, { component: 'Counter', props: { initial: 9382572 }, label: 'Counter' }], diagnostics: false, ...options,
    })], build: { write: false } });
    const disabled = (await compile({ cost: false })).output;
    const normal = (await compile({})).output;
    const chunks = output => output.filter(item => item.type === 'chunk').map(({ fileName, code }) => ({ fileName, code }));
    const html = output => String(output.find(item => item.fileName === 'index.html').source);
    const read = (output, name) => JSON.parse(output.find(item => item.fileName === name).source);
    assert.ok(!disabled.some(item => item.fileName === 'isle.cost.json'));
    assert.deepEqual(chunks(normal), chunks(disabled));
    assert.equal(html(normal), html(disabled));
    assert.ok(!/CostSummary|textPatchCalls|binaryOperations|cost-plan|data-isle-cost/.test(chunks(normal).map(item => item.code).join('\n')));
    const report = read(normal, 'isle.cost.json'), manifest = read(normal, 'isle.manifest.json');
    assert.equal(report.buildId, manifest.buildId);
    assert.equal(report.entries[0].location.file, 'app.isle');
    assert.equal(report.entries[0].instances, 2);
    assert.ok(!JSON.stringify(report).includes(directory));
    assert.ok(!JSON.stringify(report).includes('9382571'));
    const entryCost = report.entries[0];
    const closure = normal.filter(item => item.type === 'chunk' && entryCost.code.modules.includes(`/${item.fileName}`));
    assert.equal(entryCost.code.gzipBytes, closure.reduce((sum, item) => sum + gzipSync(item.code, { level: 6 }).byteLength, 0));
    assert.equal(report.code.gzipBytes, entryCost.code.gzipBytes, 'sibling handlers and repeated mounts share physical assets');
    const debug = (await compile({ diagnostics: true })).output;
    const embedded = /<script[^>]*data-isle-cost="1"[^>]*>([\s\S]*?)<\/script>/.exec(html(debug));
    assert.ok(embedded);
    assert.deepEqual(JSON.parse(embedded[1]), read(debug, 'isle.cost.json'));
    assert.ok(!/textPatchCalls|binaryOperations|cost-plan/.test(chunks(debug).map(item => item.code).join('\n')));
    await assert.rejects(compile({ cost: { budgets: [{ entry: 'Counter.up', metric: 'textPatchCalls', max: 1 }] } }), /cost budget/i);
    const ssr = (await compile({ mode: 'ssr', diagnostics: true })).output;
    assert.equal(ssr.filter(item => item.type === 'chunk').length, 0);
    assert.deepEqual(read(ssr, 'isle.cost.json').entries, []);
    assert.ok(!html(ssr).includes('<script'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
