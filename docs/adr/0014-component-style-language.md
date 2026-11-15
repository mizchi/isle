# ADR-0014: テンプレートと結び付いた component 向けのスタイル言語

- 状態: Proposed(設計案。この文書の文法・型・API はどれも実装していない)
- 日付: 2026-11-15
- Issue: 未作成
- 対応する提案: ユーザーの意見「`@noshift` だけでなく、CSS のスーパーセットか、HTML テンプレートと合わせた専用の拡張言語があるとよいかもしれない。cascading という仕様は component 記述と噛み合っていないように感じる」

## 背景

css-verifier は、普通の CSS と DOM の木を受け取り、cascade を解いてから幾何を証明する。
この設計で 120 を超える検査パターンを足してきた。その中で、検査で見つかる誤りの多くは幾何の誤りではなかった。
**selector と木の対応が崩れている**誤りだった。実装済みの検査のうち、次の 3 つは、どれも cascade と selector が component の境界と関係なく働くために起きる。

| 実装済みの検査 | 原因 |
|---|---|
| `W_CSS_SELECTOR_UNMATCHED` / `W_CSS_SELECTOR_RELATION`(`options.selectors`) | selector は文字列で木の形を仮定する。テンプレートを変えても CSS 側は誤りにならず、黙って当たらなくなる |
| `W_LAYOUT_DECLARATION_INERT` | 子の宣言(`grid-column`、`flex: 1`)の意味が親の `display` で決まる。子の規則だけを見ても正しいかどうか分からない |
| `U_LAYOUT_FIXED_CONTAINED`、`W_LAYOUT_HYPHENS_NO_LANG`、`W_LAYOUT_ROOT_FONT_FIXED` | 祖先の性質(transform、lang、root の font-size)が、component の外から結果を変える |

Svelte adapter(`packages/svelte-adapter/`)の実装でも同じことが分かった。
Svelte は selector を component の要素に scope し、使われない selector を compiler が警告する(`css_unused_selector`)。
Svelte もまた、「selector がテンプレートのどこに当たるか」を後から推論している。
cascade の 3 つの性質は、component の局所的な推論と噛み合わない。

- 規則を当てる先を、木の形の文字列(selector)で間接に指す。
- 継承で祖先から値が流れ込む。
- specificity と出現順で衝突を解く。

これはユーザーの意見と同じ結論である。

## 判断(提案)

CSS の値の文法(長さ、色、`calc()`、`@container`、`@media`)はそのまま使う。
**どの要素に当てるか**と**親子のレイアウトの役割**を、テンプレートと同じ言語で書く。
次の形の拡張を提案する。

```text
component Card(open: bool, items: list<Item>) {
  layout root: grid(columns: minmax(0, 1fr), row-gap: 8px) {
    panel?:  when open  { block-size: 120px; }        // テンプレートの節点を名前で指す
    empty?:  when !open { block-size: 40px; }
    list:    grid(auto-rows: 32px) {
      item*: in list    { background: #fff; }        // 子の役割は親の layout で型付けされる
    }
  }
  contract noshift(panel, empty) over open;          // 既存の @noshift を言語の契約として持つ
}
```

1. **当てる先は節点への参照**: 規則はテンプレートの節点名(`panel`、`item`)に結び付く。
   - selector は状態(`:hover`、`:focus-visible`)と外部への公開点にだけ残す。
   - 木を変えれば参照が切れ、compile error になる(UNMATCHED と RELATION が型の誤りになる)。
2. **子の役割を親の layout で型付けする**: `grid(...)` の子には grid item の性質だけを書ける。
   - flex の子に `column: span 2` と書けば型の誤りになる(INERT が compile error になる)。
3. **継承は宣言した経路だけ**: 文字の性質(font、color、lang)は、component の引数か、明示した `inherit` で受ける。
   - 祖先の transform や root の font-size は、component の外の前提として契約に現れる(`requires`)。
4. **cascade は層に限る**: UA・利用者・テーマ(型付きの custom property)の層の合成にだけ cascade を使う。
   - component の中では、同じ節点への宣言の衝突を compile error にする。specificity では解かない。
5. **lowering**: 出力は普通の CSS である。
   - 節点ごとの `@scope` か、hash した class を使う。
   - 検査器へは、selector の照合を経ずに「節点 → 計算値」の表を直接渡す。
   - css-verifier のコアはそのまま使える。selector を解く段がなくなるので、`U_LAYOUT_SELECTOR` の Unknown も減る。

## 既存の仕組みとの関係

- Isle の現行 DSL と `@noshift` は、この言語の契約部分の先行実装にあたる。いまは CSS と分かれた注釈になっている。
- 普通の CSS の component(Svelte、Isle の現行 template)は、引き続き adapter と `options.selectors` で検査する。
  - selector の推論で分かる範囲を報告する。分からないものは Unknown にする。
- この言語は adapter の代わりではない。「最初から誤りを書けない」書き方を選べるようにするためのものである。

## 未決の点

- テーマや design system が、component の外から節点を上書きする経路。公開点としてどこまで selector を許すか。
- `@container` と親の layout の型を、同じ言語でどう扱うか。
- 既存 CSS からの移行。selector を節点参照へ機械的に書き換えられる範囲は、`options.selectors` の行で測れる。

## 検証(実装する場合)

1. lowering の出力 CSS を Chromium で描き、同じ component の手書き CSS 版と全ての箱の幾何が一致することを確かめる。
2. 型の誤り(参照切れ、役割の不一致、衝突)が、手書き版では `W_CSS_SELECTOR_*` / `W_LAYOUT_DECLARATION_INERT` として検出されることを示す。
   - つまり、同じ誤りをより早い段階で止めていることを示す。
3. 実装するまで、この ADR の構文はどの公開 API にも含めない。
