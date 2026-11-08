# EVAL-04: universal 子の操作を親へ安全に渡したい

> pure子へ親イベントを渡す記法が見つからず親rowでclickを受けた結果、見出しクリックもtoggleする。

出典: author-v1 `report.md`。通常の7操作とroot保持は受入検査を通るが、クリック対象が広すぎる。この副作用はagent自身の追加Playwright検査で確認された。

状態: 修正済み。既存の `children: RenderFragment` を条件式・反復を持つuniversalな子でも静的に展開する。親が書いたボタンだけへイベントを接続し、親のstateとrow captureを保持する。JSON propsへ任意の関数を通す機能は追加しない。

検討した契約: universal 子へ渡すイベント参照をコンパイラがインライン展開し、親ownerとimmutable row keyを保持する。別client owner・server境界・snapshotへの関数混入を拒否する。任意関数propsの解放ではなく、型付けされたevent capabilityか限定的な描画slotを比較する。

受入条件: Toggleのみ親stateを一回更新、見出し/カード余白クリックは更新しない、Forのkeyとrootを保持、resume時の追加共通runtimeなし、SSR JavaScript 0。元のgraderには見出しクリックが含まれていなかった。追加した `--event-scope` では旧wrapperの実装を拒否し、投影したボタンの実装を受理する。[実行例](../../examples/lexical-events/README.md)と[回帰シナリオ](../../evals/scenarios/lexical-events/README.md)を保存した。
