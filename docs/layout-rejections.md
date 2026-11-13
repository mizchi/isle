# リジェクトされるコードを実行する

現在のレイアウト検査で成功扱いにしない14例と、それぞれの対応版を実行できる。契約違反の `violated` が5例、未対応・情報不足の `unknown` が9例である。

```sh
just layout-rejections
just layout-rejections container-breakpoint
```

各例は `.isle`、CSS、reset、layout.json、診断 JSON として `evals/results/layout-rejections/<id>/reject` と `accept` 以下へ生成する。全例の実行後は [実行結果一覧](../evals/results/layout-rejections/index.md)から両側のコードを参照できる。例を一つ指定した場合、一覧はその実行対象だけを記録する。

suite の PASS は「拒否版が期待する診断で exit 1となり、対応版が verified で exit 0となった」という意味である。拒否版を直接検査すると非0になる。

```sh
just layout evals/results/layout-rejections/content-box/reject/app.isle \
  evals/results/layout-rejections/content-box/reject/layout.json
```

## 期待する結果

| ID | 拒否される記述・条件 | 診断 | 対応版 |
|---|---|---|---|
| float | float:left | E_LAYOUT_FLOAT | float:none |
| flex | display:flex の item が初期値(flex:0 1 auto) | U_LAYOUT_FLEX | flex:1 1 0 と min-width:0 で伸縮 item にする |
| content-box | width:100% + padding + content-box | E_LAYOUT_ITEM_SIZE | border-box を保つ |
| block-height | 必要高さ200pxに row が100px | E_LAYOUT_CONTENT | row に200pxを与える |
| wrapping | wrap:anywhere と white-space:nowrap | E_LAYOUT_WRAP | CSS と契約を一致させる |
| container-breakpoint | 616px必要なのに600pxから二列 | E_LAYOUT_CONTENT | 616pxから切り替える |
| intrinsic-fr | intrinsic minimum を持つ1fr | U_LAYOUT_GEOMETRY | この例を minmax(0,1fr) で書く |
| css-variable | 継承元・値が不明の var(--size) | U_LAYOUT_VARIABLE | この例の値320pxを明示する。定義済みの変数は静的解決できる |
| inherit-boundary | inherit の祖先情報が不足 | U_LAYOUT_GEOMETRY | 実在する html/body を入力する |
| generated-content | content で pseudo box を生成 | U_LAYOUT_CSS | 実 DOM の leaf として記述する |
| nested-layer | layer の階層 | U_LAYOUT_LAYER | 小例を flat layer で記述する |
| revert-layer | layer rollback | U_LAYOUT_CSS | 小例の意図する値を明示する |
| missing-auto-height | text の自動高さが不明 | U_LAYOUT_GEOMETRY | trusted な exact 高さを入力する |
| percentage-height-cycle | 自動高さと子の高さ50%が循環 | U_LAYOUT_GEOMETRY | 親と row に definite な高さを与える |

container-breakpoint では、viewport の `[632, 648)` が反例になることも自動検査する。単一画面幅での失敗確認に限定しない。

## 対応版の意味

対応版は、解析可能な書き方や追加情報を示す。任意の入力で同じ browser の意味を保つ変換の証明ではない。例えば1frとminmax(0,1fr)、pseudo boxと実DOM、layer階層とflat layerでは、一般に挙動やaccessibilityが変わり得る。各例の note に目的と限界を記す。

どの例も viewport の検査範囲を狭めて成功させない。自動高さや font の契約は caller の仮定として残る。unknown を「不正なCSS」と読み替えない。

正本は [cases.mjs](../evals/scenarios/layout-rejections/cases.mjs)。`just layout-check` と `just ci` は、実 CLI を使う回帰テストにより、期待する status・診断 code・軸・反例区間・終了 code と、全対応版の verified を確認する。単なる構文エラーや設定エラーを、期待するレイアウト拒否として合格させない。

[評価記録](../evals/reports/layout-rejections.md)、[記述・読解課題](../evals/scenarios/layout-rejections/brief.md)。この追加は現行の検査挙動を再現するサンプル群であり、unknown の解析対応を拡大する変更ではない。
