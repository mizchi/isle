import { planCodeLoad } from '../runtime/manifest.mjs';

export const DEFAULT_AUTO_PRELOAD_GZIP_BYTES = 8192;
const modes = ['auto', 'lazy', 'preload', 'eager'];
export function validatePreloadBudget(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid automatic preload gzip byte budget');
}

/** The event is a latency hint, never permission to evaluate code or invoke a handler. */
export function loadingPriority({ event }) {
  return ['input', 'change'].includes(event) ? 0 : ['submit', 'invalid'].includes(event) ? 1 : undefined;
}

/** Build-only greedy planning over final physical JS/CSS assets. Explicit policies remain authoritative.
 * The budget counts only additional automatic preloads, not manual preload/eager closures.
 */
export function planLoading(manifest, policies, { gzipBytes = DEFAULT_AUTO_PRELOAD_GZIP_BYTES } = {}) {
  validatePreloadBudget(gzipBytes);
  for (const [id, mode] of policies) {
    if (!Object.hasOwn(manifest.references, id)) throw new Error(`Unknown code reference: ${id}`);
    if (!modes.includes(mode)) throw new Error(`Unknown code loading policy: ${mode}`);
  }
  const rows = Object.entries(manifest.references).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, entry]) => ({
    ...planCodeLoad(manifest, [id]), id, requested: policies.get(id) ?? 'lazy',
    priority: entry.kind === 'handler' ? loadingPriority(entry) : undefined,
  }));
  const eager = [...policies].filter(([, mode]) => mode === 'eager').map(([id]) => id);
  const preload = [...policies].filter(([, mode]) => mode === 'preload').map(([id]) => id);
  if (!rows.some(row => row.requested === 'auto')) return { eager, preload };
  const baseline = planCodeLoad(manifest, [...eager, ...preload]);
  const resident = new Set([...baseline.modules, ...baseline.styles ?? []]);
  const chunks = new Map([...Object.values(manifest.chunks), ...Object.values(manifest.styles ?? {})].map(chunk => [chunk.url, chunk]));
  const cost = row => {
    let bytes = 0;
    for (const url of [...row.modules, ...row.styles ?? []]) if (!resident.has(url)) {
      const chunk = chunks.get(url), size = chunk?.gzipBytes;
      if (chunk?.externalImports?.length || !Number.isSafeInteger(size) || size < 0 || bytes > Number.MAX_SAFE_INTEGER - size) return null;
      bytes += size;
    }
    return bytes;
  };
  let usedGzipBytes = 0;
  const selected = new Map();
  const candidates = rows.filter(row => row.requested === 'auto' && row.priority !== undefined);
  for (;;) {
    const eligible = candidates.filter(row => !selected.has(row.id)).map(row => ({ row, bytes: cost(row) }))
      .filter(({ bytes }) => bytes !== null && bytes <= gzipBytes - usedGzipBytes)
      .sort((a, b) => a.row.priority - b.row.priority || a.bytes - b.bytes || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
    if (!eligible.length) break;
    const { row, bytes } = eligible[0];
    selected.set(row.id, bytes); preload.push(row.id); usedGzipBytes += bytes;
    for (const url of [...row.modules, ...row.styles ?? []]) resident.add(url);
  }
  const initial = [...eager, ...preload].map(id => [id, new Set(planCodeLoad(manifest, [id]).modules)]);
  const decisions = rows.map(row => {
    const chosen = selected.has(row.id), bytes = chosen ? selected.get(row.id) : cost(row);
    let loading = row.requested, reason = policies.has(row.id) ? 'explicit' : 'default';
    if (row.requested === 'auto') {
      loading = chosen ? 'preload' : 'lazy';
      if (chosen) reason = row.priority === 0 ? 'input' : 'form';
      else if (row.priority === undefined) reason = 'interaction';
      else reason = bytes === null ? 'unknown-size' : 'budget';
    }
    return { id: row.id, requested: row.requested, loading, reason,
      additionalGzipBytes: row.requested === 'auto' ? bytes : 0, modules: row.modules,
      initialBy: initial.filter(([, modules]) => modules.has(manifest.references[row.id].ref[0])).map(([id]) => id),
      ...(row.styles ? { styles: row.styles } : {}) };
  });
  return { eager, preload, plan: { version: 1, strategy: 'event-and-size', budgetGzipBytes: gzipBytes, usedGzipBytes, decisions } };
}
