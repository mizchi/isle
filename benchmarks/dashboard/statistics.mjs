import assert from 'node:assert/strict';

/** Median; p95 is nearest rank, including every sample. No trimming or zero-filling. */
export function summary(samples) {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid benchmark samples');
  const sorted = [...samples].sort((a, b) => a - b), n = sorted.length;
  return { n, median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95: sorted[Math.ceil(n * 0.95) - 1], min: sorted[0], max: sorted[n - 1] };
}

export function networkTransfers(trial) {
  const initialEnd = trial.operations.find(operation => operation.name === 'cold-increment').start;
  const seen = new Set(), result = { html: 0, initialJS: 0, allJS: 0, auxiliary: 0, totalAssets: 0, requestedJS: [] };
  for (const resource of trial.networkResponses) {
    const path = new URL(resource.url).pathname;
    if (path.startsWith('/__isle/') || seen.has(resource.url)) continue;
    assert.equal(resource.status, 200);
    assert.ok(Number.isSafeInteger(resource.bytes) && resource.bytes >= 0, `Missing payload size: ${path}`);
    seen.add(resource.url); result.totalAssets += resource.bytes;
    const start = resource.start - trial.timeOrigin;
    if (resource.type.includes('text/html')) result.html += resource.bytes;
    else if (path.endsWith('.js')) {
      result.allJS += resource.bytes;
      if (start < initialEnd) result.initialJS += resource.bytes;
      result.requestedJS.push({ path, bytes: resource.bytes, start });
    } else result.auxiliary += resource.bytes;
  }
  return result;
}
