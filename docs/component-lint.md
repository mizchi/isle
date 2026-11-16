# コンポーネントの CSS×DOM lint

`tools/css-lint.mjs` は、静的な CSS×DOM 検査をコンポーネント用の linter として動かします。対象は Svelte、Vue SFC、React（JSX/TSX）で、React は StyleX、Linaria、plain className に対応します。テンプレートの分岐を状態として展開し、各状態をビューポートの範囲で検査します。検出ごとに、ソースの行、その検出が出る状態、直し方を出力します。

```bash
node tools/css-lint.mjs --viewport 320-1280 src/**/*.svelte src/**/*.vue src/**/*.tsx
```

```
Wide.vue:4  error    E_LAYOUT_ITEM_SIZE  .bar.wide requires 480px but receives 400px on inline axis at viewport 400px × 690px  [compact=false]
    fix: give the box room (a flexible track, max-width: 100%, min-width: 0) or let it shrink
StylexCard.jsx:15  error    E_LAYOUT_PAGE_OVERFLOW  .sx-1a0nljt reaches past the viewport, so the page scrolls horizontally  [wide=true, open=true]
    fix: keep the box inside the viewport width
Card.vue:25  warning  W_CSS_SELECTOR_UNMATCHED  .empty.active matches no element of the template (no element has class .empty)
Card.vue  info     ASSUMPTION  v-for is checked at 0, 2 items, all items taking the same branch choices
```

error が 1 件でもあれば終了コードは 1 です。

## オプション

| オプション | 既定 | 意味 |
|---|---|---|
| `--viewport 320-1280` | `320-1280` | 検査する幅の範囲（`--height 480-900` で高さの範囲） |
| `--page-css <file>` | box-sizing と margin のリセット(html と body は block flow) | コンポーネントを置くページの CSS |
| `--css <file>` | なし | plain className の React コンポーネントに当てる stylesheet |
| `--profile recommended\|all` | `recommended` | ルールセット |
| `--each-counts 0,2` | `0,2` | `{#each}` / `v-for` / `.map()` の要素数 |
| `--no-assume-text` | 仮定あり | テキストを 1 行 24px と仮定せず、Unknown のままにする |
| `--font Family=file.ttf` | なし | 繰り返し指定できる。CSS の計算後のフォントがこの family になるテキストは、仮定の大きさの代わりに、フォントファイルから幅と改行を測る(`auto` の列や、中身で大きさの決まる flex の item を判定できるようになる)。測れないもの(px でない font-size、`line-height: normal`、letter-spacing、斜体)は仮定のまま。測った数は info に出す |
| `--default-font-size 16` | `16` | ブラウザーの既定のフォントサイズ(px)。html が px のフォントサイズを指定しないとき、`rem`(と html の `%`/`em`/`medium`)をこの値で解決する。仮定として info に出す。`none` で解決せず Unknown にする |
| `--default-colors light\|none` | `light` | ページが dark の color-scheme を宣言しないとき、light の preference では UA の既定の色(白い canvas に黒い文字)を仮定し、color を指定しないテキストのコントラストを検査する(Chromium で測った)。仮定として info に出す。dark の preference では Chromium が canvas を #121212 にするので仮定しない。`none` で Unknown のままにする |
| `--format text\|json` | `text` | 出力形式 |

## ルールセット

`recommended` には、Chromium e2e または差分 fuzz harness で静的な判定とブラウザーの実測が一致すると確かめたルールだけを入れています。一覧と直し方は `packages/adapter-core/src/lint.mjs` の `recommended` にあります。

