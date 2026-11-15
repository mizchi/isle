# Grid とボックスモデルの静的検査

テンプレートの [scoped CSS と Z3](inline-css.md) に対応した。Vite のチェック付きビルドは抽出した制約を Z3 Wasm でも検査し、結果を証明書の `proof` に記録する。playground は専用 Worker で同じモデルを検査する。以下の geometry/cascade 解析器自体の正しさを Z3 が証明する、という意味ではない。

[CSS 変数の静的解決](css-variables.md)にも対応する。継承と条件ごとに `var()` を解決し、未解決値・不明な外部継承・fallback 経由の循環を使った geometry は成功扱いしない。

[レイアウト契約の形式化](layout-contract-language.md)では、component の要求と保証を CSS 由来の配置から分離し、独立した API で被覆と適合を検査する。

2026-11-06。Grid と親子のサイズ契約を検査する compiler adapter を実装した。横方向に加え、container size query と明示した高さ契約による縦方向を扱う。標準 CSS を PostCSS で解析し、MoonBit frontend が composition を展開した template IR から box tree を作る。component / handler を browser で実行せずに解析する。

```sh
just layout
just layout-axes
just layout-reset
just layout-subgrid
just layout path/to/app.isle path/to/layout.json
just layout-check
just layout-build
just layout-build-quality
just layout-dynamic
just layout-dynamic-quality
```

CLI の明示的な解析に加え、Vite の `layout` オプションで配信する HTML/CSS を検査する build gate を提供する。production runtime には解析器・依存ライブラリ・検査用 metadata を import しない。CSS chunk の一般的な最適化や CSS-ready runtime とは別の build-only pass である。

[リジェクト例](layout-rejections.md)は `just layout-rejections` で、拒否されるコードと対応版を一組ずつ実行できる。

## Vite build で保証範囲を閉じる

アプリからは `@isle/prototype/vite` の `isle` に次のオプションを渡す。[実行例](../examples/responsive-checked/)と[設定全文](../examples/responsive-checked/vite.config.mjs)を参照。

```js
isle({
  entry,
  mounts: [{ component: 'App', props: {} }],
  wrapMounts: false,
  layout: {
    css: './app.css',
    reset: ['./reset.css'],
    viewport: { min: 320, max: 1280, height: { min: 240, max: 900 } },
    boxes: { '.copy': { minInlineSize: 200, minBlockSize: 24 } },
  },
})
```

`css` と `reset` は **`.isle` entry からの相対パス**である。CLI の sidecar 相対とは区別する。指定した reset→app の cascade を、所有する一つの inline stylesheet として自動配信する。コメント・不要な空白をビルド時に除去し、別の stylesheet link や style block は拒否する。CSS 内の相対 URL は配信先 HTML を基準に解決される。

このモードは document を一つ所有する最初の厳格な profile であり、次を要求する。

- mount は一つ、`wrapMounts:false`。HTML に SSR marker が一つあり、body の描画要素はその component の tree と一致すること。
- html/body を viewport 全体の Grid shell として出力し、実際の class/id・reset・padding/border を含めて両軸を解析する。`hostInset` や、解析のためだけの仮の ancestor は受け取らない。
- 幅と高さの有限区間を両方指定する。到達可能な media/container query の組み合わせを有理数の領域として検査し、違反と **unknown の両方**で production build を失敗させる。成功を少数の viewport のサンプリングで代用しない。
- `Show`/`Switch`/同期 `ErrorBoundary` の各候補、有限な class/id、上限を静的に導ける `For` を含めて検査する。text 更新だけの状態を構造の直積に含めない。以下の動的構造の節を参照。
- `clientEntry`、`resources`、widget 設定、追加の実行 script、未所有の client module、inline style、popover、noscript、CSP meta 等は拒否する。head・snapshot・loader の非描画要素を CSS が表示する場合も拒否する。HTTP の CSP 等、配信側の policy は所有する stylesheet の適用を許可する前提である。
- overflow 契約は fit/clip/scroll。scrollbar は指定した native profile ごとに占有幅を差し引く。visible 契約による無制限の流出は拒否する。CLI 単体では visible 契約も利用できる。

成功時に `isle.layout.json` を出力する。検査の profile、component、正確な領域・各義務・サイズ・前提、入力 CSS と配信 HTML の SHA-256 を保存する。最終 HTML の解析では、CSS が同じであること、component の native element tree と一致することも確認する。ブラウザーはレポートを取得せず、検査で JS チャンクは変化しない。static component のサンプルは JS 0。

