# EVAL-04: universal 子の操作を親へ安全に渡したい

> pure子へ親イベントを渡す記法が見つからず親rowでclickを受けた結果、見出しクリックもtoggleする。

出典: author-v1 `report.md`。通常の7操作とroot保持は受入検査を通るが、クリック対象が広すぎる。この副作用はagent自身の追加Playwright検査で確認された。

状態: 未修正、次の機能候補の最優先。反復を持つownerではRenderFragment投影が未対応で、JSON propsに任意の関数を通す契約もない。既存の制限を回避するDOM eventの手書きは追加しない。

検討する契約: universal 子へ渡すイベント参照をコンパイラがインライン展開し、親ownerとimmutable row keyを保持する。別client owner・server境界・snapshotへの関数混入を拒否する。任意関数propsの解放ではなく、型付けされたevent capabilityか限定的な描画slotを比較する。

次の受入条件: Toggleのみ親stateを一回更新、見出し/カード余白クリックは更新しない、Forのkeyとrootを保持、resume時の追加共通runtimeなし、SSR JavaScript 0。現在のgraderの成功条件には見出しクリックは含まれないため、passを完全なアプリUXの保証とは解釈しない。
