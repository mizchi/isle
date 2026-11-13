# ADR-0007: 単色・不透明な色の静的コントラスト契約

- 状態: 一部実装([ADR-0013](0013-static-accessibility-rules.md)の text-contrast。theme/state の候補と ratio の区間表示は未実装)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 6「静的コントラスト契約」

## 背景

現在の[アクセシビリティ検査](../forms.md)はlabelや参照等を静的に検査し、デモでは
ブラウザーのcontrast gateも利用する。任意の利用アプリについて、CSSから色の組合せを
静的に検査する契約はない。幾何のfitやnoshiftが成立しても文字の読みやすさは別に検査する必要がある。

## 判断

レイアウト契約とは独立したpaintの述語群として、文字と背景のコントラストを追加する。
初版は、計算後の前景と背景が既知の不透明な単色sRGBとなる閉じた部分集合に限定する。
CSSカスケード、継承、既存のCSS変数と有限なtheme/stateの候補を利用する。

通常文字の4.5:1、大きな文字の3:1という閾値と相対輝度の定義は
[WCAG 2.2 SC 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)と
[相対輝度](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)を参照する。
2026-11-13確認。最終的なブラウザーのpaint、発話、操作性を含めたWCAG全体の適合とは区別する。

### 契約と責務

設計案の`PaintIR`はtarget、解決した前景・背景・文字サイズ/weight、
theme/state条件、source、解決の完全性を保持する。
`ContrastContractIR`は対象と要求閾値を持ち、色の抽出に要求閾値を渡して色を補正しない。
幾何がUnknownでも色だけを確定できる場合を扱えるよう、fitの成功を前提条件にしない。

透明な背景の祖先探索は、最初の不透明な単色背景へ確実に辿れる場合に限る。
画像、gradient、filter、blend、opacity、未知の重なり、外部CSS等で実際の背景が確定しなければUnknown。
黒い文字に白い背景を暗黙に補って成功させない。
大きな文字の分類が確定しなければ、初版は通常文字の閾値を要求する保守的な規則とする。
非表示やdisabled等の例外は自己申告で適用せず、実装から確定できる範囲のみ扱う。

相対輝度の非線形計算は純粋な数値moduleに分離する。
閾値に近い値は誤差を含む上下界で評価し、丸めた表示値で受理しない。
必要な精度で判定できなければUnknownとし、すべての計算を線形SMTへ押し込まない。

## 依存関係と変更箇所

必須の先行ADRはない。既存のCSS解析・変数解決・source位置を再利用する。
[0002](0002-layout-counterexample-explanations.md)の説明形式とtarget source対応は共有できる。
一般ライブラリ側に色・paint・契約moduleと型を置き、Isle adapterは有限theme/stateとtemplate対応を供給する。

## 実装計画

1. **探索**: 現行CSS parserが保持するcolor/background/文字サイズの情報と、仕様上の例外を棚卸しする。
2. **Red: 数値**: 明確な合格/不合格、閾値直前・直後、表示上は4.5に丸められる値を用意する。表示値で比較する故障版を検出する。
3. **Green: 数値**: sRGBから相対輝度とratioを求める独立moduleを作り、独立した参照計算と照合する。
4. **Red/Green: 抽出**: 継承、CSS変数、reset、theme切替、透明背景の祖先探索を追加する。背景不明・画像・overlayをUnknownへ落とす。
5. **Green: 契約**: 全theme/state候補で評価し、最悪の組合せ、ratioの区間、文字分類、sourceを結果へ出す。
6. **Green: 利用経路**: CLI・Vite・playgroundへ接続し、既存label検査と別の診断として表示する。
7. **Refactoring**: CSS事実、数値計算、契約判定、表示を分離する。利用していないアプリへ色検査のruntimeを追加しない。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 明確な黒白、低コントラストの組 | 期待する合格/不合格 |
| 閾値直前・直後 | 表示の丸めで合格へ反転しない |
| lightのみ合格、darkは不合格 | 不合格themeとsourceを報告 |
| 透明な子背景、既知の祖先背景 | 実際の合成前提で判定 |
| background画像・未知のoverlay | Unknownを維持 |
| 文字サイズの分類が不明 | 通常文字の厳しい側で検査、または原因を報告 |

- [ ] 全theme/stateの被覆、色の解決根拠、数値精度を結果に記録する。
- [ ] 同じ入力でNodeとWorkerの判定が一致する。
- [ ] ブラウザーのcomputed styleとの差分evalでCSS解釈の不一致を探す。
- [ ] 既存のlabel/参照検査、幾何検査と結果を混同しない。
- [ ] 同一アプリの配信HTML・JS・CSS増分0 byte。

追加evalは`evals/scenarios/static-contrast/`を計画する。
既存の回帰確認は`just css-verifier-check`、`just check-types`。
新しいcolor数値テストとpaint抽出テスト、最小のPlaywright差分oracleを実装時に追加する。

## 代替案と未決事項

スクリーンショットからの色判定は初版の静的検査には利用しない。
任意の色空間、半透明の一般合成、paint順の完全な解析、APCAは後続。
DOM側注釈の文法、文字サイズ分類の詳細、数値moduleの精度方式は独立したfixtureで決定する。

## Issue化

タイトル案: `有限themeと単色sRGBに対する静的コントラスト契約を追加する`。
数値計算、paint抽出、全候補の契約判定の順に実装する。
