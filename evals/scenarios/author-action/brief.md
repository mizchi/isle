# Server 境界を書く

`docs/prototype-guide.md` とこの課題だけを読み、自分の attempts directory の `action.isle` に書いてください。compiler、runtime、tests、evals/solutions、evals/expect、他の attempts、reports は読まないでください。

入力 PublishInput は string の noteId と body。出力 PublishedView は string の noteId と body。公開する server action の名前は publishNote。request context を client 引数から受け取らず、policy.notePublisher に request と input.noteId を渡して認可します。副作用は db.write、変更は notes.publish に認可 grant と input.body を渡し、await した結果を返します。

予算は check / grader の呼出し3回。各回の結果、変更理由、参照したガイドの行、迷いを `log.md` に残してください。

```sh
node tools/isle.mjs check <candidate.isle>
node tools/eval.mjs author-action <candidate.isle>
```
