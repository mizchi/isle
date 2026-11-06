# 作業計画ダッシュボードの速度比較

64 件の作業パッケージと、プロジェクト作成フォームを Isle / Qwik 1 / Qwik 2 RC / Preact で実装しています。従来の Counter fixture とは別の比較です。

```sh
just dashboard                 # build → 共通操作の検査 → 速度測定 → 表示比較
just dashboard-bench 12 12      # 各環境12回、同じ項目の連続操作を各回12回
just dashboard-visual
just dashboard-diagnose         # 計測用 mark と trace。速度の標本には混ぜない
just dashboard-serve            # http://127.0.0.1:4193/dashboard/isle/
```

同じサーバーの `/dashboard/qwik/`、`/dashboard/qwik-next/`、`/dashboard/preact/` でも操作できます。Node 24+、pnpm、MoonBit、Playwright Chromium が必要です。`pnpm exec playwright install chromium` でブラウザーを用意します。

- [実測表](../results/dashboard/latest.md) / [集計 JSON](../results/dashboard/latest.json) / [各試行の値](../results/dashboard/raw.json)
- [共通操作の検査](../results/dashboard/correctness.json)
- [表示比較と品質 gate](../results/dashboard/visual/summary.json)
- [実装で見つかった問題と読解 eval の状況](../../evals/reports/dashboard-benchmark.md)
- [manifest による並列取得の変更と比較](../../evals/reports/parallel-loading.md)
- [チャンク集約とフォーム先読みによる調整](../../evals/reports/runtime-tuning.md)

## アプリの要求

各作業項目は、編集時間、保存済み時間、ロック状態を独立して持ちます。見積額と未保存差分を計算し、時間追加、下書きの復元、ロック、非同期保存ができます。チーム別の表示切替はネイティブの radio と CSS `:has()`、作業メモは `details` / `summary` を使います。これらの静的な操作に framework JS は必要ありません。

プロジェクト作成は5 field の型付き FormData、長さ・メール・数値・相関検証、認可付き非同期検証、エラー一覧、pending、二重送信防止、reset を持ちます。`Taken project` はサーバー検証で拒否します。全実装が同じ server action / policy / validator を通ります。デモ principal は固定で、実認証や DB の実装比較ではありません。

データと表示仕様は `model.mjs` / `shell.mjs`、Isle の宣言は `../variants/isle/dashboard.isle`、各 framework の実装は `../variants/*/src/dashboard/` にあります。フォームの検証・非同期制御は共通の headless FormSession を使用し、DOM の描画はそれぞれの framework が担当します。フォームライブラリ全般の優劣を比較するものではありません。

Isle は65個の独立 scope として実装しています。Qwik / Preact は同じ64件をそれぞれの component で描画し、Preact は SSR HTML を hydrate します。Isle の現行制約に合わせた固定レコード群で、動的リストの差分処理、共有集計 state、入れ子 component、ルーターは含みません。プロジェクト作成後は保存結果を表示し、動的なプロジェクト一覧を追加する機能はありません。

## 測定方法

初期 HTML は全実装で事前に SSR し、asset も共通サーバーのメモリーに用意してから測ります。HTTP 配信中の SSR / ファイル I/O / gzip 圧縮の CPU 差は含めません。サーバーの検証と operation の prepare には、それぞれ同じ20msの待ち時間を設定します。読み取り検証だけの request は commit しません。

環境は通常の desktop と、CPU 4倍 slowdown・network latency 設定80ms・download 200000 B/s・upload 93750 B/s の2つです。Chrome DevTools Protocol の `setCPUThrottlingRate`、`emulateNetworkConditionsByRule`、`overrideNetworkState` を使います。実機のモバイル端末ではありません。[CDP Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)、[Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)

CDP の設定先は page session です。worker target ごとの CPU・通信制御は追加していません。worker の HTTP 取得は転送量に含めますが、実機の全 thread が同じ制約を受けることを再現した測定ではありません。

