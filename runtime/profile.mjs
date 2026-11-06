let serial = 0;

/** Opt-in User Timing; timestamps are local to each invocation, with no shared mark names. */
export function createInteraction(performance, handlerId, scopeId, event) {
  const invocation = ++serial, start = performance.now();
  let finished = false;
  const measure = (phase, start, status, extra) => performance.measure(`isle:${handlerId}:${phase}`, {
    start, end: performance.now(), detail: { handlerId, scopeId, event, invocation, phase, status, ...extra },
  });
  return {
    begin(phase, extra) {
      const start = performance.now();
      return (status = 'ok') => measure(phase, start, status, extra);
    },
    sync(phase, operation) {
      const end = this.begin(phase);
      try { const value = operation(); end(); return value; }
      catch (error) { end('error'); throw error; }
    },
    async measure(phase, operation, extra, status) {
      const end = this.begin(phase, extra);
      try { const value = await operation(); end(status?.(value)); return value; }
      catch (error) { end('error'); throw error; }
    },
    finish(status) { if (!finished) { finished = true; measure('interaction', start, status); } },
  };
}
