# 実際に重い対象を使った静的解析の検証

4,096商品の発注計画を作り、128 / 1,024 / 4,096商品表示の一括更新を測った。全商品の数量・発注額・重量を計算して表示する実処理で、待機や無意味な反復は入れていない。v0 の list 構文は未実装のため、build 時に行を DSL へ列挙した。

## 予測と browser の照合

4,096商品版の component 部分は65,551 element、一括操作の text patch 上限は12,289、attribute patch 上限は4,096、算術演算上限は77,825となった。128 / 1,024 / 4,096の全ケースで、native MutationObserver の更新回数が予測と一致した。全行の計算結果と attribute、既存 row node の identity、element を作り直さないことも確認した。

同じ document 内の Audit.check は text 更新1回で、先に操作しても Sheet のコードを取得せず、snapshot も復元しなかった。大きな表の費用を独立した操作へ一律に加算しないことを確認した。

検証用予算は128商品版で通り、1,024 / 4,096商品版で超過した。これは表示件数の比較で、同じ全件 UI の意味を保った最適化の比較ではない。

## 実測

Apple M5 / Chromium 156 / Node v24.21.0。各条件5 fresh contexts、warm 8回。外れ値を除外せず、中央値を以下に示す。CPU 4x は slowdown で、実端末の再現ではない。

| 商品数 | text + attribute 更新候補 | native warm click Event Timing | CPU 4x warm click Event Timing |
|---:|---:|---:|---:|
| 128 | 513 | 16ms | 16ms |
| 1,024 | 4,097 | 24ms | 72ms |
| 4,096 | 16,385 | 72ms | 304ms |

各列の warm click は40/40件を捕捉した。Event Timing の duration は8ms刻みで、field INP ではない。DOM 完了時間と混同しない。4,096商品版では native の warm DOM 完了が6.85ms、CDP LayoutDuration 差分が54.03msで、生成 handler の完了後にも大きな描画処理があった。CPU 4x ではそれぞれ25.45ms / 220.61msだった。

初回の一括操作から DOM 完了までの中央値は、native 239.20ms、CPU 4x 997.20msだった。p95 と全観測値は [結果表](../../benchmarks/results/heavy-render/latest.md) と [raw](../../benchmarks/results/heavy-render/raw.json) に置く。cold p95 は5件の小標本である。

## 分析できたことと残る範囲

依存の波及と大きな DOM を事前に検出でき、更新回数も実測と一致した。一方、生成 JS の操作数だけから時間を予測することはできない。大きな表の layout 負荷は別の計測として残す必要がある。

初回 commit では attribute locator の querySelectorAll が4,096回実行され、warm 操作では0回になった。通常速度の別診断 pass では、その検索の累積時間が約191.8msだった。これは本表の中央値ではなく、計測用 wrapper を使った単独診断である。別の profile=true / CPU 4x pass でも cold の run が約955ms、warm の run が約36msとなり、初回検索の寄与を調べる入口になった。

attribute locator は初回 commit 中に遅延解決される。User Timing の restore phase だけで locator 全体の費用を判断しない。静的 report の bindingLocators は候補数で、DOM 検索の走査時間や layout 時間の保証ではない。今回、runtime の検索方式自体は変更していない。

## 配布と確認

通常 build は diagnostics=false / profile=false。計測 probe と全 mutation の counter は Playwright から注入し、emitted JS に含めない。profile=true の別 pass は headline と分離した。通常ページが `isle.cost.json` を取得していないことも全 trial で検査した。

CI は MoonBit 36件、Node 187件、E2E 67件が成功した。vlmkit 0.24.0 の固定5 gate は共通 UI の128商品版で全 pass。4,096商品版は全行 correctness と desktop / mobile の初期・更新後・末尾 screenshot を確認した。表示の横はみ出しや数値の切れはなく、desktop は5列、mobile は商品コードを全幅とした2列で読めた。

[再現手順と source](../../benchmarks/heavy-render/README.md)、[全行の照合結果](../../benchmarks/results/heavy-render/correctness.json)、[検証記録](../../benchmarks/results/heavy-render/validation.json) を参照する。
