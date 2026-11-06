# writer-a 著者評価ログ

## 閲覧範囲と進め方

閲覧した既存ファイルは docs/prototype-guide.md、evals/scenarios/author-counter/brief.md、evals/scenarios/author-action/brief.md のみ。その他はこの attempts directory に自分で作ったファイルだけを対象とする。compiler/runtime/tests/grader/expect/solutions のソース、他著者の候補・レポートは読まない。完成済み compiler を使う。課題の条件は変更しない。

各課題は check と grader を組にしたラウンドで記録し、3ラウンド以内、成功時点で停止する。初回候補はガイドの例に課題の名前と式を当てはめる。

## Counter: 初回候補

新規 counter.isle の1–9行を作成した。ガイド21–29行の Counter 例を基に、3行の derive を remaining = 100 - count、6行の更新を count += 3、7行の表示を {count} / {remaining} にした。初期値は課題で指定された initial を2行で参照し、37を埋め込まない。

根拠となった原文:

- ガイド22行: `state count: number = initial;`
- ガイド23行: `derive doubled: number = count * 2;`
- ガイド34行: 「`derive` は純粋な式です。依存は解析され、循環を拒否します。」
- ガイド35行: 「型は `number/string/boolean`。式は literal、変数、括弧、`+ - * /`。」
- ガイド37行: 「`on click { ... }` は親要素の event handler です。`=`、`+=`、`-=` で state を変更します。」

構文・説明の迷い: ガイド36行の「通常の要素・text・`{式}`」には、テンプレートの改行・字下げを表示テキストとして保持するかという説明がない。課題の「一つの button の表示は `count / remaining`」が空白を含めて厳密一致なのかは判断しづらい。今回はガイド27行の `{count} / {doubled}` と同じ置き方にした。初回で成功しても、この空白の扱いはガイドだけでは確定できない。

## Server action: 初回候補

新規 action.isle の1–10行を作成した。ガイド55–64行の action 例を基に、1–2行の契約を PublishInput/PublishedView と noteId/body、4行の名前を publishNote、6行の policy を policy.notePublisher(request, input.noteId)、9行の操作を notes.publish(grant, input.body) にした。request を input のフィールドに入れず、5行の using 節で注入する。

根拠となった原文:

- ガイド55行: `schema RenameInput { id: string; title: string; }`
- ガイド56行: `view DocumentView { id: string; title: string; }`
- ガイド59行: `using request: RequestContext`
- ガイド61行: `effects { db.write }`
- ガイド67行: 「action の return 型は TypeScript と同じ `: DocumentView`。」
- ガイド69行: 「`using request` は server が注入する context、`authorize grant` は対象 resource の許可、`effects` は宣言する能力です。」
- 同69行: 「body は `return await qualified.operation(grant, input.field, ...);` に限定します。最初の引数は必ず grant。policy は `qualified.policy(request, input.id)`。」

構文・説明の迷い: ガイド69行は操作の引数を `input.field` と一般化している一方、policy の説明は `input.id` と固定名に見える書き方になっている。`id` というフィールドが必須なのか、任意の resource ID field が使えるのかが曖昧。課題には noteId と明記されているため input.noteId と解釈した。同じ行の「実装する host adapter は別途登録します。」には、この候補で未登録の policy.notePublisher や notes.publish が静的検査で許可されるかの説明がない。今回は課題が指定した名前をそのまま記述し、登録実装は追加しない。

## 検証結果

### Counter: ラウンド1

1. `node tools/isle.mjs check evals/attempts/writer-a/counter.isle`
   - exit code: 0
   - 返却値: `{"ok":true,"components":["Counter"],"actions":[]}`
   - diagnostics は返らなかった。候補の変更なし。
2. `node tools/eval.mjs author-counter evals/attempts/writer-a/counter.isle`
   - exit code: 0、`pass: true`、`score: 5`、`total: 5`
   - `client Counter`: pass
   - `button with click`: pass
   - `count state and remaining derive`: pass
   - `resume from 37`: pass
   - `resume from 5`: pass
   - 成功したため停止。ラウンド2・3は実行しない。

ラウンド後の変更行: なし。変更を促す診断はなかった。ガイド36行のテンプレート空白規則が不明な点は残るが、課題の採点は通過した。

### Server action: ラウンド1

1. `node tools/isle.mjs check evals/attempts/writer-a/action.isle`
   - exit code: 0
   - 返却値: `{"ok":true,"components":[],"actions":["publishNote"]}`
   - diagnostics は返らなかった。候補の変更なし。
2. `node tools/eval.mjs author-action evals/attempts/writer-a/action.isle`
   - exit code: 0、`pass: true`、`score: 6`、`total: 6`
   - `input schema`: pass
   - `output schema`: pass
   - `boundary schemas`: pass
   - `resource policy`: pass
   - `effect contract`: pass
   - `grant precedes mutation`: pass
   - 成功したため停止。ラウンド2・3は実行しない。

ラウンド後の変更行: なし。変更を促す診断はなかった。`input.noteId` を使う解釈は通過したが、ガイド69行の `input.id` が例か制約かの区別と、host adapter の登録が静的検査に必要かの説明は不足している。

## 完了結果

両課題とも1ラウンド（check 1回、grader 1回、計2呼出し）で成功。候補の初回作成後にコード修正は行っていない。課題の固定条件および閲覧・編集範囲の未達はない。採点成功から compiler/runtime 全体の保証は推論しない。
