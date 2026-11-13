# ADR-0013: DOM と CSS を組み合わせた静的アクセシビリティ検査

- 状態: 実装中(28規則、HTML adapter・Isle template・Vite・playground に接続)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: ユーザー指示「思いつく限りのCSSとDOMを組み合わせた静的検査パターンを実装したい」。ADR-0007(静的コントラスト契約)の text-contrast を含む

## 背景

css-verifier は、カスケードの結果(計算値)と border box の位置・寸法を viewport の全域で証明している。
多くのアクセシビリティの欠陥は、DOM の事実(要素の種類、名前、`aria-hidden`、id、木の順序)と
CSS の結果(`display`・`visibility`・`pointer-events`・色・配置・重なり)の**組み合わせ**で決まる。
どちらか一方だけを見る lint や、特定の幅で描画する実行時検査では、メディアクエリで変わる状態を取りこぼす。

## 判断

`options.accessibility`(`true` か `{contrast: 'AA' | 'AAA'}`)で有効にする規則を `src/layout/accessibility.mjs` に置く。
既定では無効で、既存の結果は変わらない。各規則は engine が解いた geometry の行(領域・矩形・計算値の paint 事実・祖先の paint 鎖)と
box tree の DOM 事実だけを入力にし、違反は viewport の区間(領域)として報告する。判定できない場合は Unknown にする。

| 規則 | 組み合わせ | 診断 |
| --- | --- | --- |
| accessible-name | button / `a[href]` に、描画される可視のテキストも `aria-label`・`title`・解決できる `aria-labelledby` もない。`display:none`・`visibility:hidden` のテキストは名前にならない。`visibility:hidden` と `aria-hidden` の内側は対象外 | E_A11Y_NAME |
| text-contrast | 継承した `color` と、祖先の背景を内側から合成した色。WCAG 2.2 SC 1.4.3(AA)/1.4.6(AAA)、大きな文字は 24px か 56/3 px 以上の bold | E_A11Y_CONTRAST |
| occluded-target | 後から描かれる positioned box(`pointer-events` が none でなく可視)が操作対象の一部を覆う | E_A11Y_OCCLUDED |
| target-overlap | 2つの操作対象の border box が重なる | E_A11Y_TARGET_OVERLAP |
| visual-order | 後の兄弟が前の兄弟の上、または同じ行の左に置かれる(SC 1.3.2) | W_A11Y_ORDER(警告) |
| hidden-focusable | `aria-hidden` の内側で、描画され可視のフォーカス可能な要素 | E_A11Y_HIDDEN_FOCUSABLE |
| empty-heading | 公開される h1–h6 に可視のテキストも名前もない | E_A11Y_EMPTY_HEADING |
| heading-order | 描画される見出しの並びで階層が飛ぶ。メディアクエリの領域ごとに、間の見出しが描画される領域を除いて判定 | W_A11Y_HEADING_ORDER(警告) |
| nested-interactive | 描画される button/link の内側の button/link | E_A11Y_NESTED_INTERACTIVE |
| duplicate-id | 同じ id(DOM、全域) | E_A11Y_DUPLICATE_ID |
| aria-reference | `aria-labelledby`・`aria-describedby`・`aria-controls` が存在しない id を指す | E_A11Y_REFERENCE |
| positive-tabindex | tabindex > 0 | W_A11Y_POSITIVE_TABINDEX(警告) |
| multiple-main | 同じ viewport で2つ以上の main が描画される | W_A11Y_MULTIPLE_MAIN(警告) |
| scrollable-region-focusable | scroll container 自身の content box が溢れる(証明した区間)のに、それも内側もフォーカスできない | E_A11Y_SCROLL_FOCUS |
| reflow | 320 CSS px 以下で横スクロールが生じる(SC 1.4.10)。domain が 320px より上から始まる場合は note | E_A11Y_REFLOW |
| focus-obscured | フォーカス可能な box が、後から描かれる塗りのある box に完全に覆われる(SC 2.4.11) | E_A11Y_FOCUS_OBSCURED |
| focus-area | 可視のフォーカス可能な box の幅か高さが 0 | E_A11Y_FOCUS_AREA |
| pointer-disabled | 可視の button/link が継承した `pointer-events: none` でクリックできない | E_A11Y_POINTER_DISABLED |
| small-text | 描画される文字が 12px 未満 | W_A11Y_SMALL_TEXT(警告) |
| image-alt | 描画され公開される img に `alt` がない(`alt=""` は装飾)。`alt` は link/button の名前にもなる | E_A11Y_IMAGE_ALT |
| form-label | input(hidden・submit・reset・button・image 以外)・select・textarea に、`aria-label`・`title`・`aria-labelledby` も、**描画され可視の**テキストを持つ label(包む label か `label[for]`)もない。placeholder だけなら警告 | E_A11Y_LABEL / W_A11Y_PLACEHOLDER_LABEL |
| label-for | `label[for]` が labelable な要素(button・hidden 以外の input・select・textarea・output)を指さない | E_A11Y_LABEL_FOR |
| list-structure | 描画される li の親が ul/ol でない、または ul/ol に li 以外の子がある。ul/ol の UA margin・padding と li の `display: list-item` は reset するまで Unknown | E_A11Y_LIST |
| radio-group | 同じ name の radio が、fieldset か `role=radiogroup`/`group` の外で同時に描画される | W_A11Y_RADIO_GROUP(警告) |
| landmark-name | 2つの navigation landmark が同時に描画され、両方に名前がない(名前の文字列の比較はしない) | W_A11Y_LANDMARK_NAME(警告) |
| role-valid | `role` の最初の token が WAI-ARIA の role でない | E_A11Y_ROLE |
| interactive-role-focusable | widget role(button・link・checkbox など)の要素が描画されるのにフォーカスできない。名前の規則も widget role に適用する | E_A11Y_ROLE_FOCUS |
| target-size | SC 2.5.8:24px 未満の操作対象で、border box の中心に置いた 24px の円が他の操作対象の box か、他の小さい対象の円と交わる(spacing 例外を満たさない) | E_A11Y_TARGET_SIZE |