Vite/Rolldown の HTML transform 後、Isle manifest 注入後の `generateBundle` で検査する。後続 plugin・デプロイ時の HTML/CSS 書き換え、外部 CSS の後挿入等まで自動的に許可する証明ではない。配信 HTML を変えた場合は記録されたハッシュが無効になる。build toolchain と生成コードは信頼する実装に含まれる。[Vite hook の仕様](https://vite.dev/guide/api-plugin#transformindexhtml)と、HTML tree の解釈に使う [parse5](https://parse5.js.org/)を参照。

`verified` は、宣言領域・CSS 部分集合・利用者の信頼する内容/font のサイズ上界に対して義務を満たしたという判定である。任意の入力や Web 全体に対する無条件の保証ではなく、browser のピクセル丸め、ink overflow、判定器の健全性の機械証明は含まない。これらの前提はレポートにも残す。[検証結果と今後の adapter](../evals/reports/layout-build.md)を参照。

## 動的構造の集合を検査する

[実行例](../examples/responsive-dynamic/)は、リストの追加・全削除、class の切り替え、空状態を持つ。`Show`/`Switch` の候補と同期 `ErrorBoundary`/`fallback` を結合し、現在の SSR に現れない構造も調べる。同じ component の有限な scalar state は繰り返し内でも同じ値として扱う。class/id は有限な文字列集合へ解決できる式を許可し、任意入力からの class 等は unknown にする。

```text
state items = [0];
on click {
  items = items.length < 4 ? items.concat([items.length]) : items;
}
```

配列の初期値、immutable props、各 handler の代入を抽象解釈し、長さの区間を不動点まで保守的に結合する。literal、concat、map、filter、length 比較のガードを扱う。代入途中の値も含めて overapproximation するため、実際には到達しない候補を含むことがある。例では上限4、clear があれば下限0を導き、**0〜4の全件数**を検査する。最大件数だけの計測ではない。

CLI/API には `props` を固定の初期値として渡せる。Vite は実際の mount props を自動入力する。任意の将来の props の型全体を表す契約ではない。任意コードを実行して件数を求めることもない。無制限の concat、未解決の配列、解析上限超過は `U_LAYOUT_CARDINALITY` / `U_LAYOUT_LIMIT` とし、利用者が maxItems を宣言するだけで成功扱いにはできない。現在の上限は繰り返し32件・構造256候補で、構造/profile を通じた共有 work budget も置く。上限超過で一部の候補を黙って省略しない。

`structure` に候補と件数上界、各義務・診断には `variant` を保存する。全体の件数上界が未確定なら max は null。繰り返す地点のガードで有限化できる場合だけ展開する。内容/font の上界は各候補にも適用する信頼する契約のままであり、件数の静的推論と区別する。compiler が決定した native tree の集合へ初期 HTML が属することと、配信 snapshot が解析した初期値に一致することも確認する。

## Native scrollbar の占有幅

```js
layout: {
  css: './app.css',
  viewport: { min: 320, max: 1280, height: { min: 360, max: 900 } },
  scrollbars: [
    { name: 'overlay', inlineSize: 0, blockSize: 0 },
    { name: 'classic', inlineSize: 15, blockSize: 15 },
  ],
  boxes: { '.scroller': { overflowBlock: 'scroll' } },
}
```

`inlineSize` は縦 scrollbar が横に消費する幅、`blockSize` は横 scrollbar が縦に消費する高さ。両軸とも正確な CSS px の値を宣言する。各 profile の幅×高さ領域を検査し、一つでも違反/unknown があれば失敗する。profile は **列挙した環境の正確な寸法という信頼する契約**であり、全OS、0〜15pxの連続範囲、任意の zoom/user 設定を保証する指定ではない。必要なら対応環境の実際の profile を追加する（最大8つ）。thin は `thinInlineSize` / `thinBlockSize` も要求する。

`auto` の表示・非表示を両軸で保守的に組み合わせ、scrollbar 出現によるもう一方の軸への影響も含める。`scrollbar-gutter:stable` は縦 scrollbar の領域を先に確保し、both-edges は左右二つを差し引く。横 scrollbar の高さは別に扱う。減少した content box を Grid、割合サイズ、container query、内容の契約に渡す。content-box の padding/border と gutter も区別する。[CSS Overflow 3](https://www.w3.org/TR/css-overflow-3/#scrollbar-gutter-property) に基づく。

`scrollbar-width:none` は占有0として扱える。寸法の未宣言を黙って0とは扱わない。native の太さはUA/OSに依存し、thin が auto として扱われる環境もあるため、対象環境の契約が必要になる。[CSS Scrollbars](https://www.w3.org/TR/css-scrollbars-1/#scrollbar-width) を参照。

html の scrollbar は viewport へ一度だけ適用する。body の特別な overflow 伝播は現在 unknown とし、html に overflow を明示することを要求する。`html{overflow:auto}` で viewport を使うか、`html{overflow:hidden}` で body を local scroller にできる。正の gutter を持つ subgrid 自身の共有軸への inset は未対応で、親の通常 Grid を scroller にする。native button は appearance:none、display:block と box-sizing/min-size/padding/border の明示的 reset を要求し、未モデル化の UA 寸法を仮定しない。

レポートの `scrollbars`、`scrollbarProfile`、content size と各構造の義務を確認できる。[240通りの実測と有限モデル](../evals/reports/layout-dynamic.md)を参照。

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

[略記と上書きの対応範囲](css-shorthands.md)も参照してください。最終カスケードを検査する機能と、意図しない上書きを警告するlintは区別しています。

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
- **文字のコントラストの差分 fuzzing(`e2e/layout-fuzz-contrast.spec.mjs`)**: 生成器(`e2e/support/contrast-fuzz.mjs`)が、不透明・半透明の背景の入れ子、group の `opacity`、半透明の文字色、通常と大きな文字(`font` shorthand を含む)、幅と `prefers-color-scheme` の media 分岐を作る。Chromium 側は画素で測る。文字の中に `currentColor` で塗った probe を置いて実効の文字色を(すべての opacity group を通して)取り、probe と文字を隠した同じ点で背景を取る。文字・viewport・配色ごとに、静的な `E_A11Y_CONTRAST` の有無が画素の比の判定と一致し、比が ±0.15 で一致することを求める。8 bit の画素で決められない閾値 ±0.1 の判定と、静的に Unknown の文字(group opacity など)は数えて除く。dark の判定は、同じ結果なら light の finding に `alsoUnder` として載る点も扱う。この fuzz で、`font` shorthand が解析されず大きな文字が 4.5:1 で判定されていた(正しくは 3:1)ことが見つかり、`[style] [weight] size[/line-height] family` の形を展開するようにした。seed 300–399 で 3,370 の判定がすべて一致した。
- **覆われる button の差分 fuzzing(`e2e/layout-fuzz-occlusion.spec.mjs`)**: 生成器(`e2e/support/occlusion-fuzz.mjs`)が card の grid に absolute の overlay(軸ごとに 1 つか 2 つの inset、px と %、寸法か inset で埋める)、overlay か button の z-index、`pointer-events: none`、overlay を動かす・隠す・button の幅を変える media 分岐を作る。各 button について、静的な `E_A11Y_OCCLUDED` がその viewport を含む領域にあるかと、Chromium の hit test(button と正の面積で重なる他の要素が、重なりの中心で pointer を受け取るか)が一致することを求める。最初の 20 seed で、ある cover が見つかると他の cover の領域を捨てていた不具合が見つかった(card からはみ出した button が、390px 未満では隣の button に、390–414px では隣の card にだけ覆われる場合、後者を報告していなかった)。cover ごとに、まだ報告していない領域を報告するように直した。seed 500–599 で 2,825 の判定がすべて一致した。
- **不可視な領域の差分 fuzzing(`e2e/layout-fuzz-visibility.spec.mjs`)**: seed つきの生成器(`e2e/support/visibility-fuzz.mjs`)が、入れ子の grid を作る。内容は px と `minmax(0, fr)` の track、gap、padding、px か伸長する item、`overflow: hidden` の容器で、そこに幅・高さ・向き・解像度(`min-resolution: 2dppx`)の media 分岐を加え、track・item の寸法・`display: none` を切り替える。各 grid item が置かれた grid area に収まるか(収まらない部分は容器に切られるか隣に覆われる、不可視な領域)を、静的には item 自身の `E_LAYOUT_ITEM_SIZE` がその viewport を含む領域にあるかで、Chromium では親の解決済み track・gap・padding から area を計算して border box が収まるかで判定し、item × viewport × pixel ratio ごとに一致を求める。viewport は乱数の点と、CSS の px の閾値の両側、向きの分岐があれば w = h の上と両側。領域の判定は範囲(外接矩形)ではなく制約式で行う(向きは対角に切るため)。静的に Unknown の case は数え、一致とはみなさない。通常の実行は 15 seed、`FUZZ_SEEDS`/`FUZZ_FIRST` で増やせる。150 seed で 25,528 の判定がすべて一致した(4 case は解析の作業上限で Unknown)。`FUZZ_MUTATE=ignore-dpr` は静的な判定から pixel ratio の区別を外し、harness 自身がその誤りを検出することを確かめる。flex の版(`generateCase(seed, {flex: true})`)は、行・列の flex 容器と、縮まない(`flex-shrink: 0`)px 幅の子を加え、容器ごとに「表示された子が content box を出る」を、静的には容器の `E_LAYOUT_TRACKS` か子の `E_LAYOUT_ITEM_SIZE` がその viewport の領域にあるかで比べる(縮む子は宣言幅を満たさない `E_LAYOUT_ITEM_SIZE` になるが、Chromium では縮んで収まり不可視ではないので、生成しない)。seed 2000–2099 で 647 の判定がすべて一致した(3 case は下記の Unknown)。この fuzz で、高さの決まった grid の auto の行にスクロールコンテナ(`overflow` が visible でない箱)があり、行の合計が高さを超えると、Chromium はその行を中身ではなく padding まで縮める(スクロールコンテナの自動最小サイズは 0)ことが見つかった。静的な model は中身の高さで行を取るので、その領域を `U_LAYOUT_GRID_SHRINK`(Unknown)にした。
- 結合子: 子(`>`)、子孫(空白)、隣接兄弟(`+`)、後続兄弟(`~`)。祖先と前の兄弟要素へ照合し、specificity は各複合 selector の和。状態(`:hover` など)や疑似要素は最後の複合 selector にだけ置ける(途中にあれば Unknown)。`:is()`/`:where()` の中の結合子も Unknown。Chromium の照合(`e2e/layout-combinators.spec.mjs`)は、乱数の木と結合子の規則で、すべての葉の高さが Chromium と一致することを確かめる。
- **selector とテンプレートの対応(`options.selectors`、opt-in)**: stylesheet の各 selector を解析した木の要素へ照合し、`report.selectors.rows`(selector、file、line、一致した要素の数)に記録する。状態(`:hover` など)と疑似要素は、それが付く要素で判定する。どの要素にも一致しない selector は `W_CSS_SELECTOR_UNMATCHED`(近い class 名があれば示す。転置も 1 文字の違いとして数える)。各複合 selector はどこかの要素に一致するのに結合子の関係が成り立たない selector は `W_CSS_SELECTOR_RELATION` で、壊れた結合子と、実際の親・祖先・兄弟を示す(「`.page > .item`: `.item` は 2 つあるが、親は `.list` と `.card`」)。1 つの木はテンプレートの 1 つの状態なので、分岐のある adapter は状態ごとの警告の共通部分をとる。Chromium の照合は、乱数の木と selector で一致数が `querySelectorAll` と同じことを確かめる。
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

- 子 element を配置する container は Grid か下記の flex サブセットを要求する。block container が子を持つ場合、effective な non-none float、意図を宣言していない重なり、明示列の外への配置は違反にする。
- **flex サブセット**([ADR-0011](adr/0011-flex-and-contents-subsets.md)): `flex-direction` は `row` / `column`、`flex-wrap` は nowrap と row の `wrap`、全 item の `order: 0`。
  - item の主軸: flex base size は 0、px、px の主軸サイズと `auto`、column では block の内容高さ。grow / shrink は任意で、仮の主軸サイズの合計で grow モードと shrink モードを区間分割し、§9.7 の凍結(min を下回る item を min に固定して配り直す)を段階ごとに区間分割して再現する。shrink は shrink × 内側の base に比例。
  - 最小サイズ: 明示の min、空の box と scroll container(overflow が visible / clip 以外)の0、column の内容サイズ item の内容高さ。`width` を持つ `auto` basis の自動最小は縮まない場合だけ扱う。grow / shrink の和が1未満で凍結や縮小が起きる場合は unknown。
  - `flex-wrap: wrap`: 仮の主軸サイズ(定数)で貪欲に行分割し、閾値で区間を分ける。行ごとに主軸を解き、行の高さは item の最大、定義済みの高さでは `align-content` normal / stretch で余りを等分する。
  - 位置: 主軸の auto margin が正の余白を等分し、なければ `justify-content`(flex-start / end / center / space-between / space-around / space-evenly、row では left / right)で配る。余白が負の区間は flex-start に戻る値以外の位置を出さない(サイズは検査する)。
  - 交差軸: `align-items` / `align-self` の normal / stretch は伸長、start / center / end 系は item 自身の高さで行内に置く。column で伸長しない item には px の幅を要求する。baseline、交差軸の auto margin、`wrap-reverse`、column の wrap、`*-reverse`、%・content の basis は `U_LAYOUT_FLEX` の unknown。
  - Grid の `justify-content` も固定 track の位置に同じ配分を適用する。
- **`display: contents`**: box を作らず、子を親の Grid / flex の item として扱う。継承は要素の木に従う。text・契約・noshift の対象を持つ場合、解析の root にある場合、領域によって contents かどうかが変わる場合は unknown。
- 列は固定 px と `minmax(0, Nfr)`。固定列・column gap を引いた残りを fr の比で配分し、fr 合計が1未満なら残余幅を一部残す。通常の `1fr` は intrinsic minimum を持つため未対応として unknown にする。
- 列・行の正の数値 line、`start / span N`、`start / end`、`span N` と sparse な通常の auto-placement を扱う。確定した row を先に配置する。確定 row には明示 column を要求する。暗黙の追加列、名前付き area、dense は未対応。
- `aspect-ratio`(`auto`・`w/h`・`auto w/h`)は、高さが auto の `img` と内容のない箱の高さを、`box-sizing` の示す箱の幅から求める。`img` の `width`/`height` 属性は、作者の CSS がないときの幅と高さの既定値と、`aspect-ratio: auto w/h` になる。静的な画像の大きさは `images` option で渡す。`video` の `width`/`height` 属性も同じく大きさの既定値と `aspect-ratio: auto w/h` になり、比で高さを予約できる(Chromium と一致)。`images` option にファイルの大きさ(メタデータの大きさ)を渡せば、比の食い違いも検査する。予約のない `video` は unknown。`picture` の `img` は、条件領域ごとに、前にある `source` のうち `srcset` を持ち、`media` が一致し、`type` を Chromium が扱える(avif・webp・png・jpeg・gif・svg)最初のものを選ぶ。`media` は media rule と同じく領域を分ける。選ばれた `source` に `width`/`height` があればそれが、なければ `img` の属性が予約になり、`srcset` の1つの URL(`1x` まで)のファイルの大きさが読み込み後の大きさになる。画素密度による選択は下の `devicePixelRatios` を参照。preference の `media`、動的な属性、未知の `type` は unknown。予約がない画像は `E_LAYOUT_IMAGE_UNRESERVED`、比が違う画像は `E_LAYOUT_IMAGE_RATIO`(読み込みで layout shift が起きる)。
- auto・固定 px・割合の inline/block-size、content-box / border-box、px の padding・solid border・gap を扱う。px と割合(包含ブロックの幅に対する)の `max-inline-size`(`max-width`)は推奨幅を上限で抑える(`max(min, min(推奨, max))`、区間を分ける)。行の flex item の主軸の px の max-width は、§9.7 の凍結で扱う(目標を [min, max] に収め、違反の合計の符号で min 側・max 側・全部のどれを凍結するかを区間で分ける)。px の `max-block-size`(`max-height`)は、明示か伸ばされた高さと、葉の内容の高さを抑える(抑えられた内容は契約が溢れを許さなければ E_LAYOUT_CONTENT)。auto の高さで子を持つ容器の max-height と、割合の flex item の max は Unknown。margin は0だけを許可する。p / heading 等の native な block margin は明示的な reset を要求する。CSS min-inline-size / min-width は auto / 固定 px、min-block-size は auto / 0、max は none に限定する。
- **デバイスの画素密度(`devicePixelRatios` option)**: 画素密度(dppx)の一覧を渡すと、それぞれを1つの case として解析する(scrollbar の profile と同じく、行と反例に `devicePixelRatio` が付く)。`resolution` の media query(`min-`/`max-resolution` の dppx・x・dpi・dpcm、`-webkit-min`/`max-device-pixel-ratio`)は、その case では定数になる。`srcset` の密度記述子(`1x`・`2x`…)の候補は、その画素密度以上の最小の密度、なければ最大の密度のファイルを読むとして選ぶ(`img` の `src` は `1x` の候補。`picture` の `source` も同じ)。Chromium で、3 つの `srcset` を 4 つの画素密度(1・1.5・2・3)で比べ、読むファイル・CLS の有無・`resolution` による大きさが一致した。option がない場合、`resolution` の query は unknown になる。比の違う候補を複数持つ `srcset` も unknown になる。幅の記述子(`400w`、`sizes` が要る)は、読むファイルが決まらないので画像の検査をしない。
- **カルーセルのスライド切り替えによる layout shift**: WAI-ARIA の carousel パターン(`aria-roledescription="carousel"` の要素と、その中の `"slide"` の要素)では、表示するスライドを1枚ずつ切り替えて配置し直す。スライドの外にある箱の開始位置が動けば `E_LAYOUT_CAROUSEL_SHIFT` を報告する。表示中のスライドは、`hidden` 属性のない1枚か、`active`・`current`・`selected`・`show` などの状態を表すクラスを持つ1枚とし、切り替えではその目印を他のスライドへ移す。どのスライドも表示されている場合(scroll で送るトラック)は、切り替えで配置が変わらないので検査しない。表示中のスライドが特定できない場合と、切り替え後の配置が決まらない場合は `U_LAYOUT_CAROUSEL_SHIFT`。スライドは 16 枚まで、カルーセルは 8 個までを扱う。Chromium で、`hidden` とクラスで切り替える 4 つの例(高さの違うスライド、固定の高さ、`display: none`、同じセルに重ねて `visibility` で切り替え)を比べ、CLS の有無が一致した。
- **Web フォントの入れ替わり(`W_LAYOUT_FONT_SWAP`、警告)**: `@font-face` を受け付ける(箱は作らない。以前は unknown)。font-family の最初が `@font-face` の family で、`font-display` が `optional` でないテキストのうち、箱の大きさがテキストで決まるものを警告する。
  - 高さで決まる:line-height が px でない、または折り返しうる。
  - 幅で決まる:px の幅のない flex の item。
  フォールバックの `@font-face` が size-adjust などで metrics を合わせている場合は、その family を `fallback` として示す(変化を小さくするだけなので、警告は残す)。警告は status を変えない。実際に動くかは、2つのフォントの metrics と Chromium の 3px のしきい値で決まる。Chromium では、警告のない例(px の line-height で1行、`optional`)が CLS 0 で、警告の1例が CLS > 0 だった。
- **行数の切り詰め(`-webkit-line-clamp`、`W_LAYOUT_LINE_CLAMPED`)**: `display: -webkit-box`・`-webkit-box-orient: vertical`・`-webkit-line-clamp: N` のテキストの葉(px の line-height)は、高さを「テキストの行数と N の小さい方 × line-height」とする。行の契約(折り返しの行数の profile)が N 行を超える条件領域では、残りの行が切られるので警告する(切り詰めは意図した overflow なので、内容の不足の違反にはしない)。Chromium で、5 つの幅の高さと切り詰めの有無が一致した。接頭辞のない `line-clamp` と、vertical でない組み合わせは unknown。
- **viewport のスクロール**: 文書の root(html)の overflow-y が hidden/clip でないとき、viewport がスクロールするので、root が viewport より高くてもよい(長いページ)。overflow-y が visible でスクロールバーの profile を宣言していない場合、root が viewport より高い区間があるなら unknown(スクロールバーの幅が分からない)。visible でクラシックなスクロールバーの profile を宣言した場合は、スクロールバーで狭くなる配置を計算しないので、従来どおり収まることを要求する(auto/scroll なら計算する)。hidden/clip の root は viewport の外の内容に届かないので、違反のまま。以前は、長いページはすべて違反だった。
- **貼り付かない sticky(`W_LAYOUT_STICKY_INERT`、警告)**: `position: sticky`(`top: 0`。integrity か accessibility の検査で扱う)の箱が、親の content box の下端より下に伸びる余地がない(親の高さが自分と同じ、など)場合、どのスクロール位置でも貼り付かないので警告する(よくある、ヘッダを自分の高さの wrapper で包む誤り)。Chromium で、100px スクロールした後の上端の位置と一致した(3 例)。
- **`overflow: hidden` の中の sticky(`W_LAYOUT_STICKY_SCROLLER`、警告)**: `overflow: hidden` の祖先はスクロールコンテナなので、その中の sticky はその箱に貼り付き、ページのスクロールでは貼り付かない。初期のスクロール位置では流れの位置にあるので、relative として配置して警告する(以前は unknown)。`overflow: clip` の祖先はスクロールコンテナでないので、ページに貼り付く(unknown のまま)。Chromium で一致した。
- **inset のない sticky(`W_LAYOUT_STICKY_NO_INSET`、警告)**: `position: sticky` で `top`/`bottom`/`left`/`right` がすべて `auto` の箱は、inset によってだけ貼り付くので、`position: relative` と同じくスクロールで流れる。relative として配置し(以前は Unknown)、`top: 0` の書き忘れとして警告する。Chromium の照合は、スクロール後に流れることと警告とが一致するかを確かめる。
- **`overflow-x` の wrapper の中の sticky(同じ `W_LAYOUT_STICKY_SCROLLER`)**: 表を横スクロールさせる `overflow-x: auto`/`scroll` の wrapper では `overflow-y` が `auto` に計算され、wrapper がスクロールコンテナになる。wrapper が自身の高さを持たない(内容の高さ、`max-height` なし)なら縦にスクロールしないので、上端に sticky な見出しはページに貼り付かない。`hidden` と同じく警告し、relative として配置する。自身の高さで縦にスクロールする wrapper と、`left`/`right` の sticky(先頭列の固定)は Unknown のまま。`overflow-x: clip`(`overflow-y: visible`)はスクロールコンテナを作らないので、中の sticky はページに貼り付く(以前は Unknown だった)。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、500px スクロールして見出しが上端に残るかと警告とが一致するかを確かめる。
- **描画幅より小さい `sizes`(`W_LAYOUT_SIZES_SMALL`、警告)**: `srcset` に幅の記述子(`400w`)がある `img` では、ブラウザは `sizes` の幅(× 画素密度)でファイルを選ぶ。`sizes` を layout と同じく評価し(media 条件で条件領域を分け、`vw`・`calc()` などは viewport の一次式)、描画される幅より小さい条件領域を警告する(小さすぎるファイルが拡大されてぼやける)。10w 刻みの候補で、5 つの `sizes` を 4 つの幅で比べ、Chromium が描画幅より小さいファイルを選ぶ場合と一致した。`sizes=auto` と密度の記述子は対象外。
- **`sizes` のない幅記述子の `srcset`(`W_LAYOUT_SIZES_MISSING`、警告)**: `sizes` を省くと、ブラウザは画像を `100vw` 幅として候補を選ぶ。描画幅が viewport の半分以下になる領域では、表示幅の 2 倍以上の幅のファイルを読み込む(どの画素密度でも同じ)。報告はその領域だけに出す。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)では、10w 刻みの `srcset` を使い、警告の出る場合が、選ばれたファイルの幅が描画幅の 2 倍以上になる場合とちょうど一致することを確かめる。
- **使われない picture の source(`W_LAYOUT_SOURCE_SHADOWED`、警告)**: `<picture>` は、`media` が一致する最初の `<source>` を使う。報告するのは、検査した範囲で一度も選ばれない source である。理由は 2 通りある。1 つは、その source の `media` が一致する所では、必ず前の source も一致する場合(`(min-width: 600px)` の後ろに `(min-width: 900px)` を置いたとき、`media` のない source の後ろの source)。もう 1 つは、その `media` が範囲内で一度も一致しない場合。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)では、各領域の幅で読み込まれたファイルを調べ、報告した source のファイルは一度も読み込まれず、他は読み込まれることを確かめる。
- **一番大きいファイルより広く描かれる画像(`W_LAYOUT_IMAGE_UPSCALED`、警告)**: `img` の描画幅が、使えるファイルの中で一番広い幅を超える領域を報告する。比べる幅は、`srcset` の最大の幅記述子か、`srcset` のない単一の `src` で寸法が分かるファイル(`images` オプション)の幅である。ブラウザーは画像を引き伸ばすので、画素密度 1 でもぼやける。`source` を持つ `picture` は対象外。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)では、幅を指定した SVG のファイルを使い、警告の出る場合が、表示されたファイルの幅が画像の箱より狭い場合とちょうど一致することを確かめる。
- **幅だけ指定した iframe(`W_LAYOUT_EMBED_NO_RATIO`、警告)**: `display: block` の iframe は、既定で 300×150 の置換要素として扱う。`width`/`height` 属性(整数)は寸法のヒントになる。iframe には自身の縦横比がない。そのため幅だけを CSS で決めると(`width: 100%`)、どの幅でも高さは 150px のままになり、埋め込んだ動画や地図は切れるか余白が付く。報告するのはこの場合である。`aspect-ratio` を書くと高さは幅に従う。Chromium の照合(`e2e/layout-flex.spec.mjs`)では、既定の寸法、属性の寸法、幅 100%、`aspect-ratio` の各 iframe の矩形が一致することを確かめる。
- **寸法のない inline svg(`W_LAYOUT_SVG_UNSIZED`、警告)**: HTML adapter は、inline の `<svg>` を 1 つの置換要素として読む。中身の SVG 要素は CSS の箱ではないので読まない。寸法は Chromium で測った規則で決める。`width`/`height` 属性(数値・px・%)は寸法のヒントになる。幅が決まる場合、高さは次の順に決まる:`height` 属性、幅 × viewBox の比、150px。高さだけが決まる場合、幅は高さ ÷ 比で、viewBox がなければ 300px になる。どちらも決まらない場合、viewBox があれば grid の領域いっぱいに広がり、なければ 300×150 になる。この最後の場合を報告する。アイコンがレイアウトに合わせて大きくなるからである。flex container の中で寸法のない svg は Unknown にする。名前は、`aria-label`/`aria-labelledby` か子の `<title>` で付き、それを含むリンクやボタンの名前(内容からの名前)にも入る。`aria-hidden` の svg は名前に入らない。この点も Chromium のアクセシビリティツリーと照合した(`e2e/layout-accessibility.spec.mjs`)。Chromium の照合(`e2e/layout-flex.spec.mjs`)では、属性・viewBox・CSS の各組み合わせの矩形が一致することを確かめる。
- **子を持つボタン**: `appearance: none` と寸法のリセットを書いた `<button>` は、子要素(アイコンとラベル)を持つ `display: grid` / `flex` の container として扱う。この場合、同じ CSS の div と同じ配置になる(Chromium で測った)。名前は子から付く(`aria-hidden` の svg は除く)。Chromium の照合では、次の 2 点を確かめる。`e2e/layout-flex.spec.mjs`:grid と flex のボタンで矩形が一致する。`e2e/layout-accessibility.spec.mjs`:アイコンだけのボタンに Chromium が名前を付けるのは、`E_A11Y_NAME` が出ない場合とちょうど一致する。
- **引き伸ばされる画像(`W_LAYOUT_IMAGE_DISTORTED`、警告)**: `object-fit: fill`(初期値)の `img` は、絵を内容 box の縦横それぞれに合わせて拡大する。box の比が絵の比(ファイルの大きさが `images` で分かればそれ、なければ `width`/`height` 属性)と 2% を超えて違う領域を、横に伸びる/縦に伸びるの別に報告する。典型は `width: 100%` だけを書き、`height` 属性のヒント(固定の px)が残る形。`aspect-ratio: auto …` で一方の寸法が auto の box は読み込んだファイルの比に従うので対象外。padding か border のある img は判定しない。`object-fit` は描画だけの性質として読む(`object-position` は無視)。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、複数の幅で描画した box と `naturalWidth`/`naturalHeight` の比を比べ、警告の領域と一致するかを確かめる。あわせて、`aspect-ratio: 1` や `16 / 9` のような値が正規化されずにいた不具合を直した(以前は比を読めず、高さの予約なしとして Unknown になっていた)。
- **transform の祖先の中の `position: fixed`(`U_LAYOUT_FIXED_CONTAINED`、Unknown)**: transform を持つ祖先は fixed の子孫の包含ブロックになる(CSS Transforms 1 §2)。そのため box はその祖先に対して置かれ、viewport ではなくページと一緒にスクロールする(下に固定したつもりのバーが、カードの下端に出て流れていく)。この配置は model しないので Unknown のままだが、他の未対応(clip、スクロールする祖先)とはコードを分け、原因の祖先(`ancestor`)と性質(`property`)を診断に載せる。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、500px スクロールして fixed の box の位置が動くことと、この診断が出ることとが一致するかを確かめる。
- **両側の inset を持つ absolute**: 同じ軸の両側の inset(`inset: 0` の overlay、`left` と `right`)があり、その軸の寸法が `auto` なら、包含ブロックの間を埋める(幅 = 100% − 始点 − 終点、content-box では自身の padding と border も引く。CSS 2 §10.3.7)。寸法も指定されていれば過剰指定で、終点の inset(ltr では `right`、rtl では `left`、ブロック軸は `bottom`)を無視する。以前は「軸ごとに inset は 1 つ」に限っていたため Unknown だった。疑似要素にも同じく適用するので、card 全体を覆う「stretched link」(`a::after { position: absolute; inset: 0 }`)が card 内の他の button を覆う誤りは、既存の `E_A11Y_OCCLUDED` で検出される(`::after` に `pointer-events: none` があれば対象外)。Chromium の照合(`e2e/layout-rtl-logical.spec.mjs`)は、inset・寸法・box-sizing・direction を乱数で組み合わせ、矩形が一致することを確かめる。
- **positioned な祖先のない absolute(`W_LAYOUT_ABSOLUTE_PAGE`、警告)**: `position: absolute` の箱に positioned(か transform)の祖先がないと、初期包含ブロック(ページ先頭にある viewport の大きさの矩形)に対して置かれ、ページと一緒にスクロールする。入れるつもりだった箱(カードの角のバッジ)ではなくページの角に出るので、多くは親の `position: relative` の書き忘れ。以前は Unknown だったが、初期包含ブロックに配置して警告する。間に clip やスクロールする祖先があれば Unknown のまま。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、上下左右と % の inset で、幅と高さを変えて位置が一致することを確かめる。
- **display で効かない宣言(`W_LAYOUT_DECLARATION_INERT`、警告)**: 親が flex の箱の `grid-column`/`grid-row`、親が grid の箱の `flex-grow`/`flex-shrink`/`flex-basis`、自身が flex の箱の `grid-template-*`/`grid-auto-*`、自身が grid の箱の `flex-direction`/`flex-wrap`。レイアウトはこれらを無視するので結果は正しいが、書いた意図(2 列にまたがる、伸びる)は起きない。初期値と同じ値は報告しない。absolute の箱の item の性質は対象外。ほかに、幅と高さを両方指定した箱の `aspect-ratio`(大きさを決める auto の軸がない)と、grid/flex の item の `vertical-align`(inline の箱と table cell にしか効かない。`align-self` を使う)も報告する。描画の宣言では、inline 方向の overflow が `visible` の箱の `text-overflow`(切り取られないので省略記号を付ける場所がない。`overflow: hidden` か `clip` が要る)と、`display: -webkit-box` でない箱の `-webkit-line-clamp` も報告する。flex の item の `justify-self` と flex container の `justify-items` も報告する(flex は両方を無視する。`margin-inline-start: auto` か親の `justify-content` を使う)。grid の item と absolute の箱では、`justify-self`/`justify-items` の既定値(`auto`/`normal`/`stretch`)以外の位置揃えはモデル化していないので Unknown にする。`flex-basis` が auto でない flex item の主軸の寸法(`flex: 1; width: 200px` の `width`)も報告し、レイアウトでは auto として扱う。flex-basis が主軸の寸法を置き換えるためである。ただし寸法は自動最小サイズ(specified size suggestion)にも効く。そのため報告するのは、自動最小サイズを使わない場合(明示した `min-width`、スクロールコンテナ、中身のない箱)だけにした。自動最小サイズを使う場合は Unknown のまま残す。1 行の flex container(`flex-wrap: nowrap`)の `align-content`(配分する行がない。`align-items` を使う)と、置換要素でない箱(img・video などでない)の `object-fit` も報告する。最小より小さい最大寸法(`min-width: 200px; max-width: 100px`)は報告しない。伸びる幅を最大で抑えてから最小で戻すので、最大寸法には効果がある(Chromium で確認した)。`z-index` は対象外にした。この engine では親が常に grid か flex なので、`z-index` は必ず効く。宣言の file・line・selector を載せる。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)では、警告の出る場合が次とちょうど一致することを確かめる。配置の宣言は、消しても全ての箱の位置と寸法が変わらない場合。描画の宣言は、文字を入れた箱で、消しても画面のピクセルが変わらない場合。
- **flex item の container query がつぶれる(`W_LAYOUT_CONTAINER_COLLAPSE`、警告)**: `container-type: inline-size`(または `size`)はインライン方向のサイズ封じ込めを課す。そのため箱の幅は中身を見ない(CSS Containment §3.2)。幅も flex-basis も auto で伸びない(`flex-grow: 0`)flex 行の item は、padding と border だけの幅になり、中身がはみ出す。engine はこの封じ込めを flex item の内容寸法 0 と自動最小サイズ 0 としてモデル化する。中の子の要求幅は `E_LAYOUT_ITEM_SIZE` として出る。幅が auto の absolute の箱(左右の inset の片方だけ)も同じで、内容に合わせて縮む幅が padding と border だけになる。Chromium の照合(`e2e/layout-flex.spec.mjs`)は、つぶれる item、`flex-grow: 1` で伸びる item、つぶれる absolute の箱(border-box と content-box)の矩形が一致することを確かめる。
- **一致しない container query(`W_CSS_CONTAINER_QUERY_NEVER`、警告)**: `@container` の規則が、検査した範囲でどの要素にも一致しない場合に報告する。原因は次の 3 つで、`reason` に区別して載せる。祖先に `container-type` がない(`no-container`)。`container-name` の一致する祖先がない(`no-container`)。見つかった container がその寸法にならない(`size`、検査した viewport の範囲で)。この規則は適用されない。解析する root の外に container がないこと(既存の前提)は、この判定にも使う。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)では、警告の出る規則がどの幅でも効かず、出ない規則はどこかの幅で効くことを確かめる。
- **フォーカスで動くレイアウト(`W_LAYOUT_FOCUS_SHIFT`、警告、accessibility 有効時)**: レイアウトを変える `:focus`/`:focus-visible` の規則(`border-width`、`padding`、`height` の変更)があると、フォーカスした箱ごとにページを配置し直し、開始位置の動く箱を報告する。キー入力の直後のずれは Layout Instability では除外されるので CLS にはならない。それでも、Tab で移動する利用者の目の前で内容が跳ぶ。`outline` や `box-shadow`、色の変更は配置を変えない。Chromium の照合(`e2e/layout-accessibility.spec.mjs`)では、Tab でフォーカスしたときに次の箱が報告した量だけ動き、報告しない規則では動かないことを確かめる。
- **margin を付けた幅 100%(`W_LAYOUT_FULL_WIDTH_MARGIN`、警告)**: `width: 100%` は領域の全幅なので、px の始端 margin がその分だけ箱を押し出す(引き伸ばし、つまり `width: auto` なら margin を引いた幅になる)。はみ出しの `E_LAYOUT_ITEM_SIZE` の原因として報告する。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)では、警告の出る場合が、item が領域の右端を越える場合とちょうど一致することを確かめる。
- **px だけの grid の列(`W_LAYOUT_FIXED_TRACKS`、警告。違反は inline 軸の `E_LAYOUT_TRACKS`)**: `grid-template-columns` が px の track だけ(`repeat(3, 200px)` など)の grid は、track と gap の和より縮まないので、狭い親からはみ出す。その違反が出たとき、伸縮する track(`repeat(N, minmax(0, 1fr))`)か、media/container query で列を減らすことを示す。Chromium の照合は、grid の `scrollWidth > clientWidth` と警告の範囲とが幅ごとに一致するかを確かめる。
- **収まらない長い単語(`W_LAYOUT_LONG_WORD`、警告。違反は inline 軸の `E_LAYOUT_CONTENT`)**: 折り返す文字(`white-space: normal` など)で `overflow-wrap: normal` なら、改行は単語の間だけなので、最小幅は最長の単語になる。URL や長い複合語が箱より広い違反が出たとき、その原因と `overflow-wrap: anywhere`(または `break-word`)を示す。`nowrap` の文字は別の原因なので対象外。Chromium の照合は、単語の幅を測って最小幅とし、`normal` ではみ出し `anywhere` では収まることと警告とが一致するかを確かめる。
- **width 属性の幅のままの画像(`W_LAYOUT_MEDIA_NO_MAX`、警告。違反は inline 軸の `E_LAYOUT_ITEM_SIZE`)**: `img`/`video` の `width` 属性は幅のヒントになるので、CSS の `width` も `max-width` もなければ、その px 幅のまま狭い親からはみ出す。その違反が出たとき、属性が原因であることと `max-width: 100%`(比を保つなら `height: auto`)を示す。Chromium の照合は、画像が親より広くなることと警告とが一致するかを確かめる。
- **content-box の `width: 100%`(`W_LAYOUT_CONTENT_BOX_FULL`、警告。違反は inline 軸の `E_LAYOUT_ITEM_SIZE`)**: `box-sizing: content-box`(ほとんどの箱と text input の既定)で `width: 100%` を書くと、それは内容の幅なので padding と border が上乗せされ、箱が親からはみ出す。その違反が出たとき、原因の padding/border を名指しして `box-sizing: border-box` を勧める。Chromium の照合は、箱が親の右端を越えることと警告とが一致するかを確かめる。
- **classic スクロールバーのページの `100vw`(`W_LAYOUT_VW_SCROLLBAR`、警告。違反は inline 軸の `E_LAYOUT_ITEM_SIZE`)**: `vw` はスクロールバーを含む viewport 全体の割合なので、classic なスクロールバーで縦にスクロールするページでは、`100vw` の箱はスクロールバーの横の幅より広く、横スクロールが生じる。幅を `vw` で書いた箱が inline 軸で収まらないとき、その原因を警告で示す。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、`--hide-scrollbars` を外した Chromium(15px の classic スクロールバー)で横スクロールが起きることと警告とが一致するかを確かめる。あわせて、`overflow-y: visible` の root が classic プロファイルで viewport より高い場合は、違反ではなく Unknown にした(ブラウザではスクロールする。スクロールバーで狭まる配置は `html { overflow-y: auto }` のときに model する)。`overflow-y: auto` はスクロールバーの有無の両方の frame を内容の高さによらず検査する保守的な model なので、収まるページの `100vw` も報告する(既知の過大評価)。
- **言語のない `hyphens: auto`(`W_LAYOUT_HYPHENS_NO_LANG`、警告)**: ハイフネーションは内容の言語の辞書で行う。要素にも祖先にも html にも `lang` がなければブラウザはハイフネーションしないので、`hyphens: manual` と同じに折り返す。この場合は manual として配置し、宣言が効いていないことを警告する(以前は一律に Unknown だった)。`lang` がある場合は辞書の切れ目を model しないので Unknown。html 要素のない断片では文書の言語が分からないので Unknown。文字のない箱では関係しないので verified。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は `lang` なしで auto と manual の行の高さが同じことを確かめる。この環境の headless Chromium にはハイフネーション辞書がなく、`lang` がある場合の違いは確かめていない。
- **page の font-size を継承しない form control(`W_LAYOUT_CONTROL_FONT`、警告)**: `button`・`input`・`select`・`textarea` は親の `font-size` を継承せず、UA の control の大きさ(既定 − 2.67px、16px の既定で 13.33px。Chromium で測定)になる。祖先が author の font-size を持つのに control に font-size がない場合に警告する(`font: inherit` で解消)。あわせて、control の font-size を親から継承するとしていた model の誤りを直し、author が設定するまで `ua` として扱う。Chromium の照合は、control と親の計算値の font-size が異なることと警告とが一致するかを確かめる。
- **既定の文字サイズに従う文字の px の height(`W_LAYOUT_HEIGHT_FIXED_TEXT`、警告)**: 文字を持つ箱の `height` が px で、文字の `font-size` が既定に従う場合、既定を大きくすると文字が箱より高くなり、はみ出すか(`overflow: hidden` なら)切れる。`min-height` は伸びるので対象外。Chromium の照合は、既定を 32px にして `scrollHeight > clientHeight` と警告とが一致するかを確かめる。
- **既定の文字サイズに従う文字の px の line-height(`W_LAYOUT_LINE_HEIGHT_FIXED`、警告)**: `line-height` が px で、`font-size` が利用者の既定の文字サイズに従う(root に px の font-size がなく相対値か、`medium` などのキーワード)文字。既定を大きくすると文字だけ大きくなり行は広がらないので、折り返した行が重なる。単位なしや em の line-height、px の font-size は対象外。Chromium の照合は、CDP の `Page.setFontSizes` で既定を 32px にし、文字の大きさが行の高さを超えることと警告とが一致するかを確かめる。
- **page zoom で大きくならない文字(`W_LAYOUT_FONT_ZOOM`、警告)**: page zoom z は viewport を CSS px で W/z に縮め、CSS px を z 倍で描くので、`font-size` f(W) は z·f(W/z) で表示される。px と rem は z 倍になるが vw/vh は大きくならない。200% zoom で 2 倍に届かない幅(f(W/2) < f(W) のところ)を、宣言した要素で報告する(SC 1.4.4)。`5vw` は全域で 1 倍、`calc(1rem + 1vw)` は 2 倍未満、`clamp(1rem, 4vw, 3rem)` は 4vw が下限を超える幅(400px 超)で不足する。px・rem・vw/vh/vmin/vmax・`calc`・`min`・`max`・`clamp` を評価し、`em` と `%` は親の大きさによるので判定しない。`rem` は html の px の font-size が分かる場合だけ評価する。区分線形なので幅は 1px ごとに評価する。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、200% zoom を「CSS 幅を半分、pixel ratio を 2 倍」で再現し、物理的な大きさが 2 倍に届かないことと警告の範囲とが一致するかを確かめる。
- **html/body の絶対長の `font-size`(`W_LAYOUT_ROOT_FONT_FIXED`、警告)**: `html` か `body` の `font-size` を px・pt などの絶対長にすると、ブラウザの設定にある利用者の既定の文字サイズを置き換えるので、ページの文字がそれに従わなくなる(%、em、rem、medium は従う)。部品の箱の px は対象外。Chromium の照合(`e2e/layout-cls-facts.spec.mjs`)は、CDP の `Page.setFontSizes` で既定を 16px から 24px に変え、文字の大きさが変わらないことと警告とが一致するかを確かめる。なお、この検査器は `rem` を html の px の font-size から解くので、`%` の root では `rem` の寸法が Unknown になることがある。
- **セーフエリア(`safeArea` option、`W_LAYOUT_SAFE_AREA`、警告)**: `env(safe-area-inset-*)`(px の fallback 付き、`max(px, env(…))` も)を padding で扱う。viewport の meta が `viewport-fit=cover` のときは `safeArea` option(機種の inset、px)で解決し、宣言がなければ unknown。cover でなければ 0(ブラウザと同じ)。cover のページで下端に固定した(`bottom: 0`)バーの padding-bottom が下の inset より小さいと、中身がホームインジケータの下に入るので警告する。Chromium のデスクトップ版はセーフエリアを再現しないので、ブラウザとの照合はしていない。
- **`letter-spacing` と `text-wrap-style`**: `letter-spacing` は px と em を受け付ける。em は宣言した要素の px の font-size で px にしてから継承する(CSS の computed value)。text 契約の font に `letterSpacing`(px)を書くと、計測は文字ごとにその値を足し、0 以外では合字を外す(Chromium と同じ)。CSS の値と計測の値が違えば unknown。Roboto で 4 つの間隔 × 3 つの文字列の幅が [計測値, 上界] に収まった。`text-wrap-style: balance`/`pretty` は継承し、折り返すテキストの葉にかかるときだけ unknown(1 行のテキストは変わらない。Chromium で確認)。`white-space` と略記の `text-wrap`(と `text-wrap-mode`)は、どちらも折り返しのモードを書く(CSS Text 4)。カスケードで後か詳細度の高い方が勝ち、その結果を `white-space` に戻す(nowrap ↔ normal、pre ↔ pre-wrap。`pre-line`・`break-spaces` の nowrap は対応する値がないので unknown)。10 の組み合わせ(順序・詳細度・継承)で Chromium の計算済みの `text-wrap-mode` と一致した。
- **配置に影響しないプロパティ**: スクロールの振る舞い・選択・キャレットとアクセントの色・フォントの平滑化・スクロールスナップ・view transition・画像の補間・`object-fit` などは、受け付けて無視する。改行・字形・包含ブロック・描画を変えうるプロパティ(`word-break`・`hyphens`・`text-wrap`・`font-variant-*`・`font-feature-settings`・`filter`・`contain`・`will-change`・`content-visibility`・`resize`・`mix-blend-mode` など)は、既定の値のときだけ受け付け、それ以外は unknown。受け付けたものを全て付けたページで、Chromium の全ての箱の位置と大きさが付けないページと一致した。
- **省略記号での切り詰め(`text-overflow: ellipsis`、`W_LAYOUT_TRUNCATED`、警告)**: `text-overflow`(`clip`・`ellipsis`)を受け付ける(以前は unknown)。1 行(nowrap)で overflow が hidden か clip のテキストに ellipsis があれば、入りきらない条件領域は意図した切り詰めとして警告し、内容の不足の違反にはしない。ellipsis のない切り詰めは従来どおり違反。Roboto の実フォントで、5 つの幅で Chromium の切り詰めと一致した。
- **モバイルのブラウザの挙動(警告)**: どちらもデスクトップの Chromium では再現しないので、ブラウザとの照合はしていない。
  - `W_LAYOUT_INPUT_ZOOM`:16px 未満の文字の入力欄。iOS Safari はフォーカスするとページを拡大する(拡大を禁じたページは対象外。それは meta-viewport が報告する)。
  - `W_LAYOUT_VH_TOOLBAR`:高さが `vh`(`vmin`・`vmax`)で決まる箱。モバイルのブラウザの vh はツールバーを隠したときの大きい viewport なので、ツールバーが出ている間は下端がその下に隠れる。`svh`・`dvh` は対象外。
