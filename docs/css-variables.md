# CSS 変数の静的解析

`--cell: 40px` と `var(--cell)` を、カスケード・継承・条件領域ごとに解決します。標準 CSS のまま記述し、解決器はビルド時と playground の検査 Worker だけで使います。配信する CSS の変数は残し、生成アプリへ JS の変数解決器を追加しません。

```text
component Variables() {
  <main class="row">
    <style>
      .row {
        --cell: 40px;
        --columns: 4;
        display: grid;
        grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      }
      .cell { min-width: var(--cell); }
      @media (width < 160px) { .row { --columns: 2; } }
    </style>
    <div class="cell" /><div class="cell" /><div class="cell" /><div class="cell" />
  </main>
}
```

[全体の実行例](../examples/inline-css/variables.isle)には高さ・reset も含めています。[playground](https://mizchi.github.io/isle/playground/) の **CSS variables · responsive proof** で、幅80–640px・高さ80–640pxを Z3 Wasm で検査できます。`--cell` を41pxへ変えると反例が出ます。

## 解決の順序

1. media/container 条件と動的構造の各候補で、custom property の勝つ宣言を決めます。名前は case-sensitive で、specificity・source order・layer・`!important` を使います。
2. 通常の property も先にカスケードします。`padding: var(--insets)` は各 longhand の候補を予約し、後続の `padding-left` だけが勝つ場合も扱います。
3. その element の変数環境で token を置換してから、従来の長さ・Grid・ボックスモデルの部分集合へ渡します。

query の閾値そのものへ `var()` を使う機能ではなく、成立した query 内の宣言を解決する機能です。

親で解決した別名は、子の上書きで再解決しません。たとえば親の `--unit:40px; --cell:var(--unit)` に対し、子の `--unit:80px` は継承した `--cell` を変えません。逆に、子自身が定義する別名は子の環境で解決します。`all` は custom properties をリセットしません。

`initial` は未登録変数の guaranteed-invalid 値、`inherit` / `unset` / `revert` は継承を扱います。missing / invalid が確定していれば `var(--missing, var(--backup, 40px))` の fallback を選びます。空の変数値と空の fallback も token 列として扱います。

`--n:40; min-width:var(--n)px` を `40px` とみなしてはいけません。Number と Ident は別 token のままで、長さとして解析できなければ Unknown です。`min-width:40px; min-width:var(--missing)` の後者が勝つ場合も、前の40pxへ戻したことにはしません。

## 循環と移植性

直接・間接の循環を検出します。循環した変数だけなら invalid 値になり、通常の property に有効な fallback があればその値で検査できます。fallback がなければ `U_LAYOUT_VARIABLE_CYCLE` の Unknown です。

**fallback 経由で閉じる循環は、fallback が書かれた property を利用する検査を Unknown にします。** 2022年の CR と、short-circuit を導入した現在の Editor’s Draft / WPT では、未使用 fallback 内の循環の扱いが異なります。たとえば次の `--a` を、一律に invalid や40pxと決め打ちして安全判定しません。

```css
.row {
  --safe: 80px;
  --a: var(--safe, var(--b));
  --b: var(--a);
}
.cell { min-width: var(--a, 40px); }
```

現行 Chromium では80pxになり、40pxの fallback を使ったモデルでは偽の安全判定になり得ます。現在の profile は、この相違が検査を通過しないように制約します。未使用の変数だけにある循環は geometry を変えず、検査失敗にしません。

参照：[現在の CSS Variables 1](https://drafts.csswg.org/css-variables-1/)、[CSSWG #11500](https://github.com/w3c/csswg-drafts/issues/11500)、[WPT の cycle ケース](https://github.com/web-platform-tests/wpt/blob/master/css/css-variables/variable-cycles.html)。

## 外部祖先を推測しない

選択した root の外側が不明なとき、未定義に見える変数が祖先から継承される可能性があります。その場合、fallback を勝手に選ばず Unknown にします。実際のホストが通常の document なら、CLI/API に本当の祖先を指定できます。

```js
analyzeLayout(ir, {
  css,
  ancestors: [{ tag: 'html' }, { tag: 'body' }],
  viewport: { min: 160, max: 640 },
});
```

これは祖先のサイズを証明する入力ではなく、継承の入力です。ShadowRoot に存在しない html/body を足してはいけません。component 内で必要な変数を定義する場合は外側の変数に依存せず、`--x:initial` で明示的に無効化してから fallback を使うこともできます。Vite の検査付きビルドは実際の html/body を含むため、この境界を自動で閉じます。

## 制限と検証

- custom-property 名は unescaped ASCII の `--name` 形式に限定します。`@property`、`revert-layer`、任意の登録・animation・runtime の外部上書きは検査対象外です。
- 置換後の値も従来の layout 部分集合に従います。`var()` を使っても、未対応の `calc()`、単位、配置が検証済みにはなりません。
- 1値4096 token / 65536 UTF-16単位、関数・括弧の入れ子32、1 element の自前 binding 256件に上限を置き、解決の仕事量も全体の work budget に課金します。超過は `U_LAYOUT_LIMIT` であり、fallback では隠せません。
- CSS のファイル・宣言行を診断へ残します。未対応値・未知の継承・循環・上限超過は、検査付きビルドを失敗させます。

Node の境界値テスト、Chromium の computed geometry、独立した [SMT 参照仕様](../models/css_layout/README.md)との XOR 検査を組み合わせます。40pxの仕様と生成制約は UNSAT で一致し、変数を41pxへ壊すと SAT で差を検出します。CSS parser・モデル抽出器・全ブラウザーの正しさを証明したものではありません。

```sh
node --test tests/layout-variables.test.mjs tests/layout-z3.test.mjs
pnpm exec playwright test --config playwright.layout.config.mjs e2e/layout-variables.spec.mjs
just playground-check
```
