# UI framework comparison

Generated: 2026-11-02T10:41:59.526Z

All values below are **bytes, gzip level 6**, compressed per response. HTML includes inline loader, state and CSS. Total observed includes auxiliary assets (e.g. Qwik bundle graph); RPC JSON is separate.

| Implementation | HTML | Initial external JS | First counter additional JS | First remote additional JS | Observed asset total | All emitted JS |
|---|---:|---:|---:|---:|---:|---:|
| isle 0.0.1 | 1012 | 2798 | 118 | 148 | 4076 | 3064 |
| qwik 1.20.3 | 1643 | 23591 | 0 | 0 | 25401 | 23710 |
| qwik-next 2.0.0-rc.4 | 1680 | 39189 | 0 | 0 | 41119 | 40271 |
| preact 11.1.1 | 766 | 6304 | 0 | 0 | 7070 | 6304 |

SSR without JS, both independent counters, repeated click, async Draft → Draft!, and retained button DOM: passed for all implementations.

Initial window: load + 2 seconds idle + network-idle. Fresh Chromium context per implementation, service workers blocked, production builds, default Qwik preloading. Headers and RPC response bytes excluded from asset totals. Per-phase raw bytes and request URLs are in latest.json.

Isle, Qwik 2 RC and Preact use Vite 8 / Rolldown; Qwik 1 uses its supported Vite 7 / Rollup. Shared shell/CSS and one shared RPC endpoint. Framework-native routers/RPC are excluded. This small fixture compares delivered code, not general runtime speed or feature equivalence. Qwik 2 is a release candidate.

Node v24.21.0; Chromium 156.0.8078.4; darwin/arm64.
