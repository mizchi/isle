# Rust MoonBit vibe によるコンパイラ実装

調査日: 2026-11-02。ユーザーの追加方針「resume をベースにする。できるだけポータブルに」と、Qwik の TSX + `$` 関数の独自 preprocess の運用難を避けるため専用文法を使い、静的解析の制約を許容する方針を反映。完全 TSX 互換は要求しない。以下で「事実」と「提案・推論」を分ける。未実装・未ベンチマークであり、速度順位は確定していない。

## 既存資産と TypeScript 統合はどう違うか

### Takeaway

Rust + Oxc は TypeScript の構文・スコープ・参照解析を直接再利用できる。MoonBit には mizchi/ts.mbt が既にあり、vibe は self-hosted compiler / stdio LSP / JSON-RPC まで持つので、後二者を「基盤がない」と扱うのは誤り。ただし言語ごとの静的保証と、UI ソースに埋め込んだ TypeScript の静的保証は別物である。

### Cited Findings

- Oxc parser は Rust 製で JS/JSX/TS/TSX を解析し、Rust crate と Node binding を提供する。速度の公式主張はあるが、本プロジェクトの比較値ではないため順位の根拠にはしない。— [Oxc parser](https://oxc.rs/docs/guide/usage/parser.html)
- `oxc_semantic` は JS/TS の symbol analysis / scope resolution を提供する。束縛と参照を取得する実例もある。この「semantic」は TypeScript の完全な型チェッカーを意味しない。— [oxc_semantic](https://docs.rs/oxc_semantic/latest/oxc_semantic/)
- `oxc_codegen` は JS/TS コードを出力する crate。Oxc transformer には型構文の除去と source map オプションがある。— [oxc_codegen](https://docs.rs/oxc_codegen/latest/oxc_codegen/), [transformer](https://oxc.rs/docs/guide/usage/transformer.html)
- mizchi/ts.mbt は Experimental と明記され、TypeScript / TSX の型検査と JS 変換、TS declaration→MoonBit bridge、MoonBit→JS + `.d.ts` の npm package 出力を持つ。— [ts.mbt README](https://github.com/mizchi/ts.mbt)
- ts.mbt の公開 parser 契約には `parse_expr_from_source`、`parse_block_from_source_with_positions`、`parse_type_from_source` がある。— [parser interface](https://github.com/mizchi/ts.mbt/blob/main/src/parser/pkg.generated.mbti)
- mtsc は TS と同名の CLI option を多数受け取るが、`--target` / `--module` / `--strict` / `--incremental` など動作しない option も報告して受け取る。既存 parser 再利用と TypeScript 全仕様互換の保証は分ける必要がある。— [mtsc guide](https://github.com/mizchi/ts.mbt/blob/main/docs/mtsc.md)
- vibe の parser / checker / Wasm codegen は vibe 自身で実装され、MoonBit host は退役済み。production default は linear Wasm、Wasm GC は opt-in experimental。現行 README は直接 JS backend を列挙していない。— [vibe README](https://github.com/mizchi/vibe-lang)
- vibe は型付き effect row を持つ。`@vibe/parser` は vibe 用 lexer/parser/printer の公開契約である。— [vibe README](https://github.com/mizchi/vibe-lang), [parser contract](https://github.com/mizchi/vibe-lang/blob/main/lib/@vibe/parser/index.vpkg)

### Inferences

- **Rust 案**: 専用テンプレート構文を自前パースし、埋め込み TS を Oxc に渡す。Oxc の束縛情報から capture / read / write を解決し、自前の UI IR に落とす。TS 型検査は Content Mapper 経由の TypeScript に任せる。独自 UI 構文を Oxc にそのまま理解させる必要はない。
- **MoonBit 案**: ts.mbt の式/ブロック parser を使い、UI 向け read/write/capture 解析を追加する。JS target なら Node の Oxc binding を使う別経路も考えられるが、解析のたびに全 AST を言語間で往復させる構成は測定対象とする。採用前に UI fixture に限定した parser 契約適合を確認する。
- **vibe 案**: 専用 DSL の parser と IR 変換器を vibe で書き、JS はテキスト/AST として生成すればよい。vibe 自体に JS backend がなくても、UI コンパイラの実装は可能。TS ソースの解析は外部 Oxc adapter、または制限した DSL の自前 parser が必要になる。
- 実装言語が effect-typed でも、TS の任意関数に純粋性・serializability・決定性が自動付与されるわけではない。UI 側で `state` / `derive` / `event` / `server` / `client effect` の意味を定め、未知の関数の契約を明示する必要がある。
- 専用文法で `state` / `derive` / `on` と resume 境界を明記する方針なら、3 候補とも隠れた TSX 変換規則を再現せずに済む。Rust の利点は任意 TSX の互換性より、残す TS 式の名前解決・capture 解析の再利用に絞られる。TS expression 自体も限定するなら MoonBit / vibe の自前 parser の範囲はさらに小さくなる。

### Gaps

- 3 言語で同一 UI compiler を実測した値はない。コンパイル速度・メモリ・生成 JS サイズの優劣は未確定。
- vibe に現行の汎用 TS parser / JS code generator があることは確認できなかった。存在しないと断定はしない。
- ts.mbt parser はローカル現行 `moon.pkg` で fs / checker 等への依存も持つ。文字列入力だけの package として browser JS / Wasm へ切り出せるかは未検証。

## resume とポータビリティに適した配布境界は何か

### Takeaway

ブラウザに出すものを標準 ESM / DOM / HTML + snapshot に固定し、コンパイラ言語の選択から独立させる。ポータビリティの最大の差はアルゴリズムの記述能力より、ホスト API と配布時の実行環境に現れる。

### Cited Findings

- MoonBit は JS / Wasm / Wasm GC / native 等を選択できる。JS の module format は ESM が既定で CJS / IIFE も選べ、native は生成 C を C compiler でビルドする。— [package configuration](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html)
- MoonBit の JS FFI は外部 JS 値と inline JS lambda を扱える。JS backend は JS runtime の GC を使い、Wasm backend の callback は host 側 closure adapter を必要とする場合がある。— [MoonBit FFI](https://docs.moonbitlang.com/en/latest/language/ffi.html)
- MoonBit の async library は native / Wasm1 の IO と、限定的で browser-compatible な JS support を持つ。JS で OS IO を使うには Node 等による primitive 実装が必要と説明されている。— [moonbitlang/async](https://github.com/moonbitlang/async)
- Oxc は Node native binding に加え、CI に wasm32-wasip1 と wasm32-wasip1-threads のビルド/テスト経路を持つ。「Oxc を使うには native addon が必須」は正しくない。— [Oxc CI](https://github.com/oxc-project/oxc/blob/main/.github/workflows/ci.yml), [binding manifest](https://github.com/oxc-project/oxc/blob/main/napi/parser/Cargo.toml)
- vibe は Wasmtime runner と compiler Wasm を配布し、インストール時に compiler の AOT compilation を行う。— [install guide](https://github.com/mizchi/vibe-lang/blob/main/docs/user/getting-started/install.md)
- vibe default 出力は core Wasm であり、常に WASI Preview 1 `fd_write` を import する。host effect を使うと `vibe::*` ABI も要求し、純粋 WASI host だけでは動作しない。linear backend の exception / SIMD 要件も生成 module に依存する。— [host ABI](https://github.com/mizchi/vibe-lang/blob/main/docs/user/reference/host-abi.md)
- vibe の Node/Rust runner と emitter の host 契約が明文化されている。packed string は guest memory 上の ptr/length を使用する。— [host runtime contract](https://github.com/mizchi/vibe-lang/blob/main/docs/user/reference/host-runtime-contract.md)
- vibe の self-hosted LSP は stdio の JSON-RPC transport と compiler query を同一プロセスで扱い、per-request subprocess / Wasm reload を避ける構成。`@vibe/json` に JSON-RPC codec もある。— [LSP source](https://github.com/mizchi/vibe-lang/blob/main/lib/@vibe/lsp/lsp_server.vibe), [JSON-RPC codec](https://github.com/mizchi/vibe-lang/blob/main/lib/@vibe/json/jsonrpc.vibe)

### Inferences

**推奨する三つの独立した契約**:

1. `compiler-core`: source text + options + 解決済み module metadata → artifacts + diagnostics + source spans。FS、Vite、process、HTTP を直接参照しない。Wasm 向けは入力/出力バイト列の小さな ABI を用意する。
2. `tooling-host`: file reading / module resolution / cache / watch / Content Mapper stdio / bundler adapter。実行環境ごとの違いをここに置く。compile ごとに process を立ち上げず、project session を再利用する。
3. `generated-application`: SSR 用 ESM、browser handler/update ESM、HTML、versioned resume snapshot、CSS。compiler やそのホストを本番 application の必須依存にしない。

**言語別評価（提案）**:

| 候補 | 適している構成 | ポータビリティ上の検証点 |
|---|---|---|
| Rust + Oxc | compiler core を Rust、Wasm entry を共通配布、必要なら native CLI/addon を高速経路として追加 | 非 thread の browser Wasm entry、FS 依存の除去、Wasm memory と string copy、各 runtime loader |
| MoonBit | compiler core を MoonBit、JS ESM package と Wasm/native adapter。ts.mbt parser 再利用を検討 | parser dependencies の pure 化、JS host IO の adapter、native と JS/Wasm の出力一致 |
| vibe | 純粋な DSL/IR 変換器を vibe、Wasm command を viberun/Node host から常駐呼び出し | `vibe::*` host ABI と feature 要件、browser embedding API、TS parser との IPC と source spans |

- Content Mapper は外部 process の API adapter なので、3 言語とも実装可能と考えられる。stdio と JSON を扱えることと、最新版 Content Mapper 契約に適合することは別であり、protocol fixture が必要。vibe には transport の実績があり、追加作業は独自 host 契約込みの配布にある。
- portable にするためブラウザ UI runtime を最初から Wasm にする必然性はない。resume の handler import、DOM 参照、state snapshot の復元は標準 JS に生成する。Wasm は compiler の配布手段として使い、アプリで使うかは計算処理の測定で別途決める。
- SSR は core を `render(props, sink, context)` として JS 出力し、Node/Bun/Deno/Workers の入口で Response/stream 等に包む。静的出力では build 時に同じ renderer を呼ぶ。adapter ごとに SSR ロジックを実装し直さない。
- compiler が Rust でも、生成した SSR/client ESM に native dependency がなければアプリの実行環境は Rust に縛られない。vibe でも同様で、compiler host の移植性と生成 application の移植性は別々に評価する。

### Gaps

- Oxc の CI は Wasm 利用の実績であり、本プロジェクトの pure browser Wasm compiler entry が既に動く証拠ではない。最初の spike で確認が必要。
- MoonBit の native/JS/Wasm 出力が可能という一般仕様から、ts.mbt 全体が全 backend 対応だとは結論できない。
- vibe の browser 組み込み向け安定した string-in/string-out library ABI を今回の調査では確認していない。

## 共通 IR と最初の比較実験をどう作るか

### Takeaway

同一の resume 契約をまず固定し、compiler を替えても同じブラウザ成果物が出る実験にする。コンパイラ実装言語を比較する実験と、resume runtime 自体の性能を比較する実験を混ぜない。

### Cited Findings

- AST/semantic/codegen の分離は Oxc に実際に存在する。— [Oxc parser](https://oxc.rs/docs/guide/usage/parser.html), [semantic](https://docs.rs/oxc_semantic/latest/oxc_semantic/), [codegen](https://docs.rs/oxc_codegen/latest/oxc_codegen/)
- source range に基づく parser と tooling の契約は vibe に公開され、stdio LSP が query functions を再利用している。— [parser contract](https://github.com/mizchi/vibe-lang/blob/main/lib/@vibe/parser/index.vpkg), [editor integration](https://github.com/mizchi/vibe-lang/blob/main/docs/user/reference/editor-and-debugging.md)

### Inferences

以下は全て新フレームワークへの**提案**:

- 独自 IR は `ModuleIR → ReactiveIR → ResumePlan → EmitPlan` と段階化する。必要な情報は symbol ID、source range、state cell、read/write、capture、DOM locator、handler symbol、serialization schema、branch/list instance ID。SSR/client/type view は共通の解析結果を使う。
- Type view は最適化後の DOM IR から逆算しない。元の型構文・式・source mapping を保持した semantic model の分岐から作る。DOM 更新の最適化が editor の型エラー位置を変えてはいけない。
- 初期の研究用 IR schema は JSON で可視化・差分可能にする。内部 pass を毎回 JSON 化する必要はなく、同一実装内では型付き IR、外部 adapter / 代替実装 / fixture の境界でだけシリアライズする。
- 最初の vertical slice は、SSR 初期値、局所 state、derived text、click handler、明示的な capture を持つ counter 一つ。起動時に component body を再実行せず、最初の click が対象 state と必要コードだけを復元し、text node を直接更新するところまで通す。
- Red: HTML/snapshot/handler symbol の対応 fixture、起動時 component 実行ゼロ、初回 click の復元、同型 counter 二つの instance 分離、capture 不能値への compile error を先にテストする。Green: 最小 codegen と loader を作る。Refactor: core/host を分離し、同じ fixture を Wasm 配布でも通す。
- いきなり3本の完全 compiler は作らない。Rust+Oxc で TS 埋め込みを含む一往復を測り、MoonBit または vibe を候補に残すなら同一 IR lowerer の範囲だけを置き換える。こうすると runtime の品質を揃えて言語の実装/配布コストを比較できる。
- compiler KPI: cold/warm latency、incremental invalidation、host+guest peak memory、配布サイズ、IPC/FFI の転送 bytes。application KPI: compressed JS と snapshot/HTML の合計、parse/execute、初回操作の network 込み latency、定常更新、DOM writes、retained memory。生成コードが同じならブラウザ速度は実装言語によって自動的には変わらない。
- 暫定採用案は **Rust+Oxc の pure compiler core + Wasm を共通配布 + 標準 JS の resume runtime**。根拠は TS 解析基盤と native/Wasm 経路の実績であり、未測定の「最速」ではない。作者の MoonBit 資産を重視するなら **MoonBit + ts.mbt parser の pure core 抽出**も実証する価値が十分ある。vibe は **effect を明示した独自 DSL と optimizer の dogfooding**を主目的とする場合に強い候補になる。

### Gaps

- 実装言語は未決定。上記は採用確定ではなく、resume 契約と portable entry を先に検証するための優先順位。
- KPI に数値目標は置いていない。比較対象と端末/ブラウザ/ネットワーク条件が未確定であり、限界値や他 framework 比を約束できない。
