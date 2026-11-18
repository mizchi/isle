# ADR-0015: 静的検査できるスタイル記述の案と、Web 以外でも動くレイアウトエンジン

- 状態: Proposed(設計の比較。この文書の構文・型・API はどれも実装していない)
- 日付: 2026-11-18
- Issue: 未作成
- 対応する提案: ユーザーの意見「表現力を損ねない範囲で、静的検査可能に記述できる CSS のサブセットまたはスーパーセット言語を考察したい。noshift のように HTML 側と一緒に書く前提をおいてもよい」「react-native のように、Web 以外の GUI 環境のためのレイアウトエンジンを、サブセットを満たす範囲で提供したい(mizchi/crater のブラウザー実装が似たことをしている)」「isle だけでなく、ほかの UI ライブラリと一緒に使う」
- 関係: [ADR-0014](0014-component-style-language.md)(テンプレートと結び付いた言語。本 ADR の案 C)

## 背景: 何が検査を決められなくしているか

css-verifier は、普通の CSS と DOM の木から、viewport の範囲全体で幾何を証明する。決められないところは Unknown にする。
これまでに足した検査(`docs/layout-checking.md`、`docs/static-check-checklist.md`)から、Unknown と誤りの原因は次の 5 つに分かれる。

| 原因 | 例 | いまの扱い |
|---|---|---|
| S1. selector と木の対応 | 当たらない selector、親の display で意味が変わる子の宣言 | `W_CSS_SELECTOR_*`、`W_LAYOUT_DECLARATION_INERT` で推論して報告 |
| S2. component の外から流れ込む値 | 継承(font、lang)、祖先の transform、root の font-size、外側の cascade | 祖先の鎖がなければ Unknown(`@scope` の判定、`rem`) |
| S3. 実行時にしか決まらない量 | 文字列の長さ、画像の比、非同期の表示、状態の数 | 契約で受ける(`data-noshift`、`boxes`、font の計測 ADR-0010) |
| S4. 時間で変わる値 | アニメーション、トランジション、easing の行き過ぎ | キーフレームと easing の極値を列挙(`easing.mjs`) |
| S5. モデルにない機能 | inline の行の配置、`%` の flex 項目、3D の transform | Unknown |

S5 はエンジンの実装を足せば減る。S1〜S4 は **書き方** の問題で、どの言語で書くかで決まる。
S1 と S2 は CSS の selector と cascade から来る。S3 と S4 は、書き手が知っていることが CSS に書く場所を持たないことから来る。

### mizchi/crater の現状(調査の要約)

- レイアウトの核(`layout/`、`mizchi/crater-layout`)は Taffy 由来の MoonBit で、block・inline・flex・grid・table・float・positioned を持つ。
  - 入力は `Node { style, children, measure: MeasureFunc? }`、出力は `Layout { x, y, width, height, margin/padding/border, overflow, children }`。
  - スタイルは `mizchi/css`(このリポジトリと同じ作者の CSS 実装)が出す平らな `Style`(約 115 項目)。
- ブラウザーの外で使える API がある。
  - `compute_layout(Node, Size)` と、増分の `LayoutTree` がある(`docs/tui-api.md`)。
  - JS からは Yoga 互換の node API を使える(`createNode`、`setFlexGrow`、`getComputedLeft` など。`js/index.d.ts`)。
  - wasm component もあり、端末の UI(`browser/tui/`)で使っている。
- 検査済みのサブセットとして `layout/core_subset/` がある。block・inline・flex(nowrap)・grid(単純なトラック)、static の配置だけを受け付ける。
  - 型での保証はない。検証器が違反を報告する方式である。
- 文字の計測は `MeasureFunc` と `TextMetricsProvider` で差し替えられる。
- ブラウザーとの照合は WPT を Chromium と比べる方式で、許容差は 15px。
- React Native や、端末以外のネイティブ環境への対応はない。

## 要件