### target-size の円(非線形)の扱い

円との交差は距離の2乗の比較で、viewport の affine 式の2次式になる。領域は有理数の凸多角形なので、次のように決める。

- 2つの中心の差(または中心から相手の box の最も近い点までの差)の両成分が viewport に依らない定数なら、有理数で2乗を厳密に比較する。
- 片方の成分が恒等的に0なら、もう一方の絶対値と半径の線形比較で厳密に決まる(横一列や縦一列の配置)。
- 両成分が変わるときは、ピタゴラス数で作った有理単位法線(第1象限で約2.5°間隔)の多角形で円を内側と外側から挟む。
  内側の多角形 `n·p < r·c`(c は cos(間隔/2) の有理の下界)に入れば交わり、外側の多角形 `n·p < r` の外なら交わらない。
  間の帯(幅 0.01px 未満)は、同じ対象に証明した違反がなければ Unknown にする。

### 2.5.8 の他の例外と AAA(SC 2.5.5)

- **Equivalent**:DOM の `data-a11y-equivalent="id"`(box tree の `equivalent`)で同じ機能の別の control を宣言する。
  宣言を信頼せず、参照先が存在し、描画され可視で、その領域で自身が target-size を満たす部分だけを免除する(`report.accessibility.exempted`)。
  互いを指す2つの小さい対象は免除されない。参照先が隠れる幅、存在しない id では違反のまま。動的な値は Unknown。
- **Essential**:`data-a11y-essential="理由"` は作者の表明として、理由を付けて免除に記録する(検証ではない)。
- **Inline**:文中の inline の対象は検査対象のサブセットの外(inline box は Unknown)なので生じない。
- **User agent control**:検査対象の button は `appearance: none` などの reset を要求するため、UA が寸法を決める control は生じない。
- **AAA**:`accessibility.targetLevel: 'AAA'` で SC 2.5.5 の 44px を要求し、spacing 例外を適用しない(equivalent と essential は適用する)。
  `accessibility.targetSize` で寸法を直接指定することもできる。
ADR-0012 の target-undersized(vlmkit と同じく spacing を考えない)とは別の規則である。

違反は checks の義務ではないため、Z3 のモデルにはその違反領域が空でないことの確認として入る(`rule` を持つ診断)。

### form control と画像

`img`・`input`・`select`・`textarea` を box tag に加えた。UA の固有寸法と padding はモデルにないので、button と同じく `appearance: none`・
`display: block` と reset を要求し、さらに `inline-size`(両軸の検査では `block-size` も)の明示を要求する。満たさなければ Unknown。
`width`/`height` 属性は presentational hint なので HTML adapter では未対応の属性(Unknown)のまま。
form field は操作対象として target-size・occluded-target・target-overlap・hidden-focusable・pointer-disabled の対象にもなる。