- **画面内の遅延読み込み画像(`W_LAYOUT_LAZY_IN_VIEWPORT`、警告)**: `loading="lazy"` の `img` が、初期のスクロール位置で viewport の中にある条件領域を警告として示す(LCP の画像の読み込みが遅れる)。その領域は、Chromium で4つの大きさの viewport の表示の有無と一致した。
- **layout shift の score の上界(`scoreBound`)**: viewport の高さがある場合、`E_LAYOUT_HOVER_SHIFT` と `E_LAYOUT_CAROUSEL_SHIFT` に、その変化(1 フレーム)の Layout Instability の score の上界を付ける。上界は、影響の割合 × 距離の割合で求める。
  - 影響の割合:動いた全てのレイアウトの箱の前後の矩形の和集合を viewport で切り取り、その面積を viewport の面積で割る。
  - 距離の割合:最大の横か縦の移動量を、viewport の幅と高さの大きい方で割る。
  Chromium が数える箱(描画される箱)はこの部分集合なので、どちらの割合も大きく見積もるだけで、上界になる(初期のスクロール位置)。Chromium の実測は、hover の 2 例とカルーセルの 2 例で上界と一致した(どの箱も描画されている場合)。アニメーションの `E_LAYOUT_ANIMATION_SHIFT` には、Chromium の CLS の 1 つの窓(間隔 1 秒未満、最大 5 秒)の上界を、前提つきで付ける(`scoreBound`: `window`・`perIteration`・`iterations`・`assumes`)。前提は「キーフレームの間で箱が単調に動く」で、`assumes` に記録する(前提のない上界ではない)。
  - 隣り合うキーフレームの間の影響は、動く箱の 2 つの位置を囲む矩形の和集合で抑える。フレームごとの最大の移動の和は、各箱の移動量の和で抑える。
  - 5 秒に入る回数を掛ける。`normal`/`reverse` の繰り返しでは、100% から 0% への跳びと、開始時の基本の配置からの跳びを、1 回の変化の上界で足す。
  - margin のキーフレーム(配置し直さないもの)には付けない。
  Chromium の最大の窓は、4 例で上界以下だった(例:0.069 に対して 0.127)。初期化の前後のような2つの状態の比較は、既存の noshift API(2つの解析結果)で行う。