- R1. **表現力**: 出力は標準の CSS に落とせる。言語で書けないものは、標準の CSS へ逃がす口を残す(その部分は従来どおり推論か Unknown)。
- R2. **決められること**: 言語のどの構文にも、検査の意味がある(決められる、契約になる、明示的に Unknown になる、のどれか)。
- R3. **ライブラリを選ばない**: React・Preact・Solid・Vue・Svelte・Lit・isle のどれとも使える。特定の compiler に依存しない経路を持つ。
- R4. **Web 以外で動く**: 同じ記述が、React Native のような Web 以外のホストのレイアウトエンジンでも同じ箱を出す(サブセットの範囲で)。
- R5. **段階的に移れる**: 既存の CSS から少しずつ移れる。

## 案

### 案 A: 検査済みの CSS サブセット(profile)。新しい構文なし

標準の CSS のうち、css-verifier が決められる部分を **profile** として名前で固定する。外れた書き方は lint で知らせる。

```css
/* profile: checked/portable — flex・block・px と %・状態は :hover / :focus-visible だけ */
.card { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.card > .title { font: 600 16px/24px Inter, sans-serif; }
```

- 決まる理由: 受け付ける集合を、検査器がいま証明できる集合と一致させる(Unknown を profile 違反として前に出す)。
- 長所: 構文を足さない。どのライブラリ・どの CSS ツール(PostCSS、Tailwind の出力)とも使える。R3・R5 が最もよい。
- 短所: S1・S2 は残る(推論で報告し続ける)。S3・S4 は書く場所がない。
- profile の層: `portable`(Web 以外でも同じ箱になる部分。下の「レイアウトエンジン」参照)⊂ `web`(grid・positioned・media・container)⊂ 標準の CSS。

### 案 B: 契約を書ける CSS のスーパーセット(ブラウザーが読み飛ばす at-rule)

標準の CSS に、S3・S4 の「書き手が知っていること」を書く at-rule を足す。
ブラウザーは知らない at-rule を読み飛ばすので、出力は入力そのままでよい(取り除いてもよい)。

```css
@contract .card {
  noshift: open;                 /* open が変わっても .card の外の箱は動かない(既存の data-noshift) */
  text(.title): 1..40ch / 1 line; /* 動的な文字列の長さと行数 */
  media(img): ratio 16 / 9;      /* 読み込む前の比 */
}
@assume root { font-size: 16px; lang: ja; }   /* component の外から来る値(S2)の前提 */
@property --space { syntax: "<length>"; inherits: true; initial-value: 8px; }  /* 型付きの token(既存の @property 対応) */
```

- 決まる理由: 契約は検査の入力になる(いまの `boxes`、`data-noshift` を CSS の側に移す)。前提は呼び出し側で検査する。
- 長所: 標準の CSS のまま書ける。契約が CSS の隣にある。どのライブラリとも使える。
- 短所: selector で当てる点(S1)は変わらない。HTML 側の書き換えで契約が外れても、黙って当たらなくなる(`W_CSS_SELECTOR_UNMATCHED` で拾う)。

### 案 C: テンプレートと結び付いた component 言語(ADR-0014)

規則をテンプレートの節点への参照に結び付ける。子の役割を親の layout で型付けし、component の中では cascade を使わない。

- 決まる理由: S1 が型の誤りになる(参照切れ、役割の不一致)。S2 は component の引数か `requires` になる。
- 長所: 最も強い。Unknown の原因の多くが compile error になる。
- 短所: テンプレートの文法ごとに compiler が要る(JSX、Svelte、Vue、Lit の tagged template、isle の DSL)。R3・R5 が最も弱い。

### 案 D: 型付きのスタイル値(StyleX・React Native の StyleSheet に近い)

selector を使わず、スタイルを要素に直接渡す型付きの値として書く。レイアウトの役割は TypeScript の型で表す。