- **error**：ブラウザーで実際に壊れるもの。はみ出し（`E_LAYOUT_ITEM_SIZE`、`E_LAYOUT_PAGE_OVERFLOW`、`E_LAYOUT_TRACKS`、`E_LAYOUT_CONTENT`）、画像の領域未確保、名前のないコントロール、コントラスト不足、覆われたコントロール、小さすぎるターゲット、フォーカス表示の消失。
- **warning**：バグの可能性が高いもの。効かない宣言、inset のない sticky、`100vw` とスクロールバー、固定 line-height、固定高さのテキスト、RTL での物理方向、セレクタとテンプレートの不一致など。
- **info**：検査しなかったもの（Unknown）と、置いた仮定。Unknown を合格として扱うことはありません。
- spec 層: WAI-ARIA / HTML の仕様違反のうち、マークアップだけで決まり描画には現れないもの(role の必須属性の欠落、不正な ARIA 属性・値、存在しない id への参照、id の重複、role の親子関係、入れ子の操作要素、ul/dl の子、th の scope など。一覧は `specRules`)。描画からは確かめられないので、recommended の error とは分けて warning にし、`tier: 'spec'` を付ける。メッセージは「spec:」で始まる。
- CSS の誤り(同じルールの略記と longhand の衝突 `E_CSS_SHORTHAND_CONFLICT`)は error にする。これがあると状態のレイアウトを解析しないので、その状態は「not checked」(`U_LAYOUT_NOT_ANALYZED`)として示す。
- recommended に含まれないルールの検出も、info として残す(「outside the recommended rules」)。解析が中に入らなかった箱(grid でも flex でもない container の `E_LAYOUT_CONTAINER`)は、「not checked」として、その箱と中身が検査されていないことを示す。検出が黙って消えることはない。
- ページ全体についてのルール(h1、main ランドマーク、スキップリンク、ランドマーク外のテキスト)は、コンポーネントには当てはまらないので出さない(API の `page: true` で出す)。

一つの原因は一件にまとめる。tracks や大きさのはみ出しの中で、ページの外へ出る箱は、いちばん外の検出に「(also: N boxes inside it reach past the viewport)」として足す。固定バーがテキストの一部を隠す `E_A11Y_FIXED_HIDES_PART` があるときは、同じテキストの `E_A11Y_TEXT_START_OBSCURED` は出さない。寸法は小数の px で出す。

`--profile all` にすると、エンジンの全診断を出します。

## テキストの期待を書く属性(`--font` と組み合わせる)

- `data-text-one-line`: その要素のテキストは 1 行に収まるはず(CSS が折り返しを許していても)。収まらない幅で `E_LAYOUT_CONTENT` を出す。
- `data-text-max-length="12"`: 動的なテキスト(`{name}` など、adapter は「…」として描画する)の最大文字数。その長さ以下のどの文字列でも収まるかを、最悪の幅で検査する。文字集合は `data-text-chars="…"` で指定する(既定は印字可能な ASCII)。折り返し位置は決まらないので、`white-space: nowrap` か `data-text-one-line` が要る(なければ仮定のまま)。
- props の型が文字列・数値リテラルの union なら(`status: 'Active' | 'Pending review'`)、その props のテキストは型の値のどれかである。adapter は値ごとに状態を作り、そのテキストを測る。`{#if status === 'Active'}` のような比較は、選んだ値と矛盾しない状態だけを残す。React は props の引数の型(型リテラル、ローカルの type / interface)、Svelte は `let { … }: Props = $props()`、Vue は `defineProps<Props>()`(`<script setup lang="ts">`)を読む。省略可能な props(`status?:`)は渡されないことがあるので、これまでどおり測らない。既定値は実際の値と違いうるので使わない。
- 既定値のある props(`let { label = 'Save changes' } = $props()`、`({ label = '…' })`、Vue の `withDefaults` と `default`)は、呼び出し側が渡さないときに既定値を描くので、既定値の状態を 1 つ加えて測る(ほかの値の状態は、これまでどおり「…」)。
- 属性のない動的なテキストは測らない(実際の文字列が分からないため)。
- `--font` を渡すと、既定のフォントサイズを 2 倍(32px)にした状態も解析する(SC 1.4.4 のテキストの 200% 拡大)。rem・em・%・キーワードのフォントサイズはそれに従って大きくなり、測り直される。1 倍では起きず 2 倍でだけ起きるはみ出しや切り取りを `E_A11Y_TEXT_RESIZE` として出す(`--text-resize off` で外す)。Chromium の照合では、CDP で既定のフォントサイズを 32px にしたときにはみ出す場合とちょうど一致した。
- テキスト入力欄の `placeholder` も、入力欄のフォントで測る。入力欄の内容の箱より広い幅では、末尾が切れて見えないので `W_A11Y_PLACEHOLDER_CLIPPED`(警告)を出す(Chromium の描画と照合した)。

```svelte
<span class="name" data-text-one-line data-text-max-length="20">{user.name}</span>
```

## Linaria

