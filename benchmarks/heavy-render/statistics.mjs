import { summary } from '../dashboard/statistics.mjs';

/** Join only unique trusted click entries. Thresholded/missing observations are not zero. */
export function nativeClickTiming(trials, operationName) {
  const durations = [];
  let attempts = 0, ambiguous = 0;
  for (const trial of trials) for (const operation of trial.operations) {
    if (operation.name !== operationName || !operation.trusted) continue;
    attempts++;
    const candidates = trial.eventTimings.filter(entry => entry.name === 'click' && entry.interactionId > 0
      && Math.abs(entry.startTime - operation.start) < 1 && Number.isFinite(entry.duration) && entry.duration >= 0);
    if (candidates.length === 1) durations.push(candidates[0].duration);
    else if (candidates.length > 1) ambiguous++;
  }
  return { attempts, reported: durations.length, unreported: attempts - durations.length, ambiguous,
    latency: durations.length ? summary(durations) : null };
}