- **CSS アニメーションによる layout shift**: 動いている(`paused` でも時間 0 でもない)アニメーションの `@keyframes` に、配置を変える宣言(transform・不透明度・色などの描画だけの宣言以外)があれば、キーフレームごとに、その宣言をその箱だけに当てて配置し直す。アニメーションが動く条件領域で、開始位置が動いた箱を `E_LAYOUT_ANIMATION_SHIFT` として報告する。in-flow の箱の `margin-top`/`margin-left` を 0 以外の px にするキーフレームは、その箱自身が動くので、配置し直さずに報告する。キーフレームの間のフレームは列挙しない。キーフレームで動けば、動いている間は毎フレーム動く。キーフレームの配置が決まらない場合は `U_LAYOUT_ANIMATION_SHIFT`。CLS の値(面積 × 距離)の上限は計算しない。
- **`:hover` による layout shift**: 配置を変える `:hover` のルール(複合セレクタ)は、一致する箱ごとに、その箱と祖先を hover 状態にして配置し直す。全ての箱の開始位置(inlineStart・blockStart、transform を除いたレイアウトの矩形)を、条件領域の共通部分の頂点で厳密に比べ、動いた箱を `E_LAYOUT_HOVER_SHIFT` として報告する(hover は CLS を免除する入力ではない。Chromium で測定)。大きさだけが変わり開始位置が動かない場合(末尾の箱が伸びる、幅が始点から縮む)は報告しない。hover 時の配置が決まらない場合や、レイアウトの矩形がない箱(clip の中など)がある場合は `U_LAYOUT_HOVER_SHIFT`。対象は最初の 64 個の箱まで。
- **長さの単位と計算式**: `svw`・`lvh`・`dvh`・`svmin` など(small・large・dynamic の viewport 単位)は、option の静的な viewport では `v` の単位と同じ値として扱う(ブラウザの UI で viewport が変わることは扱わない)。`inline-size`・`block-size`・`max-inline-size`・`max-block-size`(明示の高さを抑える場合)は px と % に加えて `vw`・`vh`・`vmin`・`vmax`・`rem`・`em` と `calc()`(`+ − × ÷`、× ÷ は数値との間だけ)・`min()`・`max()`・`clamp()` を受け付ける。長さは viewport の幅 W と高さ H のアフィン関数になる。`vmin`/`vmax` と `min()`/`max()`/`clamp()` は、引数が交わる位置で条件領域を分ける(例: `clamp(200px, 50vw, 500px)` は W = 400 と 1000 で3区間)。`vh`/`vmin`/`vmax` には viewport の高さの範囲が要る。`rem` は解析する木の html ルートの px の font-size で解決する。`analyzeHTML` に `<html>` から始まる文書を渡すと html ルートを持てる(head は捨てる。meta と title 以外の要素を含む head は unknown)。fragment には html ルートがないので、`rem` は unknown。`em` は要素の px の font-size で解決する。padding・gap の `rem` も同じ扱い。単位のない数値の長さ、長さ同士の積、0 での除算、未知の単位は unknown。`hsl()`/`hsla()` の色はコントラストの計算に使える。Chromium の実測と、幅5通り・高さ2通りで照合した(e2e)。
- row は固定 px、`minmax(0, Nfr)`、auto。implicit row は grid-auto-rows を反復する。auto row は子の自動高さを下から集約し、definite な container では余りの伸長を反映する(`align-content: start | center | end` では伸ばさず、center・end は行を余白の半分か全部ずらす。溢れると負にずれる)。indefinite な fr row は max-content に対応する契約値から flex fraction を求める。
- item の block alignment は normal / stretch、content alignment は normal / stretch / start。row span は独立にサイズを確定できる row 間で扱う。intrinsic size の分配が必要な row span、他の alignment、intrinsic column は未対応である。
- 折り返し条件は `white-space` と `overflow-wrap` の継承を含めて照合する。`anywhere` と `break-word` を同一視しない。

