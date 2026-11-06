# TodoMVC build size comparison

Measured 2026-11-06T13:15:20.975Z. Sizes are **bytes**, compressed per file/response: gzip level 6; Brotli quality 11.

| Implementation | All emitted JS raw | gzip | Brotli |
|---|---:|---:|---:|
| isle 0.0.1 | 18078 | 8035 | 7170 |
| qwik 1.20.3 | 60052 | 24504 | 22069 |
| qwik-next 2.0.0-rc.4 | 108725 | 42757 | 38247 |
| preact 11.1.1 | 16950 | 6917 | 6278 |

| Implementation | Initial HTML gzip | Initial external JS gzip | First add additional JS gzip | All exercised JS gzip | Observed asset total gzip |
|---|---:|---:|---:|---:|---:|
| isle | 2322 | 1440 | 5150 | 8035 | 10357 |
| qwik | 3002 | 24354 | 0 | 24354 | 27591 |
| qwik-next | 3538 | 42521 | 0 | 42521 | 46463 |
| preact | 1839 | 6917 | 0 | 6917 | 8756 |

All implementations passed the same add/trim/empty, complete, keyed DOM identity, edit (Enter/blur/Escape/empty-delete), delete, hash filters, persistence/reload, toggle-all and clear-completed flow. The separate check runs this at 1280px and 375px and verifies the empty SSR view without JavaScript.

Production/minified, ES2023, no source maps, Vite modulePreload disabled. Empty initial storage and a fresh Chromium context per implementation; service workers blocked. Initial = load + 2s + network idle, including default Qwik speculative preloads. Subsequent phases are assigned when each request starts. Assets count once per URL, including the persistence reload. Shared inline CSS, shell and browser host adapter (storage/hash/focus); all adapter code is included. HTML includes inline loaders, state and CSS; it is not counted again as external JS. Auxiliary fetched assets, e.g. Qwik graph JSON, are included in observed totals. HTTP headers, compiler/SSR bundles, source maps and unrequested manifests/diagnostic reports are excluded. Brotli is a size estimate; the common server serves gzip.

Qwik stable 1.20.3 uses its supported Vite 7 / Rollup. Isle, Qwik 2 RC and Preact use Vite 8 / Rolldown. Exact versions, individual emitted files and fetched URLs are in latest.json. Qwik 2 is a release candidate. Isle's typed JSON decoder and generated region reconciler are included. This is an equal-feature fixture implemented here, not a measurement of official TodoMVC distributions or runtime speed. Custom accessible CSS and native hash handling replace the official site's presentation/router dependencies.

Node v24.21.0; Chromium 156.0.8078.4; darwin/arm64. Reproduce: `just todomvc-size`.
