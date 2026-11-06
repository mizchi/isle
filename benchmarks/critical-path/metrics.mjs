/** CLS uses the largest session: gaps < 1s, duration < 5s; recent input excluded. */
export function layoutMetrics(entries) {
  const shifts = [...entries].sort((a, b) => a.startTime - b.startTime);
  let cls = 0, sum = 0, first = -Infinity, last = -Infinity;
  for (const entry of shifts) {
    if (entry.hadRecentInput) continue;
    if (entry.startTime - last < 1000 && entry.startTime - first < 5000) sum += entry.value;
    else { first = entry.startTime; sum = entry.value; }
    last = entry.startTime;
    cls = Math.max(cls, sum);
  }
  return { cls, rawShift: shifts.reduce((sum, entry) => sum + entry.value, 0), entries: shifts };
}
