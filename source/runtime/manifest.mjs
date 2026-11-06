import { codeRef, createCodeResolver } from './code-ref.mjs';

/** Select only required references and static import dependencies, with URL deduplication. */
export function planCodeLoad(manifest, ids) {
  if (manifest?.version !== 1) throw new Error('Unsupported code manifest version');
  const references = [], modules = new Set(), styles = new Set(), seenRefs = new Set(), seenChunks = new Set();
  function chunk(file) {
    if (seenChunks.has(file)) return;
    if (!Object.hasOwn(manifest.chunks, file)) throw new Error(`Unknown code chunk: ${file}`);
    seenChunks.add(file);
    const entry = manifest.chunks[file];
    for (const dependency of entry.imports) chunk(dependency);
    for (const file of entry.styles ?? []) {
      if (!manifest.styles || !Object.hasOwn(manifest.styles, file)) throw new Error(`Unknown code style: ${file}`);
      styles.add(manifest.styles[file].url);
    }
    modules.add(entry.url);
  }
  function reference(id) {
    if (seenRefs.has(id)) return;
    if (!Object.hasOwn(manifest.references, id)) throw new Error(`Unknown code reference: ${id}`);
    seenRefs.add(id);
    const entry = manifest.references[id], ref = codeRef(...entry.ref);
    if (manifest.chunks[entry.chunk]?.url !== ref[0]) throw new Error(`Code reference/chunk mismatch: ${id}`);
    for (const dependency of entry.requires) reference(dependency);
    chunk(entry.chunk); references.push(id);
  }
  for (const id of ids) reference(id);
  return { references, modules: [...modules], ...(styles.size ? { styles: [...styles] } : {}) };
}

/** Evaluate modules and check exports, without invoking any referenced function. */
export async function eagerLoad(manifest, { baseURL, ids = manifest.loading.eager, importModule, loadStyle } = {}) {
  const plan = planCodeLoad(manifest, ids), resolver = createCodeResolver(baseURL, importModule);
  if (plan.styles?.length) {
    if (!loadStyle) throw new Error('A style loading adapter is required');
    await Promise.all(plan.styles.map(url => loadStyle(new URL(url, baseURL).href)));
  }
  await Promise.all(plan.references.map(id => resolver.resolve(manifest.references[id].ref)));
}
