# Grid とボックスモデルの静的検査

2026-11-06。Grid と親子のサイズ契約を検査する compiler adapter を実装した。横方向に加え、container size query と明示した高さ契約による縦方向を扱う。標準 CSS を PostCSS で解析し、MoonBit frontend が composition を展開した template IR から box tree を作る。component / handler を browser で実行せずに解析する。

```sh
just layout
just layout-axes
just layout-reset
just layout path/to/app.isle path/to/layout.json
just layout-check
```

現在は明示的な CLI pass である。Vite build の自動 gate、CSS 最適化、CSS-ready runtime への追加処理は接続していない。production runtime には解析器・依存ライブラリ・検査用 metadata を import しない。

[リジェクト例](layout-rejections.md)は `just layout-rejections` で、拒否されるコードと対応版を一組ずつ実行できる。

## 入力

[実行できる fixture](../evals/scenarios/layout/fixture.isle) と [CSS](../evals/scenarios/layout/layout.css) に対して、次の sidecar を与える。CSS のパスは sidecar 自身からの相対パスである。

```json
{
  "component": "Board",
  "css": "./layout.css",
  "viewport": { "min": 352, "max": 1280 },
  "boxes": {
    ".side": { "minInlineSize": 120 },
    ".body": { "minInlineSize": 320 },
    ".copy": { "minInlineSize": 320, "wrap": "anywhere" }
  }
}
```

公開 API は [layout.d.mts](../lib/layout.d.mts)、入出力の型は [layout-contracts.d.ts](../lib/layout-contracts.d.ts)。`analyzeLayout(ir, options)` では `css` にファイルパスではなくソース本文を渡す。`hostInset` は、選択した root の外側で host が消費する横幅の合計で、既定は0。root の包含領域は `viewport - hostInset` とする。

`minInlineSize` は、許可する全入力・font・折り返し条件で内容を収めるための必要幅の上界を、呼出し側が宣言する契約である。compiler が文字列や font metrics から導いた証明ではない。割当幅がこれを下回る診断は契約違反を意味し、任意の具体的な文字列が必ずあふれることまでは意味しない。fixture には320pxの子を実際に置き、反例の overflow を browser でも再現する。

text leaf の fit 検査にはこの幅契約が必要。契約の selector は、型名・class・id の複合 selector に限定する。同じ box へ複数契約が一致した場合や、一つも一致しない契約は入力エラーにする。

## CSS reset と継承

reset を暗黙の border-box として仮定せず、実際に使う CSS を先行する author stylesheet として与える。CLI の `reset` は sidecar 相対のファイルパス配列で、配列順→`css` の順に解析する。

```json
{
  "reset": ["./reset.css"],
  "css": "./app.css",
  "ancestors": [{ "tag": "html" }, { "tag": "body" }],
  "viewport": { "min": 320, "max": 1000 }
}
```

```css
/* reset.css */
html { box-sizing: border-box; }
*, *::before, *::after { box-sizing: inherit; }
:where(*) { margin: 0; padding: 0; }
```

API の `reset` はソース配列 `[{ css: resetSource, file: 'reset.css' }]` を受け取る。ファイルを自動 fetch する API ではない。CLI は明示されたローカルファイルを読む。解析への入力は browser への reset 挿入を意味しないため、アプリにも同じ CSS を同じ順序・layer で配布する必要がある。

box-sizing 自体は非継承 property である。reset が inherit を指定した場合は、実際の親の computed value を参照する。`ancestors` は一番外側から mount 直前までの祖先を指定し、tag / 任意の id・classes で reset の一致を計算する。先頭の html を document root として :root に一致させ、選択した component の root は :root とみなさない。祖先が足りず明示 inherit を解決できなければ unknown。

ancestor 入力は継承用であり、host の寸法を再計算する入力ではない。包含サイズは引き続き viewport / hostInset / hostBlockInset の契約に従う。祖先は検査対象で使える HTML 要素と html/body に限定する。祖先自体が query container、または display:none の場合はサイズの前提が不足するため unknown にし、実際の template 内で検査することを要求する。ShadowRoot の widget 等では存在しない html/body の祖先を入力しない。

対応する reset 構文は次の範囲である。

- universal・型・class・id・:root と、その複合 selector。:where の specificity は0、:is は一致しない枝も含めた最大 specificity を保持する。combinator、属性 selector 等は未対応。
- before / after の単一・二重コロン。reset の宣言は読めるが、その selector を実 element へ適用しない。content が生成する追加 box は未対応で unknown。content:none / normal だけを許可する。
- 平坦な名前付き layer、順序宣言、再開、匿名 layer block。通常宣言は後の layer、重要宣言は先の layer を優先する。layer 外の宣言も標準の優先順位に従う。nested layer と条件付き layer 宣言は未対応。layer 内の media / container 条件は扱える。
- 検査対象 property の inherit / initial / unset / revert と、padding / margin / border 等の対応 shorthand、all reset。revert-layer は未対応。UA 由来の未知の margin 等を0だと推測しない。

