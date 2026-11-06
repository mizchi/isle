// Test-only browser instrumentation. This module never enters an application bundle.
export function observeCriticalPath({ saved, blockedStorage = false } = {}) {
  if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) throw new Error('Layout Instability API is required');
  const entries = [], paints = [], largest = [];
  const rect = box => ({ x: box.x, y: box.y, width: box.width, height: box.height });
  const collect = rows => { for (const entry of rows) entries.push({ startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
    sources: (entry.sources ?? []).map(source => ({ node: source.node?.className || source.node?.nodeName, previousRect: rect(source.previousRect), currentRect: rect(source.currentRect) })) }); };
  const shifts = new PerformanceObserver(list => collect(list.getEntries())); shifts.observe({ type: 'layout-shift', buffered: true });
  const paint = new PerformanceObserver(list => paints.push(...list.getEntries().map(entry => ({ name: entry.name, startTime: entry.startTime })))); paint.observe({ type: 'paint', buffered: true });
  const lcp = new PerformanceObserver(list => largest.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, size: entry.size })))); lcp.observe({ type: 'largest-contentful-paint', buffered: true });
  window.__criticalPath = { read() { collect(shifts.takeRecords()); return { entries, paints, largest }; } };
  if (saved !== undefined) localStorage.setItem('todos-isle', saved);
  if (blockedStorage) Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new DOMException('Blocked', 'SecurityError'); } });
}
