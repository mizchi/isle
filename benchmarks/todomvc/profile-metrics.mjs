import assert from 'node:assert/strict';
import { SourceMap } from 'node:module';

/** Never extend a native module's last source-map entry over an unmapped virtual tail. */
export function sourceFrame(frame, payload) {
  if (!payload) return { ...frame, sourceMapUnavailable: true };
  const map = new SourceMap(payload), last = map.findEntry(2147483647, 2147483647);
  if (last.generatedLine === undefined || frame.lineNumber > last.generatedLine || frame.lineNumber === last.generatedLine && frame.columnNumber > last.generatedColumn) return { ...frame, sourceMapUnavailable: true };
  const entry = map.findEntry(frame.lineNumber, frame.columnNumber);
  if (!entry.originalSource) return { ...frame, sourceMapUnavailable: true };
  const index = payload.sources.indexOf(entry.originalSource), line = payload.sourcesContent?.[index]?.split('\n')[entry.originalLine];
  return { ...frame, originalName: line?.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)?.[1],
    originalSource: entry.originalSource.replace(/^.*?(?=runtime\/|examples\/|virtual:)/, ''), originalLine: entry.originalLine + 1, originalColumn: entry.originalColumn };
}

export function unionRanges(ranges) {
  const result = [];
  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (end <= start) continue;
    const previous = result.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else result.push([start, end]);
  }
  return result;
}

/** V8 offsets are UTF-16; smaller nested ranges override their parent's count. */
export function coverageRanges(functions, length) {
  const ranges = functions.flatMap(fn => fn.ranges);
  for (const range of ranges) assert.ok(Number.isInteger(range.startOffset) && Number.isInteger(range.endOffset) && range.startOffset >= 0 && range.endOffset <= length && range.endOffset >= range.startOffset && range.count >= 0, 'Invalid V8 coverage range');
  const points = [...new Set([0, length, ...ranges.flatMap(range => [range.startOffset, range.endOffset])])].sort((a, b) => a - b);
  const used = [];
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i];
    let selected;
    for (const range of ranges) if (range.startOffset <= start && range.endOffset >= end && (!selected || range.endOffset - range.startOffset <= selected.endOffset - selected.startOffset)) selected = range;
    if (selected?.count > 0) used.push([start, end]);
  }
  return unionRanges(used);
}
export const rangeBytes = (source, ranges) => ranges.reduce((sum, [start, end]) => sum + Buffer.byteLength(source.slice(start, end)), 0);

/** Sampled self time, not a precise per-function CPU duration. Idle and driver work remain separate. */
export function summarizeCPU(profile, appPrefix) {
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  assert.equal(samples.length, deltas.length, 'Mismatched CPU sample deltas');
  const nodes = new Map(profile.nodes.map(node => [node.id, node])), functions = new Map();
  assert.ok(Number.isFinite(profile.startTime) && Number.isFinite(profile.endTime));
  let time = profile.startTime;
  const ordered = samples.map((id, i) => {
    assert.ok(nodes.has(id) && Number.isFinite(deltas[i]), 'Invalid CPU sample');
    time += deltas[i]; return { id, time };
  }).sort((a, b) => a.time - b.time);
  assert.ok(!ordered.length || ordered[0].time >= profile.startTime && ordered.at(-1).time <= profile.endTime, 'CPU sample outside recording');
  let total = 0, app = 0;
  for (let i = 0; i < ordered.length; i++) {
    const frame = nodes.get(ordered[i].id).callFrame;
    const weight = (ordered[i + 1]?.time ?? profile.endTime) - ordered[i].time;
    total += weight;
    if (!frame.url.startsWith(appPrefix)) continue;
    app += weight;
    const key = JSON.stringify(frame), row = functions.get(key) ?? { ...frame, samples: 0, selfUs: 0 };
    row.samples++; row.selfUs += weight; functions.set(key, row);
  }
  return { appSampledMs: app / 1000, totalSampledMs: total / 1000, negativeDeltasSorted: deltas.filter(delta => delta < 0).length,
    initialUnsampledMs: ordered.length ? (ordered[0].time - profile.startTime) / 1000 : 0,
    functions: [...functions.values()].sort((a, b) => b.selfUs - a.selfUs).map(({ selfUs, ...row }) => ({ ...row, selfMs: selfUs / 1000 })) };
}