`styleSources` に入力順と file、`sizes` に有効な `boxSizing` と `boxSizingSource` の file / line / selector / layer / specified value を記録する。reset 内の構文・未対応宣言の診断も、app CSS と区別して元ファイルを指す。

[実行可能な reset fixture](../evals/scenarios/layout-reset/layout.json)は `just layout-reset` で検査できる。[評価記録](../evals/reports/layout-reset.md)には content-box へ戻してあふれる故障版と browser の computed style を保存する。

## 縦方向の入力

`viewport.height` の有限な閉区間を渡すと両軸の検査になる。`block: true` でも明示できるが、その場合も height 区間を要求する。`hostBlockInset` は host が外側で消費する高さで、既定は0。

```json
{
  "component": "QueryPanel",
  "css": "./layout.css",
  "block": true,
  "viewport": { "min": 432, "max": 1000, "height": { "min": 320, "max": 600 } },
  "boxes": {
    ".copy": { "minInlineSize": 400, "minBlockSize": 200 },
    ".text": {
      "minInlineSize": 200,
      "intrinsicBlockSize": [
        { "atLeastInlineSize": 200, "blockSize": 80 },
        { "atLeastInlineSize": 400, "blockSize": 40 }
      ]
    }
  }
}
```

これは形を示す断片であり、selector と契約は実際の tree に合わせる。[実行可能な両軸 fixture](../evals/scenarios/layout-axes/layout.json)は `just layout-axes` で検査できる。

`minBlockSize` は内容を収める必要高さの上界を宣言する。自動高さの計算には、実際の content 高さを表す **trusted な exact 値** `intrinsicBlockSize` を使う。単一数値、または inline content 幅ごとの profile を宣言できる。profile は閾値の昇順で、最後に成立する値を選ぶ。定義域を覆わない幅は unknown。font の変更や入力の変化で exact 契約が崩れないことは caller の責任であり、font metrics の自動証明ではない。

固定 block-size、または definite な row に伸長する leaf には、自動高さの profile は不要。ただし text の fit を検査するには、minBlockSize または intrinsicBlockSize が必要である。percentage block-size は definite な包含サイズがある場合に扱う。auto 行の intrinsic 計算と percentage が循環する場合は unknown にする。

## 保証する範囲

各条件領域で cascade / specificity / source order / `!important` を計算し、親の content box から子の grid area へ渡す幅と高さを求める。物理・論理プロパティの対応は horizontal-tb / ltr に固定する。

- 子 element を配置する container は Grid を要求する。effective な non-none float、意図を宣言していない重なり、明示列の外への配置は違反にする。
- 列は固定 px と `minmax(0, Nfr)`。固定列・column gap を引いた残りを fr の比で配分し、fr 合計が1未満なら残余幅を一部残す。通常の `1fr` は intrinsic minimum を持つため未対応として unknown にする。
- 数値の `grid-column`、`start / span N`、`start / end`、正の数値 `grid-row` と sparse な通常の auto-placement を扱う。確定した row を先に配置する。暗黙の追加列、名前付き area、dense、subgrid は未対応。
- auto・固定 px・割合の inline/block-size、content-box / border-box、px の padding・solid border・gap を扱う。margin は0だけを許可する。p / heading 等の native な block margin は明示的な reset を要求する。CSS min-size は auto / 0、max は none に限定する。
- row は固定 px、`minmax(0, Nfr)`、auto。implicit row は grid-auto-rows を反復する。auto row は子の自動高さを下から集約し、definite な container では余りの伸長を反映する。indefinite な fr row は max-content に対応する契約値から flex fraction を求める。
- item の block alignment は normal / stretch、content alignment は normal / stretch / start。row span、他の alignment、intrinsic column、subgrid は未対応である。
- 折り返し条件は `white-space` と `overflow-wrap` の継承を含めて照合する。`anywhere` と `break-word` を同一視しない。

CSS による通常の in-flow parent と child の関係を検査する。pure component の展開と単純な client island の root は追えるが、動的 class/id、分岐・loop・opaque children、inline style、native form control 等は unknown。初期 SSR に存在する構造だけを見て、将来の構造まで安全としない。

## Overflow の契約

横方向は `overflow`、縦方向は `overflowBlock` を宣言し、それぞれ既定は `fit`。CSS の overflow 値だけを変えても、この要求は解除しない。以下の x を、縦方向では y として照合する。

