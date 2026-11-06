# Resource の自動接続

2026-11-05。`resources: { Counter: './resources.mjs' }` から component の初回 resume、親子 owner、native DOM 削除、widget disconnect へ所有・破棄カーネルを接続した。専用 resource / Once / `Suspense` 構文の実装ではない。

受入 fixture は [app.isle](../../e2e/fixtures/resource-bindings/app.isle) と [setup module](../../e2e/fixtures/resource-bindings/resources.mjs)。Node 10ケース、共有 widget engine の Chromium 8ケース、機能を削減した通常 app engine の7ケースを検査した。通常 app では widget 専用の1ケースを対象外とする。

- 初期表示では setup module を評価せず、初回 resume でのみ取得・初期化する。同じ instance で再実行せず、別 instance は別 owner を持つ。
- setup と handler の取得を Promise barrier で止め、並列で要求されることを観測した。取得中に DOM が削除された場合は setup / handler を実行しない。
- setup の完了は待つが、登録した非同期取得の完了は handler を待たせない。取得途中の unmount で abort し、遅い成功値も一度だけ解放する。
- 子だけ resume しても親 setup を実行しない。親の dispose / root の close では全子孫を先に無効化する。一つの cleanup が throw しても他の解放を続ける。
- native 削除で破棄し、同じ root 内の同期 DOM move は保持する。同じ scope ID を持つ二つの widget は、一方の切断後も他方を操作できる。
- setup の部分失敗、import の再試行、async setup の拒否と遅い rejection、閉じた controller の拒否を検査した。
- snapshot が不正な場合は handler / setup の import Promise を開始する前に拒否し、失敗する import の unhandled rejection を残さない。loader による manifest の modulepreload はこの前に発生し得る。
- SSR は resource module のパスを解決せず JS も出力しない。未使用の所有カーネル・MutationObserver・resources API は通常 build から除去する。
- profile build では resource-code / resource-setup を記録し、setup と restore の重複計測を避ける。

`just ci` は MoonBit 51、Node 226、既存 browser 67、制御構文 browser 4、resource browser 15、形式検査86ケース、評価 corpus と二つの Form a11y 検査を通過した。resource browser は共有8ケースと通常 app 7ケースの合計。`just widget-check` は Node 28、既存 browser 24、Workers dry run を通過した。ブラウザの検査は形式モデル全体との refinement 証明ではない。破棄カーネルとモデル由来の9反例 schedule の再生は引き続き Node tests に含まれる。

サイズは [size.json](../results/resource-bindings/size.json)。ES2023・diagnostics/profile 無効の同一 Counter で、resource 対応による全 JS の増分は raw 4,901 B / 各ファイル gzip 合計 1,789 B。ResizeObserver の短い adapter と registry を含む。SSR の JS は0 B。既存3アプリの前回 build 比は raw -2〜+2 B / gzip -3〜+3 B で、private property の mangle と参照先 hash の変化による。未使用 feature の実行コードが残らないことは別に検査した。HTTP 転送時間・性能比較の再測定ではない。

```sh
just resource-binding-check
just resource-binding-size
```

書きやすさ・意図の読解は [追加課題](../scenarios/resource-bindings/brief.md)で評価できる。参加者評価と読解の自動 grader はまだ実施していない。trusted setup が生の値を外へ保存する alias、UI state への ready / failed 公開、非同期 cleanup の依存順、独自 ShadowRoot host の切断通知は、別の DSL / adapter の契約として残る。
