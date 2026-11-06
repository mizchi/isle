# コンパイラ研究と開発基盤から取り入れる設計

## どの研究成果を resume 言語の意味論へ移せるか

### Takeaway

2026-11-02 時点では、resume を直接実装する新しい万能理論を探すより、段階分離・関数のデータ化・差分計算・capability・非同期因果性を小さい契約へ落とすのが有効である。以下の5件は研究上の事実と今回への転用を区別する。理論や型体系全体の導入、論文の性能数値の UI への転用は提案しない。

### Cited Findings

- **段階分離：Davies／Pfenning, A Modal Analysis of Staged Computation（POPL 1996、後に JACM 2001）**。binding-time analysis を段階の型検査として扱い、早期に使える引数と後段に残す計算を分離する。専用文法から何をいつ実行できるか診断するための基礎となる。新しい研究ではなく、今回の意味論を整理する古典である。[著者版](https://www.cs.cmu.edu/~fp/papers/popl96.pdf)、[JACM 著者版](https://www.cs.cmu.edu/~fp/papers/jacm00.pdf)
- **関数のデータ化：Danvy／Nielsen, Defunctionalization at Work（2001）**。高階プログラムを一階プログラムへ変換する手法と、その適用・正しさの関係を研究する。resume snapshot の `handler symbol + environment` を検討する際の基礎となる。ただし、この論文自体が Web の closure serialization を提供するわけではない。[BRICS 原著掲載](https://tidsskrift.dk/brics/article/view/21684)
- **差分計算：Cai ほか, A Theory of Changes for Higher-Order Languages（2013 preprint／PLDI 2014）**。入力の差分から出力の差分を作る静的変換を定義し、基底型・primitive ごとに必要なインターフェースを示す。適用対象の λ 計算について形式的正しさを扱う。[著者 preprint](https://arxiv.org/abs/1312.0658)、[本文](https://arxiv.org/pdf/1312.0658)、[正式版 DOI](https://doi.org/10.1145/2594291.2594304)
- **能力の明示：Brachthäuser／Schuster／Ostermann, Effects as Capabilities（OOPSLA 2020）**。計算が環境に要求する capability として effect を捉え、関数と値を区別し capability-passing へ変換する。一方、要求 capability の扱いやすさと「effect の不在」の推論は同じ問題ではないと明示する。[著者所属機関の論文紹介](https://pl.cs.uni-tuebingen.de/publications/brachthaeuser20effects/)、[詳細な著者版](https://ps.informatik.uni-tuebingen.de/publications/brachthaeuser20effekt.pdf)
- **非同期因果性：Bahr／Møgelberg, Asynchronous modal FRP: Ticking all the boxes（JFP 36、2026-10-07 公開）**。2023年版を拡張し、非同期入力から出力へ進む機械の causality・productivity・space leak の不在を扱う。実行中に変わる入力依存集合にも型システムで静的な上限を付けられる。[JFP 掲載と公開日](https://jfp.episciences.org/en/articles/17791)、[著者ページ](https://bahr.io/pub/asyncratt-extended.html)

### Inferences

**採用案1：phase を独立した解析結果にする。** build-time、server-render、client-event、client-effect の実行可能性を、TS の値の型とは別に記録する。同じ pure helper は SSR と client update の双方に必要になり得る。`state` 初期化は SSR 時の動的計算であり、build 時の定数畳み込みと混同しない。server-only 値を handler が参照した時点で、宣言位置を含む独自診断にする。これは staging 研究からの設計上の転用であり、modal type system 全体を導入する提案ではない。

**採用案2：継続を symbol と capture layout の契約へ変換する。** handler の自由変数を、`Value(codecId, payload)`、`StateRef(scopeId, slotId)`、`ImportRef(symbolId)` へ分類する。同じ state を使う二つの handler は同じ cell を参照する。DOM・任意 closure・host capability の生オブジェクトを snapshot に入れない。defunctionalization の考え方は使えるが、ESM export への抽出は通常の closure conversion／lambda lifting と組み合わせた実装になる。全 handler を巨大な switch にまとめる必要はない。

**採用案3：差分はまず dirty binding と構造編集に限定する。** 初期 IR は state write から必要な derive と DOM patch を静的に列挙する。リストには insert／remove／move／replace の明示的な更新表現を持たせる余地を残す。ただし、任意の TS の `filter`／`sort`／外部関数まで自動で漸近高速化する約束はしない。数値再計算が安ければ再計算し、巨大データ変換の微分化は別の最適化段階として保留する。

**採用案4：pure と capability を分ける。** `derive` では許可演算と解析済み pure helper だけを使えるようにする。browser DOM・network・clock・random・storage は明示的な capability 境界へ置く。必要 capability が分かることは、結果の決定性や例外・発散の不在まで証明することとは異なる。Rust／MoonBit／vibe 側の effect system が、文字列として埋め込んだ TS の effect を自動検査することもない。初期版は一般的 effect polymorphism を実装せず、小さい閉じた effect 集合を使う。

**採用案5：静的 graph と動的な scope lifetime の両方を規定する。** template 内の依存候補が静的でも、active branch、keyed item の個数、pending async task は動的である。IR に静的 owner を持たせ、runtime instance に generation を持たせる。scope を破棄したら listener・timer・resource を解放し、遅れて完了した処理がその scope を更新しない契約にする。Async RaTT の成果はこの不変条件の参考になるが、generation counter を加えただけで論文の証明がそのまま適用できるとは主張しない。

同期更新では、state write のまとまり→pure derive を依存順で評価→DOM commit→外部 effect という段階を定義する。これにより diamond dependency の途中値を DOM に出さない。宣言的な非同期 resource の再計算は `(ownerGeneration, resourceKey, requestRevision)` を開始時に記録し、結果の適用時に owner の生存・世代・当該 resource の最新 revision を検査する案を推す。`AbortSignal` は実行の停止要求として併用するが、停止要求だけを stale result 防止の根拠にしない。検索結果のような「最新入力に対応する値」にはこの規則が合う。通常の mutation／event action は dispatch 順序や明示的な並行性を別に定義し、global な latest-wins へ統一しない。ここで規定する transaction は UI 更新の単位であり、任意の外部副作用を rollback する機構ではない。

### Gaps

- 挙げた論文は、このフレームワークの SSR と browser resume が同値であることを証明しない。小さい DSL の reference semantics と codegen の関係は別途定める必要がある。
- 完全な ownership／linear type system や modal clock 推論を入れる費用は未評価。初期仕様では owner・cleanup・generation の契約までとする。
- 導出 graph の同期 cycle は初期版で拒否する案だが、遅延 feedback を許す文法は未決定。汎用 async 構文の導入前に意味論を決める必要がある。

## 最新の Vite／Rolldown／Content Mapper は設計をどう変えるか

### Takeaway

compiler は分割可能な論理 ESM module を出す必要がある。開発時は bundle の出力 hook が存在せず、SSR と client も別 environment であるため、同じ解析結果と schema を共有しつつ生成物・cache を target ごとに分ける。Content Mapper の型投影と compiler の安全性解析は独立した契約にする。

### Cited Findings

- Vite 現行 docs は Rolldown plugin interface を基礎とし、virtual module と `resolveId`／`load`／`transform` を dev／build 共通の経路にできる。dev では `moduleParsed` と通常の output generation hooks は呼ばれない。hook filter は Rust と JS 間の不要な呼び出しを減らす用途で導入されている。[Vite Plugin API](https://vite.dev/guide/api-plugin)
- Rolldown の自動分割は静的 import graph を基にし、ロード性能や cache invalidation まで自動で最適化するものではない。現在、一つの module 自体を複数 chunk に分割する機能はなく、`maxSize` も絶対上限ではない。[Rolldown manual splitting](https://rolldown.rs/in-depth/manual-code-splitting)
- Vite Environment API は現在 RC、個別 API に experimental なものもある。`RunnableDevEnvironment.runner.import()` は同じ runtime 内の module export を取得する。`FetchableDevEnvironment` は Request／Response 境界を使い、Vite を動かせない host 向けの経路を提供するが、提案・実装詳細の注記がある。app 全体の build は `createBuilder`／`builder.buildApp` で調停できる。[Environment API for Frameworks](https://vite.dev/guide/api-environment-frameworks)
- module hook は per-environment で `this.environment` を持ち、`hotUpdate` も environment ごとに走る。共有 plugin 内の可変 cache を environment で区別するパターンが示される。複数 browser tab は同じ environment 内でも別 app instance として扱われる。[Environment API for Plugins](https://vite.dev/guide/api-environment-plugins)
- TypeScript 7.1 は2026-10-20時点で Beta。Content Mapper は原文から仮想表現・位置対応を返し、TS に埋め込み領域の型検査と editor 機能を担当させる機構である。CLI の外部実行許可と editor 側の許可が必要になる。[TypeScript 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)
- Content Mapper の round 2 では数値 `protocolVersion` が除去され capabilities ベースへ移行する方針となった。SpanMap は verbatim／atom／alias を区別し、virtual 空間では順序付き非重複、原文側 overlap は許可する。text edit は exact verbatim を要求する。[TypeScript #63936](https://github.com/microsoft/TypeScript/pull/63936)、[SpanMap source](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/spanmap/spanmap.go)
- Oxc semantic の公式説明は symbol analysis と scope resolution を扱う。Content Mapper host はファイル内容・投影・mapping を扱う別の経路である。[Oxc semantic](https://docs.rs/oxc_semantic/latest/oxc_semantic/)、[TypeScript mapper host](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/contentmapper/host.go)

### Inferences

**採用案6：handler／update／factory を必要な粒度の virtual submodule として出す。** 一つの巨大な generated module を出してから bundler に symbol 単位分割を期待しない。compiler が lazy entry と静的 import の辺を決め、Rolldown が物理配置・共有化・hash を決める。1 handler＝1 chunk は要求しない。route／entry の registry に literal `import()` を生成し、snapshot 内の論理 symbol ID から接続する。manual groups は測定後の設定とし、最初から vendor／handler の一律分割を固定しない。

**採用案7：解析 cache と生成 cache を別にし、build set で整合を取る。** `sourceHash + transitive signature/effect dependencies + compiler/options/schema revisions` を解析の入力 identity に含め、client／SSR／型ビューの codegen cache は target を加えて分ける。異なる target の module source を同じ cache entry に上書きしない。Vite に共有 plugin instance があることへ correctness を依存させず、独立した build でも同じ logical symbol／capture layout を得る artifact 契約にする。

manifest は compiler の論理 ID／schema／capture layout と、bundler の最終 asset URL を分ける。`buildId` は両者の組合せを指し、SSR snapshot、route registry、handler module が同じ build set に属することを検証する。dev は `resolveId`／`load` で registry を用意し、production だけに存在する `generateBundle` の結果を要求しない。schema が変わる HMR は full reload を基本にする。state 保持 HMR は互換性規則を定めた後へ保留する。これは runtime 内部の復元 ABI であり、TypeScript Content Mapper の protocol version と混同しない。

portable SSR の外側には `Request → Response` を置き、HTML writer／stream の生成 core は request host から分ける案を推す。Vite の Fetchable API のクラスを core の公開型に埋め込まず、adapter の内側で吸収する。環境 API は major ごとの適合範囲を固定し、native／Wasm compiler は共通 artifact 契約から評価する。

**採用案8：TS の型診断・独自保証・runtime codec を三分する。** Content Mapper は型情報を compiler core に自動的に返す仕組みではない。`number` や imported alias の意味が TS で検査されても、それだけで閉じた serializer／effect checker が成立しない。初期 state schema は compiler が理解する primitive・構造へ限定し、外部型・`any`／`unknown`・任意 class を黙って serializable と扱わない。trusted helper／外部 codec は明示的な境界とする。一般の TS 型 alias 展開が必要なら、別の型問い合わせ連携を設計する費用を認める。

SSR に渡る request data は実行時値なので、snapshot encode 時の検証は残る。v1 codec は例えば null／boolean／string／有限 number／制限した array・plain record に限定し、`NaN`／Infinity／`-0` の保持または拒否、undefined／BigInt／Symbol、循環・共有 alias の扱いを仕様に書く。JSON.stringify に意味論を丸投げしない。制約を超えた入力は一度黙って劣化変換せず、schema と原文位置を示して失敗させる。具体的なタグ付き codec の実装はこの設計段階では行わない。

### Gaps

- Content Mapper の Beta npm patch と editor の相互運用を実行検証していない。source から分かる能力と、実ホストでの安定性は分ける。
- Vite Environment／Fetchable API は安定化の途中である。依存 major・RC 範囲の選定は未確定であり、具体的な class 名を永続 ABI として保証しない。
- Rust core から Wasm 入口を使う際の文字列転送費用、parse cache の実効果、build parallelism の利益は未計測。言語を選んだだけで generated UI の性能順位は決まらない。

## 実装前にどの不変条件と評価基準を設計書へ追加するか

### Takeaway

state／derive／on の文法を固める前に、解析結果が codegen・snapshot・型ビュー・bundle のどこへ渡るかを契約化する。速度は JS byte 単独ではなく、resume の cold path と継続更新の両方で判断する。この節は上の研究・tooling から導く設計提案であり、実装済み機能や測定結果ではない。

### Cited Findings

- Vite は plugin の中間結果を可視化する inspect tooling を案内している。独自変換が運用しにくいという今回の問題には、出力の観測可能性を設計に含める余地がある。[Vite plugin debugging](https://vite.dev/guide/api-plugin#authoring-a-plugin)
- 静的増分化の論文でも、変換の正しさに加えて primitive ごとの差分実装の性能設計が必要になる。正しさの証明や静的変換の存在から、すべての workload で速いとは導けない。[A Theory of Changes 本文 §4](https://arxiv.org/pdf/1312.0658)

### Inferences

**採用案9：IR と artifacts の不変条件を明文化する。** 契約案は次のとおり。

|対象|要求する不変条件|
|binding／span|全参照は一意な binding に解決し、独自診断は宣言位置・参照位置を保持する|
|phase／effect|呼出先の許可 phase と effect が閉じ、未知 call を pure と推定しない|
|state／capture|保存値と state 参照を区別し、state cell の外部流出・暗黙 alias mutation を拒否する|
|derived graph|同期 cycle を拒否し、write→compute→commit の順序が一意に決まる|
|structure／owner|静的 template location と動的 instance を区別し、破棄した owner へ更新しない|
|snapshot／build|encode／decode の codec、capture layout、handler symbol が同じ build set を指す|
|artifact target|SSR、client、型投影それぞれの import・mapping を区別する|

source→AST／binding→解析モデル→各 backend という分離を保つ。公開 artifact は `moduleId, target, code, runtimeSourceMap, logicalImports, sourceDependencies`、schema は `schemaId, scopeLayouts, captureLayouts, codecRequirements`、型投影は `virtualSource, spanMap, diagnostics` といった別の型にする案を推す。TS SpanMap と browser debugger の source map を同じ型にしない。FS／resolve／stdio／watch／Vite の capability は host adapter へ出し、core は host の生オブジェクトを受け取らない。

**採用案10：explain と contract fixture を最初から仕様へ入れる。** `explain` では各 handler の capture、state→patch の経路、client に残る helper、その理由、snapshot field、論理 module と物理 chunk の対応を出す。capture error だけでなく「この helper のために何 byte／どの import が残るか」を後で bundle report に結べる ID を持たせる。圧縮後 byte の精密帰属は非加算的なので、初期 explain が正確な per-symbol gzip 費用を返すとは約束しない。

今はテストを実装せず、将来の受入例として、別 browser realm で setup／render を再実行しない初回操作、二 instance の state 分離、shared state 参照、同期 diamond の一括 commit、scope 破棄中に完了する import／resource、逆順に完了する検索、旧 build snapshot、codec 不適合、原文 rename／診断 mapping を設計書に列挙する。

性能評価の fixture は、静的ページ、疎な操作、共有 state の多点更新、branch／keyed list、入力と検索を分ける。総転送量は HTML・snapshot・marker・bootstrap・初回操作に必要な全 chunk・CSS を同条件で数え、chunk 数、最長依存 import chain、parse／execute、初回操作から可視 commit、warm 更新、heap／解放を記録する。HTTP cache、module cache、prefetch を独立した条件にする。静的解析で動作を変えずに生成コードを削れたかを先に検証し、その上で手書き DOM や既存 framework と比較する。今回の資料では数値目標や性能順位は出さない。

### Gaps

- 依存集合の精度、capture の縮小率、最適な module 粒度の基線がない。cost model の係数は将来の測定から決める。
- どの effect を初期 grammar へ公開するか、latest-input resource と event action の構文、snapshot codec の厳密な v1 集合は未確定。
- 本調査では実装・依存インストール・build・テスト実行をしていない。追加したのは設計用の調査文書のみである。
