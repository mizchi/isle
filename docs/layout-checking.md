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
- auto・固定 px・割合の inline/block-size、content-box / border-box、px の padding・solid border・gap を扱う。margin は0だけを許可する。p / heading 等の native な block margin は明示的な reset を要求する。CSS min-inline-size / min-width は auto / 固定 px、min-block-size は auto / 0、max は none に限定する。
- row は固定 px、`minmax(0, Nfr)`、auto。implicit row は grid-auto-rows を反復する。auto row は子の自動高さを下から集約し、definite な container では余りの伸長を反映する。indefinite な fr row は max-content に対応する契約値から flex fraction を求める。
- item の block alignment は normal / stretch、content alignment は normal / stretch / start。row span は独立にサイズを確定できる row 間で扱う。intrinsic size の分配が必要な row span、他の alignment、intrinsic column は未対応である。
- 折り返し条件は `white-space` と `overflow-wrap` の継承を含めて照合する。`anywhere` と `break-word` を同一視しない。

CSS による通常の in-flow parent と child の関係を検査する。pure component と client island の root を追い、有限な動的 class/id・分岐・上限付き loop の集合を検査する。opaque children、inline style、reset/adapter のない native control 等は unknown。初期 SSR に存在する構造だけで将来の構造を判断しない。

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

## vlmkit の integrity 規則(opt-in)

`integrity: true`(または `{targetSize: 24, protrusion: 'painted'}`)を渡すと、`vlmkit check integrity` のボックスモデルの規則を viewport の全域で静的に判定する([ADR-0012](adr/0012-static-integrity-rules.md))。
ページの横溢れ(`E_LAYOUT_PAGE_OVERFLOW`)、子の親からのはみ出し(`E_LAYOUT_PROTRUSION`)、テキスト box の重なり(`E_LAYOUT_TEXT_COLLISION`)、
button / a の target 寸法(`E_LAYOUT_TARGET_SIZE`)はエラー、overflow で切れる内容(`W_LAYOUT_CLIPPED`)と入れ子のスクロール(`W_LAYOUT_NESTED_SCROLL`)は警告になる。
契約で溢れを許した場合も報告する。vlmkit の4px閾値は持たない。text-collision は、フォント由来のテキスト契約を持つ leaf では描かれる1行の範囲(上界の幅を `text-align` で配置し、入りきらなければ行頭寄せ)、それ以外は border box で判定し、absolute の box が関わる重なりは免除として記録する。`protrusion: 'painted'` は border か背景を持つ親だけを対象にする(vlmkit と同じ)。Vite の `layout.integrity` で検査付き build の失敗条件に加わり、警告は build の警告になる。vlmkit との差分は `e2e/layout-integrity.spec.mjs` で確認する。

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
