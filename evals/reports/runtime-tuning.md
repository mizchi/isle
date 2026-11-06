# チャンク集約と先読みのチューニング

並列取得を導入した時点の[集計](../../benchmarks/results/dashboard/history/before-tuning.json)と[生データのgzip](../../benchmarks/results/dashboard/history/before-tuning.raw.json.gz)を基準値として保存した。64項目と検証付きフォームのデータ・表示・API・測定する操作は維持し、次の4点を変更した。

1. **compiler のチャンク集約**。同じ component の小さい handler を、UTF-8 の生成 source 合計1024Bを上限にまとめる。schema Form と大きい handler、他の component は境界を維持する。lazy / preload の構成では `WorkItem` の4操作が1つの228B gzip module にまとまった。CodeRef の URL は共有し、export・capture・source・profile ID はそれぞれ保持する。eager では bundler による facade / 共通依存も生成されるため、物理サイズはその全てを数える。
2. **アプリの loading policy**。フォームと小さくなった作業項目の code を `eager` にした。初期転送量と初期評価を増やして初回操作の追加作業を減らす調整で、framework 全体の既定値は引き続き `lazy`。code を評価しても scope の復元や handler 呼び出しはしない。
3. **loader の削除最適化**。production の全 entry が preload / eager なら、操作時に inert なリンクを有効にする処理をコンパイル時定数で削除する。lazy を含むページと直接 ESM で使う adapter は既存の経路を保つ。
4. **eager の参照準備**。runtime の import Promise と eager entry の callable 参照を起動時に準備する。操作中の native import を省き、Document への接続・scope 復元・handler 呼び出しだけを操作時に行う。prepared callable map は生成 JS の registry の省略可能な第6要素で、snapshot v2 と CodeRef の保存形式は変えない。

`handlerChunkBytes: 0` で1 entry ずつの分割に戻せる。ダッシュボードは `ISLE_DASHBOARD_LOADING=lazy just dashboard` で lazy、`ISLE_DASHBOARD_LOADING=preload just dashboard` で取得だけの先読みを比較できる。どの設定でも取得・評価と state の復元は別で、今回も65 scope のうち操作した2つだけが復元される。

## 診断

既存の Resource Timing では通常環境の runtime / handler の応答は操作から1～2msで完了する一方、DOM 更新まで約40msかかっていた。配信用コピーへ module-body mark を追加した診断では、実クリック時の runtime 評価開始がイベントから32.6ms、操作完了が34.3msだった。合成クリックでは評価開始1.5ms、完了2.4msだった。[診断データ](../../benchmarks/results/dashboard/diagnostics/before-tuning.modules.json)と[Chromium trace](../../benchmarks/results/dashboard/diagnostics/before-tuning.trusted.trace.json.gz)を保存した。

この診断は instrumented で、初回の観測では合成クリック側に locator の自動 scroll もない。入力方法・ブラウザーの task scheduling・自動操作の影響を分離した実験ではなく、JS の計算量やブラウザー内部の原因を断定しない。合成クリックに切り替えて高速化したとは扱わず、本測定の実クリックと開始・終了条件を維持した。診断ツールは以後、両入力方法とも対象の scroll を済ませてから計測する。

## 検証

チャンク集約は、実際の生成 module を native ESM として読み込み、4つの export の解決が1回の import を共有することと、時間追加・保存・復元の capture / remote 引数が変わらないことを検査する。byte budget の0・小さい上限・UTF-8、component / Form 境界、生成 input の非破壊性と決定性も確認する。

先読み専用ページから不要な loader 処理が消えることを Red → Green で確認した。ダッシュボードでは、起動時の preload が生成 policy と一致し、その時点では state が復元されないこと、追加・ロック・保存・reset に不要な追加 JS request がないことを共通操作検査に加えた。lazy と preload の両設定で検査する。

`just ci` は Node 123件、MoonBit 27件、形式モデル27ケース・故障版10種、Playwright 55件、既存の2種類のフォームの a11y gate を通過した。ダッシュボードの共通操作も lazy / preload / eager の各設定で通過した。eager entry の callable identity、lazy entry が prepared map に入らないこと、準備失敗の rejection が未処理にならないこと、不正 callable が snapshot 復元前に拒否されることも確認した。状態・認可・フォームのモデルを変更したわけではなく、既存モデルの検査を維持している。

取得だけの preload 版も全96試行を行い、[集計](../../benchmarks/results/dashboard/history/preload-tuning.json)と[生データのgzip](../../benchmarks/results/dashboard/history/preload-tuning.raw.json.gz)を保存した。制限環境の初回操作は40.05ms、初回フォーム入力は4.15ms、保存は102.00msだった。preload 後も初回の native import を操作時に残す構成では、通常環境の初回操作が36.25ms残ったため、上記の eager 参照準備も実装した。

