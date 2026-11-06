# 大量の商品行を実際に描画して解析する

4,096商品の発注計画を用意し、表示件数128 / 1,024 / 4,096を比較します。一括操作は、表示中の全商品の数量・発注額・重量と `data-cost` を変更します。独立した確認メモの操作も、同じ大きな document 内で測ります。

待機や無意味な反復で負荷を作りません。商品ごとの数量、商品代、手数料20円/個、梱包費5円/個、重量を実際に計算して表示します。全行の正しさを独立した計算式で検査します。

## 実行

```sh
just heavy-check           # build と全行の browser correctness
just heavy-bench          # 各条件5 contexts、warm 8回
just heavy-quality        # vlmkit の固定5 gate と screenshot
just heavy-serve          # http://127.0.0.1:4195/heavy-render/4096/
```

試行回数は `just heavy-bench 5 8` のように指定します。通常 build は `diagnostics: false, profile: false` です。CPU 1x と Chromium の CPU 4x slowdown を測り、localhost に追加のネットワーク遅延は設定しません。

`benchmarks/generated/heavy-render/<件数>/app.isle` に実際の DSL、`benchmarks/dist/heavy-render/<件数>/` に production 出力と `isle.cost.json` を生成します。v0 に動的 list 文法がないため、行の列挙は build 時に行います。実行時にテンプレートを生成する JS は追加しません。

```sh
just cost benchmarks/generated/heavy-render/4096/app.isle
just cost benchmarks/dist/heavy-render/4096/isle.cost.json benchmarks/heavy-render/budgets.json
```

後者は検証用予算を超過するため、非ゼロの終了コードになります。128商品版は同じ予算を通ります。閾値はこの検証用の設定で、端末共通の速度保証ではありません。

## 照合するもの

- `Sheet.addAll` の text patch 上限は `3 × 商品数 + 1`、attribute patch 上限は商品数です。
- browser の MutationObserver で更新数を数え、全商品の値と attribute を照合します。既存の row node を保持し、element の作成・削除がないことも検査します。
- `Audit.check` は text 更新1回です。先にこの操作をしても Sheet の handler は取得せず、Sheet の snapshot は復元しません。
- 初回の attribute locator 検索回数を数え、warm 操作では検索を再実行しないことを調べます。検索の累積時間は correctness 用の別計測です。
- latency 用 probe は最後の期待値など少数の node だけを監視します。大量の mutation を数える pass の負荷を、速度の測定へ混ぜません。

DOM 完了は入力の event timestamp から期待した最終値までです。描画側は warm click の Event Timing と CDP の LayoutDuration などを別に記録します。Event Timing は startTime が1ms以内で一致する一意な trusted click だけを結合し、欠測を0にしません。これは field INP ではありません。([Event Timing](https://www.w3.org/TR/event-timing/), [CDP Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/))

CPU 4x は実端末の再現ではなく、Chrome の slowdown 設定です。CDP の補助 duration 区間には automation / probe の仕事も入ります。raw の `cpuIntervalMs` はこの差分を保持する名前で、OS の CPU 消費時間ではありません。([CDP CPU throttling](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate))

## 出力

[結果表](../results/heavy-render/latest.md) に静的解析と実測の中央値 / p95 を置きます。

- `build.json`: source / bundle の identity、静的な操作数、budget。
- `correctness.json`: 全行の検査、mutation 数、snapshot 復元、locator 検索。
- `raw.json`: 既定値では30 contexts の全540操作、閾値付き Event Timing と Long Task。
- `latest.json`: 集計と実行環境。外れ値を除去しません。
- `instrumented.json`: 4,096商品・CPU 4x・profile=true の別 pass。速度比較の headline へは混ぜません。
- `quality/`: vlmkit 0.24.0 の5 gate と desktop / mobile の初期・更新後・末尾 screenshot。gate は同じ UI の128商品版、4,096商品版は全行 correctness と screenshot を対象にします。

表示件数の比較は、同じ全件 UI の意味を保った最適化とは区別します。64K element の layout や初回の locator 検索は browser / runtime の仕事を含むため、静的な演算数だけで時間を説明できません。今回の検証で core runtime の実装を変更せず、計測コードは Playwright から注入するか、明示した profile build に限定します。
