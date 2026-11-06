# Content Mapper と vize から考える型付けとコンパイラ契約

## Content Mapper はどこまで型付けとエディタを担当できるか

### Takeaway
Content Mapper は未知拡張子の import に仮想型宣言を返すだけでなく、独自ファイル全体を仮想 TS/TSX と span map に変換し、埋め込み式の診断・補完・ナビゲーションを TypeScript に処理させられる。初期段階では独自 TypeScript 型検査器や完全な専用 LSP を持たず、言語の意味解析・仮想 TS 生成・構文サービスを分離する構成が有力。

### Cited Findings
- 2026 年 10 月 20 日の Microsoft 一次発表は TypeScript 7.1 **Beta**。Content Mappers はその機能として紹介され、非 TS ファイルから仮想表現と原文へ戻る領域マッピングを受け取る。CLI は `tsc --runExternalCode`、VS Code は workspace trust と mapper permissions が必要。安定版リリース済みと扱わない。[TypeScript 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)
- 一次ソースの設定型ではトップレベル `contentMappers` の要素に `package`、`extensions`、`options` があり、実行コマンドと依存 compiler options 等は npm package manifest から解決される。同一 mapper identity のプロセスは複数 project で共有される。[TypeScript contentmapper definitions](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/contentmapper/contentmapper.go)
- TypeScript の現行プロトコル契約は `initialize`、`openProject`、`closeProject`、`transform` を持ち、仮想ソース、位置マッピング、原文座標の mapper diagnostic、補助的な projection を扱う。原文全体を仮想 TS にする契約であり、単なる `.d.ts` ローダーとは異なる。[TypeScript host contracts](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/contentmapper/host.go)
- Round 2 PR で `protocolVersion` 数値交渉は削除され、capabilities に進む方針になった。原文範囲の重複マッピングを許し、declaration map を実装。合成 export の definition には mapper 側の明示的な mapping が必要。[Content mappers round 2](https://github.com/microsoft/TypeScript/pull/63936)
- vize の現行 mapper は UTF-8 位置を選択し、project lifecycle を扱い、`.tsx` 仮想ソースを出力する。Vue 原文内の hover / definition / rename / completions / diagnostics をホスト側へ渡す。独立した `.vue.ts` project の物理生成は不要。[vize Content Mapper guide](https://vizejs.dev/guide/content-mapper/index.html)
- 公開 main の実装でも `TransformParams` は `fileName`、`content`、`projectHandle`、initialize は位置 encoding を受ける。[vize protocol server](https://github.com/ubugeeei-prod/vize/blob/main/crates/vize/src/commands/content_mapper.rs)
- 現行の vize protocol tests は `.vue` の `const count = 1` を仮想テキストに残し、`extension: ".tsx"` と非空 mappings を返すことを検証する。旧 `scriptKind` / `protocolVersion` を response に出さないテストもある。[current mapper protocol tests](https://github.com/ubugeeei-prod/vize/blob/main/crates/vize/src/commands/content_mapper/tests.rs)
- TypeScript SpanMap は source-map の点列とは別の双方向領域 map。verbatim は文字列・長さを一致させ、atom は名前変換などに用い、alias は同一論理 entity を表す。virtual 側の span は順序付き・非重複で、原文側の overlap は可。rename 等の text edit は exact verbatim geometry を要する。各 segment の feature flags と診断の扱いは別で、診断は flags だけでは抑止できない。[SpanMap source and validation rules](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/spanmap/spanmap.go)
- staging の `microsoft/typescript-go` は終了し、ネイティブ TypeScript の開発先は `microsoft/TypeScript` に戻っている。[staging README](https://github.com/microsoft/typescript-go/blob/main/README.md)

### Inferences
- `.isle` の型付けは「props の `.d.ts`」で止めず、`state`、derived、handler、template expression、HTML property、子 component props、slot を仮想 TSX 内で検査する。式はできるだけ原文のまま残し、前後に検査用 helper を合成すると、原文位置への精密な写像を作りやすい。
- 専用の editor extension はまず拡張子・文法・mapper の登録を担う。独自構文の keyword completion、構文色分け、format、framework diagnostic、HTML/CSS 部分の支援は compiler frontend 側のサービスにする。TypeScript 領域の navigation と rename を二重実装しない。
- mapper を Vite の codegen と共通の parser / binding model 上に置くが、仮想 TS codegen を SSR/client codegen と混ぜない。型検査用コードが runtime に入る経路を設けない。
- 最小の型ビューは、原文の `state count: number = 0; <button on:click={(event) => count++}>{count.toFixed(true)}</button>` を、概念的に `let count: number = 0; checkButton({ onclick: (event: MouseEvent) => count++ }); void (count.toFixed(true));` のような TSX 仮想 module に投影する（これは説明用の未実装案）。`count.toFixed(true)` は verbatim segment で原文に戻し、`state` の除去や helper は合成区間とする。こうすれば `.isle` 内の不正引数が TypeScript diagnostic として原文へ戻る。単に export signature を生成するだけでは、この検査は発生しない。
- tsconfig の例は `{ "contentMappers": [{ "package": "@isle/compiler", "extensions": [".isle"] }] }`。初期段階は compiler / editor の既知の組合せを固定し、実ホストでの fixture と editor integration を CI へ追加する。
- mapper 非対応利用者・ライブラリ配布には、同じ component signature model から型宣言を出す fallback を作る。手書き `declare module '*.isle' { const x: any }` は型の意味を失うため fallback にしない。独自ファイル内部の精密診断まで `.d.ts` だけで代替できるとは約束しない。

### Gaps
- この調査ではインストール済み `typescript@beta` を実行していない。公式一次発表と現行ソースは確認済みだが、特定 npm patch と各 editor extension の相互運用は MVP で測定する必要がある。
- editor の HTML/CSS 補完が mapper だけでどこまで提供できるかは、実際の文法・mapping・補助 projection 次第。完成済みの体験と同一とは断定しない。

## vize から再利用すべき構成と、模倣しなくてよい範囲は何か

### Takeaway
参考にするべき中心は Rust の採用そのものより、「parser と意味解析を共有し、SSR / DOM / 型検査 / editor を別 backend にする」構造。新言語の意味論を一箇所で定義し、再開可能性に関する静的な制約をそこで検証する。

### Cited Findings
- vize のローカル checkout `3d3bebf79e3b490e0dab7a17343f2805df582b63` の設計資料は、Vue parser → shared AST → scope/binding analysis → backend という構造を示す。OXC は JS/TS parsing、SSR は hydration marker を含む文字列出力、Vapor は direct DOM を担当する。[vize architecture at inspected commit](https://github.com/ubugeeei-prod/vize/blob/3d3bebf79e3b490e0dab7a17343f2805df582b63/docs/content/architecture/overview.md)
- 同 checkout の `vize_canon` は Croquis の scope 情報から closure を組み立て、script と template の意味を virtual TypeScript に表す。`declare const` だけで template の lexical scope を近似する方式を避けている。[virtual TS generator](https://github.com/ubugeeei-prod/vize/blob/3d3bebf79e3b490e0dab7a17343f2805df582b63/crates/vize_canon/src/virtual_ts.rs)
- batch checker と language server が同じ原文座標を返すため、生成 offset から原文へ戻すロジックが共通化されている。狭い subspan の優先や、合成された文字列が原文範囲を越えない制限もある。[vize mapping implementation](https://github.com/ubugeeei-prod/vize/blob/3d3bebf79e3b490e0dab7a17343f2805df582b63/crates/vize_canon/src/virtual_ts/mapping.rs)
- Vapor には専用 IR と direct DOM 向け operations があり、template AST を直接 JS 文字列へ置き換えるだけの設計ではない。[Vapor crate exports and IR](https://github.com/ubugeeei-prod/vize/blob/3d3bebf79e3b490e0dab7a17343f2805df582b63/crates/vize_atelier_vapor/src/lib.rs)
- 公開 main の mapper server は framing と project 管理、変換 dispatch を分離している。[server](https://github.com/ubugeeei-prod/vize/blob/main/crates/vize/src/commands/content_mapper.rs), [dispatch](https://github.com/ubugeeei-prod/vize/blob/main/crates/vize/src/commands/content_mapper/dispatch.rs)

### Inferences
- `.isle` → lossless CST / source spans → AST → resolved UI model → lowered rendering/update/resume IR を用意し、(1) SSR (2) client update modules (3) snapshot/handler manifest (4) virtual TSX (5) CSS を出す。巨大な単一 IR に全ツールの事情を詰め込まず、source identity と binding identity を共通契約にする。
- OXC のような JS/TS parser は binding / scope / syntax 解析に使う。TypeScript の型は runtime purity、serializability、browser/server availability の証明にならない。`Serializable` という型 alias だけを根拠に closure capture を安全と見なさず、専用構文の制約と実行時 codec 検証を組み合わせる。
- vize の多機能性を最初から揃える必要はない。最初に必要なのは parser、binding model、二つの executable backend、型検査 projection、コード生成の parity と resume fixture。formatter / 独自 LSP / cross-file 最適化はこれらの契約を再利用して段階追加できる。

### Gaps
- local checkout は公開 main より古く、古い mapper は `protocolVersion: 1` を要求した。この旧実装を現行 API の仕様として使ってはいけない。
- vize の compile/build 性能の比較値は UI framework の browser runtime 性能を証明しない。ここでは backend 構造の根拠にのみ使用する。

## resume を前提として、どの契約をポータブルに固定すべきか

### Takeaway
ユーザーの追加方針は「resume をベースに、できるだけポータブルに」。compiler の実装言語・TypeScript 接続・SSR の実行ホストから切り離して、生成物が Web 標準の JS/ESM と HTML、明示的な Snapshot ABI で相互運用する設計を提案する。以下は設計提案であり、既存ライブラリの仕様ではない。

### Cited Findings
- TypeScript の mapper 自体は外部 executable と JSON-RPC でつながるため、実装言語に依存しないプロセス境界を利用できる。[TypeScript mapper definitions](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/contentmapper/contentmapper.go)
- vize は NAPI と WASM の binding layer を compiler core から分離している。この分離は native CLI、Node integration、browser tooling を独立して持つ構成例である。[inspected architecture](https://github.com/ubugeeei-prod/vize/blob/3d3bebf79e3b490e0dab7a17343f2805df582b63/docs/content/architecture/overview.md)

### Inferences
- 公開 contract を `CompileRequest / CompileArtifact / Diagnostics / SourceMap / ComponentSignature` と `Snapshot ABI` に限定する。内部の Rust arena AST や parser library の node shape を FFI/ユーザー向け API に露出しない。core は deterministic input/output、ファイル探索・watch・package resolution は host adapter に置く。
- SSR はまず HTML と snapshot を生成する portable ESM entry にする。Node 固有 filesystem / stream / Buffer を core の signature に入れない。`render(props, context) -> {html, snapshot, assets}` のように、request host と rendering semantics を分離する。後から Web Streams、Node、静的生成 adapter を載せる。
- client は ESM、DOM、標準イベント、dynamic import を基本とし、Wasm runtime を必須にしない。compiler の native/Wasm 配布と browser app の実行形式は別の選択である。全 compiler backend を同時実装する必要もない。
- Snapshot ABI v0 には format version / build identity、state object identity、codec tags、handler symbol と capture references、binding/location references、所有 scope と cleanup 関係を定義する。HTML marker、state table、handler manifest を SSR/backend の共有 lowered model から生成してズレを防ぐ。framework 内の closure オブジェクトを JSON 化するのでなく、抽出済み symbol + 明示 capture tuple とする。
- compile-time location は template の識別子、実行時 instance identity は loop key / ownership path を含む別識別子にする。静的 locator だけで実行時個数・順序が変わる list を一意に特定できるとはしない。
- build 中に選んだ codec / handler ID を snapshot と client が同じように解釈する契約を設ける。build identity の不一致は silent resume を避けてエラーまたは明示 reload にする。server-only state は graph の到達性にかかわらず snapshot へ出さない境界を型・構文で定義する。
- MVP の契約テストは (1) malformed snapshot / unknown codec / build mismatch を拒否する Red (2) SSR HTML の既存 Node identity を保って初回 click で再開する Red (3) handler 引数/props/template expression の型エラーが原文位置へ戻る Red (4) capture 不能値と未解決依存を compile error にする Red。Green 後に backend を分割・最適化する。この順番なら resume を後付け hydration モデルへ押し込まずに検証できる。

### Gaps
- ABI は未実装・未測定である。snapshot の圧縮率、参照復元コスト、初回 event 遅延、marker 数を fixture で測ってから serializability の許容集合と chunk 単位を決める。
- arbitrary npm module の副作用・動的 property access・未知の関数 call まで完全静的解析できるという前提は置かない。独自文法で許す意味論と opaque JS 境界の制約を、言語仕様として先に決める必要がある。

### ユーザー方針の確定による追記
- ユーザーは「resume をベース」「できるだけポータブル」「Qwik の TSX と `$` 関数に対する独自プリプロセスが運用を難しくしているため、専用文法で分かりやすくしたい」「制約してよい」と明言した。これを以後の設計の前提とする。静的に解析できない capture / phase / effect を compile error とし、必要な箇所に明示的な client 境界を要求することは、ユーザー了承済みである。
- `state` / `derive` / `on` を専用の構文カテゴリにし、状態宣言、純粋な導出、イベントによる変更・副作用を構文上で区別する方針とする。具体的な表記は今後確定するが、JS 関数名や `$` suffix を後から推測して境界にする設計を避ける。
- parser の source span と binding ID を基に、独自の phase / capture / effect analysis を実行する。TypeScript による props・式・handler 引数の型検査とは責務を分ける。独自診断は `code / message / primary source span / related spans` を持ち、Content Mapper の原文座標 diagnostic と CLI に同じ内容を返す。例えば「server-only binding が handler に capture された」「derive が state を変更する」「resume 境界を跨ぐ値の codec がない」を、該当する原文と宣言位置へ報告する。