`css`` ` と `styled.tag`` ` のテンプレートの補間は、Linaria のビルド(wyw-in-js)と同じように、モジュールの中で静的に決まるものを評価する。モジュールの `const` の文字列・数値、`const` のオブジェクトのメンバー(`${theme.colors.accent}`)、ほかの `css`` ` のクラス(クラス名そのもの。セレクタでは `.${row}` と書く)、styled のコンポーネント(`.クラス`)。props の関数や import した値は Unknown にする。`react-adapter/fixtures/LinariaSettings.jsx` は、Svelte の `Settings.svelte` と同じ検査(隠れたチェックボックス、コントロールのフォント、効かない grid-column、スクロールコンテナの中の sticky)を、実際の Linaria のビルドと react-dom/server の描画で Chromium と照合する(`e2e/layout-react.spec.mjs`)。

className のテンプレートリテラルは、補間が空白で区切られていれば(`` `${bar} ${active ? on : ''} wide` ``)、それぞれのクラスの並びとして展開する。`` `btn-${size}` `` のように文字とつながった補間はクラス名を作るので Unknown にする。

## コンポーネントのスコープ

Svelte、Vue、Linaria のコンポーネントでは、セレクタと、セレクタが前提にする親子関係を、そのコンポーネントの中で閉じたものとして扱う。どの要素にどのスタイルが当たるかがコンポーネントの定義だけから決まり、置かれる場所や子のコンポーネントの中身に左右されないようにするためである。次の 3 つを error にする(recommended に含む)。

| コード | 対象 | 内容 |
|---|---|---|
| `E_SCOPE_ESCAPE` | Svelte の `:global(…)`、Vue の `:deep()` / `:slotted()` / `:global()`、Linaria の `:global(…)` | コンポーネントの外(ページ、親、子のコンポーネント)の要素を選ぶ。スタイルはその要素を描くコンポーネントに書き、文脈はカスタムプロパティか props で渡す。 |
| `E_SCOPE_OUTSIDE` | Vue の scoped と通常の `<style>`、Linaria | 結合子の左側(祖先や兄弟)が、どの状態でもコンポーネントのどの要素にも当たらない(`.theme-dark .card`、Linaria の `.x &`)。ルールが置かれる場所に依存している。どれかの状態で自分の要素に付くクラス(`class:open` など)なら閉じているので報告しない。 |
| `E_SCOPE_REACHES` | Linaria と Vue の通常の `<style>` | スタイルを当てる要素が、そのコンポーネントの持つクラスで固定されておらず、結合子の起点の下(`>` なら直下、子孫結合子なら中全体、`+` `~` なら同じ親)に子のコンポーネント、slot、`{children}`、`{@html}` / `v-html` がある。例えば `ul` の Linaria クラスに `& > li` と書き、`li` は `<Item>` が描く場合。その `li` のスタイルは `Item` に書く。 |

Svelte はセレクタのすべての compound をスコープするので、コンポーネントの外の祖先は当たらない(未使用のセレクタで、Svelte のコンパイラと `W_CSS_SELECTOR_*` が報告する)。`E_SCOPE_OUTSIDE` にはしない。Vue の scoped はスタイルを当てる要素だけをスコープするので、祖先はコンポーネントの外の要素にも当たる。StyleX はセレクタを持たない。外部のスタイルシート(`--css`)はページの CSS として扱い、検査の対象にしない。

adapter は、子のコンポーネントなどの境界を、状態のマークアップに `<!--isle-boundary:component Item-->` のようなコメントとして残す。css-verifier の `scope` オプション(`{mode: 'scoped' | 'global', ancestors?: 'scoped', owned?: [...], firstLine?}`)が、これと解析した木を照合する。

## レイアウトシフトの契約(`data-noshift`)

親子の配置についての契約も、コンポーネントの定義として書く。コンポーネントは、自分の要素に `data-noshift="名前"` を付けて、その要素の箱(位置と大きさ)が状態の間で変わらないことを宣言する。adapter が展開した状態どうしを、検査する viewport の全区間で比べる。

