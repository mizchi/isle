import { mkdir, writeFile } from 'node:fs/promises';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareComponent } from '../lib/codegen.mjs';
import { shell } from './shared/scenario.mjs';
import { source } from './static-scenario.mjs';

const component = prepareComponent(requireIR(compile(source)).components[0]);
const directory = 'benchmarks/results/static/visual';
await mkdir(directory, { recursive: true });
for (const mode of ['ssr', 'resume']) {
  const cards = ['Draft', ''].map((initial, index) => {
    const rendered = component.render({ initial }, { mode, scopeId: `s${index}` });
    return `<section class="card"><h2>Decorated ${index + 1}</h2>${rendered.html}${rendered.snapshotHtml}</section>`;
  }).join('');
  await writeFile(`${directory}/${mode}.html`, shell(`<div id="app">${cards}</div>`));
}
console.log('Wrote static SSR / resumable initial-display references. Interaction behavior is checked by Playwright.');