CSS による通常の in-flow parent と child の関係を検査する。pure component と client island の root を追い、有限な動的 class/id・分岐・上限付き loop の集合を検査する。opaque children、inline style、reset/adapter のない native control 等は unknown。初期 SSR に存在する構造だけで将来の構造を判断しない。

## block flow

`display: block` の container で、子がすべて block レベルで、子に縦の margin がない場合は、行が伸びない(`align-content: start`)1 列の grid として配置する。子は上から積まれ、幅いっぱいに広がる。container に高さがあっても子は伸びない。% は container の幅に対して解決し、左右の margin はそのまま効く。grid の性質と gap は block には効かないので使わない。幅が auto で左右が `auto` margin の子は、幅いっぱいを `max-width` で抑えたうえで中央に置く(`max-width: 1200px; margin: 0 auto` のラッパー)。幅、%、左右の margin、padding、border、入れ子の grid、画像、auto margin について、Chromium での配置が同じであることを測った。隣り合う子の縦の margin は相殺され、大きい方だけが残る(Chromium で測った)。そのため、次の子の上 margin を「max(前の下, 自分の上) − 前の下」に置き換えて配置する。container を通り抜ける相殺(その側に padding も border もない場合や、高さが auto の下端)と、中身のない子の自身の margin の相殺は Unknown にする。inline レベルの子(行の配置)と、子要素と混ざった直接のテキストも Unknown にする。Chromium の照合は 2 つある。`e2e/layout-flex.spec.mjs` は矩形の一致を確かめる。`e2e/layout-fuzz-visibility.spec.mjs` の block 版は、40 seed・4,348 件の判定の一致を確かめる。

