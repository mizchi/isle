# ADR-0002: レイアウト反例の可視化と原因追跡

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 1「反例の可視化と原因追跡」

## 背景

現在はviewport、違反field、正確な差分、source位置、key列、前後のpathを取得できる。
一方、対象を動かした親Grid・track・gap・media/container条件までの説明は揃っていない。
[反例のJSON](../layout-transitions.md)を読めても、どのCSSを見直せばよいかが分かりにくい。

## 判断

CSS由来の幾何factに依存とsourceの由来を付け、反例から原因となるfactを逆向きに辿る。
説明は既存の証明結果の付加情報とし、説明生成の成功でproofのstatusを変更しない。
playgroundは反例の幾何をSVGの模式図として描画する。これはCSSの描画結果を証明に利用する処理ではない。

### 契約と責務

設計案の`ExplanationIR`は、proof digest、対象identity、前後のcase、viewport、
有理数の矩形、fieldの差分、根拠factとsource参照を持つimmutableなJSONとする。
汎用コアはbox pathとCSS位置を保持し、Isle adapterがnodeId・key列・template位置を補う。
factの依存辺には「Grid trackから割当」「gapを加算」「条件で分岐」等の根拠種別を付ける。

sourceが追えないfactは不足として表示する。近くのCSS宣言を原因と推測して断定しない。
修正案の自動適用は初版に含めない。将来の修正案も、元と同じ入力領域で再検証してから提示する。

## 依存関係と変更箇所

既存LayoutIRとnoshiftの反例で開始できる。[0001](0001-static-layout-instability-verification.md)の
scoreやframeが未実装でも独立に完了できる。

- 汎用抽出: `packages/css-verifier/src/layout/`のgrid、linear、conditions、位置計算。
- 証明結果: `packages/css-verifier/src/transitions.mjs`と契約の診断型。
- Isle側: `lib/layout-noshift.mjs`、`lib/layout-summary.mjs`。
- 表示: `playground/layout.worker.mjs`、`playground/layout-checker.mjs`、`playground/main.mjs`。

## 実装計画

1. **探索**: 現行の「key bが40px移動」と「子4個の最小幅不足」を保存し、既にある出典と欠けた依存を棚卸しする。
2. **Red**: gap、track、media境界を一つずつ変えたfixtureで、対象と原因宣言の対応を要求する。無関係な同名classや別componentの宣言へ飛ぶ故障を検出する。
3. **Green: コア**: 依存factに安定した参照を付け、演算の単純化・分岐・合成でも由来を保持する。反例に必要な部分graphだけを抽出する。
4. **Green: adapter/CLI**: key列、前後のpath、親の割当と子の要求を結び付ける。CSS位置とtemplate位置を区別して要約する。
5. **Green: playground**: before/afterを同一scaleで表示し、移動対象・寸法・原因のCSS位置を選択できるようにする。複数矩形の描画量に上限を設ける。
6. **Refactoring**: source map、幾何、説明文、表示を分離し、説明JSONをNodeとWorkerで共有する。proof全体をSVGへ埋め込まない。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 同じkeyの40px移動 | identity・前後のpath・差分40・原因trackを表示 |
| gap込みの4箱 | 親の割当と各子の要求を混同しない |
| media/container境界 | 反例が属する条件と元の宣言へ到達 |
| 入れ子component | 公開rootとprivateな内部の出典を区別 |
| CSS未対応 | Unknownの根拠を表示し、存在しない矩形を描かない |

- [ ] 既存proofのstatus・数値・入力領域は説明の有無で一致する。
- [ ] 表示した差分は有理数の正本から計算し、近似表示を証明へ戻さない。
- [ ] sourceとlabelは安全に文字列として表示し、利用者の文字列をHTMLとして評価しない。
- [ ] 390px/1440px、キーボード操作、図のスクロールをPlaywrightで確認する。
- [ ] 同一fixtureの配信HTML・JS・CSS増分0 byte。説明データはbuild/debug出力に限る。

追加evalは`evals/scenarios/layout-explanations/`に、説明JSONと期待するsource対応を置く計画。
既存の回帰確認は`just noshift-check`、`just layout-contract-check`、`just playground-check`。

## 代替案と未決事項

ブラウザーsnapshotだけではsolverが使った入力・条件を説明できないため、IRの模式図を採る。
最小原因集合の厳密な計算は初版に含めず、まず実際に使った依存経路を表示する。
fact graphの最大件数と省略表示の閾値は、重いGridのevalから決めて記録する。

## Issue化

タイトル案: `layout反例から原因CSSを追跡し、playgroundに前後の模式図を表示する`。
CLI/source追跡とplayground表示を順に実装し、両方の完了条件で一機能として閉じる。
