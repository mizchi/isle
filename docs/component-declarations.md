# Component を実行計画として宣言する

状態: 次段階の設計案。以下の named event、`on:click`、`inline(ts)` と本文解析は未実装である。現在動く構文は [記述ガイド](prototype-guide.md)、従来の明示 `reads` 案との比較は [設計書 §2.1](design.md#21-宣言-dsl-と処理本体を分ける案) を参照する。

## Component 本体の意味

component 本体は、状態・依存・描画・実行入口の宣言である。任意の TS statement を置かず、compiler が宣言から初期化・更新・再開の計画を作る。ソースに並べた通常の文を、render のたびに先頭から実行する意味を持たせない。

Qwik は `$` を目印に式を遅延読み込み可能な symbol へ抽出し、closure の capture を扱う。また Task / Render / VisibleTask に実行時点を分けている。Isle では、このような実行境界を component 内の宣言の種類に対応させる。([Qwik Optimizer](https://qwik.dev/docs/advanced/optimizer/), [Tasks and Lifecycle](https://qwik.dev/docs/core/tasks/))

| 場所 | 記述できること | Compiler が決めること |
|---|---|---|
| component の引数 | 名前付き readonly props | 入力型、実行側を越える値の契約 |
| `state` | 保存する値と初期式 | owner、初期化の依存、snapshot の配置 |
| `derive` | 副作用のない値の計算 | 静的 dependency、循環検出、必要な再計算 |
| `event` | 名前、更新先、利用する action と処理本体 | CodeRef、入力の capture、commit の更新先 |
| template / component のタグ | HTML、binding、子 component | 静的 HTML、DOM 更新先、子の owner |
| `inline(ts)` の本文 | 局所変数、条件分岐、ループ、計算、許可された処理 | TS の型検査と、その入口の契約との照合 |

component 直下の任意の `const` / `let`、文としての `if` / `for`、call、`await` は許さない。`state` の初期式と `derive` の式には閉じた純粋な式を使う。表示の条件分岐やリストを追加するときも、構造を compiler が読める template の宣言にする。TS 本文が返すものはデータであり、動的な component 定義や解析できない描画関数は初期範囲に含めない。

template の制御構文は実装済みの `Show` / `For` / `Switch` / `ErrorBoundary` を使う。[制御構文と最適化](control-flow.md) に意味規則を記録する。これらの body も宣言 DSL の範囲に保つ。構造が変わらない更新、arm の切り替え、keyed row の寿命を IR で区別し、TS の通常の文へ早期に変換して情報を失わないようにする。

## 記述例

次の例では、DSL が更新可能な場所を決め、その値の求め方を TS に委ねる。

```text
client component Counter(initial: number) {
  state count: number = initial;
  derive doubled: number = count * 2;

  event increment
    writes(count)
    inline(ts) {
      const next = count + 1;
      return { count: next };
    }

  <button on:click={increment}>{count} / {doubled}</button>
}
```

`count` は DSL が所有する state である。本文の `count` には dispatch 時点の通常値を渡し、本文から直接 cell を変更させない。本文が返す更新 record を runtime が検証し、owner が有効なときに state と必要な DOM 更新を commit する。初期範囲では現行の primitive 値を使い、object の可変 alias を経由する更新は導入しない。

この component は通常の TS 関数として呼び出せない。`<Counter initial={0} />` の合成は compiler が解決し、TS の通常の関数呼び出しと区別する。readonly props、純粋な子の展開、client の子が持つ独立した owner は [現行の合成契約](composition.md) を引き継ぐ。

## 依存は推論し、変更できる範囲を明示する

記述の候補として、`reads(count)` は本文の名前解決から静的に推論し、`writes(count)` と `calls(...)` は宣言に残す。これを既存の明示 reads 案と比較する。本文内の同名の局所変数と DSL の binding は symbol として区別する。

上の例から得る論理的な契約は次のとおりである。これは現行 `explain` の出力形式ではなく、次段階で説明すべき情報の例である。

```text
entry: Counter.increment
reads: count
writes: count
calls: none
derive: doubled <- count
```

すべての分岐で参照し得る値の和を依存候補とし、実行中の購読登録は行わない。既知の DSL binding、許可した import、入口が供給する引数以外の free symbol は診断する。`writes` にない state の更新、readonly 入力への代入、返却契約にない更新 record は受け入れない。

CodeRef と計測の論理名は `Counter.increment` に結び付ける。物理 chunk と読み込み方針は Vite / Rolldown が決める。`inline(ts)` は本文の言語を指定し、eager loading を要求しない。処理本体の変更や minify 後も、宣言された入口から計測結果を引けるようにする。

## TS に渡しても残る検査

TS の型検査は純粋性の証明にはならない。たとえば `(n: number): number => n + Date.now()` は型検査を通るが、同じ入力から同じ値を返す保証はない。`derive` を任意の TS に開放すると、この問題が戻ってくる。

まずは `derive` と state 初期式を現在の閉じた式言語に保ち、複雑なロジックは event / action の本文へ置く。将来 `derive = inline(ts) { ... }` を許す場合も、解析できる純粋な部分言語と helper に限る。未知の call や import を、戻り値の型や `pure` という自己申告だけで検証済みにしない。通常の TS を別ファイルへ移すだけでも純粋性の保証は増えない。

event / action の本文では、局所的な TS の制御構文を使える一方、利用できる外部能力は入口の契約で区切る。未知の global、動的な code 生成、解析できない capture を無条件で許す案ではない。外部 module の初期化を含む効果も adapter の検査・信頼契約の対象とする。この検査は悪意ある任意 JS を隔離する sandbox ではない。

非同期の例は次のようになる。

```text
event save async
  writes(title)
  calls(renameDocument)
  inline(ts) {
    const next = await actions.renameDocument({ id, title });
    return { title: next.title };
  }
```

`id` と `title` は入力値として推論し、`actions` には宣言した stub だけを供給する。`await` 後も入力を暗黙に読み直さない。`calls` は利用先の制約であり、server の認可を代替しない。decode・認証・認可・output 検査は server entry に残す。dispose 後の更新の抑止と、外部へ完了した副作用の rollback は別の契約である。詳細は [server / client 境界](security-boundaries.md) に従う。

## 最適化と検証の対象

必要な consumer を持たない `derive` は評価しない、という意味を DSL 自体に定める。その上で、依存グラフから不要な計算・capture・更新コードを除去する。副作用がないことだけで例外や非停止が消えるわけではないため、任意の TS 文を先に実行してから削除できる、とは扱わない。

SSR 済み owner の再開では、保存値と既存 DOM から必要な入口へ接続する。component の初期化を再実行しない。将来、操作で新しい branch / list item を作る場合には、生成用の入口と初期化計画が別に必要になる。

MoonBit の core は宣言、binding、owner、dependency、CodeRef の契約を扱う。TS adapter は本文の AST と名前解決、型診断、capture と effect の summary、生成 module、原文への mapping を供給する。Content Mapper は型検査と診断の投影に使い、それ自体を純粋性解析とは扱わない。本文の文字列検索だけで読み書きや境界を検査しない。

実行計画から高負荷を事前に検出することも要件とする。現行 v0 の既存 plan を対象にした初版を [静的な負荷予測](static-profiling.md) に実装した。入口ごとの依存の波及、計算回数、DOM 更新候補、static code closure を出す。入力上限の記号式と実測で校正した時間は後続とし、不明な費用を区別する。通常の browser payload に解析 metadata を載せない。

形式モデルでは、循環のない依存グラフ、宣言した更新先、owner の寿命、compute / commit の規則を対象にできる。TS 本文が満たす契約と、adapter が信頼に置く性質を仮定として分ける。DSL のモデル検査の成功を、任意の TS の副作用や停止性の証明へ広げない。

ここで示した TS 本文の導入では、component 直下の通常文の拒否、局所変数を区別した capture、未宣言 write / action の拒否、dispose 中の async 完了の順に Red を用意する。その後に TS adapter と codegen を接続し、同じ操作の HTML・snapshot・遅延 chunk・更新結果を現行 v0 と比較する。記述評価では、明示 reads と推論版の重複記述、実行時点の誤読、診断から修正できるかを比較する。この本文構文と adapter は設計段階である。
