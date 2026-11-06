# 大量発注行の静的解析とブラウザー計測

同じ4,096商品のデータから表示件数を変え、全表示行の数量・発注額・重量を一括更新する。確認メモは同じ大きな document 内の独立 owner。

## 静的解析

| 商品数 | DOM element | text patch 上限 | attribute patch 上限 | 算術演算上限 | 復元 locator | 検証用 budget |
|---:|---:|---:|---:|---:|---:|---|
| 128 | 2063 | 385 | 128 | 2433 | 513 | pass |
| 1024 | 16399 | 3073 | 1024 | 19457 | 4097 | exceeded |
| 4096 | 65551 | 12289 | 4096 | 77825 | 16385 | exceeded |

## native / CPU 1x

DOM 列は入力 event timestamp → 最後の期待 DOM 更新、median / p95 (ms)。Event Timing 列は同じ warm click の browser 計測と捕捉件数。

| 商品数 | cold DOM 完了 | warm DOM 完了 | warm 確認メモ DOM | warm layout (CDP) | warm click Event Timing |
|---:|---:|---:|---:|---:|---:|
| 128 | 18.30 / 19.40 | 0.95 / 1.60 | 0.40 / 0.60 | 3.94 / 6.40 | 16.00 / 16.00 (40/40) |
| 1024 | 36.20 / 36.70 | 2.50 / 3.10 | 0.30 / 0.40 | 19.73 / 22.38 | 24.00 / 32.00 (40/40) |
| 4096 | 239.20 / 252.70 | 6.85 / 10.00 | 0.20 / 0.30 | 54.03 / 56.08 | 72.00 / 80.00 (40/40) |

## cpu4 / CPU 4x

DOM 列は入力 event timestamp → 最後の期待 DOM 更新、median / p95 (ms)。Event Timing 列は同じ warm click の browser 計測と捕捉件数。

| 商品数 | cold DOM 完了 | warm DOM 完了 | warm 確認メモ DOM | warm layout (CDP) | warm click Event Timing |
|---:|---:|---:|---:|---:|---:|
| 128 | 22.10 / 25.20 | 1.80 / 2.40 | 1.05 / 1.40 | 7.53 / 8.48 | 16.00 / 16.00 (40/40) |
| 1024 | 89.30 / 94.60 | 6.60 / 7.70 | 1.20 / 1.50 | 55.15 / 58.63 | 72.00 / 80.00 (40/40) |
| 4096 | 997.20 / 1526.10 | 25.45 / 37.30 | 1.10 / 1.60 | 220.61 / 233.29 | 304.00 / 320.00 (40/40) |

## 方法と限界

- 5 fresh contexts / 件数 / CPU条件、各 context に warm 8回。順序を round ごとに回転し、外れ値を除去しない。cold の p95 は小標本。
- production minified、diagnostics=false、profile=false。計測 probe は Playwright から注入し、通常 JS に含めない。HTTP は localhost gzip、追加のネットワーク遅延なし。SSR と server の圧縮 CPU は計測前。
- 対象 node だけを観測して DOM 完了を計測。全 DOM の mutation 数検査は別 pass。表示件数の違いであり、同じ全件 UI の意味を変えずに高速化した比較ではない。
- DOM 完了は次の paint や INP ではない。CDP の Script/Layout/RecalcStyle/TaskDuration は click 前から二つの rAF 後までの累積 duration 差分で、OS の CPU 消費時間ではない。automation/probe の仕事も含む。
- warm click の Event Timing は startTime が1ms以内で一致する一意な trusted click だけを結合する。16ms reporting threshold、duration は8ms刻み。非同期 cold 操作の最終結果の描画や field INP と混同しない。
- 4x は Chromium CPU slowdown で、特定端末の再現ではない。Event Timing は閾値以下を0に補完せず、long task も生データに残す。
- 時間を静的に保証せず、計算・更新上限と layout の不明を区別する。予算は検証用の設定値。
- instrumented.json は profile=true の別 pass。通常 runtime の速度比較には混ぜない。

Node v24.21.0; Chromium 156.0.8078.4; Apple M5; darwin/arm64.
