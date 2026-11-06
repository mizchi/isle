import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { compileFile, requireIR } from '../lib/compiler.mjs';
import { generateComponent } from '../lib/codegen.mjs';

const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
const html = await readFile('dist/index.html', 'utf8');
const files = [...new Set(['index.html', ...Object.values(manifest).map(item => item.file)])];
const assets = [];
for (const file of files) {
  const data = await readFile(`dist/${file}`);
  assets.push({ file, bytes: data.length, gzipBytes: gzipSync(data).length });
}
const javascript = (await Promise.all(files.filter(file => file.endsWith('.js')).map(file => readFile(`dist/${file}`, 'utf8')))).join('\n');
const snapshots = [...html.matchAll(/<script type="application\/json" data-isle-snapshot="[^"]+">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const components = requireIR(await compileFile('examples/counter/app.isle')).components.map(generateComponent);
const runtimeEntry = manifest[manifest['index.html'].dynamicImports[0]];
const report = {
  version: 1, description: 'Single local production demo; byte baseline, not a comparative performance benchmark.', assets,
  loaderEntries: manifest['index.html'].dynamicImports.map(id => ({ id, file: manifest[id].file })),
  dynamicEntries: runtimeEntry.dynamicImports.map(id => ({ id, file: manifest[id].file })),
  snapshotSlots: snapshots.map(snapshot => ({ scope: snapshot[2], fields: components.find(component => component.schemaId === snapshot[1]).fields.map(field => field.name) })),
  serverSymbolStringsAbsent: !javascript.includes('policy.documentEditor') && !javascript.includes('documents.rename'),
};
if (report.dynamicEntries.length !== 2 || !report.serverSymbolStringsAbsent || report.snapshotSlots.some(s => s.fields.includes('unused'))) throw new Error('Unexpected generated demo build graph');
await mkdir('evals/results', { recursive: true });
await writeFile('evals/results/build.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ dynamicEntries: report.dynamicEntries.length, serverSymbolStringsAbsent: report.serverSymbolStringsAbsent, report: 'evals/results/build.json' }));
