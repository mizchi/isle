# Documentation and demo site validation

2026-11-06。GitHub Pages の `/isle/` と root 配信 `/` の両方でビルド・操作を確認した。

| 検査 | 結果 |
| --- | --- |
| Markdown・サイト・デモの HTML | 81ページ |
| 内部リンク・画像・JS・CSS・見出し参照 | 1,540件、参照切れ0 |
| ガイドの実行用 framework JS | module script なし |
| Pages subpath の Playwright | 21 pass |
| root 配信の Playwright | 21 pass |
| vlmkit：8ページの integrity | 8 pass |
| 英日トップ：copy / scroll / handlers / interactions / contrast / touch / focus / responsive | 16 pass |
| responsive | 英日各24ケース、375〜1440px |
| Node 回帰検査 | 318 pass |
| MoonBit 回帰検査 | 53 pass |
| 型検査と配布 API / CLI / 同梱型の検査 | pass |
| GitHub Actions workflow | actionlint pass |

トップは Isle の server component と client Counter で構築する。Markdown とコードの展開はビルド時のみ。10例は静的配信で操作でき、Web Components の例は2つの ShadowRoot が runtime を共有しつつ独立した状態を持つ。server action の3例を静的な RPC mock で成功したように見せず、サーバーが必要なことを明示する。

Isle を実際のサイトに使って見つかった不足を補った。`wrapMounts: false` はアプリがページ構造を持つためのビルド設定。`href` は不変な URL に限定し、危険な scheme と制御文字をコンパイル・SSR で拒否する。client の領域 factory で使えるリンクは literal のみ。宣言的な widget の相対 URL は document base に対して解決し、HTTP(S) と版の検査を維持する。

PC・tablet・phone の英日トップ、カタログ、ガイド、開いたソースを `test-results/site/` に保存して目視した。タブレットの日本語見出し、狭いカタログ列、閉じた details のレイアウトを修正。例の分類と配布物は [site.json](https://mizchi.github.io/isle/site.json)、機械的な見た目の結果は [quality.json](quality.json)。生成サイトは Git へ入れず、Actions が `dist/site/` を生成・配信する。

再実行: `just site-check` / `just site-quality`。root も検査する場合は `SITE_BASE=/ just site-check` を実行し、公開前に既定の `just site-build` で `/isle/` に戻す。