- `data-noshift-on="open loading"`: その条件(props の名前、`.map` / `v-for` / `{#each}` のリスト)だけが違う状態どうしを比べる。省略すると、すべての状態の組を比べる。
- 要素がない状態は比べない(条件付きの要素がないことはシフトではない)。
- `E_LAYOUT_NOSHIFT`(error): 要素が動くか大きさが変わる。反例の幅と、上・左・幅・高さのどれがいくつからいくつに変わるかを示す。Chromium で 2 つの状態を描いて比べ、判定が一致することを確かめた(`e2e/layout-svelte.spec.mjs`)。
- `U_LAYOUT_NOSHIFT`: どちらかの状態で箱が決まらない(その状態が Unknown か、検査する幅の一部しか分からない)。成功にはしない。
- `E_SCOPE_CONTRACT`(error): 子のコンポーネントのタグに `data-noshift` を付けた。その要素は子のコンポーネントのものなので、子の中で宣言するか、このコンポーネントの要素で包んで、その要素に付ける。

## 状態とソース行

- 状態はテンプレートの分岐で決まります。Svelte の `{#if}` / `class:`、Vue の `v-if` / `v-show` / `:class`、JSX の `&&` / 三項演算子 / `cx()` / `stylex.props()` が分岐になります。同じ要素が複数のクラスの組み合わせで出す検出は 1 件にまとめ、状態の表示（`[compact=false]` など）にはすべての状態に共通する条件だけを出します。
- adapter に `sourceLines: true` を渡すと、各要素に `data-src-line` が付きます。lint は検出したボックスのパスをたどってその行を報告します。行がたどれないときは、最初のクラス名が出てくる行を代わりに使います。

## 扱えるマークアップ

コンポーネントでよく使う書き方を、Chromium と照合したうえで扱う。

