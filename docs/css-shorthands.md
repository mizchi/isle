# CSS略記と上書きの検査

同じCSSルールで、略記と別のプロパティが同じlonghandに書き込む場合、`E_CSS_SHORTHAND_CONFLICT` で拒否する。テンプレートの `<style>` はNode・ブラウザーの両コンパイラで常に検査する。`layout.css` / `layout.reset` はレイアウト検査付きビルド、CLI、`analyzeLayout` で検査する。検査対象外の通常の外部CSSへ、この制約を自動適用するものではない。

検査器はビルド時だけ動作し、生成アプリにparser・solver・監視処理を追加しない。

## 拒否する例

```css
.box {
  padding-left: 24px;
  padding: 0;
}
```

`padding` は左辺にも書き込む。順序を逆にしても、値が同じでも拒否する。`!important`、`var()`、`initial` / `unset` / `revert` による例外はない。値を評価する前にプロパティの書き込み先を比較する。

```css
.box {
  font-weight: 700;
  font: 16px sans-serif;
}
```

後の `font` は省略されたweightを通常値へ戻す。`border` と `border-image-source` のように、略記で指定できずリセットだけされる下位プロパティも検出する。[CSS Cascadeの略記規則](https://www.w3.org/TR/css-cascade-5/#shorthand)、[fontの明示設定・暗黙リセット・独立プロパティ](https://www.w3.org/TR/css-fonts-4/#font-prop)を参照。

診断には両方のプロパティ名と共通のlonghandを含める。`.isle` では後の宣言のsource spanと、前の宣言の `related` spanを返す。Playgroundはクリックで後の宣言を選択し、前の宣言の行・列も表示する。外部CSSでは両方のファイル・行・列を返し、CLI summaryとViteのビルドエラーにも表示する。

## 意図的なカスケードを書く

独立したlonghandを使うか、意図的な上書きを別のルールに分ける。

```css
.box {
  padding-inline: 16px;
  padding-block: 8px;
  font: 16px/1.5 sans-serif;
}
.box { font-weight: 700; }
```

reset→component、別selector、別stylesheet、`@media` / `@container` / `@layer` 内の別ルールによる上書きを許可する。同じプロパティを繰り返す通常のCSS fallbackも許可する。これは別ルール間の競合がないという保証ではない。レイアウト検査は、それらをカスケードした最終的なサイズも検査する。

[受理するcomponent](../examples/inline-css/shorthands.isle)と[拒否するcomponent](../examples/inline-css/rejected/shorthand.isle)を、そのままPlaygroundへ貼って試せる。

## 書き込み先のモデル

宣言 `d` の正規化名を `P(d)`、書字方向 `m` でのlonghand集合を `W(d,m)` とする。同一ルールの宣言対に次が成立すると拒否する。

```text
P(a) != P(b)
AND (a または b が対応する略記)
AND exists m: W(a,m) ∩ W(b,m) != ∅
```

通常のプロパティ名は小文字化しCSS escapeを復号する。`grid-gap` と `gap`、`font-stretch` と `font-width` などのaliasも揃える。custom propertyは大文字小文字を区別し、値内のトークンを宣言として扱わない。

物理・論理プロパティはhorizontal/vertical/sideways・ltr/rtlの6つの辺の対応で比較する。`padding-inline` と `padding-top` は縦書きで競合し得るので拒否する。`padding-inline` と `padding-block` はどの対応でも独立なので許可する。この方針はルール内の `writing-mode` の値に依存しない保守的な検査であり、レイアウトの数値モデルの書字方向の範囲は広げない。

`all` はcustom property・`direction`・`unicode-bidi` を除くプロパティと競合する。将来の未知のプロパティも例外にしない。通常の略記では次の明示的なメタデータを使用する。

| 略記の系列 | 書き込み先 |
|---|---|
| padding / margin / inset / scroll-padding / scroll-margin | 物理4辺、inline/blockの2辺 |
| border とwidth/style/color、物理・論理各辺 | 対応する幅・style・色。border全体はborder-imageの全下位プロパティもリセット |
| border-image / border-radius | imageの5属性 / 四隅。border全体とradiusは独立 |
| gap / overflow / container / outline | 各軸 / nameとtype / width・style・color。outline-offsetは独立 |
| background、background-position/repeat | 色・image・位置・size・repeat・origin・clip・attachment |
| font / font-variant / font-synthesis | 明示・暗黙リセット対象。font-paletteとfont-synthesisはfont全体から独立 |
| grid / grid-template / grid-area / grid-row / grid-column | template・auto配置・開始/終了line |
| place-items/self/content、flex/flow | 対応する配置 / grow・shrink・basis / direction・wrap |
| columns / column-rule / list-style | 対応する下位プロパティ |
| text-decoration / text-emphasis | 対応する下位プロパティ |
| transition / animation / animation-range | 対応する下位プロパティとanimationのtimeline/rangeリセット |

新しい略記・vendor拡張は、メタデータ追加前には一般の名前として扱う。任意のCSS全体の非干渉証明ではない。略記検査を通っても、レイアウトモデルが未対応の `grid` 等は引き続きUnknownになる。fontや文字の実寸は呼出し元の信頼する契約に依存する。

## カスケードの検査と区別する

書き込み先の重複検査は値・優先順位・Z3から独立した記述方針である。サイズの検査はその後に行う。対応する略記を展開し、`!important`、specificity、layer、media/container、CSS変数を考慮した最終的なサイズを検査する。

marginの値にも制約がある。通常の略記は1〜4値、inline/blockは1〜2値、各辺は1値に制限する。無効な `margin:0 0 0 0 0` はUnknownとなり、検査付きbuildを失敗させる。[Box Model](https://www.w3.org/TR/css-box-4/#margin-shorthand)・[Logical Properties](https://www.w3.org/TR/css-logical-1/#margin-properties)の文法に対応する。[修正前のブラウザー照合](../evals/results/css-shorthands/audit-before.json)も保存している。

```sh
just css-writes-check
```

[書き込み先・source span・外部CSSのテスト](../tests/css-writes.test.mjs)、[カスケードの回帰テスト](../tests/layout-shorthand.test.mjs)、[ブラウザーのmargin反例](../e2e/layout.spec.mjs)で検証する。
