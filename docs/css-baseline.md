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

## 検査をほかのブラウザーに広げるには

1. **UA スタイルの値をブラウザーごとに持つ**: `css.mjs` の UA の規則(ボタン・入力欄・select・textarea・チェックボックス・radio・range)を、測った値の表から選べるようにする。今の値は Chromium の列にあたる。
2. **既定の色をブラウザーごとに持つ**: canvas と canvastext(dark の preference)、ButtonFace / ButtonText。
3. **表と改行は Unknown にする**: 表のアルゴリズムと改行の規則はブラウザーごとに違い、仕様が決めていない部分がある。対象のブラウザーで照合できるまでは、そのブラウザーでは Unknown にする(成功にしない)。
4. **丸め**: WebKit の 1/64px への丸めは、許容誤差の側で扱えるか確かめる。

`e2e/support/browser-baseline.mjs` の項目は、差がある限り「失敗することを確かめるテスト」(`test.fail`)として流れます。ブラウザーの更新やエンジンの対応で差がなくなると、そのテストが失敗として報告されるので、一覧から外せます。
