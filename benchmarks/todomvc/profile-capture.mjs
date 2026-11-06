import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { coverageRanges, unionRanges, rangeBytes, summarizeCPU, sourceFrame } from './profile-metrics.mjs';

export async function capture(page, server, { coverage = false, cpu = false, latency = 0 } = {}) {
  assert.ok(!(coverage && cpu), 'Precise coverage disables optimized execution; use separate trials');
  const cdp = await page.context().newCDPSession(page), requests = [], pending = new Map(), trace = [], sources = new Map(), cumulative = new Map();
  let phase = 'initial', lastActivity = Date.now();
  const inflight = new Set();
  await cdp.send('Network.enable');
  if (latency) await cdp.send('Network.emulateNetworkConditionsByRule', { matchedNetworkConditions: [{ urlPattern: '', latency, downloadThroughput: 1048576, uploadThroughput: 1048576 }] });
  cdp.on('Network.requestWillBeSent', event => {
    if (!event.request.url.startsWith(server.url)) return;
    inflight.add(event.requestId); lastActivity = Date.now();
    const row = { url: new URL(event.request.url).pathname, phase, start: event.timestamp * 1000, initiator: event.initiator.type, requestId: event.requestId };
    pending.set(event.requestId, row); requests.push(row);
  });
  cdp.on('Network.responseReceived', event => { const row = pending.get(event.requestId); if (row) { row.headers = event.timestamp * 1000; row.status = event.response.status; row.mimeType = event.response.mimeType; row.fromDiskCache = event.response.fromDiskCache; } });
  cdp.on('Network.loadingFinished', event => { const row = pending.get(event.requestId); if (row) { row.end = event.timestamp * 1000; inflight.delete(event.requestId); lastActivity = Date.now(); } });
  cdp.on('Network.loadingFailed', event => { inflight.delete(event.requestId); lastActivity = Date.now(); });
  await cdp.send('Profiler.enable');
  if (coverage) {
    await cdp.send('Debugger.enable');
    await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true, allowTriggeredUpdates: false });
  }
  if (cpu) {
    cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing', transferMode: 'ReportEvents' });
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  }
  function mappedFrame(frame) {
    const path = new URL(frame.url).pathname, map = server.maps.get(path);
    return sourceFrame(frame, map);
  }
  async function snapshot() {
    assert.ok(coverage);
    const result = await cdp.send('Profiler.takePreciseCoverage'), rows = [];
    for (const script of result.result.filter(script => script.url.startsWith(server.url))) {
      const path = new URL(script.url).pathname;
      if (!sources.has(script.scriptId)) sources.set(script.scriptId, (await cdp.send('Debugger.getScriptSource', { scriptId: script.scriptId })).scriptSource);
      const source = sources.get(script.scriptId), used = coverageRanges(script.functions, source.length);
      const all = unionRanges([...(cumulative.get(path) ?? []), ...used]); cumulative.set(path, all);
      const functions = script.functions.map(fn => {
        const range = fn.ranges[0], prefix = source.slice(0, range.startOffset).split('\n');
        return { name: fn.functionName, calls: range.count, source: source.slice(range.startOffset, Math.min(range.endOffset, range.startOffset + 100)),
          ...mappedFrame({ url: script.url, lineNumber: prefix.length - 1, columnNumber: prefix.at(-1).length }) };
      });
      rows.push({ url: path, bytes: Buffer.byteLength(source), usedBytes: rangeBytes(source, used), cumulativeUsedBytes: rangeBytes(source, all), functions });
    }
    return rows;
  }
  return {
    cdp, requests, setPhase(value) { phase = value; }, snapshot,
    async settled() {
      // A previous load's networkidle state may still be set before a lazy import starts.
      // Require a new quiet window after every operation and follow all import generations.
      const began = Date.now();
      while (inflight.size || Date.now() - Math.max(began, lastActivity) < 250) {
        assert.ok(Date.now() - began < 15000, 'Module requests did not settle');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    },
    async startCPU(name) { assert.ok(cpu); await page.evaluate(name => performance.mark(`todo:${name}:start`), name); await cdp.send('Profiler.start'); },
    async stopCPU(name, directory) {
      const { profile } = await cdp.send('Profiler.stop');
      await page.evaluate(name => performance.mark(`todo:${name}:end`), name);
      await writeFile(`${directory}/${name}.cpuprofile`, JSON.stringify(profile));
      const summary = summarizeCPU(profile, server.url);
      summary.functions = summary.functions.map(mappedFrame);
      return summary;
    },
    async close(directory, name) {
      if (coverage) await cdp.send('Profiler.stopPreciseCoverage');
      if (cpu) {
        const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end'); await completed;
        await writeFile(`${directory}/${name}.trace.json.gz`, gzipSync(JSON.stringify({ traceEvents: trace })));
      }
      await cdp.detach();
    },
  };
}

/** Unique body sizes come from the immutable build, not instrumentation or HTTP header lengths. */
export function networkSummary(requests, server) {
  const seen = new Set(), phases = new Map();
  for (const request of requests) {
    if (seen.has(request.url)) continue; seen.add(request.url);
    if (!request.url.endsWith('.js')) continue;
    assert.equal(request.status, 200, request.url); assert.ok(Number.isFinite(request.end), `Incomplete JS response: ${request.url}`);
    const asset = server.routes.get(request.url); assert.ok(asset, request.url);
    const row = phases.get(request.phase) ?? { phase: request.phase, gzip: 0, requests: [], start: Infinity, end: -Infinity };
    row.gzip += asset.gzip.length; row.requests.push(request); row.start = Math.min(row.start, request.start); row.end = Math.max(row.end, request.end); phases.set(request.phase, row);
  }
  return [...phases.values()].map(({ start, end, ...row }) => ({ ...row, fetchSpanMs: end - start,
    requestStartSpreadMs: Math.max(...row.requests.map(request => request.start)) - start,
    requests: row.requests.map(request => ({ ...request, relativeStartMs: request.start - start, relativeEndMs: request.end - start })) }));
}