```tsx
const card = layout.flex({ direction: 'column', gap: 8, padding: 12 });
const title = text({ font: inter(600, 16, 24), lines: 1, length: [1, 40] }); // S3 の契約も値の一部

<Box layout={card} noshift={['open']}>
  <Text style={title}>{props.title}</Text>
  <Box item={card.item({ grow: 1 })} />   {/* flex の子にだけ書ける性質(S1 の INERT が型の誤り) */}
</Box>
```

- 決まる理由: 当てる先が要素そのものなので、selector の照合がない(S1 が起きない)。継承する性質を型で限る(S2)。
- 長所: TypeScript の型だけで成り立ち、特定の compiler に依存しない(R3)。
  - Web では atomic な CSS に落とし、Web 以外では下のレイアウト IR に落とす(R4)。
  - React Native の `StyleSheet`、Yoga の node API と 1 対 1 に近い。
- 短所: cascade・selector・`:has()` のような関係の表現を手放す。状態は props か、限られた状態の名前(`hover`・`focusVisible`・`pressed`)で表す。既存の CSS からの移行は手作業。

### 案 E: 共有のレイアウト IR(表に出る言語ではない)

案 A〜D のどれからも落とせる、正規化した中間表現を定める。検査器もレイアウトエンジンも、IR だけを読む。

```text
LayoutIR = {
  nodes: [{ id, parent, role: block | flex | grid | text | replaced, style: PortableStyle, contract?: Contract }],
  assumptions: { rootFontSize, lang, viewport: { min, max, height? } },
  text: TextMeasureSpec   // フォント(ADR-0010)と、文字列の長さ・行数の契約
}
PortableStyle = 計算値(px と %、flex/grid のトラック、box-sizing、align …)。selector・cascade・継承は解決済み。
```

- 決まる理由: IR は解決済みの値だけを持つので、検査は幾何の証明だけになる。S1・S2 は IR を作る側(front-end)の責任になる。
  - 作れない front-end は、その節点を「推論」「Unknown」と印を付けて渡す。
- 長所: 案 A〜D を同時に受け入れられる。css-verifier はすでに内部で「箱 + 計算値」の木を作っており、それを公開する形になる。
  - crater の `Node`/`Style` にも近い。
- 短所: それ自体は書く言語ではない。どの front-end を推すかは別に決める。

## 比較

| | S1 selector | S2 外からの値 | S3 実行時の量 | S4 時間 | R3 ライブラリ | R4 Web 以外 | R5 移行 |
|---|---|---|---|---|---|---|---|
| A サブセット | 推論 | 推論 | 書けない | 列挙 | ◎ | ○(portable 層) | ◎ |
| B 契約の at-rule | 推論 | 前提 | 契約 | 契約で補える | ◎ | ○ | ◎ |
| C テンプレート言語 | 型 | 型 | 契約 | 契約 | △(compiler ごと) | ○ | △ |
| D 型付きの値 | 起きない | 型 | 値の一部 | 値の一部 | ○(TS) | ◎ | △ |
| E IR | front-end 次第 | front-end 次第 | 契約 | 列挙 | ◎ | ◎ | — |

## 判断(提案)

1. **E を核にする**: レイアウト IR を公開の境界にする。css-verifier・crater-layout・ほかのエンジンが同じ IR を読む。まず css-verifier の内部の木を IR として書き出す。
2. **A を既定の入口にする**: いまの「普通の CSS + adapter」の経路に名前の付いた profile(`portable` / `web`)を与え、違反を lint で出す。既存の利用者は何も変えずに始められる。
3. **B を次に足す**: S3・S4 の契約を CSS の側に書けるようにする。`data-noshift` と `boxes` の内容を `@contract` に移せるようにし、両方を受け付ける。
4. **D を Web 以外のホストのための front-end にする**: React Native 型の環境では selector がないので、D が自然な書き方になる。D から Web の CSS(atomic)と IR の両方に落とす。
5. **C は D と B の経験のあとに決める**(ADR-0014 は Proposed のまま)。

## Web 以外のホストで動くレイアウトエンジン

### サブセットの層