各試行は新しい browser context、service worker 禁止、1280×900です。同じ試行内の HTTP / module cache は通常どおり使います。各 round の実装順を循環させ、順番の偏りを減らします。navigation の `DOMContentLoaded` の後、通常の locator click を最初に実行します。クリック前の scroll・安定待ち・driver 通信の時間は操作の測定に含めません。Qwik の標準 preloader は有効。Isle のチューニング版ではフォームと作業項目に `loading: 'eager'` を指定し、小さな handler は同じ component 内で1KiBの生成 source 予算にまとめます。`ISLE_DASHBOARD_LOADING=lazy just dashboard` で全て lazy、`ISLE_DASHBOARD_LOADING=preload just dashboard` で取得だけの先読みにできます。framework 自体の既定値は lazy のままです。実際に生成した policy と chunk/export を結果 JSON の `configuration.isle` に残します。全実装で Speculation Rules は無効です。

Isle の lazy loader は、操作時に manifest から生成した inert な modulepreload link を有効にし、対象 handler と runtime・静的依存を並列取得します。初期表示での prefetch は追加していません。[並列取得を導入する前の基準値](../results/dashboard/history/before-interaction-preload.json)も保存しています。

測定開始は browser の event timestamp、終了は対象 DOM の期待値が全て揃った MutationObserver callback です。Node 側の時計や Playwright の往復時間は使いません。2つの派生値が揃うこと、更新のない操作を測らないこと、欠けた対象や不正なサンプルで失敗することを回帰テストにしています。中央値、nearest-rank p95、min、max、n を保存し、外れ値を削除しません。12試行の p95 は小標本の最大値になるので、差の有意性を主張しません。

測定する操作は初回の時間追加、同じ項目の連続操作、別 scope の初回操作、非同期保存、フォームへの初回入力、フォーム送信、32項目への一括操作です。一括操作だけは synthetic click で、通常のクリックと別の列にします。

これは **DOM 更新完了までの時間**です。next paint / INP とは異なります。FCP、Long Tasks、Event Timing も JSON に残しますが、Event Timing の16ms未満の未報告値をゼロとして集計しません。[Event Timing 仕様](https://w3c.github.io/event-timing/)

転送量は速度とは別の試行で、BrowserContext の HTTP response header の Content-Length を集計します。worker 経由の取得も対象にして URL ごとに一度数え、RPC と HTTP header / 再送は asset 合計から除きます。HTML は inline script・CSS・snapshot を含みます。初期 JS は「最初のクリック前に request が始まったもの」で、クリック前に完了済みとは限りません。通常は各実装・環境1回の転送量測定で、速度の12試行とは標本数を分けます。window の Resource Timing だけで全通信を数えたとは扱いません。

`run.mjs --reuse-latencies` は、保存済み測定値に転送量の測定を追加し直すための明示的な補助オプションです。生成 policy・chunk/export、sample 数・warm 数と参照 chunk hash を検査しますが、CSS や API など測定条件を変更した場合には使わず、全体を再測定してください。最終 JSON の `reusedLatencySamples` で区別できます。

`diagnose.mjs` は配信する JS のコピーに module 評価時の mark を追加し、実クリック／合成クリックと Chromium trace を `results/dashboard/diagnostics/` に出力します。production のファイルは変更しません。instrumented な診断であり、通常の速度測定とは別です。入力方法・自動操作の違いを性能改善として扱わず、本測定は実クリックを維持します。

## 機能・表示の検証

同じ操作列で SSR、JavaScript 無効の表示、ネイティブ disclosure、全64件の内容、独立状態、派生値、連打、保存、reset、ロック、チーム絞り込み、相関・サーバー検証、送信、二重送信、button の DOM identity を確認します。Isle では、作業項目1個とフォームを操作しただけなら、65 scope のうちその2つだけが snapshot を parse することも確認します。この観測用 wrapper は速度測定に入れません。

vlmkit 0.24.0 で integrity / copy / scroll / handlers / interactions を検査します。表示比較は wide / desktop / mobile の3幅。matched computed style の差分0、raw pixel difference 0.01%以下を受入条件とし、実値を保存します。Qwik 1 / Preact の差分は最大約0.0028%で、インライン text node の境界付近の小さな文字描画差を画像で確認しました。Qwik 2 RC は0でした。初期・編集とメモ展開・エラー・保存後を desktop / mobile の画像でも確認しています。

Qwik 1 は既存の対応構成である Vite 7 / Rollup、他は Vite 8 / Rolldown を使います。Qwik 2 は RC です。バージョンは package.json と結果 JSON に記録します。ここで得られる結果は、この固定 workload と設定の結果です。