## 測定条件

初期JSが小さい従来の lazy 設定との比較であり、**compiler の変更だけによる高速化とは主張しない**。アプリの先読み policy を調整した効果を含む。生成した policy・chunk・export は結果 JSON の `configuration.isle` に記録する。速度は過去の標本を流用せず、4実装・2環境・各12回を再測定する。転送量は別試行で採取する。

時間は実イベントから期待する DOM 更新完了まで。INP / next paint / SSR throughput の測定ではない。Qwik は既定の preloader、Preact は SSR と hydrate、Isle は code 準備後も操作時に scope を再開する。同じ API・headless FormSession を使い、API delay は変更しない。[全測定表](../../benchmarks/results/dashboard/latest.md)と[方法](../../benchmarks/dashboard/README.md)を参照。

## 結果

Apple M5 / Node 24.21.0 / Chromium 156.0.8078.4 で最終版も96試行、転送量は別の8試行を実行した。過去の速度標本は流用していない。環境、依存バージョン、sample / warm 数、API delay が基準値と同じことを検査した。[最終集計](../../benchmarks/results/dashboard/history/after-tuning.json)、[最終生データのgzip](../../benchmarks/results/dashboard/history/after-tuning.raw.json.gz)、[3構成の比較 JSON](../../benchmarks/results/dashboard/tuning.json)を保存した。

以下は Isle の中央値、時間は ms。制限環境は page session の CPU 4倍 slowdown・通信遅延設定80ms・download 200000 B/s。1構成につき各12試行、連続操作は各環境144標本である。

| 項目 | 導入前・lazy | 集約＋preload | 最終・eager参照準備 |
|---|---:|---:|---:|
| 通常環境・初回操作 | 39.55 | 36.25 | 1.15 |
| 制限環境・初回操作 | 107.80 | 40.05 | 4.15 |
| 制限環境・連続操作 | 0.80 | 0.90 | 1.00 |
| 制限環境・初回フォーム入力 | 108.15 | 4.15 | 3.75 |
| 制限環境・保存 | 184.20 | 102.00 | 111.60 |
| 制限環境・DOMContentLoaded | 195.20 | 224.80 | 253.25 |

初回操作の最終 p95 は通常環境4.80ms、制限環境4.90ms。12試行の p95 は最大値であり、小さな差の有意性は主張しない。preload 版と最終版の保存時間の差も、API・通信の待ちを含むため、CPU コストの差とは扱わない。

gzip body の転送量は次のとおり。チューニング版では、このページの client code を操作前に取得・評価する。state の復元を一括で行うこととは区別する。

| 対象 | 導入前・lazy | 最終版 |
|---|---:|---:|
| HTML（inline CSS・snapshot 込み） | 9,024B | 8,961B |
| 初期外部JS | 1,550B | 8,290B |
| 操作後までの全外部JS | 8,126B | 8,290B |
| シナリオ全体の asset | 17,150B | 17,251B |

初期JSが6,740B増える一方、総転送量の増加は101Bだった。DOMContentLoaded も58.05ms遅くなった。初回操作の短縮はこの前倒しの効果を含むため、起動が全て高速化したとは言わない。小さな画面の選択肢として eager、初期転送を優先するページには lazy / preload を使い分ける。

同じ最終測定での比較も残す。以下は制限環境の中央値と gzip body の byte 数。

| 実装 | 初回操作ms | 連続操作ms | 初回フォーム入力ms | 保存ms | 初期外部JS | 全asset |
|---|---:|---:|---:|---:|---:|---:|
| Isle（今回のeager設定） | 4.15 | 1.00 | 3.75 | 111.60 | 8,290 | 17,251 |
| Qwik 1.20.3 | 129.10 | 15.00 | 8.10 | 113.80 | 28,410 | 50,266 |
| Qwik 2.0.0-rc.4 | 161.70 | 1.30 | 10.60 | 111.40 | 42,280 | 82,522 |
| Preact 11.1.1 | 3.20 | 1.00 | 2.95 | 107.70 | 10,041 | 15,220 |

この固定 workload では、Isle は操作時の待ちを Preact に近付けた一方、総転送量と起動指標では Preact が依然有利だった。Qwik 1 は Vite 7 / Rollup、他は Vite 8 / Rolldown、Qwik 2 は RC である。動的リスト、入れ子 component、共有 state、画面遷移、実機モバイル、複数 browser への一般化はしない。

vlmkit 0.24.0 の5つの gate と3幅の表示比較も通過した。matched computed style の差分は0、raw pixel 差分は従来と同じ小さい文字描画差だった。desktop の作業編集と mobile のエラー表示の画像も確認した。
