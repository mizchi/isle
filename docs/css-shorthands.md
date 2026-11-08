# CSS略記と上書きの扱い

現在の検査は、対応する略記をレイアウト上の要素プロパティへ展開し、最終的なカスケード結果を検査する。上書きが発生したこと自体を禁止・警告するlintは未実装。

CSSの略記は、省略した下位プロパティも初期値へ戻す場合がある。[CSS Cascade §3](https://www.w3.org/TR/css-cascade-5/#shorthand)の規則を踏まえ、単に同名の宣言を比較するだけでは干渉を判定できない。

| 対象 | 現在の扱い |
|---|---|
| padding / margin と対応する論理プロパティ | 対応する辺へ展開して優先順位を計算。paddingは対応するpx値、marginは0とinherit/initial/unset/revertに制限 |
| gap / overflow | 各軸へ展開。overflowのcomputed-value上の軸間干渉も計算 |
| border / border-inline / border-block | 対応する幅の部分集合を計算。個別のstyle/width等の未対応宣言はunknown |
| container | name/typeへ展開。type省略時のnormalへのリセットも反映 |
| grid / grid-template / place-items等 | 未対応の略記はunknown。検査付きbuildは失敗 |
| font / background等の装飾 | 上書き検査の対象外。font/内容の寸法は呼出し元の信頼する契約に依存 |

例えば次の宣言は左paddingを0へ戻す。解析器も0として扱うが、意図しない上書きだったかは判定しない。

```css
.box {
  padding-left: 24px;
  padding: 0;
}
```

順序を逆にすれば左だけ24pxになる。`!important`、specificity、対応するlayer、media/container条件も優先順位へ反映する。対応する略記に `var()` がある場合は、勝った宣言を環境ごとに解決する。

`font-weight:700; font:16px sans-serif` はブラウザーではweightを400へ戻すが、この意図の干渉は現在検出しない。fontの実寸を自動的に証明した結果としてlayoutのverifiedを解釈してはならない。

## 2026-11-08の監査と修正

Chromiumと解析器で10ケースを照合した。paddingの順序・論理属性、gap、border、container、importantの対応7ケースは一致。fontは未モデル化、gridはunknown。無効な `margin:0 0 0 0 0` を0として受理する穴が一件見つかった。

ブラウザーは無効な宣言を無視し、pのUA marginが残る。以前の解析器はそれを0としてverifiedを返していた。今回、通常marginは1〜4、inline/block略記は1〜2、各辺は1値だけを受け付けるよう修正した。CSS変数の解決後も同じ検査を使う。無効な値はunknownとし、検査付きbuildを失敗させる。[Box Model](https://www.w3.org/TR/css-box-4/#margin-shorthand)・[Logical Properties](https://www.w3.org/TR/css-logical-1/#margin-properties)の文法に対応する。

- [解析器の回帰テスト](../tests/layout-shorthand.test.mjs)
- [ブラウザー上の反例と修正版の検査](../e2e/layout.spec.mjs)
- [修正前の照合結果](../evals/results/css-shorthands/audit-before.json)

## 意図しない干渉を防ぐための次の設計

未実装の候補は、各宣言に「書き込むlonghandの集合」を持たせる検査。省略時のリセットも集合へ含め、条件が重なる二つの宣言が同じlonghandへ書く場合は、元のプロパティ・ファイル・行と上書き先を示す。

reset→componentやresponsiveの上書きは意図的にも使うため、全重複を禁止する仕様にはまだしていない。対応subset内のstrict policyと、明示的に許可するoverrideの契約を分けて検討する。Z3が検査する前のCSS正規化と、記述上の干渉lintは別の責務である。
