# Reader B — fresh reader evaluation v2

許可された `docs/prototype-guide.md`、`evals/scenarios/intent/brief.md`、`evals/scenarios/intent/fixture.isle` だけを読んだ。compiler/runtime/tests/期待値/解答/他 attempts は読まず、explain/check も実行していない。以下の回答を確定してから grader を一度だけ実行する。採点後に回答は変更しない。

## 回答の根拠

| キー | 回答 | fixture または guide の短い引用と読み取り |
| --- | --- | --- |
| serverComponents | `["Heading"]` | fixture: `export server component Heading`。宣言から判別できる。 |
| clientComponents | `["Counter"]` | fixture: `export client component Counter`。宣言から判別できる。 |
| rpcActions | `["renameDocument"]` | fixture: `export server action renameDocument`。guide は `server action` を「外部から直接呼べる RPC entry を登録する」と定義する。 |
| policy | `policy.documentEditor` | fixture: `authorize grant = policy.documentEditor(request, input.id)`。policy 名をそのまま読む。 |
| authorizationTarget | `input.id` | fixture: `policy.documentEditor(request, input.id)`。guide: 「その field の resource に対する policy の成功が必要」。 |
| requestFromClient | `false` | fixture: `using request: RequestContext`。guide: 「server の `host.context(request)` が現在の request から注入する。wire input には含めない」。 |
| responseFields | `["id", "title"]` | fixture: `view DocumentView { id: string; title: string; }`。field 名はソースに明示されている。 |
| clientSetupReruns | `false` | guide: 「初期化は SSR で行い、resume 時は再実行しません」。fixture の `state count = initial;` に適用する。 |
| firstClick | `[38, 76]` | fixture: `state count = initial;`、`derive doubled = count * 2;`、`on click { count += 1; }`。37 から count は38、doubled は76。guide: 「同期 handler の中の state 更新が終わったら、影響する binding を生成済みコードで更新します」。 |
| browserCanChoosePrincipal | `false` | guide: 「server の `host.context(request)` が現在の request から注入する。wire input には含めない」。加えて「server runtime は直接 request に対しても入力、request principal、resource policy、出力を検査します」。fixture の wire schema は `id` と `title` のみ。payload で request principal を指定する契約はない。 |

## ソースだけで読めた事実と、ガイドに依存した意味

- ソースから直接読めたのは component の実行側と名前、action 名、policy 名と引数 `input.id`、view の field、state/derive/handler の数式である。通常の加算・乗算の読み方なら最初の click の数値も計算できる。
- action が直接 RPC entry になること、`using` が wire input ではないこと、resume で state 初期化が再実行されないこと、更新の反映タイミング、principal が server context に由来することはガイドの意味規則に依存する。構文の見た目だけから保証したとは扱わない。
- `browserCanChoosePrincipal: false` はこの言語契約についての回答である。実ログインや host 実装の安全性をソースだけで証明したという主張ではない。guide は「ログイン方式と principal の生成実装」をソースだけでは決まらないものとしている。

## 記法の security/performance 含意

意味規則表は過大な推測を明示的に抑えており、今回の読み取りで保証を広げる必要はなかった。ただし、表記だけでは次の誤読が起こりうる。

- `policy.documentEditor` は document の所有者や編集者を実際に検査するという語感を持つ。しかし guide は「policy の業務条件。名前だけから所有者判定等を推測しない」と明示する。今回の回答は名前と対象の特定まで。
- `effects { db.write }` から adapter の副作用が完全に閉じているとは言えない。guide の「adapter 本体の副作用を完全に証明するものではない」に従う。
- `view DocumentView` は field 名の境界であり、返す `title` の値が安全・公開可能であることの証明ではない。guide: 「field の値が公開可能かを一般に自動証明するものではない」。
- `client component` と resume で初期化を繰り返さない契約から、必ず byte 数が小さい、必ず速いとは結論しない。guide は「復元形式と実際の byte 数」を未決定とし、runtime/host が契約を満たす検証も別としている。

採点結果は `results.json` に保存する。回答の採点後修正は行わない。