## grid item の margin

grid item には、負でない px の margin を書ける(grid と flex の margin は相殺しない)。item は、grid の領域から margin を引いた幅と高さの中に配置され、左上の margin の分だけずれる。auto の行は、item の margin を含めた大きさで決まる。収まるかどうかは、始端の margin と border box を合わせて領域と比べる。終端の margin がはみ出しても、何も隠れず、スクロールも起きない(Chromium で測った)。幅を指定した item(px か %、ltr)の inline の `auto` margin は、領域の空きを取って item を中央(両側 auto)か端へ寄せる。空きが負なら取らずに始端に置く(Chromium で測った)。幅が auto で `auto` margin の item は内容に合わせて縮むので、Unknown にする。flex の行(row)の item の px margin は、主軸の外側の大きさ(基準・最小・最大)に含め、item はその内側に配置する。交差軸では、伸びる大きさから margin を引き、行の高さは margin を含めて決める。行がはみ出したかどうかの判定では、最後の item の終端の margin を除く。負の margin、column の flex item の px margin、subgrid の margin、rtl で左右の値が異なる margin は Unknown にする。Chromium の照合は 2 つある。`e2e/layout-flex.spec.mjs` は、入れ子と auto の行を含めて矩形が一致することを確かめる。`e2e/layout-fuzz-visibility.spec.mjs` の margin 版は、40 seed・5,944 件で、item が収まるかどうかの判定が一致することを確かめる。flex の margin 版は、40 seed で、flex の行がはみ出すかどうかの判定が一致することを確かめる。

## 静的位置の absolute と視覚的に隠したテキスト

inset がどちらも auto の absolute の箱は、静的位置に置かれる。grid container の中では、それは container の padding の端である(css-grid-1 §9.4)。その container 自身が containing block(positioned)の場合に限り、始端の inset 0(rtl では right: 0)として扱う。それ以外の場合は Unknown にする。こうして、inset を書かない sr-only の定番のパターンやバッジを扱える。

視覚的に隠した箱(`clip-path: inset(50%)`、`clip: rect(0 0 0 0)`、または overflow を隠した 1px 以下の箱)の中身は、見せないことが目的である。そのため、収まるかどうか(`E_LAYOUT_CONTENT`)と固定高さのテキスト(`W_LAYOUT_HEIGHT_FIXED_TEXT`)は判定しない。名前には入る。Chromium の照合では、次の 2 点を確かめる。`e2e/layout-flex.spec.mjs`:静的位置の矩形が、padding・border・rtl を含めて一致する。`e2e/layout-accessibility.spec.mjs`:sr-only のテキストでリンクに名前が付くのは、`E_A11Y_NAME` が出ない場合とちょうど一致する。

## 最小幅のある fr トラックと auto-fill

`minmax(Lpx, Nfr)` は、空き幅の取り分が L 未満のトラックを L で固定し、残りを分け直す(css-grid-1 §12.7.1 の fr の大きさの求め方)。各回は「取り分 ≥ L」による領域の分割になる。全てのトラックが L に固定され、さらに幅が足りない領域は `E_LAYOUT_TRACKS` になる。`minmax(min(Lpx, 100%), Nfr)` では、container の幅が L 未満の所で最小幅が container の幅になり、はみ出さない。

`repeat(auto-fill, T)`(T は `Lpx` か上記の minmax)は、最小幅で並ぶ数だけトラックを作る(1 本以上)。本数は、container の幅に対する閾値 `n·L + (n−1)·gap` で領域を分けて決める。`auto-fit` は、item の入らないトラックとその gap をつぶす。そのため、すべての子が自動配置で 1 マスの item で、どの状態でも描画される場合に限り、auto-fill の本数を item 数で頭打ちにしたものとして扱う(Chromium で測った)。それ以外の場合は Unknown にする。

Chromium の照合は 2 つある。`e2e/layout-flex.spec.mjs` は、本数が変わる閾値の前後の幅で矩形が一致することを確かめる。`e2e/layout-fuzz-visibility.spec.mjs` の minmax 版では、これらのトラックを混ぜた入れ子の grid を生成し、item が Chromium の解決したトラックに収まるかどうかの判定が一致することを確かめる(auto-fill は 60 seed で 7,796 件、auto-fit を加えた版は 30 seed で 3,166 件の判定)。

## 名前付きの grid 領域

`grid-template-areas` と `grid-area: <名前>` を扱える。`grid-row` / `grid-column` に名前を書いた場合も、その領域の線として扱う。名前は大文字と小文字を区別する。item は DOM の順序ではなく名前で配置される。以下は Unknown にする。

- 長方形でない領域や、列数の揃わない行(宣言として無効)
- `grid-template-columns` より列の多いテンプレート(暗黙の列ができる)
- 行番号を書く形の `grid-area`(`1 / 2 / 3 / 4`)
- `grid-template` 略記

テンプレートに無い名前を指す item(`grid-area: header` に対して領域が `head`)は `W_LAYOUT_GRID_AREA_UNKNOWN`(警告)になり、レイアウトは Unknown になる。ブラウザーはその名前の暗黙の線を明示グリッドの後ろに作り、item をそこへ置くからである。Chromium の照合では、次の 2 点を確かめる。

- `e2e/layout-flex.spec.mjs`:名前で配置した item の矩形が一致する。
- `e2e/layout-cls-facts.spec.mjs`:警告の出る場合に、item が明示グリッドの外に置かれる。

## Subgrid の共有トラック

`grid-template-columns: subgrid` と `grid-template-rows: subgrid` を扱う。子の幅でもう一度 fr を配分せず、直接の親 Grid から、配置された span に対応する **解決済みトラック列**を渡す。ローカル line は1から始まり、入れ子でも共有を維持する。CSS の `inherit` による track 定義のコピーとは区別する。

```css
.board {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 144px;
  grid-template-rows: 100px minmax(0, 1fr);
  block-size: 360px;
  gap: 16px;
}
.group {
  display: grid;
  grid-column: 1 / span 2;
  grid-row: 1 / span 2;
  grid-template-columns: subgrid;
  grid-template-rows: subgrid;
  padding: 8px;
}
```

