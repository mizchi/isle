# コンパイル主導 UI の runtime と構文

調査日: 2026-11-02。ユーザーの追加方針「resume をベースにする。できるだけポータブルに」を反映。以下の「提案」は既存実装の事実ではなく、新フレームワークへの設計判断。

さらにユーザーは「Qwik の `$` 関数の独自 preprocess が運用を難しくするので、専用文法で明確にしたい」「制約してよい」と指定。従って任意 TS/TSX を受け入れることを優先せず、resume に必要な契約を文法に出す厳格 DSL を初期案とする。

## Qwik から何を引き継ぎ、何を強めるか

### Takeaway

Qwik の本質は SSR 結果への高速な再描画ではなく、ブラウザで setup/template を再実行しない server-client handoff。新設計ではそこを必須とし、更新グラフ・DOM 更新手続きを専用言語からさらに静的生成する。

### Cited Findings

- Qwik の公式説明は listener・component tree・application state を復元する通常の hydration と resume を区別する。SSR が listener の symbol URL と状態・購読関係を記録し、ブラウザで全 component code を実行する必要をなくす。[Qwik resumability](https://qwik.dev/docs/concepts/resumable/)
- Optimizer は `$` に続く式を import 可能な symbol に抽出する。Rust 実装で Wasm 版もある。これは任意 TS の計算結果をすべてビルド時に解く仕組みではない。[Qwik optimizer](https://qwik.dev/docs/advanced/optimizer/)
- QRL は chunk URL・export symbol・lexical object reference を表す。[Qwik QRL](https://qwik.dev/docs/advanced/qrl/)
- `$` の closure capture には const と serializable value という制約がある。関数を任意にそのまま JSON 化する設計ではない。[Qwik dollar rules](https://qwik.dev/docs/advanced/dollar/)
- 遅延イベントはコード未ロードなら実行が遅れる。`preventDefault`、`stopPropagation`、`currentTarget` の扱いに制約があり、宣言的属性や別引数で補う。初回操作の遅れを抑えるため handler code を browser cache に先読みする設計も説明されている。[Qwik events](https://qwik.dev/docs/core/events/)
- Qwik は現時点で v2 beta 向けの別 docs を公開している。resume という説明は継続しているが、v1 の API・詳細性能を v2 に自動的に当てはめない。[Qwik v2 home](https://next.qwik.dev/)、[Qwik v2 resumability](https://next.qwik.dev/docs/concepts/resumable/)

### Inferences

- **提案**: 「全てコンパイル時に決まる」は「値」ではなく「計算の配置・依存関係・更新手順・serializable capture の境界がコンパイル時に確定する」と定義する。request の props、乱数、時刻、DB 結果、ユーザー入力は後で得られる。将来発生する keyed item の個数もビルド時には未確定。
- **提案**: build / server request / client event の三相に分ける。server request の実行結果を snapshot に渡し、client 側で初期値式を再実行しない。`Date.now()` で初期化された state は同じ式の再実行でなく SSR 時の値を復元する。
- **提案**: compiler が `State → Derived → Binding/Block/Effect` の静的 graph を出す。汎用 signal observer graph を初期ロード時に探索しない。branch の候補は静的でも現在 active な branch と instance 数は動的なので、その topology は resume data に残す。

### Gaps

- Qwik より速い／小さいという根拠はまだない。cold first interaction と warm update は別の指標で測定すべき。
- SSR が JS、別言語、Wasm のどれかは他の調査担当領域。runtime は DOM/ESM のみに依存できるが、それだけで任意 SSR host が保証されるわけではない。

## Marko 6 と比べた設計の位置

### Takeaway

目指す compile-time reactivity と resume の組み合わせは Marko 6 に非常に近い。比較対象の中心に置き、差は TS-first の構文・型統合・effect/capture 契約・compiler distribution に求めるべき。

### Cited Findings

- Marko は SSR 用の HTML stream 出力と browser 用の細粒度 DOM 更新コードを別々に生成し、server/client 共通の DOM tree 表現を不要にする。[Targeted compilation](https://markojs.com/docs/explanation/targeted-compilation)
- Marko 6 の client bundle は component 全体でなく interactive な部分から決まる。静的部分は client JS 不要で、動的に生成されない初期ボタンについては生成処理そのものも送らない。[Fine-grained bundling](https://markojs.com/docs/explanation/fine-grained-bundling)
- resume のため HTML に marker と serialized state を含める。client は既存 DOM と必要な state を接続し、初期テンプレートを再描画しない。[Why is Marko fast](https://markojs.com/docs/explanation/why-is-marko-fast)
- Marko の reactive graph はコンパイル時に発見される。render expression は pure であるべきとされ、更新は queue に集約される。state 代入直後でも derived は flush 前には前の値という仕様まで明記される。[Reactivity reference](https://markojs.com/docs/reference/reactivity)
- 実装説明は単一 dependency graph から retained DOM module graph、SSR scope payload、DOM/range markers、lazy ready streams の四つを対応させて生成すると説明する。registered ID を serialize し、function source を送らない。登録が多すぎれば dead client graph が残り、少なすぎれば resume が壊れるため、最適化後 bundle を確認する。[Marko runtime resumability architecture](https://github.com/marko-js/marko/blob/main/packages/runtime-tags/RESUMABILITY.md)

### Inferences

- **提案**: compiler の最適化対象を「生成 JS 文字数」に狭めない。retained client code / serialized values / markers / chunk requests を共通 liveness graph から導出する。snapshot 内の関数 ID を消した結果、巨大な client helper まで DCE できる、といった効果を扱う。
- **提案**: まず明示的 state/derived/effect を持つ制限言語を実装し、Marko 級の alias・property・closure 全般の解析は段階的に増やす。任意 TS を最初から完全解析する方針は MVP を膨らませる。
- **提案**: static subtree hoist と component inline は分ける。static 部分は HTML にだけ置く。dynamic 部分は component 境界を跨いでも dependency summary が接続できる IR にする。コードの component 分割が hydration 単位を不必要に増やさないようにする。

### Gaps

- 新規性を「静的解析＋resume」だけで主張できない。Marko の現行構成が既に近い。
- Marko の公開説明の性能主張は本調査で再測定していない。速度比較の根拠として引用しない。

## 専用構文・effect 制約・portable resume 契約

### Takeaway

TSRX の読み書きしやすい構造は参考になるが、その構文自体は静的最適化の保証ではない。resume 可能なプログラムの意味論を先に定義し、その範囲で構文を選ぶ。

### Cited Findings

- TSRX の draft は TypeScript-compatible な追加構文と static constraints を定義する。component 専用宣言はなく通常の関数が template を返す。`@{}` は TS setup の後に一つの output、`@if`/`@for`/`@switch`/`@try` を持ち、host profile が追加制約を課せる。[TSRX specification](https://tsrx.dev/specification)
- TSRX compiler は AST を framework-specific plugin へ渡す。つまり構文と runtime を分離する構成であり、TSRX を選ぶだけで特定の reactivity/resume semantics が付くわけではない。[TSRX home](https://tsrx.dev/)
- Solid は signal と observer で targeted update を行うが、依存関係を runtime で追跡する設計を公式説明している。[Solid fine-grained reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity)
- Svelte の `$derived` は副作用を避ける制約を持ち、同期に読んだ値を依存とする。構文コンパイルと runtime dependency discovery は両立するので、「compiler がある」だけでは全 graph 静的とは限らない。[Svelte derived](https://svelte.dev/docs/svelte/$derived)

### Inferences

以下は全て設計提案。

**厳格 DSL の方向（構文の確定案ではない）**

```text
component Counter(initial: number) {
  state count: number = initial;
  derive doubled: number = count * 2;

  <button>
    on click { count += 1; }
    {count} / {doubled}
  </button>
}
```

`state` は SSR 初期化と serialized slot、`derive` は静的 read dependencies と pure computation、`on` は browser event symbol と capture、`effect client` は activation/cleanup を持つ browser-only work を表す。名前末尾が `$` なら任意の関数が変換されるという拡張点は設けない。compiler が `on` 内の free variables を state refs / immutable serializable captures / importable symbols に分類し、違反時は capture 元の場所と phase を指した diagnostic を出す。診断と explain 出力には「どの handler が何を capture して、どの値を送るか」を表示できるようにする。専用語を増やすだけでなく、この契約が grammar/IR/codegen で一貫することが目的。

TS は props、式、pure helper の型・editor 連携に利用できる。reactive state を生成・保持する higher-order JS、実行時の hook 呼出、任意 closure の自動移送は初期版では拒否できる。serializable な shape と static dependency の可視性を最優先する。

**静的意味論の最小範囲**

- state は compiler 所有の cell。initial value は server 実行、write は event/action から。初期版では deep proxy mutation、state cell 自体の alias escape、reflection、`eval`、実行時 component registry は対象外。
- derived は pure expression。local function には inferred read/write summary を付けられる。import した任意関数には TS の関数型だけで purity を仮定しない。
- 未知 call は三択に閉じる: (a) immutable な引数だけに依存する pure capability の明示契約、(b) dependency を明示した opaque compute として保守的に扱う、(c) `client effect` 側に隔離。単に「返り値が number だから pure」は禁止。宣言契約は信頼境界であり数学的証明ではない。
- `effect` は実行時機を明示する。SSR effect / client activation effect / state change effect を混同しない。resume 時に server effect を再実行しない。client effect は DOM の接続後に実行し、block destruction 時に cleanup。
- branch が選ぶ active dependency は runtime の値による。静的には候補の union を持ち active guard で止める。これにより動的 read tracking をなくせても、必要最小の計算回数を常に保証するわけではない。
- 可変長 list は `key` を必須とし、DOM range + scope + cleanup の単位を key に結び付ける。new order、insert/remove/reuse の判断は runtime に残る。静的なのは更新アルゴリズムであり、差分結果そのものではない。

**共通 IR**

`Module / Template / StateSlot / Derived(reads) / EventSymbol(captures, mode) / Binding(dom-address, patch) / Branch / KeyedRange / Effect(scope, timing, cleanup)`。build artifacts は SSR ESM、client ESM symbol chunks、CSS、versioned manifest。DOM node や closure object は compiler IR 内に埋めない。

**snapshot に入れるもの**

- `schemaVersion`、`buildId`、root/container ID。
- 実際に SSR で生成された instance/scope IDs と所有関係。
- client の将来の計算で必要な state/props/derived 値だけ。server-only props 全体を機械的に serialize しない。
- 同一 state を複数 event が共有することを保つ slot references。単に各 handler に JSON copy を持たせない。
- active branch IDs、keyed instance IDs と順番、DOM range marker の対応。
- event の export symbol ID、capture slot IDs、同期制御フラグ。関数の文字列表現は不可。

静的 dependency edges は ESM code 内に既にあるので snapshot に全 graph を二重収録しない。snapshot は主に dynamic instance topology と runtime values を持つ。ただし resume 後に必要な graph と値が一致することは compiler が保証する。

**最小 runtime**

1. global delegate が event metadata を読む。
2. 必要な symbol chunk と更新依存 group を import。
3. 必要な scope/state と DOM refs を lazy に resolve。root の全 instance を upfront に materialize しない。
4. handler が既存 state を変更し、静的 fanout で dirty binding を queue に入れる。
5. topological な derived 更新・DOM patch・effect の順に transaction を flush。
6. branch/list の範囲生成・破棄と cleanup を行う。

render 関数全体を再実行せず直接 patch する。新しい branch/list item を生成する factory は必要なので、その部分の creation code まで消せるとはしない。初期 SSR にしか存在せず生成され直さない subtree の creation code は除去できる。

**イベントの難所**

- cold な lazy handler は同期 DOM event に間に合わない。`preventdefault` のような静的 metadata は delegate が同期処理する。
- drag/clipboard/user activation が必要な処理は明示 `sync` または eager handler 境界を持つ。その箇所は事前 JS 実行が必要で、全 handler の完全遅延と同時には保証できない。
- handler import 中の連打は event ごとの ordering と state consistency を定義する。標準 Event object を後から安全に再生できると仮定せず、必要な fields の snapshot と target identity を持つ。scope が破棄されたら pending dispatch は中止。
- resume 前に入力された `<input>` の `value`、`checked`、selection を SSR snapshot で上書きしない。form binding は接続時に live DOM を読み取って state と合流する規則を持つ。input/composition イベントの queue と IME 中の更新は counter の次段階で明示検証し、単なる click replay の成功を form 全般の保証としない。
- handler 単位をすべて別 HTTP request にしない。同じ state/update group の小さい handler は bundle 可能にし、prefetch の有無と bytes を benchmark 条件に含める。

**portability**

- client は標準 DOM・ESM dynamic import・microtask・Fetch/URL だけに依存。Wasm の DOM bridge を入れず JS を出力する。
- SSR の core 出力は ESM と HTML writer interface。Node stream・Bun API・Deno API・Workers bindings は adapter に隔離し、static pre-render は同じ writer を string collector に向ける。
- compiler native/Wasm と、生成物の Node 非依存性は別々に検証する。npm/Vite は最初の adapter であり core semantics ではない。
- external package に DOM を管理させる場合は明示的な opaque boundary を設け、内部 node address の安定性を約束しない。scope destruction と event deregistration の契約を固定する。

### Gaps

- timestamp/locale/random/network の扱い、streaming 途中の scope flush、snapshot schema migration の詳細設計は未確定。初期 MVP は SSR 完了後の HTML から resume し、streaming は別段階にできる。
- 初期文法は未決。TSRX 全仕様への準拠より、small static profile を先に決める方が実装可能性を検証しやすい。

## MVP と測定で何を証明するか

### Takeaway

最初に証明するのは「SSR 初期計算を browser で再実行せず、既存 DOM を操作して state を更新できる」こと。速度の順位はその後に比較する。

### Cited Findings

- Marko 自身の実装資料も、raw compiler output でなく最適化後の bundle・chunk placement・Brotli サイズを確認し、client retention と payload を一体で測るよう説明している。[Marko runtime resumability architecture](https://github.com/marko-js/marko/blob/main/packages/runtime-tags/RESUMABILITY.md)
- Qwik の lazy handler は実行の遅延と cache の先読みを分けるので、初回操作の benchmark でも network/cache 条件を区別する必要がある。[Qwik events](https://qwik.dev/docs/core/events/)

### Inferences

**最初の縦切り**: 外部 props から SSR された counter、一つの derived、一つの event、一つの text binding。compiler、SSR HTML/snapshot、symbol loader、direct DOM patch まで通す。次の段階で conditional、keyed list、cleanup を追加する。

**TDD の acceptance**

- Red: SSR setup に記録した sentinel が client では一度も実行されず、SSR render function 自体を browser に渡さなくても click できる。
- Red: 初期 state を server で 37 としたら、最初の click で 38 になる。`state(0)` の再実行で 1 になる挙動は失敗。
- Red: static sibling の DOM identity が変わらず、変更対象 text node だけが更新される。root innerHTML replacement は失敗。
- Red: 同一 state を capture する二つの handler が互いの変更を観測する。capture の値 copy による独立 state は失敗。
- Red: unsafe capture / unknown effect call / unkeyed mutable list は compile-time diagnostic になる。
- 次段階の Red: list reorder で input/focus/node identity を保持、remove で cleanup 一回、pending import 中に削除された scope は発火しない。
- form を導入する段階の Red: loader/handler 未準備の間に入力した文字と selection を保持し、最初の submit が live input value を受け取る。SSR 初期値への巻き戻りは失敗。
- `SSR JS → HTML → 新しい browser realm` でテストする。同じ JS realm のメモリを使い回すデモでは serialize/resume を証明できない。

**測定軸**

|軸|測るもの|
|---|---|
|配信量|HTML・snapshot・markers・runtime・client chunks を分けた minified/Brotli bytes、chunk/request 数|
|起動|操作前の JS parse/eval 時間、module 数、復元 scope 数、SSR setup client 実行回数|
|初回操作|cold network/cache と warm cache、import/deserialization/DOM resolve/handler/flush の各時間、end-to-next-paint|
|継続操作|1/100/10000 bindings で単一 state update、fanout、derived chain、keyed insert/reorder/remove、heap/GC|
|SSR|TTFB・全完了時間・allocations・HTML bytes、streaming を加えたら各 flush 時刻|
|compiler|cold/warm/incremental compile、peak memory、mapping/diagnostics の応答時間|

scalar text patch は手書き DOM を下限比較にし、Qwik / Marko / Solid などは同一データ・意味論・minifier・通信条件で比較する。「初期 JS 0」は runtime loader と HTML 中の metadata を別枠に隠して達成したことにしない。数値の目標は測定基線ができてから合意する。

### Gaps

- 本調査は文書調査であり実装・benchmark はしていない。bundle size や「最速」の数値は未確定。
