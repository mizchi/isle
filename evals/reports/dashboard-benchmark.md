# 作業計画ダッシュボードの実装と測定

この報告の数値は操作時の並列取得を導入する前の[基準値](../../benchmarks/results/dashboard/history/before-interaction-preload.json)。並列取得を追加した後の結果は[変更と比較](parallel-loading.md)に記録する。

Counter より広い操作を検証するため、64件の作業項目とプロジェクト作成フォームを Isle / Qwik 1 / Qwik 2 RC / Preact に実装した。同じデータ、CSS、API、操作列で比較する。[測定条件と実行方法](../../benchmarks/dashboard/README.md)、[全測定表](../../benchmarks/results/dashboard/latest.md)、[生データ](../../benchmarks/results/dashboard/raw.json)を併せて参照する。

## 今回試した範囲

作業項目ごとの独立状態、2つの派生値、時間追加、復元、ロック、非同期保存を持つ。フォームは5 field、相関検証、認可付き非同期検証、エラー一覧、pending、二重送信防止、reset を扱う。チーム切替とメモ開閉は Web 標準の要素と CSS を使う。

Isle は64項目とフォームを65 scope に分けた。共通操作検査では、項目1つとフォームだけの操作で、その2 scope だけが snapshot を復元することを確認した。JavaScript 無効でも初期表示とメモ開閉が動く。速度測定には、この復元観測用 wrapper を入れていない。

動的なリスト追加・削除、scope 間の共有集計、入れ子 component、画面遷移はまだ含まない。プロジェクト作成後は保存結果を表示する。この固定レコード群は、現行実装で扱えるアプリの基準として使う。

## 実装中に見つかったこと

- Isle の要素 allowlist が `details` / `summary` を拒否した。コンパイル・SSRの回帰テストを先に追加し、parser と codegen の許可要素に追加した。runtime の実装追加は不要だった。
- Qwik のフォームで初期値だけを渡すと、再描画時に入力が初期値へ戻った。共通 FormSession の現在値を view に含め、Qwik の input をそれに結び付けた。
- Preact では同じ項目への短時間の3クリックで更新が失われた。関数形式の state 更新に直し、同じ連打の回帰検査を全4実装に追加した。
- 最初の転送量観測では window の Resource Timing に worker 経由の取得が揃わなかった。転送量を別試行に分け、BrowserContext の HTTP response を URL ごとに集計するようにした。

フォームの検証・非同期制御には同じ headless FormSession を使い、表示は各 framework が担当する。入力制御の違いを検査しつつ、異なるフォームライブラリの機能差が速度差に混ざることを抑えた。

## 検証と評価の区別

共通の機能検査と表示比較を実行した。3幅の matched computed style 差分は0。raw pixel difference は Qwik 2 RC が0、Qwik 1 / Preact が最大約0.0028%で、インライン text node の境界付近の文字描画差を画像で確認した。受入条件は0.01%以下で、実値を[表示比較の結果](../../benchmarks/results/dashboard/visual/summary.json)に残す。

`just ci` は MoonBit 27件、Node 112件、形式モデル27ケースと変異10種、既存の Playwright 50件、フォームの a11y 検査を通過した。ダッシュボード固有の操作検査も全4実装で通過した。これらは挙動の検査であり、人間や第三者 agent による書きやすさの評価ではない。

[読解・記述課題](../scenarios/dashboard/brief.md)も用意した。scope 数、静的データの扱い、action の認可・非同期検証境界を採点し、名前付き entry と派生値を追加する記述課題で診断・修正回数を記録できる。grader の正誤判定は回帰テスト済み、参加者評価は未実施。

## 結果の読み方

2026-11-04 JST、Apple M5 / Node 24.21.0 / Chromium 156.0.8078.4 で、通常環境と制限環境を各実装12回、合計96試行測定した。連続操作は各試行12回。転送量は別の8試行で採取した。最終結果の `reusedLatencySamples` は `false` で、過去の速度標本は流用していない。

制限環境（CPU 4倍 slowdown、network latency 設定80ms、download 200000 B/s）での中央値は次のとおり。時間は ms、転送量は gzip body の byte。初期JSはクリック前に取得を開始した外部JS、総転送量はシナリオ終了までの HTML / JS / 補助 asset の合計。

| 実装 | 初回の時間追加 | 同じ項目の連続操作 | 初期JS | 総転送量 |
|---|---:|---:|---:|---:|
| Isle | 192.65 | 0.80 | 1,477 | 16,880 |
| Qwik 1.20.3 | 126.75 | 15.55 | 28,410 | 50,266 |
| Qwik 2.0.0-rc.4 | 165.80 | 1.00 | 42,280 | 82,527 |
| Preact 11.1.1 | 2.75 | 0.90 | 10,041 | 15,220 |

通常環境の初回操作は Isle 40.30ms、Qwik 1 40.35ms、Qwik 2 RC 43.95ms、Preact 0.70ms。同じ項目の連続操作は順に0.30 / 15.30 / 0.40 / 0.30msだった。Isle の初期JSは小さいが、このシナリオの総転送量は Preact より大きい。連続操作の1ms前後の差から有意な優位性は主張しない。

次の改善候補は初回操作の依存読み込み。Isle の取得列では runtime の後に handler の request が始まる。manifest から両者を並列取得する方法と、予測 preload / eager の設定を比較できる。時間のすべてを通信やCPUに帰属させるには別の trace が必要で、今回の結果だけでは断定しない。今回は lazy の基準値を残し、測定途中でこの読み込み実装を変更していない。

測るのは browser event timestamp から期待する全 DOM 値が揃うまでで、次の描画や INP ではない。初回操作と同じ項目の連続操作を分け、転送量には HTML 内の state / CSS / inline script も含める。Preact の初回操作には、その前に読み込んだ hydrate 用 JS のコストが含まれないため、初期転送量・ページの指標も併せて読む。

DOM 更新を frame に合わせる scheduler の待機も時間に含まれる。測定値の比をCPU計算量の比として扱わない。CDP の設定は page session に行い、worker target ごとの追加制御はしていない。

全実装の HTML と gzip asset を事前にメモリーへ用意し、配信中の SSR CPU は測らない。API は同じ遅延設定を使う。各環境・実装12試行であり、p95 は小標本の最大値になる。実機モバイル、複数 browser、production の DB / 認証・ネットワーク、SSR throughput への一般化はしない。