- **portable**: 次の 3 つの共通部分。
  - css-verifier が証明できるもの
  - crater の `core_subset`
  - Yoga(React Native)が同じ意味で持つもの
  - 内容は、block・flex(row/column、wrap、gap、grow/shrink/basis、align)、px と %、box-sizing、static と relative/absolute の配置、文字は計測関数経由。
- **web**: portable に、grid・media/container の条件・transform の描画・スクロールを足したもの。Web 以外のホストでは、grid は crater の grid で扱える(Yoga にはない)。

### エンジンの組み方

- **参照の意味(仕様)**: css-verifier の記号的な配置を、IR の意味の定義とする。viewport の範囲の上で区分的にアフィンな幾何を出すので、具体的な viewport を 1 つ代入すれば、具体的な箱になる。
- **実行するエンジン**:
  - 案 1: crater-layout を wasm / JS の Yoga 互換 API で使う。端末やネイティブのホストに組み込む。
  - 案 2: Yoga に落とす。flex だけの portable のさらに部分集合で、React Native に直接渡せる。
  - どちらも IR を入力にする。
- **文字の計測**: IR の `TextMeasureSpec` を、ホストの計測関数(crater の `MeasureFunc`、Yoga の measure callback)に渡す。css-verifier の font から導出した計測(ADR-0010)と同じ値を使えば、検査とエンジンで文字の箱が一致する。

### 一致の確かめ方(三者の差分照合)

1. 同じ IR を、css-verifier(記号)、crater-layout(具体)、Chromium(lowering した CSS)の 3 つで配置する。
2. portable 層では、3 つの箱が 1/64px で一致することを求める。いまの crater の WPT の許容差 15px は、この層では使わない。
3. いまの `e2e/layout-differential.spec.mjs`(宣言を 1 つずつ・2 つずつ変える照合)を、crater にもかける形に広げる。

## ほかの UI ライブラリとの組み合わせ

- **Web**: 各ライブラリの出力(SSR の HTML、または adapter が状態を展開した木)と CSS から、IR を作る。
  - いまある adapter は React(JSX)、Svelte、Vue。Lit(tagged template)と Solid(JSX の別の扱い)は adapter を足す。
  - 案 B の契約は CSS の側にあるので、どのライブラリでも同じに読める。
- **Web 以外**: ライブラリごとに、IR の節点を作る「ホスト」を書く(React なら `react-reconciler` の host config、Solid なら universal renderer、Vue なら `createRenderer`)。
  - ホストは IR を作ってエンジンに渡し、返った箱を描画の命令にする。
  - 案 D の値は、そのまま IR の `PortableStyle` になる。
- **isle**: 既存の DSL と `@noshift` は案 B・C の契約部分の先行実装なので、IR への書き出しを最初に作る。

## 未決の点

- IR の版と互換性(css-verifier と crater で同じ型を持つか、JSON の schema にするか)。
- 状態(hover、focus、pressed)を、Web 以外のホストで何に対応させるか。
- `portable` 層の文字: 折り返しの規則(行分割)をホストの間でどこまで揃えられるか(Web 以外では、ホストの text engine が別の規則を持つ)。
- 案 B の構文: at-rule にするか、`@property` のような既存の規則に寄せるか。CSS の将来の仕様(`@contract` に当たるもの)と衝突しないか。

## 検証(実装する場合)

1. IR の書き出し: いまの e2e のすべてのページで、IR から配置し直した幾何が、現行の結果と同じになること。
2. portable 層の三者照合: 宣言を 1 つずつ・2 つずつ変える照合(現行の差分照合と同じ形)を、css-verifier・crater・Chromium の 3 つにかけて、1/64px で一致すること。外れた組み合わせは、portable から外すか、エンジンを直す。
3. 案 B の契約: `data-noshift` と `boxes` で書いた既存の例を `@contract` に書き換え、診断が同じになること。
4. 案 D の front-end: 同じ component を D と手書きの CSS で書き、Web(Chromium)と crater で箱が一致すること。
