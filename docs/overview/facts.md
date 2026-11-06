# 図の主張と根拠

公開 README の想定読者は [仮の読者像](../../personas/readme-reader.md)。図は実装済みの機能を扱う。速度の優劣や、コンパイラ全体の形式証明は主張しない。

| 図の主張 | 実装・実行する検査 | 範囲 |
| --- | --- | --- |
| 専用 `.isle` を MoonBit frontend で解析する | [compiler](../../compiler/)、[JS adapter](../../lib/compiler.mjs)、`node tools/readme-overview.mjs` | 現在の制約付き構文。任意 TS / inline は未対応 |
| HTML + snapshot、分割 JS / CSS、manifest を出力する | [Vite plugin](../../lib/vite.mjs)、[build tests](../../tests/build.test.mjs)、[style build tests](../../tests/style-build.test.mjs) | Vite / Rolldown がチャンクを生成する |
| 初期化を再実行せず、動的テキストだけ更新する | [図の Counter](counter.isle)、[codegen](../../lib/codegen.mjs)、`node tools/readme-overview.mjs` | snapshot 0 → handler 1、更新先は1つ。一般の部分更新は [control flow tests](../../tests/control-flow.test.mjs) も参照 |
| auto / lazy は取得と setup を分ける | [loading build tests](../../tests/loading-optimizer-build.test.mjs)、[ブラウザー検査](../../playwright.loading.config.mjs)、[解説](../resolution-optimizer.md) | コードは操作前に取得可能。明示 eager は別方針 |
| SSR のみなら Isle の browser JS は不要 | [build tests](../../tests/build.test.mjs) の forced-ssr / server / universal / no-handlers | ページ上の任意の外部 JS まで削除する意味ではない |
| Form / server action | [Form tests](../../tests/forms.test.mjs)、[ガイド](../forms.md)、[共通 schema](../schema-contracts.md) | 認証・業務 policy は trusted host adapter が実装する |
| Web Components widget | [widget architecture](../widget-architecture.md)、[共有 runtime tests](../../tests/shared-runtime.test.mjs) | ShadowRoot、固定寸法、完全一致版で runtime 共有。異なる版は拒否 |
| Grid / CSS 静的検査 | [独立 CLI](../../tools/isle.mjs)、[リジェクト14例](../../evals/results/layout-rejections/index.md)、[仕様](../layout-checking.md) | 宣言されたサイズ・折り返し・overflow 契約内。unknown を成功扱いしない |
| 有限モデルで寿命を検査 | [独立した参照モデル](../../models/README.md)、`just verify` | compiler IR からのモデル自動生成と全体証明は未実装 |
| ES2023 / Web 標準 API、MoonBit / Wasm runtime の配布なし | [runtime](../../runtime/)、[出力検査](../../tools/check-build.mjs) | コンパイラは開発時に動く |

事実ラベルは [isle-overview.facts.json](figures/isle-overview.facts.json) に列挙し、描画後のテキストに対して検査する。矢印を使わず、番号と左→右／上→下の順序で、宣言→生成物と初期表示→操作を表す。