| 契約 | 検査 |
|---|---|
| fit | 子と内容が割当領域へ収まることを要求する |
| scroll | computed overflow-x が auto / scroll であることを要求し、当該内容の幅不足を許可する |
| clip | computed overflow-x が hidden / clip であることを要求し、明示した切り取りを許可する |
| visible | computed overflow-x が visible であることを要求し、明示した領域外表示を許可する |

非 fit の container では、その子が割当領域を越えることも許可する。子自身の fit 契約は独立して検査する。CSS における overflow-x/y の computed value の相互作用を反映する。スクロール操作性、切り取られる情報の妥当性、focus の可視性、縦方向の scrollbar gutter は今回の保証に含めない。

## Media と反例

screen 用の width / height 条件、min/max、比較演算、and、comma による選言、入れ子の media を扱う。hover / orientation / 相対単位などの未対応条件は unknown。

container query は width / height / inline-size / block-size の px 条件と and、名前付き・無名・入れ子を扱う。名前は大文字・小文字を区別する。`container-type: inline-size` は inline 条件に、`size` は両軸に適格で、`container` shorthand も扱う。条件に使う全 feature を照会でき、名前も合う最も近い祖先を選ぶ。対象自身は選ばず、適格な祖先がなければ条件は不成立とする。

query は container の **content box** に対して評価する。例えば padding が左右16pxなら、600pxの container 条件は viewport 632pxから成立する。`container-type: size` の自動高さは size containment に従って内容を空として決め、その内部の Grid と overflow は別に検査する。

選択した root より外には query container がないことを、現在の解析境界の前提とする。外部 host に依存する場合は、その ancestor を解析対象へ含める必要がある。style / scroll-state query、or / not、container query list、cq 単位は未対応で unknown。

有理数の半平面で条件を分割し、幅×高さの凸領域を厳密に切り出す。strict な境界と、線・一点に退化する等号領域も保持する。単一の代表幅のサンプル検査ではない。横方向だけの検査では、同じ義務が破綻する隣接区間を結合する。

```text
親の content 幅 = V - 32
必要幅 = sidebar 240 + gap 16 + main 320 = 576
二列は V >= 608 で成立

600 から二列にすると:
E_LAYOUT_CONTENT .body
違反区間 [600, 608)
```

寸法と係数には BigInt の有理数を使う。`minExact` / `maxExact` が正本で、数値の min/max と witness.viewport は表示用の近似値。小数入力は小数点以下6桁まで、viewport / 契約幅は0〜1,000,000 CSS pxに制限する。CSS / box 数と解析の組合せにも上限を置き、超過を unknown にする。

両軸の診断は `axis`、`heightRange`、高さを含む witness、`region` を持つ。range / heightRange は各軸への射影で、直積が反例領域と一致するとは限らない。正本は region の vertices が張る閉包と strict constraints の共通部分である。`sizes` は計算したサイズ式、`queries` は選んだ target と条件成立を説明する。

## 検査結果と前提

- `verified`: 宣言した幅、または幅×高さの全実数入力について、対応する数理モデル内で指定した契約を満たした。
- `violated`: 契約違反の区間・義務、または禁止規則を検出した。
- `unknown`: 未対応の構造・CSS・情報不足・上限超過があり、全体を保証できない。既知部分の診断が併記されることもある。

CLI は verified のときだけ exit 0。入力エラー、コンパイルエラー、violated、unknown は非0にする。解析できない幾何の CSS や未知の selector / at-rule を、装飾だと推測して無視しない。reset を含む閉じた author cascade を渡すことは呼出し側の前提であり、host の全 CSS を自動収集したという保証ではない。

任意 font の glyph 幅・改行位置の自動推論、paint / ink overflow、画像、スクロールや layout の実時間、scrollbar gutter、browser の subpixel rounding はモデル外。非対応の幾何プロパティは unknown にする。実ブラウザとの完全同値性の証明でもない。

今回は静的な純粋制約の判定であり、既存 veri の時相モデルを増やして寸法を離散化する方法は採らない。有理数の領域判定、独立した1次元・2次元の bounded arithmetic oracle、browser での反例再現を組み合わせる。判定器そのものの形式的な健全性証明は未着手。既存の MoonBit / veri 92ケースは別の検査として維持する。

検証方法と結果は [両軸の評価記録](../evals/reports/layout-axes.md)、[初段の横幅検査](../evals/reports/layout.md)、記述・読解は [両軸の課題](../evals/scenarios/layout-axes/brief.md)。参考: [Grid](https://www.w3.org/TR/css-grid-2/)、[Box sizing](https://www.w3.org/TR/css-sizing-3/)、[Overflow](https://www.w3.org/TR/css-overflow-3/)、[Media Queries](https://www.w3.org/TR/mediaqueries-4/)、[Container queries](https://www.w3.org/TR/css-conditional-5/#container-queries)、[Size containment](https://www.w3.org/TR/css-contain-2/#containment-size)。
