# Fresh author evaluation v2: writer-b

参照範囲は `docs/prototype-guide.md` と `author-counter` / `author-action` の brief、および自分の成果物だけ。compiler / runtime / tests / grader 本体 / 正解 / 他の attempts は読んでいない。

## 初稿の根拠

### Counter

- brief の `Counter`、number prop `initial`、`count = initial`、`remaining = 100 - count`、click ごとに3加算をそのまま表現した。
- ガイドの例 `export client component Counter({ initial }: { initial: number })` を prop と component の構文に使った。
- ガイドの「`state` は mutable な保存対象候補です。初期化は SSR で行い、resume 時は再実行しません。」によって SSR 初期値からの再開の意図が明確になった。
- ガイドの「`derive` は純粋な式です。依存は解析され、循環を拒否します。」から remaining を derive にした。
- ガイドの「式の間の ` / ` も保持します。」と「`on click { ... }` は親要素の event handler です。`=`、`+=`、`-=` で state を変更します。」を表示と更新の根拠にした。
- 構文上の迷いは特になかった。ガイドの Counter 例との差分は derive の式と加算値のみ。

### Action

- brief で指定された schema / view / action / policy / operation 名を使った。
- ガイドの「`using request: RequestContext` | server の `host.context(request)` が現在の request から注入する。wire input には含めない」に従い、request は schema や action 引数に含めず using で宣言した。
- ガイドの「action の return 型は TypeScript と同じ `: DocumentView`。」を PublishedView に適用した。
- ガイドの「最初の引数は必ず grant。policy は `qualified.policy(request, input.resourceField)` の形です。`resourceField` は input schema 内の field で、`id` は必須の固定名ではありません。`input.noteId` 等も使えます。」によって、noteId を認可対象にできることと notes.publish の引数順が明確になった。
- ガイドの「`check` は policy/operation 名の構文と境界を検査し、host の実登録は調べません。」および「実行時には server host へ同名の policy/operation を登録する必要があり、未登録なら処理は成功しません。」から、ソースの受理だけでは実行成功を判断しない。
- policy の名前から業務条件を補完していない。ガイドの「policy の業務条件。名前だけから所有者判定等を推測しない」に従った。

## 検証

各課題で1 round、check 1回と grader 1回（計2呼出し）で終了した。両方とも成功したため候補の修正も追加実行もしない。

### author-counter — round 1

実行コマンド:

```sh
node tools/isle.mjs check evals/attempts/writer-b/counter.isle
node tools/eval.mjs author-counter evals/attempts/writer-b/counter.isle
```

check は exit 0、結果は以下。

```json
{"ok":true,"components":["Counter"],"actions":[]}
```

grader は exit 0、`pass: true`、`score: 5`、`total: 5`。以下の5項目はすべて `pass: true`。

- `client Counter`
- `button with click`
- `count state and remaining derive`
- `resume from 37`
- `resume from 5`

変更: なし。診断による修正: なし。ガイド行34–40の例、行46の「初期化は SSR で行い、resume 時は再実行しません。」、行47の「`derive` は純粋な式です。」、行50の「式の間の ` / ` も保持します。」、行51の「`+=`」で課題の実装が決まった。

残る曖昧さ: この課題の source 構文・求める挙動についてはなし。ガイド行9の「復元形式と実際の byte 数」は source から決まらないが、本課題に復元形式の指定はない。grader の `resume from 37` / `resume from 5` 成功を確認し、文書だけから実装の正しさを推測してはいない。

### author-action — round 1

実行コマンド:

```sh
node tools/isle.mjs check evals/attempts/writer-b/action.isle
node tools/eval.mjs author-action evals/attempts/writer-b/action.isle
```

check は exit 0、結果は以下。

```json
{"ok":true,"components":[],"actions":["publishNote"]}
```

grader は exit 0、`pass: true`、`score: 6`、`total: 6`。以下の6項目はすべて `pass: true`。

- `input schema`
- `output schema`
- `boundary schemas`
- `resource policy`
- `effect contract`
- `grant precedes mutation`

変更: なし。診断による修正: なし。ガイド行11の「server の `host.context(request)` が現在の request から注入する。wire input には含めない」、行81の return 型、行83の「`id` は必須の固定名ではありません。`input.noteId` 等も使えます。」により、request を入力に足したり resource field を id に変更したりする必要がないと明確に判断できた。行83の「最初の引数は必ず grant。」も brief と対応した。

残る具体的な不明点: host に `policy.notePublisher` / `notes.publish` を登録する手順や API 自体はこのガイドにはない。行85は「実行時には server host へ同名の policy/operation を登録する必要があり、未登録なら処理は成功しません。」と境界を明示しているため、これは source の迷いにはならなかった。今回の grader が報告した6項目の成功から、実際のログイン・host 登録・DB mutation まで動いたとは主張しない。

## 文書についての直接のフィードバック

- 明確になった箇所: 行46の「初期化は SSR で行い、resume 時は再実行しません。」が、client component の初期化を browser 側で繰り返さない意味を明示していた。
- 明確になった箇所: 行11の「wire input には含めない」が、request を client の入力 schema に入れない判断に直結した。
- 明確になった箇所: 行83の「`id` は必須の固定名ではありません。`input.noteId` 等も使えます。」が、RenameInput の例を PublishInput に適用するときの resource field 名の疑念を解消した。
- 明確になった箇所: 行85の「`check` は policy/operation 名の構文と境界を検査し、host の実登録は調べません。」が、check 成功の解釈を限定していた。
- 混乱した箇所: 今回の2課題の source 作成に関してはなし。未記載の host 登録手順は上記のとおり残るが、この課題の要求を妨げなかった。
