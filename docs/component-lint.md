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
| `--format text\|json` | `text` | 出力形式 |

## ルールセット

`recommended` には、Chromium e2e または差分 fuzz harness で静的な判定とブラウザーの実測が一致すると確かめたルールだけを入れています。一覧と直し方は `packages/adapter-core/src/lint.mjs` の `recommended` にあります。

- **error**：ブラウザーで実際に壊れるもの。はみ出し（`E_LAYOUT_ITEM_SIZE`、`E_LAYOUT_PAGE_OVERFLOW`、`E_LAYOUT_TRACKS`、`E_LAYOUT_CONTENT`）、画像の領域未確保、名前のないコントロール、コントラスト不足、覆われたコントロール、小さすぎるターゲット、フォーカス表示の消失。
- **warning**：バグの可能性が高いもの。効かない宣言、inset のない sticky、`100vw` とスクロールバー、固定 line-height、固定高さのテキスト、RTL での物理方向、セレクタとテンプレートの不一致など。
- **info**：検査しなかったもの（Unknown）と、置いた仮定。Unknown を合格として扱うことはありません。
- recommended に含まれないルールの検出も、info として残す(「outside the recommended rules」)。解析が中に入らなかった箱(grid でも flex でもない container の `E_LAYOUT_CONTAINER`)は、「not checked」として、その箱と中身が検査されていないことを示す。検出が黙って消えることはない。
- ページ全体についてのルール(h1、main ランドマーク、スキップリンク、ランドマーク外のテキスト)は、コンポーネントには当てはまらないので出さない(API の `page: true` で出す)。

`--profile all` にすると、エンジンの全診断を出します。

## テキストの期待を書く属性(`--font` と組み合わせる)

- `data-text-one-line`: その要素のテキストは 1 行に収まるはず(CSS が折り返しを許していても)。収まらない幅で `E_LAYOUT_CONTENT` を出す。
- `data-text-max-length="12"`: 動的なテキスト(`{name}` など、adapter は「…」として描画する)の最大文字数。その長さ以下のどの文字列でも収まるかを、最悪の幅で検査する。文字集合は `data-text-chars="…"` で指定する(既定は印字可能な ASCII)。折り返し位置は決まらないので、`white-space: nowrap` か `data-text-one-line` が要る(なければ仮定のまま)。
- 属性のない動的なテキストは測らない(実際の文字列が分からないため)。

```svelte
<span class="name" data-text-one-line data-text-max-length="20">{user.name}</span>
```

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
- `rem` の margin、padding、幅、gap(既定のフォントサイズの仮定のもとで px に直す)。
- 既定の appearance のテキスト入力欄(text 系の input と textarea)。padding と border を 4 辺とも指定していれば、`appearance: none` でなくても同じ箱になる(測った)。UA の `display: inline-block`、`box-sizing: content-box`(search は border-box)、最小寸法 0 もモデル化した。
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
