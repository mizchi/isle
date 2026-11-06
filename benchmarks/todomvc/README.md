# TodoMVC comparison

[Results / 実測結果](../results/todomvc/latest.md) · [Raw requests and emitted files](../results/todomvc/latest.json) · [Isle source](../../examples/todomvc/app.isle)

```sh
just todomvc-size     # production builds → shared correctness flow → byte sizes
just todomvc-serve    # http://127.0.0.1:4332/todomvc/{isle,qwik,qwik-next,preact}/
just todomvc-quality  # fixed UI gates for the populated Isle demo
just todomvc-profile  # CPU profiles, traces, coverage and chunk-loading controls
```

The [TodoMVC application specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md) supplies the behavioral requirements: add/trim/ignore blank, complete, edit with Enter/blur/Escape, remove empty edits, delete, toggle-all, clear-completed, active count, hash filters, and localStorage persistence. Keyboard activation also opens the title button. The same `flow.mjs` runs against all four implementations at desktop and phone sizes, verifies stable keyed DOM before filtering, and checks restore on reload. Empty SSR works without JavaScript; persisted data belongs to the browser and requires JavaScript.

[Chunk/profile analysis](../results/todomvc/profiling/latest.md) compares the current grouping, one handler per file and auto preload. A control removes only the manifest's parallel-loading hints. Detailed V8 coverage and sampled CPU use separate trials because precise coverage disables optimized execution. Diagnostic builds and source maps use isolated outputs; an assertion verifies the production manifest stays identical. DevTools-compatible `.cpuprofile` and compressed Chrome trace files are saved under `../results/todomvc/profiling/raw/`.

All four use the same CSS, document shell and `examples/todomvc/host.mjs` for optional storage, native hash navigation and editor focus. The host does not render; each framework owns the list and every mutation. Fresh storage is empty. The JSON boundary validates restored shape/unique IDs before dispatch; Isle additionally checks its decoded closed type before committing. Storage exceptions and malformed previous values are ignored. Each implementation uses its own `todos-{framework}` key. Routers, RPC and backend services are unnecessary.

Builds are minified ES2023 without source maps. Isle 0.0.1, Qwik 2 RC and Preact use Vite 8 / Rolldown; Qwik stable uses its supported Vite 7 / Rollup. Dependency versions are pinned by the existing workspace lockfile. Qwik's default optimizer/chunk/preload policy is retained; Isle explicitly uses lazy loading and production diagnostics are disabled. Preact SSR is hydrated. Shared host code is included in every measured build.

`latest.json` records every emitted browser `.js` file and each first-requested URL, with raw bytes, gzip level 6 and Brotli quality 11. Files are compressed independently and summed. Server bundles, compiler, source maps and unrequested analysis/manifest files are excluded from browser JS; fetched graph JSON is included in observed asset totals. The common server serves gzip; Brotli is a deterministic estimate. HTML includes inline loaders, snapshots and CSS, which are not double-counted as external JS. The initial phase includes load + 2s + network idle and speculative downloads. A fresh Chromium context blocks service workers; later phases are classified at request start, and URLs count only once even across the persistence reload. This measures payload size, not runtime speed or SSR CPU.

## 日本語

TodoMVC の追加・完了・編集・取消・削除・件数・hash 絞り込み・localStorage 保存を、4実装で同じ Playwright 操作によって検査します。CSS・HTML shell・保存/hash/focus の host module を共通化し、描画は各フレームワークに任せています。最初の空リストは JavaScript 無効でも SSR 表示を検査し、保存データはブラウザーで復元します。

結果では、ビルドした全 JS、初期表示で取得した JS、最初の追加で増えた JS、全操作で取得した JS、HTML・補助ファイルを含む取得合計を区別します。圧縮はファイルごとの gzip level 6 / Brotli quality 11 の合計です。Brotli はサイズ推計で、共通サーバーは gzip 配信します。Isle の型検査付き JSON decoder と region runtime も計測対象です。Qwik stable の bundler が異なること、Qwik 2 が RC であること、公式 TodoMVC の CSS/router 配布物を使わないことを考慮して読みます。

`just todomvc-profile` で[チャンク分析](../results/todomvc/profiling/latest.md)も再実行できます。CPU・Chrome trace、最適化を無効にする詳細カバレッジ、module 評価時刻は別の試行で記録します。並列取得の有無、13個への細分化、auto preload を比較し、500件の通常キー入力と input イベントの違いも検査します。プロファイラは production の配布 JS には追加しません。
