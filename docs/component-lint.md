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
| `--page-css <file>` | box-sizing と margin のリセット、grid の body | コンポーネントを置くページの CSS |
| `--css <file>` | なし | plain className の React コンポーネントに当てる stylesheet |
| `--profile recommended\|all` | `recommended` | ルールセット |
| `--each-counts 0,2` | `0,2` | `{#each}` / `v-for` / `.map()` の要素数 |
| `--no-assume-text` | 仮定あり | テキストを 1 行 24px と仮定せず、Unknown のままにする |
| `--format text\|json` | `text` | 出力形式 |

## ルールセット

`recommended` には、Chromium e2e または差分 fuzz harness で静的な判定とブラウザーの実測が一致すると確かめたルールだけを入れています。一覧と直し方は `packages/adapter-core/src/lint.mjs` の `recommended` にあります。

- **error**：ブラウザーで実際に壊れるもの。はみ出し（`E_LAYOUT_ITEM_SIZE`、`E_LAYOUT_PAGE_OVERFLOW`、`E_LAYOUT_TRACKS`、`E_LAYOUT_CONTENT`）、画像の領域未確保、名前のないコントロール、コントラスト不足、覆われたコントロール、小さすぎるターゲット、フォーカス表示の消失。
- **warning**：バグの可能性が高いもの。効かない宣言、inset のない sticky、`100vw` とスクロールバー、固定 line-height、固定高さのテキスト、RTL での物理方向、セレクタとテンプレートの不一致など。
- **info**：検査しなかったもの（Unknown）と、置いた仮定。Unknown を合格として扱うことはありません。

`--profile all` にすると、エンジンの全診断を出します。

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

`fixtures/Catalog.svelte` は、これらを組み合わせた例である。

## 保証の範囲

- 検査は adapter が展開した状態だけです。状態が `maxStates` を超える場合、他のコンポーネント、動的な class や style は Unknown として info に出ます。
- テキストの寸法は仮定です（`--no-assume-text` で外せます）。フォントの寸法を契約として与えれば、仮定を使わずに検査できます。
- スクロールバーは overlay 幅 0 を前提にしています。classic スクロールバーを前提にした検査は、API の `scrollbars` オプションで指定します。

## API

```js
import {analyzeVue} from '@mizchi/css-verifier-vue';
import {lint, formatText} from '@mizchi/css-verifier-adapter-core';
const result = analyzeVue(source, {pageCSS, viewport, accessibility: true, selectors: true, assumeText: true, sourceLines: true});
console.log(formatText(lint(result, {file: 'Card.vue', source})));
```

テストは `packages/adapter-core/test/lint.test.mjs`（CLI を含む）にあります。
