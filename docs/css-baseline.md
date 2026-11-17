# CSS ベースライン(Chromium・Firefox・WebKit)

静的な検査は、ブラウザーの既定の振る舞い(UA のスタイル、既定値、レイアウトのアルゴリズム)を前提にしています。今の前提は Chromium で測ったものです。Firefox と WebKit も検査の対象にするには、どの前提をブラウザーごとに持つ必要があるかを、2 つの方法で測りました。

- **ベースラインの測定**(`tools/css-baseline.mjs`): 前提にしている UA の値と挙動を 42 項目、3 つのブラウザーで同じページを開いて測ります。結果は `evals/results/css-baseline/baseline.md` と `baseline.json`。
- **e2e の 3 ブラウザー化**(`playwright.layout.config.mjs` の `chromium` / `firefox` / `webkit` の project): Chromium と照合するために書いたレイアウトの e2e を、Firefox と WebKit でも流します。合わないテストは `e2e/support/browser-baseline.mjs` に、理由と分類を付けて載せています。

測ったブラウザーは Chromium 153、Firefox 157、WebKit 27.2(いずれも Playwright 1.64.1、Linux、headless)です。

```bash
node tools/css-baseline.mjs
```

```bash
npx playwright test -c playwright.layout.config.mjs --project firefox
```

## 結果の要約

e2e(Chromium で 390 件)のうち、Firefox で 34 件、WebKit で 43 件が Chromium と合いませんでした。