Chromium と照合して分かったこと:`display: none` の label は field の名前にならない(`aria-labelledby` は隠れた参照先の text も読む)。
label による名前は、label の text が描画され可視の領域だけで成立するとした。
また、2つの in-flow の block box が重なるとき、木の順で後の box が上に描かれ hit test を受ける(occluded-target と focus-obscured に追加)。

### 事実の出どころ

- **CSS**: `color`・`visibility`・`pointer-events`(継承)と `opacity` を計算値に保持するようにした(以前は装飾として捨てていた)。
  `background`・`background-color`・`background-image` は ADR-0012 で保持済み。幾何には使わない。
  `z-index` は未対応のプロパティのまま(使うと Unknown)なので、描画順は「positioned は in-flow の後、positioned 同士は木の順」で確定する。
- **DOM**: box tree に `alt`・`inputType`・`labelFor`・`placeholder`、`named`(空でない `aria-label`・`title`)、`labelledBy`、`references`、`ariaHidden`、`focusable`
  (`a[href]`、無効でない button、tabindex ≥ 0。tabindex < 0 は除く)、`tabIndex` を持たせた。
  HTML adapter と Isle template(IR)は同じ `accessibilityFacts` で属性から導き、動的な値は `'dynamic'` として Unknown の原因にする。
  `aria-labelledby` は参照先の subtree のテキストで名前になる(描画されない参照先も含む、accname 2.B)。
- **幾何**: 重なりは開区間で判定し(接するだけは重ならない)、両方の面積が正であることを要求する。

### text-contrast と ADR-0007

ADR-0007 の制約に従う。

- 背景は祖先を内側から辿り、最初の不透明な色までの半透明の層を合成する。`background-image`、`opacity < 1`、未対応の色の表記はUnknown。
- 黒い文字や白い背景を暗黙に補わない:作者が不透明な背景を宣言していなければ、文字色が UA 既定(`canvastext`)ならUnknown。
- 閾値との差が数値誤差の範囲(1e-9)ならUnknown。表示用に丸めた値では判定しない。
- 大きな文字の分類が確定しない(px 以外の `font-size`、UA の見出しの size)場合は通常文字の閾値を要求する。
- positioned な box が不透明な背景より内側にあり、祖先以外の塗りのある box と重なる(または位置が証明されない)場合、背後が祖先ではないのでUnknown。

色の表記は hex、`rgb()`/`rgba()`/`hsl()`/`hsla()`(カンマ区切りと空白区切り)、主要な named color、`transparent`、`currentcolor`(背景)。

## 範囲外

- `z-index`、`position: fixed/sticky`、`transform`、filter・blend、`color-scheme`・forced colors、`:focus` などの状態の擬似クラス。
- 文字列そのものに依存する規則(label-in-name など)。box tree はテキストの有無だけを持つ。
- 2.5.8 の spacing 例外(24px の円の距離は線形でない)。target-undersized(ADR-0012)は spacing を考慮しない。
- Chromium 130 以降は focusable な子のない scroller を自動でフォーカス可能にする。scrollable-region-focusable は axe と同じ DOM の定義で判定する。

## 検証

| 検査 | 内容 |
| --- | --- |
| `packages/css-verifier/test/accessibility.test.mjs` | 43件(list・radio・landmark・role を含む。画像・form control・in-flow の覆いを含む。equivalent・essential・AAA を含む。円の近似が内側・外側で正しく、未決の帯が 0.05px 未満であることを含む)。各規則の違反・非違反・メディアクエリの区間、Unknown になる条件、HTML adapter の属性 |
| `tests/layout-accessibility.test.mjs` | Isle template の静的・動的な属性 |
| `tests/layout-build.test.mjs` | Vite の `layout.accessibility`:名前のない button で build が失敗し、証明書に契約が残る |
| `e2e/layout-accessibility.spec.mjs` | 26構成を 1280/768/375px(reflow は 320/340/375)で Chromium と照合し、全規則で一致。名前は AX tree(CDP)、重なりと覆いは hit testing、フォーカスは `focus()`、順序は矩形、コントラストは計算値の色。1280px では `vlmkit check a11y contrast` とも一致 |

結果は `evals/results/layout-accessibility/report.json` に残る。

## 次の段階

1. playground の preset と、Isle の例(`examples/layout-contracts`)。
2. `fieldset`/`legend`(UA のレイアウトが通常の block と異なる)と table。
3. inline box のモデル(文中のリンクの inline 例外を判定するため)。
