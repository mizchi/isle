/** Injected before any application JS. Duration is native event timestamp -> expected DOM state. */
export function installProbe() {
  performance.setResourceTimingBufferSize(10000);
  const operations = [], eventTimings = [], longTasks = [], largestPaints = [], finished = new Map(), waiting = new Map();
  let active, sequence = 0;
  for (const [type, into] of [['event', eventTimings], ['longtask', longTasks], ['largest-contentful-paint', largestPaints]]) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) into.push(entry.toJSON()); })
      .observe({ type, buffered: true, ...(type === 'event' ? { durationThreshold: 16 } : {}) });
  }
  function matches(item) {
    const node = item.node;
    return Object.hasOwn(item, 'text') ? node.textContent.trim() === item.text
      : Object.hasOwn(item, 'attribute') ? node.getAttribute(item.attribute) === item.value
      : node[item.property] === item.value;
  }
  function complete() {
    if (!active?.start || active.remaining.size || !active.expected.every(matches)) return;
    const end = performance.now(), result = { id: active.id, name: active.name, event: active.event,
      start: active.start, dispatch: active.dispatch, end, duration: end - active.start,
      dispatchToDOM: end - active.dispatch, inputDelay: Math.max(0, active.dispatch - active.start), trusted: active.trusted };
    clearTimeout(active.timer); active.observer.disconnect();
    finished.set(active.id, result); operations.push(result); waiting.get(active.id)?.(result); waiting.delete(active.id); active = undefined;
  }
  function start(event) {
    if (!active || active.start || event.type !== active.event || !event.target?.closest?.(active.trigger)) return;
    active.start = event.timeStamp; active.dispatch = performance.now(); active.trusted = event.isTrusted;
    for (const item of active.expected) if (matches(item)) active.remaining.delete(item);
    complete();
  }
  for (const event of ['click', 'input', 'submit', 'change']) document.addEventListener(event, start, true);
  window.__dashboard = {
    arm(spec) {
      if (active) throw new Error('Benchmark operation already active');
      if (!spec.expected?.length) throw new Error('Expected DOM state is required');
      const expected = spec.expected.map(item => {
        const node = document.querySelector(item.selector);
        if (!node) throw new Error(`Missing benchmark target: ${item.selector}`);
        return { ...item, node };
      });
      if (expected.every(matches)) throw new Error(`Benchmark state is already satisfied: ${spec.name}`);
      const targets = new Map(expected.map(item => [item.node, item])), id = ++sequence;
      const observer = new MutationObserver(records => {
        if (!active?.start) return;
        for (const record of records) {
          let node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          while (node && !targets.has(node)) node = node.parentElement;
          const item = targets.get(node);
          if (item && matches(item)) active.remaining.delete(item);
        }
        complete();
      });
      for (const item of expected) observer.observe(item.node, { attributes: true, characterData: true, childList: true, subtree: true });
      const timer = setTimeout(() => {
        observer.disconnect(); const result = { id, error: `DOM completion timed out: ${spec.name}` };
        finished.set(id, result); waiting.get(id)?.(result); waiting.delete(id); active = undefined;
      }, spec.timeout ?? 15000);
      active = { ...spec, id, expected, remaining: new Set(expected), observer, timer }; return id;
    },
    wait(id) { return finished.has(id) ? Promise.resolve(finished.get(id)) : new Promise(resolve => waiting.set(id, resolve)); },
    report() {
      return { timeOrigin: performance.timeOrigin, operations, eventTimings, longTasks, largestPaints, navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
        paints: performance.getEntriesByType('paint').map(entry => entry.toJSON()), resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()) };
    },
  };
}