| 分類 | Firefox | WebKit | 内容 | ベースラインに要るもの |
|---|---|---|---|---|
| 照合の手段がない | 14 | 16 | レイアウトシフトの照合に使う Layout Instability API(`layout-shift`)、forced colors のエミュレーション。どちらも Chromium にしかない | なし(CSS の差ではない。そのブラウザーでは skip) |
| テキスト | 12 | 8 | 改行の位置(UAX #14 の実装、日本語の句読点の前後)、字形の幅(letter-spacing、ヘブライ語)、長い語のはみ出し | ブラウザーごとの改行の規則と、shaping の差の上限 |
| 表 | 4 | 14 | rowspan のセルが行を伸ばす配り方、自動レイアウトの表の列幅、固定レイアウトの表の幅 | 表のアルゴリズムをブラウザーごとに(仕様が決めていない部分) |
| フォームの部品 | (下の表) | (下の表) | フォント、padding、大きさ、色 | UA スタイルの値をブラウザーごとに |
| canvas の色 | 1 | 1 | dark の preference での canvas と canvastext。Chromium は #121212 の上に黒い文字 | 既定の色の仮定をブラウザーごとに |
| システムカラー | 0 | 1 | ボタンの ButtonFace(WebKit は #c0c0c0) | ButtonFace / ButtonText をブラウザーごとに |
| レイアウトの丸め | 0 | 2 | WebKit は位置を 1/64px に丸める(3 等分の位置がずれる) | 丸めの単位と規則 |
| grid | 0 | 1 | size containment の grid item と auto の行の高さ | 調査が要る(実装差か仕様の解釈か) |

照合の手段がないものを除くと、Firefox で 20 件、WebKit で 27 件が、ブラウザーの CSS の振る舞いの差です。

## UA の既定値(ベースラインの測定から)

42 項目のうち 18 項目で、ブラウザーの値が違いました。違ったのは、ほぼすべてフォームの部品です。

| 項目 | エンジンの前提(Chromium) | Firefox | WebKit |
|---|---|---|---|
| ボタン・入力欄・select のフォント | Arial 13.33px | sans-serif 13.33px | 16px(-webkit-standard) |
| ボタンの padding | 1px 6px | 1px 4px | 2px 6px |
| textarea のフォント | monospace 13.33px | monospace 12px | 16px |
| チェックボックスの大きさと margin | 13 × 13、3px 3px 3px 4px | 14 × 14、同じ | 12 × 12、3px 2px |
| radio の margin | 3px 3px 0 5px | 同じ | 3px 2px |
| text の入力欄の既定の大きさ | 185 × 21 | 202 × 22 | 213 × 26 |
| text の入力欄の padding-left | 2px | 2px | 1px |
| range の大きさ | 129 × 16 | 160 × 20 | 129 × 20 |
| select の padding-left と border | 0、1px | 4px、2px | 0、1px |
| placeholder の色 | rgb(117, 117, 117) | 黒の 54% | rgb(169, 169, 169) |
| フォーカスの枠の太さ | 1px | 1px | 3px |
| 既定のフォント名 | "Times New Roman" | serif | -webkit-standard |

見出しの大きさ(h1 32px、h3 18.72px)と small の大きさ(13.33px)は、小数の丸めだけが違います(18.72 / 18.7188 / 18.719999)。

違わなかったもの(今の前提がそのまま使える):

- body・p・ul・dd の余白、見出しと th の太さ、表の border-spacing、fieldset の余白、details と summary の display、閉じた dialog、svg の既定の大きさ(300 × 150)、Roboto 16px の line-height normal(19px)。
- 今回の作業で Chromium で測って入れた挙動: sticky・backdrop-filter・will-change が重なりの文脈になること、backdrop-filter と will-change: transform が fixed の子孫を閉じ込めること(will-change: opacity は閉じ込めない)、`minmax(0, 1fr)` の grid の min-content が 0 であること、flex item のボタンの `min-width` が auto であること。

## UA profile(初期条件)

フォームの部品の UA スタイルは、レイアウトのオプション `ua` で選びます(`packages/css-verifier/src/layout/ua-profile.mjs`)。

- `ua: 'chromium' | 'firefox' | 'webkit'`: 測った値の profile。ボタン・文字入力欄・textarea・select の padding と border、チェックボックスと radio の margin、range の margin、ボタンの色、コントロールのフォント。
- `ua: { base: 'webkit', button: { padding: ['0px', '10px', '0px', '10px'] } }`: profile の一部を置き換えた初期条件(社内の基準のブラウザー、独自の UA の想定など)。
- 省略したとき: これまでどおり。ボタンと range は Chromium の値、ほかの部品の UA の padding・border・margin は Unknown。

`ua` を指定すると、作者が padding と border を書いていない入力欄も、その profile の値で解析できます。各ブラウザーで、何も指定していない部品(content-box の入力欄と textarea、ボタン、チェックボックスと radio の margin)の位置と大きさが、そのブラウザーの profile のモデルと一致することを確かめました(`e2e/layout-ua-profiles.spec.mjs`)。CLI では `css-lint --ua webkit`。

## 最小の CSS Reset の提案

`suggestReset({ browsers, target })`(`css-lint --suggest-reset chromium,firefox,webkit`)は、選んだブラウザーの profile のうち、値が違うものだけを打ち消す reset を返します。

- 最近の reset の書き方に合わせる: `font: inherit`(Josh Comeau、Andy Bell の reset と同じ)、チェックボックスと radio の `margin: 0`、論理プロパティ(`padding-block` / `padding-inline`)、`:where()` で詳細度を足さない。
- 値が同じものには規則を出さない。Chromium と Firefox だけなら、チェックボックスの margin と入力欄の padding の規則は出ない。
- どれか 1 つの値に決めなければならないもの(padding、チェックボックスの大きさ)は、`target` の値に合わせる。既定は検査の基準の Chromium なので、reset を当てれば `ua: 'chromium'` の解析がどのブラウザーにも当てはまる。
- デザインで決めるもの(ボタンの色、フォーカスの枠、ページのフォント、入力欄と range の既定の大きさ)は reset に入れず、注記として返す。

3 つのブラウザーに対する提案:

```css
/* The smallest reset for chromium, firefox, webkit (values kept from chromium where one has to be picked). */

/* the control font differs (chromium Arial 13.3333px, firefox sans-serif 13.3281px, webkit -webkit-standard 16px; textarea chromium monospace 13.3333px, firefox monospace 12px, webkit -webkit-standard 16px); inheriting the page font also lets its text be measured */
:where(button, input, select, textarea) {
  font: inherit;
  letter-spacing: inherit;
  word-spacing: inherit;
}

/* the UA margins differ (checkbox chromium 3px 3px 3px 4px, firefox 3px 3px 3px 4px, webkit 3px 2px; radio chromium 3px 3px 0px 5px, firefox 3px 3px 0px 5px, webkit 3px 2px) */
/* the default size differs (chromium 13px, firefox 14px, webkit 12px) */
:where(input[type="checkbox"], input[type="radio"]) {
  margin: 0;
  inline-size: 13px;
  block-size: 13px;
}

/* the button padding differs (chromium 1px 6px, firefox 1px 4px, webkit 2px 6px 3px 6px) */
:where(button, input[type="button"], input[type="submit"], input[type="reset"]) {
  padding-block: 1px;
  padding-inline: 6px;
}

/* the text field padding differs (chromium 1px 2px, firefox 1px 2px, webkit 1px) */
:where(input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="password"], input[type="tel"], input[type="url"], input[type="number"]) {
  padding-block: 1px;
  padding-inline: 2px;
}

/* the textarea border differs (chromium 1px, firefox 2px, webkit 1px) */
:where(textarea) {
  border-width: 1px;
}

/* the select padding differs (chromium 0px, firefox 1px 4px, webkit 0px) */
/* the select border differs (chromium 1px, firefox 2px, webkit 1px) */
:where(select) {
  padding-block: 0px;
  padding-inline: 0px;
  border-width: 1px;
}

/* the placeholder color differs (chromium rgb(117, 117, 117), firefox rgba(0, 0, 0, 0.54), webkit rgb(169, 169, 169)) */
::placeholder {
  color: rgb(117, 117, 117);
  opacity: 1;
}

/* Not in the reset (decide them in your design):
 * - button colors differ (chromium #000000 on #efefef, firefox #000000 on rgb(233, 233, 237), webkit rgba(0, 0, 0, 0.8) on rgb(192, 192, 192)): set background-color and color on your buttons
 * - the default font differs (Chromium "Times New Roman", Firefox serif, WebKit -webkit-standard): set font-family on html (the controls inherit it with this reset)
 * - a field's default width (its size attribute) and a range's default size come from the font and the browser: give them an inline-size (and block-size)
 * - the focus ring width differs (chromium 1px, firefox 1px, webkit 3px): give :focus-visible an outline of your own
 */
```

確かめ方: この reset を当てて 3 つのブラウザーでベースラインを測り直すと(`node tools/css-baseline.mjs --reset reset.css`)、違う項目は 25 から 13 に減り、profile の値はボタンの色を除いてすべて揃いました。残った 13 項目は、ページの既定のフォント(名前の違いと、それによるボタンの幅)、見出しの大きさの丸め、入力欄と range の既定の大きさ、ボタンの色、フォーカスの枠で、どれも注記に挙げたものです。また、reset を当てた何も指定していない部品は、3 つのブラウザーとも `ua: 'chromium'` のモデルどおりの位置と大きさになりました(`e2e/layout-ua-profiles.spec.mjs`、33 件)。

## 検査をほかのブラウザーに広げるには

1. (対応済み)**UA スタイルの値をブラウザーごとに持つ**: `ua` オプションの profile。
2. **既定の色をブラウザーごとに持つ**: canvas と canvastext(dark の preference)、ButtonFace / ButtonText。
3. (対応済み)**表と改行は Unknown にする**: `ua` の profile が Chromium 以外(`firefox`、`webkit`、それらを `base` にした上書き)のとき、次の解析は `U_LAYOUT_BROWSER` の Unknown になる(Chromium の判定を流用して成功にしない)。
   - 表(`<table>`): rowspan の行の伸ばし方、自動レイアウトの列幅、WebKit の固定レイアウトの表の幅が違う。
   - 折り返すテキスト(行のプロファイル): 改行の位置(UAX #14、日本語の約物)が違う。
   - 行の中の inline 要素の位置(`textMetrics.inline`)。
   - letter-spacing / word-spacing のあるテキスト、右から左に書くテキスト(`direction: rtl`、ヘブライ文字・アラビア文字)。
   - 全角の約物を含むテキスト: Chromium は行末の閉じ括弧・句点を半角に詰める(text-spacing-trim)が、Firefox と WebKit は詰めない(「日本語のテキスト幅検査。」は Chromium で 191.6px 以内、Firefox 192px、WebKit 192.02px)。

   1 行の左から右へ書くテキスト(字間の指定なし)は、どのブラウザーでも字形の幅の合計が同じなので、そのまま解析する(`e2e/layout-ua-profiles.spec.mjs` のボタンのラベル)。
4. **丸め**: WebKit の 1/64px への丸めは、許容誤差の側で扱えるか確かめる。

差の中身を見るときは `BASELINE_OFF=1` を付けて e2e を流すと、一覧の項目も普通のテストとして失敗を報告します。

`e2e/support/browser-baseline.mjs` の項目は、差がある限り「失敗することを確かめるテスト」(`test.fail`)として流れます。ブラウザーの更新やエンジンの対応で差がなくなると、そのテストが失敗として報告されるので、一覧から外せます。
