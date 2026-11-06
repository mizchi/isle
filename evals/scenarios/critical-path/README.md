# Critical path patterns

`just critical-path-check` で、初回描画を済ませてから JavaScript を到着させる。初期 raw layout shift = 0 を要求するため、入力後500msの CLS 除外で問題を隠さない。

- `fixture.isle`: 静的表示、SSR-only、単一の値、遅延分岐、100行の keyed list、同じコンポーネントの複数 owner。
- TodoMVC: 空、1・20・500件の復元、URL の初期絞り込み、長文、壊れた保存値、ストレージ禁止、遅い CSS、最初の操作と通常キー入力。
- `route-split`: handler を全て別チャンクにし、route だけ1900ms遅延。全件を先に表示してから絞り込む実装はリジェクトする。
- `unreserved.css`: commit `253fe89` の CSS を保存した負例。初期描画後に保存データを復元するとシフトを検出できなければ、計測器側の失敗としてリジェクトする。

375 / 768 / 1280px で Chromium の実際の Layout Instability API と FCP/LCP、移動要因の矩形を記録する。SSR DOM の同一性、説明文の座標、横スクロール、複数 owner の状態分離とコード再利用も検査する。observer・計測コードは配布物に入れない。

記述の意図は「Grid の領域予約とデータ適用順を、コンポーネントのロジックと分けて指定する」。リストは内容を切り捨てず、native scroll で予約領域内に収める。空表示には余白が残る。任意の CSS や外部フォントへの普遍的な CLS 保証ではない。

[結果](../../../benchmarks/results/critical-path/latest.md)・[再現コード](../../../benchmarks/critical-path/run.mjs)
