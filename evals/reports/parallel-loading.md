# manifest による操作時の並列取得

この報告は[並列取得導入時の記録](../../benchmarks/results/dashboard/history/after-interaction-preload.json)。その後のチャンク集約・フォーム先読みの結果は[追加のチューニング](runtime-tuning.md)に記録する。

最初の操作で runtime と handler を直列に取得していた部分を変更した。ビルド時の manifest から、対象 handler の `requires` と静的 `imports` の closure を取り、重複する module URL を1つにまとめる。

確定した URL を `<template data-isle-load="1">` 内の `modulepreload` link として HTML に埋める。初期表示では inert のまま、イベントを受け付けたときに対応する link を head へ移す。manifest JSON の追加通信・parse は不要。起動時の eager / preload 対象は除き、無関係な動的 descendant はたどらない。[形式と挙動](../../docs/code-references.md)を参照。

取得と実行は別の段階である。modulepreload は module map を準備し、通常の import / dispatch が評価・snapshot 復元・handler 呼び出しを行う。modulepreload の完了を待つ新しい queue は置かない。metadata がない adapter は従来の import 経路を使用できる。([HTML Standard](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload))

## 検証

先に失敗を確認したテストでは、runtime の応答を止めると handler の取得も止まった。変更後は runtime を止めたまま handler の取得が完了する。handler の top-level に観測用コードを入れ、取得だけでは評価されないこと、snapshot も復元されないことを検査した。runtime の取得中に dispose した場合は、応答が届いても handler を実行しない。別 scope の操作で同じ handler を再取得しないことも確認した。

production / development の両経路で検証した。Node では共有依存の重複排除、静的 import の循環、動的な別枝の除外、lazy な欠落依存、URL の escape、配信 base / nonce、eager / preload との重複排除を検査する。既存の SSR 専用 JS ゼロ、queue、Form、認可、transaction、profile の検査を維持した。

`just ci` は Node 116件、MoonBit 27件、形式モデル27ケース・変異10種、ブラウザーテスト53件、フォームの a11y 検査を通過した。ダッシュボード固有の共通操作も4実装で通過し、Isle は操作した2 scope だけを復元する。

vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions も通過した。3幅の比較では matched computed style の差分0を維持し、raw pixel 差分は従来同様 Qwik 2 RC が0、Qwik 1 / Preact が最大約0.0028%。desktop の編集後と mobile の保存後の画像も確認し、値・フォーム・レイアウトに崩れがないことを確認した。[表示比較の記録](../../benchmarks/results/dashboard/visual/summary.json)を参照。

## 測定

[導入前の集計](../../benchmarks/results/dashboard/history/before-interaction-preload.json)と、[生データのgzip](../../benchmarks/results/dashboard/history/before-interaction-preload.raw.json.gz)を保存した。導入後も[同じダッシュボード](../../benchmarks/dashboard/README.md)を同じ4実装・2環境・各12試行で測る。転送量は別試行で取得する。測定結果は[最新の全表](../../benchmarks/results/dashboard/latest.md)と[生データ](../../benchmarks/results/dashboard/raw.json)に保存する。

2026-11-04 JST、Apple M5 / Node 24.21.0 / Chromium 156.0.8078.4 で全96試行を再測定した。転送量は別の8試行で取得し、過去の速度標本は流用していない。前後で環境、依存バージョン、sample / warm 数、API delay が同じであることを検査した。[導入後の集計](../../benchmarks/results/dashboard/history/after-interaction-preload.json)、[導入後の生データのgzip](../../benchmarks/results/dashboard/history/after-interaction-preload.raw.json.gz)、[前後比較と request 時刻](../../benchmarks/results/dashboard/parallel-loading.json)も保存した。

Isle の初回の時間追加は次のとおり。単位は ms、中央値 / nearest-rank p95。各12試行の p95 は最大値になる。

| 環境 | 導入前 | 導入後 |
|---|---:|---:|
| 通常環境 | 40.30 / 42.20 | 39.55 / 43.60 |
| CPU 4倍・通信遅延設定80ms | 192.65 / 204.00 | 107.80 / 113.50 |

制限環境では中央値が84.85ms、約44%短くなった。通常環境はほぼ同等。連続操作の中央値も、通常環境0.30ms・制限環境0.80msを維持した。

Resource Timing でも両環境の全12試行で handler の取得開始が runtime の応答完了より早くなった。導入前は両環境とも0/12だった。制限環境の最初の試行では、イベントから runtime の取得開始が2.5ms、handler が3.1ms、runtime の取得完了が104.5msだった。URL と時刻は上記の前後比較 JSON から追える。

gzip body の転送量は次のとおり。起動時に取得する JS は loader のみで、runtime と handler の要求は操作後に始まる。

| 対象 | 導入前のbyte | 導入後のbyte | 増分 |
|---|---:|---:|---:|
| HTML（inline CSS・snapshot・metadata 込み） | 8,827 | 9,024 | +197 |
| 初期外部JS | 1,477 | 1,550 | +73 |
| 操作後までの全外部JS | 8,053 | 8,126 | +73 |
| シナリオ全体の asset | 16,880 | 17,150 | +270 |

runtime と handler の chunk は同じ内容・hash を保ち、初期 loader と HTML metadata だけが増えた。64項目の scope ごとに複製せず、5種類の handler と runtime の6リンクを共有する。新しいライブラリやブラウザー固有 API は追加していない。

Preact は引き続きこのシナリオの総転送量が15,220Bで小さく、hydrate 済みの初回操作も速い。今回改善したのは Isle の lazy な初回操作であり、一般的な優位性を示すものではない。通常環境で残る約40msの内訳は、別途 trace で確認する必要がある。

時間はイベントから期待する全 DOM 値が揃うまで。INP / 次の paint / SSR throughput の測定ではない。前後は別の実行であり、微小な差の統計的な優位性は主張しない。parallel request の成立は、速度差と独立した応答遮断の回帰テストでも確認する。