- inline の `<svg>` のアイコン。`width`/`height`/`viewBox` が寸法になり、`<title>` と `aria-label` が名前になり、`fill`/`stroke` がアイコンの色になる。React の `strokeWidth` などは属性名に変換する。
- アイコンとラベルを子に持つ grid / flex のボタン。
- `grid-template-areas` と `grid-area`。
- `repeat(auto-fill | auto-fit, minmax(…, 1fr))` のカードの grid。
- `<picture>` の source、`srcset`/`sizes`、`iframe`。
- grid item と flex の行の item の px margin。幅を指定した grid item の `margin: 0 auto`。
- block の子だけを持つ `display: block` の container(block flow)と、`max-width` + `margin: 0 auto` のラッパー。
- 既定の appearance のボタン(`button` と type が button / submit / reset の `input`)。UA の padding(1px 6px)、border(2px)、`display: inline-block`、`box-sizing: border-box` と、色(ライトでは #efefef の上に黒、ダークでは #6b6b6b の上に白。author が `color` / `background-color` を書かない限り親から継がない)をモデル化した。`appearance: none` と同じ箱になる(測った)。
- 日付と時刻の入力欄(date、time、datetime-local、month、week)は、テキストの入力欄と同じ箱になる(Chromium で測った)。
- 伸び縮みしない flex item のパーセントの basis(`flex: 0 0 100%` のカルーセルの slide)。1 行の flex の行で、container の内容の幅の割合になる。折り返す container では Unknown。
- `flex: 1`(0% の basis)の item の自動の最小は、中身の min-content。
- スクロールコンテナの中のテキストを、その外の不透明な箱が覆いうるときは `U_A11Y_SCROLLED_COVER`(検査していない)を出す。
- `type="range"` のスライダー(Chromium で測った: content-box、UA の padding と border はなく margin が 2px、作者の大きさをそのまま使う、grid item で幅が auto なら伸びる)。
- 位置指定された祖先(または初期の containing block)より背の高い absolute の箱(ドロップダウン)は、block 方向の大きさを error にしない。fixed でビューポートより高い箱は error。
- 中身がテキストだけの、1 列(`minmax(0, 1fr)`)の grid の container は、block のテキストの葉として扱う(Chromium で照合した)。
- grid item の justify-self(と grid の justify-items)の start、center、end。px の幅の item と、幅が auto のテキストの葉(fit-content の幅)を、area の空きの割合だけずらす。Chromium と同じく、はみ出す場合もずらす(unsafe)。
- `rem` の margin、padding、幅、gap(既定のフォントサイズの仮定のもとで px に直す)。
- フォームの部品(button、input、select、textarea)は、ページの font-size だけでなく font-family・font-weight・line-height・letter-spacing も継承しない(Chromium では Arial、textarea は monospace)。祖先が font-family か font-size を指定しているのに部品が UA のフォントのままなら `W_LAYOUT_CONTROL_FONT` を出す。部品の中のテキストは、`font: inherit` を付けるまで測らない(1 行と仮定し、高さには計算した line-height を使う)。
- 既定の appearance のテキスト入力欄(text 系の input と textarea)。padding と border を 4 辺とも指定していれば、`appearance: none` でなくても同じ箱になる(測った)。UA の `display: inline-block`、`box-sizing: content-box`(search は border-box)、最小寸法 0 もモデル化した。 幅が auto でも、grid の項目として伸ばされるもの、flex の行の項目で `flex-basis` が px かつ `min-width` が auto でないもの(`flex: 1 1 120px; min-width: 0`)は、固有の幅を使わないので検査する(Chromium と照合した)。
- grid item の block 軸の自己整列(`align-items` / `align-self` の start、center、end と、その flex-*/self-* の別名)。item は自分の高さを保ち、area の空きのその割合だけずれる(Chromium と照合した)。baseline は Unknown。
- h1–h6 と th のテキストは、UA の `font-weight: bold`(700)として測る。strong/b は親に対する `bolder` なので、author が太さを書くまで Unknown。
- 子が 1 つの block container(`<li><a>…</a></li>`)は、子が `display: inline` のときだけテキストの葉として扱う。`nav > a { display: block }` の a は block の子になる。
- `border-collapse: collapse` の表。表、行グループ、行、セルのどこにも枠線がなく、表に padding もないとき、`border-spacing: 0` の分離モデルと同じ箱になる(Chromium と照合した)。枠線があれば Unknown。
- フォントファイルで測ったテキストは max-content の幅も持つ。表の自動の列幅と、中身で大きさの決まる flex item が解ける。
- grid item のテキスト入力欄は、幅が auto でも列の幅まで伸びる(Chromium で測った)。block flow の auto の幅は固有の幅なので Unknown。
- `minmax(Apx, Bpx)` の track(`minmax(0, 480px)` の最大幅の列など)。fr の track より先に B まで伸びる。
- `border-width: 0`(StyleX の `borderWidth: 0`)。0 でない値は border-style しだいなので Unknown。
- overflow が auto/scroll の container は、その軸で中身をスクロールさせる意図とみなす(コアのオプション `scrollIntent: 'css'`。lint が渡す)。hidden/clip で切れる中身は報告する。
- StyleX の同じ entry の shorthand と longhand(`padding` と `paddingBottom`)。StyleX と同じく、順序によらず longhand が勝つ(実際の StyleX のビルドと Chromium で照合した)。
- 自動の列幅の表で、px の幅の空の block が一つだけのセル(アイコンのボタン)。
- レイアウトが Unknown でも、テキスト、画像のテキスト、名前の属性のどれもないボタンとリンクは、マークアップだけで `E_A11Y_NAME` を出す(CSS がそれを隠すことも、生成テキストを付けることもできない場合だけ。Chromium の accessibility tree と照合した)。
- sr-only(視覚的に隠したテキスト)。名前には入るが、収まるかどうか、切り取り、コントラストは判定しない。

`svelte-adapter/fixtures/Catalog.svelte` と `vue-adapter/fixtures/Article.vue` は、これらを組み合わせた例である。

## 保証の範囲

- 検査は adapter が展開した状態だけです。状態が `maxStates` を超える場合、他のコンポーネント、動的な class や style は Unknown として info に出ます。
- テキストの寸法は仮定です（`--no-assume-text` で外せます）。`--font` でフォントファイルを渡すと、その family のテキストは測った寸法になります(Chromium で同じフォントを描いた幅との差は 1px 未満)。フォントの寸法を契約として与えれば、仮定を使わずに検査できます。
- スクロールバーは overlay 幅 0 を前提にしています。classic スクロールバーを前提にした検査は、API の `scrollbars` オプションで指定します。

## API

```js
import {analyzeVue} from '@mizchi/css-verifier-vue';
import {lint, formatText} from '@mizchi/css-verifier-adapter-core';
const result = analyzeVue(source, {pageCSS, viewport, accessibility: true, selectors: true, assumeText: true, sourceLines: true});
console.log(formatText(lint(result, {file: 'Card.vue', source})));
```

テストは `packages/adapter-core/test/lint.test.mjs`（CLI を含む）にあります。
