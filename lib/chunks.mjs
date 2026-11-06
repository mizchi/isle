import { planCodeLoad } from '../runtime/manifest.mjs';

/** Locations use 1-based lines/UTF-16 columns and 0-based UTF-16 offsets. */
export function sourceLocation(text, span, file) {
  const position = offset => {
    const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
    return { offset, line: lines.length, column: lines.at(-1).length + 1 };
  };
  return { file, start: position(span.start), end: position(span.end) };
}

/** A cold code closure excludes the bootstrap, HTML, RPC and unrelated dynamic imports. */
export function describeChunks(manifest) {
  return Object.entries(manifest.references).map(([id, ref]) => {
    const plan = planCodeLoad(manifest, [id]), chunk = manifest.chunks[ref.chunk];
    const closure = Object.values(manifest.chunks).filter(chunk => plan.modules.includes(chunk.url));
    const css = Object.values(manifest.styles ?? {}).filter(style => plan.styles?.includes(style.url));
    const assets = [...closure, ...css];
    return { id, location: ref.source && `${ref.source.file}:${ref.source.start.line}:${ref.source.start.column}`,
      event: ref.event, async: ref.async, loading: ref.loading ?? 'lazy',
      captureNames: ref.captureNames ?? [], writes: ref.writes ?? [], actions: ref.actions ?? [],
      bytes: chunk.bytes, gzipBytes: chunk.gzipBytes,
      coldGzipBytes: assets.every(asset => asset.gzipBytes !== undefined) ? assets.reduce((sum, asset) => sum + asset.gzipBytes, 0) : undefined,
      ...(css.length ? { styleGzipBytes: css.every(style => style.gzipBytes !== undefined) ? css.reduce((sum, style) => sum + style.gzipBytes, 0) : undefined } : {}),
      modules: plan.modules, ...(plan.styles ? { styles: plan.styles } : {}),
      ...(manifest.resolution ? { resolution: manifest.resolution.decisions.find(row => row.id === id) } : {}) };
  });
}