通常の Grid の `gap: normal` は0、subgrid の共有軸では親の使用 gap とする。省略時も normal。明示した別の gap では、親と子の gap の差の半分を内部の端へ加減し、共有境界の中央を維持する。padding と border は最初・最後のトラックから引き、入れ子の調整を積み重ねる。これらは [CSS Grid Level 2 の subgrid](https://www.w3.org/TR/css-grid-2/#subgrids)に基づく。

制約は次の通り。

- 親の列は既存の固定 px / `minmax(0, Nfr)`。行共有には高さを含む両軸検査を要求し、親の row は独立に確定できる固定 px または definite な高さに対する fr とする。固定 row だけなら親全体の高さは auto でもよい。
- 子の内容を親の auto row や indefinite な fr row へ押し上げる intrinsic contribution は未実装で `U_LAYOUT_SUBGRID`。単なる最小高さの仮定で安全としない。
- 共有する軸の子のサイズは auto、min-size は auto / 0 を要求する。名前付き line、`repeat()`、解析境界外の親、調整後に負のトラック幅が生じる場合も unknown。非共有軸は既存の明示 Grid subset に従う。
- 共有軸の範囲外への配置や暗黙トラックは `E_LAYOUT_SUBGRID_PLACEMENT`、意図しない重なりは `E_LAYOUT_OVERLAP`。ブラウザーが範囲外を clamp する有効な CSS でも、この検査 subset では拒否する。
- media / 親の container 条件、reset、box-sizing は既存の条件領域ごとに解決する。subgrid 自身の `container-type: inline-size / size` は、独立 formatting context の実装差があるため unknown とし、size query container を親に置く。subgrid 自身への正の scrollbar inset は unknown とし、親の通常 Grid の gutter を考慮する。

`LayoutSummary.subgrids` に共有元の box/path、軸、親での開始 line、span、使用 gap、端の inset とトラック幅の有理数 affine 式を記録する。検査は build-only で、browser runtime と配布 JS は増えない。

[ソース](../examples/layout-contracts/subgrid.isle)・[CSS](../examples/layout-contracts/subgrid.css)・[sidecar](../examples/layout-contracts/subgrid.json)を `just layout-subgrid` で実行できる。`just layout-subgrid-check` は MoonBit/veri の有限モデルと JS kernel を照合し、ブラウザーで共有 line の中央と各 box の両軸サイズを比較する。[範囲と結果](../evals/reports/layout-subgrid.md)を参照。

## Overflow の契約

横方向は `overflow`、縦方向は `overflowBlock` を宣言し、それぞれ既定は `fit`。CSS の overflow 値だけを変えても、この要求は解除しない。以下の x を、縦方向では y として照合する。

| 契約 | 検査 |
|---|---|
| fit | 子と内容が割当領域へ収まることを要求する |
| scroll | computed overflow-x が auto / scroll であることを要求し、当該内容の幅不足を許可する |
| clip | computed overflow-x が hidden / clip であることを要求し、明示した切り取りを許可する |
| visible | computed overflow-x が visible であることを要求し、明示した領域外表示を許可する |

非 fit の container では、その子が割当領域を越えることも許可する。子自身の fit 契約は独立して検査する。CSS における overflow-x/y の computed value の相互作用を反映する。scrollbar の占有幅は宣言した profile に従って検査する。スクロール操作性、切り取られる情報の妥当性、focus の可視性自体はサイズの保証に含めない。

## Media と反例

screen 用の width / height 条件、min/max、比較演算、and、comma による選言、入れ子の media を扱う。orientation と、利用者の設定(`prefers-reduced-motion`・`prefers-color-scheme`・`prefers-contrast`・`forced-colors`。paint と animation だけを変える状態として扱う)に対応する。hover などの未対応条件と相対単位は unknown。

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

## vlmkit の integrity 規則(opt-in)

`integrity: true`(または `{targetSize: 24, protrusion: 'painted'}`)を渡すと、`vlmkit check integrity` のボックスモデルの規則を viewport の全域で静的に判定する([ADR-0012](adr/0012-static-integrity-rules.md))。
ページの横溢れ(`E_LAYOUT_PAGE_OVERFLOW`)、子の親からのはみ出し(`E_LAYOUT_PROTRUSION`)、テキスト box の重なり(`E_LAYOUT_TEXT_COLLISION`)、
button / a の target 寸法(`E_LAYOUT_TARGET_SIZE`)はエラー、overflow で切れる内容(`W_LAYOUT_CLIPPED`)と入れ子のスクロール(`W_LAYOUT_NESTED_SCROLL`)は警告になる。
契約で溢れを許した場合も報告する。vlmkit の4px閾値は持たない。text-collision は、フォント由来のテキスト契約を持つ leaf では描かれる1行の範囲(上界の幅を `text-align` で配置し、入りきらなければ行頭寄せ)、それ以外は border box で判定し、absolute の box が関わる重なりは免除として記録する。`protrusion: 'painted'` は border か背景を持つ親だけを対象にする(vlmkit と同じ)。Vite の `layout.integrity` で検査付き build の失敗条件に加わり、警告は build の警告になる。vlmkit との差分は `e2e/layout-integrity.spec.mjs` で確認する。


## DOM と CSS を組み合わせたアクセシビリティ規則(opt-in)

`accessibility: true`(または `{contrast: 'AAA'}`)を渡すと、DOM の事実(名前、`aria-hidden`、id、木の順序)と
CSS の結果(`display`・`visibility`・`pointer-events`・色・配置)を組み合わせた69規則を viewport の全域で判定する
([ADR-0013](adr/0013-static-accessibility-rules.md))。名前のない button/link、コントラスト不足、覆われた・重なった操作対象、
`aria-hidden` の内側のフォーカス、空の見出しと階層の飛び、入れ子の操作対象、重複 id と存在しない参照、
フォーカスできない scroll 領域、alt のない画像、ラベルのない form field(隠れた label は名前にならない)、どこも指さない `label[for]`、ul/ol 以外の li、下線も 3:1 の色差もない文中のリンク、可視のテキストを含まない `aria-label`(SC 2.5.3)、ARIA の必須の文脈・状態・属性名・値、無視される `role=presentation`、空の th、value のない input button、autofill にない `autocomplete`、不正な `scope`、lang のない html と不正な言語タグ、片方の向きでだけ消える main(`orientation` の media query に対応)、フォーカスしても何も変わらない要素と hover/focus 時のコントラスト不足(paint だけを変える `:hover`・`:focus` の規則に対応)、line-height 1.5 や字間 0.12em・語間 0.16em で入らない clip された text、hover では現れるのに focus では現れない control、dark scheme でのコントラスト不足、一行の測った文字列の中の inline リンクを覆う箱(`text.inline` で範囲を測る)、reduced motion でも止まらない長い animation、interactive でない要素の `cursor: pointer`、marker のない list(WebKit で role を失う)、marquee、dl の構造、重複する accesskey、`ismap`、body の aria-hidden、title のない iframe、字幕 track のない video、Vite では title のない文書と zoom を禁じる viewport、header が描画されない table と同じ table の th を指さない `headers`、WAI-ARIA にない role、フォーカスできない widget role、320px での横スクロール、完全に隠れるフォーカス、面積のない focusable、
`pointer-events: none` の操作対象、SC 2.5.8 の target size(24px 未満でも 24px の円が他と交わらなければ合格する spacing 例外、`data-a11y-equivalent` で宣言して検証する equivalent 例外、`data-a11y-essential` の免除を含む。`targetLevel: 'AAA'` で SC 2.5.5 の 44px)をエラーに、表示順と DOM 順の不一致・正の tabindex・複数の main・まとまっていない同名の radio・名前のない複数の nav・legend のない fieldset・同じ名前で行き先の違うリンク・汎用のリンク文言・隣のテキストと同じ alt・title だけの名前・h1 のない領域・landmark の外の内容・skip link のない nav・入れ子や重複した landmark・見出しを装う p・音の出る autoplay・th のない data table・12px 未満の文字を警告にする。
メディアクエリで変わる状態は区間として報告する(例:`@media (width < 600px)` で label を隠すと、その区間で名前がない)。
fieldset の最初の legend は border の中に描く(px の寸法が必要)。`direction: rtl`(と `dir` 属性の ltr/rtl)は、容器が直接の子の部分木を content box の中で左右反転した位置に平行移動する(子の中身は子自身の向き。入れ子で合成され、grid・flex・入れ子の dir=ltr で Chromium と一致)。絶対配置の箱は物理的な inset で置かれるので反転せず、containing block が動く部分木の中にあるときだけ一緒に動く(Chromium と一致)。rtl のスクロール容器は scrollbar が左に出るが、容器の箱と content の幅は変わらず、スクロール容器の中の位置はもともと渡さないので扱える。`dir=auto` は文字列の最初の強い向きの文字で決める(Hebrew・Arabic などは rtl、他の文字は ltr、なければ ltr。自分の dir を持つ子孫は飛ばす。Chromium と一致)。HTML と Vite の adapter は文字と子要素の DOM 上の順序(`runs`)を木に渡すので、混ざっていても順に決まる(6通りの順序で Chromium と一致)。順序のない木で両方に強い文字があるときだけ Unknown。`style` 属性はその要素だけに一致する宣言として cascade に入れ、Cascade 5 の element-attached として selector と layer の全てに勝ち、重要度だけには負ける(id・layer の !important・属性の !important で Chromium と一致)。動的な値は Unknown。`overflow: clip` はスクロールしないので中の位置は正確に決まる(focus-clipped だけが使い、他の規則には従来どおり位置を渡さない)。`transform` は accessibility・integrity の検査でだけ、px の translate・正の scale・90° の倍数の rotate とその列を扱う(描画の矩形を写し、絶対配置の子の containing block になる)。`content: ""` で絶対配置・px 寸法の `::before`/`::after` は覆う箱として扱い、文字を生成する content は Unknown。`table-layout: fixed` の table と、内容が px の列に収まる自動レイアウトの table は同じ形の grid として検査する(1行目の cell の幅で列を決め、`border-spacing` を gap にする。colspan、中身のない rowspan、spacing のない table の caption にも対応。rowspan の cell の中身は、px の高さの箱・計測した text・行の flex・px の行の grid の積み重ねに加えて、px の `row-gap` を持つ1列の grid と、高さが auto の column flex(nowrap・伸長する item・`flex-basis: auto`)を、子の高さの和と gap で積み重ねる。Chromium と一致)。文中の `a`・`span` などは text の inline の内容として扱い(inline のままで左右の余白がないこと)、文中の操作対象は target size の対象外。リンクの色は UA のリンク色なので、`color` を指定しない限りコントラストは Unknown。動的な属性値、画像の背景、`opacity`、宣言されていない色は Unknown。Vite では `layout.accessibility` で検査付き build の失敗条件に加わる。

論理的な inline の辺(`padding-inline-start`/`-end`、`padding-inline`、`margin-inline-*`、`inset-inline-*`)は、箱の `direction` で物理の辺に解く(rtl では start が右)。物理の辺と同じ cascade で競い、後に勝った方が効く。以前は向きによらず ltr の辺(start が左)に固定していたため、rtl の箱で左右が逆になっていた。Chromium の照合(`e2e/layout-rtl-logical.spec.mjs`)は、rtl と ltr の箱に論理・物理の padding を乱数で混ぜ、子の位置と幅が一致することを確かめる。

- **rtl の箱の物理の辺(`W_LAYOUT_PHYSICAL_IN_RTL`、警告)**: rtl の箱で、物理の辺として書いた左右の値(padding・border・margin の left/right が反対側と違う、positioned の `left`/`right`)と `text-align: left/right`。読む向きに合わせて反転しないので、ltr 用の style を rtl の内容へ持ち込んだ形になる。論理の辺(inline-start/end)で書いたもの、左右が同じもの、ltr の箱は対象外。意図して物理の辺を使う場合もあるので警告。Chromium の照合は、同じ CSS を ltr と rtl で描き、子の位置が鏡像にならないことと警告とが一致するかを確かめる。

## 反例の出典

幾何の違反(`E_LAYOUT_ITEM_SIZE`、`E_LAYOUT_TRACKS`、`E_LAYOUT_CONTENT`、`E_LAYOUT_BOX_EDGES`)は、[ADR-0002](adr/0002-layout-counterexample-explanations.md)の`explanation`を持つ。両辺を決めたcascadeの勝者を、宣言のfile・line・selector・layer・指定値と、勝者を囲む`@media`/`@container`条件で示す。

- `available`: 親のtrack・gap・itemの配置と、親から上の寸法の連鎖。定まったpx長さ、または全てが長さのtrackで止まり、autoのrootはviewportへ到達する。
- `required`: 対象box自身のbox-sizing・size・min-size・padding・border。`minInlineSize`等は`kind: 'contract'`、`trusted: true`の呼出し側の前提として区別する。
- `overridden`は勝者に負けた宣言、`dormant`は同じboxに一致するが反例の領域で条件が成立しない宣言。

説明は幾何の判定後に付ける付加情報で、status・range・witness・checks・Z3の結果を変えない。CSSの値を再計算して原因を推測せず、実際に使った勝者だけを引用する。最小原因集合ではない。unknownの診断には説明を付けない。`layout --summary`は`offered by`/`required by`/`overridden`/`not applied here`の行で表示する。

```text
E_LAYOUT_ITEM_SIZE: .cell requires 40px but receives 53/2px on inline axis at viewport 154px
  offered by: .row grid-template-columns: repeat(4, minmax(0, 1fr)) (app.css:2); .row column-gap: 16px (app.css:8 under @media (max-width: 300px) (app.css:7)); …; viewport inline size
  required by: .cell box-sizing: border-box (app.css:1); .cell min-inline-size: 40px (app.css:3)
  not applied here: .row grid-template-columns: repeat(2, minmax(0, 1fr)) (app.css:5 under @media (min-width: 400px) (app.css:4))
```

検査は`packages/css-verifier/test/explanations.test.mjs`と[説明のeval](../evals/scenarios/layout-explanations/check.mjs)。playgroundの模式図とnoshift反例への接続は未実装。

## フォントから導出するテキスト寸法

`layout.json`の`fonts`にCSSのfamilyとフォントファイルを対応させ、text boxへ`text`契約を書くと、
[mizchi/font](https://github.com/mizchi/font)のshapingで幅を導出する([ADR-0010](adr/0010-font-derived-text-metrics.md))。
固定文字列(`content`)と、文字集合と最大文字数(`characters`・`maxLength`)を扱う。

```json
"fonts": { "Noto Sans JP": { "file": "./fonts/NotoSansJP.ttf" } },
"boxes": {
  ".name": { "text": { "font": { "family": "Noto Sans JP", "size": 16, "lineHeight": 24, "weight": 400 },
                       "characters": "日本語のテキスト…ABC123", "maxLength": 12 } }
}
```

導出した幅は`minInlineSize`、1行の高さは`intrinsicBlockSize`、`wrap: "nowrap"`になり、既存の検査が全てのviewportで照合する。

**生成テキストの計測(`withGeneratedText`)**: `::before`/`::after` の `content` の文字列は、葉の text と同じ行に並ぶ。`metrics.withGeneratedText(options => analyzeHTML(html, options), options)` を使うと、次の 2 段階で解析する。
1. 1回目の解析で、各葉の生成テキスト(`generatedText`:path、契約の selector、before/after、文字列)を報告する。
2. 固定の `content` を持つ text 契約で、その契約の葉がどれも同じ生成テキストを持つなら、`before + content + after` を計測して、もう一度解析する。

条件(media)や箱によって生成テキストが違う契約は合成しない(unknown のまま)。`::before`/`::after` の display の既定値は、要素のタグによらず inline にした。Chromium で、`"$ " 1,200 " USD"` を 4 つの幅で表示し、静的に収まるとした幅では溢れなかった。
### 折り返すテキスト

`wrap: "normal"`(または `"anywhere"`)と固定文字列を書くと、行分割をモデルにして行数の profile を導出する。

```json
".body": { "wrap": "normal",
  "text": { "font": { "family": "Noto Sans JP", "size": 16, "lineHeight": 24, "weight": 400 }, "content": "折り返しを確認します。日本語のテキスト幅検査。" } }
```

内容の幅ごとの行数 × line-height が `intrinsicBlockSize`、最長の分割できない区間が `minInlineSize` になる。
分割位置は空白の後と漢字・仮名の前後で、開き括弧は行末に、閉じ括弧・句読点・`・！？々` などは行頭に来ない。
隣接する全角約物(`。」` など)は Chromium が詰めるので入力エラー、行末の閉じ括弧が詰められるかで行数が変わる幅は Unknown。
ASCII の記号は Chromium の対の表に従う(`well-known` は `-` の後、`ABCD-1234` も分けるが `-1` は分けない、括弧・句読点は語に付く)。
`$ % + \` と日本語の隣接、Latin-1 の文字と ASCII 記号の隣接は入力エラー。`lang` で字形が変わる文字(Noto Sans JP の `'` など)は各言語で測り、行数が言語で変わる幅は Unknown。
`text` に `"lang": "ja"` を書くとその言語だけで測る。要素の `lang` 属性(継承、CLI では `ancestors` の `lang`、Vite では配信する `<html lang>`)と一致しなければ Unknown。分割位置は en・ja・ko で照合済みで、中国語は対象外。
[例](../examples/layout-contracts/text-wrap.json)では 48px の行に本文が3行必要になる幅を報告する。

```text
E_LAYOUT_CONTENT: .body requires 72px but receives 48px on block axis at viewport 24487/128px × 400px
  width [160, 14247/64)px; height [200, 600]px
  text: wraps into 3 lines at this width; 2 fit
```

見出し(`h1`–`h6`)などの UA のフォント指定は継承しないので、計測したフォントを CSS で明示する。

Vite の検査付き build では `layout.fonts` に同じ形で渡す(パスは `.isle` entry からの相対)。

```js
isle({entry: './app.isle', mounts: [{component: 'Card'}], wrapMounts: false,
  layout: {css: './app.css', viewport: {min: 240, max: 1000, height: {min: 200, max: 600}},
    fonts: {'Noto Sans JP': {file: './fonts/NotoSansJP.ttf'}},
    boxes: {'.title': {text: {font: {family: 'Noto Sans JP', size: 16, lineHeight: 24, weight: 400}, content: '日本語のテキスト幅検査'}}}}})
```

溢れる幅があれば build が失敗し、成功時は `isle.layout.json` の `contracts.fonts` にフォントの SHA-256 が残る。`fonts` なしの `text` 契約は設定エラー。

反例には収まる文字数が付く。[例](../examples/layout-contracts/text-fonts.json)では、名前欄の割当が`V − 88`、12文字の上界が`192 + 1/64`pxなので、
viewport `[240, 17921/64)`で溢れ得ると報告する。

```text
E_LAYOUT_CONTENT: .name requires 12289/64px but receives 22017/128px on inline axis at viewport 33281/128px × 400px
  text: up to 10 of 12 characters fit here (widest "日"); 11 or more may overflow
  required by: .name minInlineSize 192.015625px (derived from Noto Sans JP 16px/400 12 × "日" ".name")
```

上界はshapingのadvanceを1/64 pxへ切り上げ、さらに1/64 pxを加える。Chromiumの実測は常に`[advance, 上界]`に入る。
文字集合は各文字と全ての順序対をshapingし、`n·最大advance + (n−1)·最大対調整`を上界にする。

導出した値はCSSの計算値と照合する。family(先頭)、px の font-size、px か数値の line-height、絶対値の font-weight、
normal の font-style/stretch/variant、`text-transform: none`、normal の letter/word-spacing が契約と一致しなければ`U_LAYOUT_TEXT_FONT`のunknownにする。
mediaで font-size を変えると、その領域だけunknownになる。`font`shorthand、`line-height: normal`、UA既定のfamily・size、
未収録グリフ(フォールバック)、RTL、結合文字、`white-space`がnowrap以外の折り返しは対象外。

## mizchi/cssとのcascade差分検査

[mizchi/css](https://github.com/mizchi/css)はMoonBitの独立したCSS parser・selector・cascade・computed style実装である。開発用の差分オラクルとして`packages/css-verifier/oracle/`でJSへbuildし、同じCSSとbox treeについて、共通の部分集合の計算値を比較する。対象はdisplay・position・box-sizing・overflow・size・padding/border/margin・gap・Grid track。

決定的に生成した入力(詳細度、`:is`/`:where`、`!important`、source順、media境界、`var()`と継承、wide keyword)を使う。差分は両者のどちらかの誤りの手掛かりであり、片方の正しさの証明ではない。mizchi/css 0.8.2を使い、差分は全て失敗にする。flex系(`flex`・`flex-basis`・`flex-flow`等)も比較する。既知差分の分類は持たない。

0.8.0では次の7種類が差分になり、全てmizchi/css側の誤りだった。0.8.1で修正され、各最小例を「両者が仕様の値で一致する」回帰テストとして残している。

| 0.8.0の差分 | 0.8.0の挙動 |
| --- | --- |
| shorthandとlonghandの優先順位 | 別のkeyでcascadeし、source順に適用するため、後に書かれた低い詳細度・非importantの宣言が勝つ |
| overflowの計算値 | 片方の軸がscrollでもvisible/clipをauto/hiddenへ変換しない |
| 初期値と`inherit` | padding・gap・displayの初期値と、非継承プロパティの`inherit` |
| `column-gap: normal` | autoになる |
| `var()` | shorthand内のfallbackを失う。祖先の`--h: var(--g)`を子で再解決する |
| flex(0.8.1、0.8.2で修正) | `flex: 30px 2 0`等の順序・単位なし0、`flex-basis: content`、`flex-flow`の省略側 |

css-verifier側の`!important`無視、詳細度無視、順序反転、media無視、padding左右の入替、gapの消失を加えた変異は全て差分として検出する。`@layer`、container query、幾何、Z3は対象外。`gap: var(--missing)`等のguaranteed-invalid参照は両者とも`unset`として計算し、30,000ケースで比較対象外は0件。実行は`just css-oracle-check`、結果は[report.json](../evals/results/css-cascade-oracle/report.json)。未リリースのmizchi/cssを試す場合は、それへ接続したbuildを`CSS_ORACLE_JS`で指定する。

## 検査結果と前提

### 40px の箱を4つ並べる場合

折り返さず、重ならず、全てを親の中へ収めるなら、子の外側最小幅を `m`、gap を `g` として親の content 幅には `4m + 3g` を要求する。m=40px、gap=0 なら160px。親の border-box 幅にはさらに左右の padding/border を加える。子が content-box なら、その子の padding/border も各 m に加える。

```css
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)
                         minmax(0, 1fr) minmax(0, 1fr);
}
.cell { min-width: 40px; }
```

固定 px の CSS 最小幅を使って、子の使用幅を計算し、割当トラックに収まることを検査する。この例は親幅 `[100, 300]` に対して違反区間 `[100, 160)` を返し、160px以上の領域は通る。親の幅を自動で広げる変換はしない。CSS は小さい親の中でも子の min-width を守ってあふれることがあり、それを検査する。

160pxは必要条件であり、列の配分も検査する。例えば `20px 20px 20px 100px` は合計160pxでも、最初の3列へ40pxの子は収まらない。gap 8px・親 padding 12px・border 2px なら必要幅は `160 + 24 + 24 + 4 = 212px`。min-width は内容が収まることの証明ではないため、文字列には別途 content-size 契約を要求する。

media と container 条件は、到達可能な領域の共通部分で評価する。4列への切替を159pxにすると `[159,160)` が違反し、160pxで切り替える版は通る。高さ条件と幅条件の組み合わせにも同様に制約をかけ、同時に成立しない条件は除外する。未対応 CSS、解析上限、未知の内容を含む場合は unknown。Vite では layout オプションでこの pass を明示的に有効にする。未指定の build に保証を付与するものではない。

192構成の独立した下限和の oracle、96件のブラウザー計測を[回帰テスト](../tests/layout-minimum.test.mjs)・[ブラウザー照合](../e2e/layout-minimum.spec.mjs)に置く。[要約と実測](../evals/results/layout-minimum/latest.json)・[完全な symbolic checks](../evals/results/layout-minimum/full.json.gz)は固定境界、box-sizing と条件の組み合わせを含む。これは下記の数理モデルの検査であり、判定器の実装自体の健全性証明や任意の UI の無条件保証ではない。

### 結果の意味

- `verified`: 宣言した幅、または幅×高さの全実数入力について、対応する数理モデル内で指定した契約を満たした。
- `violated`: 契約違反の区間・義務、または禁止規則を検出した。
- `unknown`: 未対応の構造・CSS・情報不足・上限超過があり、全体を保証できない。既知部分の診断が併記されることもある。

CLI は verified のときだけ exit 0。入力エラー、コンパイルエラー、violated、unknown は非0にする。解析できない幾何の CSS や未知の selector / at-rule を、装飾だと推測して無視しない。reset を含む閉じた author cascade を渡すことは呼出し側の前提であり、host の全 CSS を自動収集したという保証ではない。

任意 font の glyph 幅・改行位置の自動推論、paint / ink overflow、画像、スクロールや layout の実時間、未宣言の scrollbar 寸法、browser の subpixel rounding はモデル外。非対応の幾何プロパティは unknown にする。実ブラウザとの完全同値性の証明でもない。

今回は静的な純粋制約の判定であり、既存 veri の時相モデルを増やして寸法を離散化する方法は採らない。有理数の領域判定、独立した1次元・2次元の bounded arithmetic oracle、browser での反例再現を組み合わせる。判定器そのものの形式的な健全性証明は未着手。既存の MoonBit / veri 92ケースは別の検査として維持する。

検証方法と結果は [両軸の評価記録](../evals/reports/layout-axes.md)、[初段の横幅検査](../evals/reports/layout.md)、記述・読解は [両軸の課題](../evals/scenarios/layout-axes/brief.md)。参考: [Grid](https://www.w3.org/TR/css-grid-2/)、[Box sizing](https://www.w3.org/TR/css-sizing-3/)、[Overflow](https://www.w3.org/TR/css-overflow-3/)、[Media Queries](https://www.w3.org/TR/mediaqueries-4/)、[Container queries](https://www.w3.org/TR/css-conditional-5/#container-queries)、[Size containment](https://www.w3.org/TR/css-contain-2/#containment-size)。
