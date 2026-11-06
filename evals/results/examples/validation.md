# npm 利用者向け README と examples の検査

2026-11-06。README.md / README.ja.md はアプリ利用者向け、compiler 開発用の手順は docs/contributing.md に移した。

| 対象 | 実行 | 結果 |
| --- | --- | --- |
| 公開型と import 境界 | `just check-types` | pass |
| MoonBit と Node | `just test` | 53 / 310 pass |
| 15例の一覧・英日リンクと12ページのビルド | `node --test tests/examples.test.mjs` | 14 pass |
| 配布 API・型の同梱・README の最小アプリ・CLI | `just package-check` | 2 pass、MoonBit のない PATH で成功 |
| UI の初期表示、PC / phone、機能の操作 | `pnpm exec playwright test --config playwright.examples.config.mjs` | 21 pass |
| 新規8 UI の integrity / copy / scroll / handlers / interactions | `just examples-quality` | 40 pass |
| 既存の通常 Form / schema Form | `just a11y-form a11y-schema-form` | 各8 gate pass |
| Workers widget の配布ビルド | `just widget-build` | shared / standalone の生成に成功 |
| 英日説明画像と README の画像切替 | `just overview-quality` | pass |
| 英日図の事実・文字・引用・解説ページ | explainer `verify-doc.mjs docs/overview --write` | VERIFIED |
| README・追加ガイドのローカル参照21文書 | 参照先ファイルの存在検査 | 参照切れ0 |

新規 UI の生の gate 結果は [quality.json](quality.json)、初期表示は [desktop](sheet-1040.png) / [phone](sheet-375.png)。操作後の empty/catch、CSS 適用、resource disposal の画像は `test-results/examples/` に保存して目視した。

配布用の [npm archive](../../../artifacts/isle-prototype-0.0.1.tgz) にはコンパイル済み frontend、public API、runtime、型、CLI と英日 README を含める。PostCSS は解析用の配布依存、Vite は peer。レジストリへの公開は行っていない。

初見の参照読みは英語・日本語のモデル読者で実施した。利用者に MoonBit・Z3・clone が不要で、公開 import と機能例を探せることが伝わった。archive の入手先と HTML 生成時期が不明という反応を受け、実物へのリンクとビルド時生成の説明を追記した。人間のユーザーテストとしては扱わない。
