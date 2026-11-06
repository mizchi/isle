import { gzipSync } from 'node:zlib';

const kinds = ['html', 'js', 'css', 'rpc', 'other'];
const empty = () => ({ count: 0, raw: 0, gzip: 0 });
export const size = body => ({ raw: body.length, gzip: gzipSync(body, { level: 6 }).length });

/** Unique response bodies, assigned to the phase in which their URL was first requested.
 * HTML includes inline JS/state/CSS. RPC is excluded from the asset total.
 */
export function summarizeTransfers(entries) {
  const phases = {};
  const seen = new Set();
  const total = empty();
  for (const entry of entries) {
    const phase = phases[entry.phase] ??= Object.fromEntries(kinds.map(kind => [kind, empty()]));
    if (entry.kind !== 'rpc') {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
    }
    const measured = { ...size(entry.body), count: 1 };
    for (const key of ['count', 'raw', 'gzip']) {
      phase[entry.kind][key] += measured[key];
      if (entry.kind !== 'rpc') total[key] += measured[key];
    }
  }
  return { phases, total };
}
