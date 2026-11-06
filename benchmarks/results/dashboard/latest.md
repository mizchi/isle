# Work planning dashboard benchmark

Generated: 2026-11-04T05:17:59.261Z

64 independent work packages, calculated values, draft reset, lock, asynchronous save, native team filter/disclosure and a validated project form.

## desktop

CPU 1x; configured network latency 0 ms; download unlimited.

Event timestamp → expected DOM state, **median / p95 in milliseconds**. 12 fresh contexts per implementation; warm samples 144.

| Implementation | DCL | First increment | Warm increment | Other island | Save plan | First form input | Submit project | Burst 32 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| isle | 19.65 / 22.30 | 1.15 / 4.80 | 0.30 / 0.70 | 0.75 / 1.10 | 24.50 / 30.40 | 1.60 / 2.70 | 45.70 / 47.60 | 0.95 / 1.70 |
| qwik | 8.20 / 10.50 | 43.25 / 48.30 | 15.50 / 16.20 | 17.05 / 17.40 | 41.10 / 43.70 | 4.55 / 6.50 | 59.65 / 62.60 | 6.50 / 7.90 |
| qwik-next | 8.35 / 10.20 | 47.55 / 57.90 | 0.40 / 0.80 | 16.40 / 17.50 | 40.95 / 42.50 | 4.80 / 8.10 | 46.95 / 50.30 | 18.30 / 23.50 |
| preact | 10.85 / 24.20 | 0.80 / 1.20 | 0.30 / 0.60 | 0.65 / 1.00 | 24.75 / 26.70 | 1.35 / 1.90 | 45.90 / 48.10 | 1.70 / 2.40 |

Unique gzip payload bodies from HTTP response headers, in **one separate transfer pass per implementation/profile**, including worker requests. Initial means request started before the first click, including framework default prefetch.

| Implementation | HTML bytes | Initial external JS | JS through scenario | Auxiliary assets | All assets |
|---|---:|---:|---:|---:|---:|
| isle | 8961 | 8290 | 8290 | 0 | 17251 |
| qwik | 21649 | 28410 | 28410 | 207 | 50266 |
| qwik-next | 37217 | 44982 | 44982 | 323 | 82522 |
| preact | 5179 | 10041 | 10041 | 0 | 15220 |

## constrained

CPU 4x; configured network latency 80 ms; download 200000 B/s.

Event timestamp → expected DOM state, **median / p95 in milliseconds**. 12 fresh contexts per implementation; warm samples 144.

| Implementation | DCL | First increment | Warm increment | Other island | Save plan | First form input | Submit project | Burst 32 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| isle | 253.25 / 254.20 | 4.15 / 4.90 | 1.00 / 1.60 | 1.35 / 1.80 | 111.60 / 113.20 | 3.75 / 5.10 | 103.90 / 106.70 | 1.60 / 1.90 |
| qwik | 195.15 / 198.70 | 129.10 / 130.20 | 15.00 / 16.10 | 18.00 / 19.00 | 113.80 / 115.50 | 8.10 / 13.60 | 119.55 / 120.40 | 12.20 / 15.80 |
| qwik-next | 384.10 / 390.90 | 161.70 / 175.70 | 1.30 / 2.00 | 16.70 / 18.60 | 111.40 / 128.40 | 10.60 / 16.50 | 101.95 / 111.20 | 31.75 / 35.20 |
| preact | 244.05 / 254.90 | 3.20 / 4.20 | 1.00 / 1.60 | 1.20 / 1.80 | 107.70 / 112.60 | 2.95 / 3.80 | 101.50 / 107.00 | 2.35 / 3.10 |

Unique gzip payload bodies from HTTP response headers, in **one separate transfer pass per implementation/profile**, including worker requests. Initial means request started before the first click, including framework default prefetch.

| Implementation | HTML bytes | Initial external JS | JS through scenario | Auxiliary assets | All assets |
|---|---:|---:|---:|---:|---:|
| isle | 8961 | 8290 | 8290 | 0 | 17251 |
| qwik | 21649 | 28410 | 28410 | 207 | 50266 |
| qwik-next | 37217 | 42280 | 44982 | 323 | 82522 |
| preact | 5179 | 10041 | 10041 | 0 | 15220 |

## Method and limits

- Same production UI/data/API. All HTML is pre-rendered and all assets cached by the common server before timing; SSR CPU is excluded.
- The common API adds 20 ms to readonly validation and to operation preparation. Project submission performs both.
- Real clicks/input/submit use browser event timestamps and targeted MutationObservers; Playwright round trips are excluded. The 32-island burst uses synthetic clicks, separately labelled.
- This measures DOM completion, not next paint or INP. FCP, Long Tasks, and thresholded native Event Timing are also retained in JSON.
- Fresh Chromium context each trial, service workers blocked, ordinary HTTP/module caches retained within a trial. Implementation order rotates each round. No timing samples are trimmed. p95 uses nearest rank; 12 trials is a small tail sample.
- Qwik keeps its default preload policy. Isle's emitted loading policy: {"eager":["WorkItem.increment","WorkItem.reset","WorkItem.lock","WorkItem.save","ProjectForm.__form0"],"preload":[]}. Its small sibling entries share bounded chunks. Speculation Rules are disabled for all variants.
- Form validation/scheduling use the same framework-independent headless FormSession; each framework renders its own form UI. This is not a comparison of form-library ecosystems.
- Isle still lacks nested components, dynamic lists, cross-island shared state and routing. This fixed 64-row scenario does not establish general framework superiority. Native filtering does not update a reactive list.
- Qwik 1 uses Vite 7/Rollup; Isle, Qwik 2 RC and Preact use Vite 8/Rolldown. Build-system differences are included. Qwik 2 is a release candidate.

Node v24.21.0; Chromium 156.0.8078.4; darwin/arm64. See correctness.json, raw.json, and README.md.
