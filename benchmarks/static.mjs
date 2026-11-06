import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { compile, requireIR } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';
import { size } from './metrics.mjs';
import { source, attributes, aliases, repeated } from './static-scenario.mjs';

const outputPath = process.argv[2] ?? 'benchmarks/results/static/latest.json';
const directory = await mkdtemp(join(tmpdir(), 'isle-static-size-'));
try {
  await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
  const rows = [];
  for (const [name, input, props] of [['Decorated', source, { initial: 'Draft' }], ['AttributeOnly', attributes, {}],
    ['Aliased', aliases, { base: 37 }], ['Repeated', repeated, { factor: 3 }]]) {
    const entry = join(directory, 'app.isle');
    await writeFile(entry, input);
    const component = requireIR(compile(input)).components[0], generated = generateComponent(component);
    const rendered = renderComponent(component, props);
    const result = await build({ configFile: false, root: directory, base: './', logLevel: 'silent',
      plugins: [isle({ entry, diagnostics: false, mounts: [{ component: name, props, label: name }] })], build: { write: false } });
    const html = result.output.find(output => output.fileName === 'index.html').source;
    const js = result.output.filter(output => output.type === 'chunk');
    const javascript = js.reduce((total, chunk) => {
      const measured = size(Buffer.from(chunk.code));
      return { raw: total.raw + measured.raw, gzip: total.gzip + measured.gzip };
    }, { raw: 0, gzip: 0 });
    const htmlSize = size(Buffer.from(html));
    const handler = generated.handlers[0], chunk = js.find(item => item.facadeModuleId?.endsWith(`isle-handler/${handler.id}`));
    if (!chunk || chunk.imports.length) throw new Error('Work-count fixture must have a standalone handler chunk');
    const module = await import(`data:text/javascript,${encodeURIComponent(chunk.code)}`);
    const values = handler.captures.map(index => rendered.snapshot[3][index]), slotReads = {};
    let textPatches = 0, attributePatches = 0;
    const observed = new Proxy(values, { get(target, key, receiver) {
      if (/^(0|[1-9][0-9]*)$/.test(String(key)) && Number(key) < handler.captureNames.length) {
        const name = handler.captureNames[Number(key)]; slotReads[name] = (slotReads[name] ?? 0) + 1;
      }
      return Reflect.get(target, key, receiver);
    } });
    await module.run(observed, (index, value) => { values[index] = value; }, () => textPatches++, () => attributePatches++);
    rows.push({ name, snapshotSlots: generated.fields.map(field => field.name),
      snapshot: size(Buffer.from(JSON.stringify(rendered.snapshot))), html: htmlSize, javascript,
      work: { slotReads, textPatches, attributePatches }, computations: handler.computations,
      assetTotal: { raw: htmlSize.raw + javascript.raw, gzip: htmlSize.gzip + javascript.gzip },
      chunks: js.map(chunk => ({ file: chunk.fileName, ...size(Buffer.from(chunk.code)) })) });
  }
  const report = { version: 1, description: 'Synthetic production build sizes; gzip level 6 per file. Work counts instrument slot reads in emitted handlers using a Proxy; not CPU timings.', rows };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
