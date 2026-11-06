# 制御構文と最適化の意味を読む

状態: 全体設計の読解評価。fixture.isle.next の resource / inline / union は未実装です。同期の実装範囲は fixture.isle と docs/control-flow.md 冒頭で確認できます。実行範囲の受入テストはあり、参加者評価は未実施です。

docs/control-flow.md と fixture.isle.next を読んでください。expect、solutions、実装、過去の attempts は読まないでください。products は空ではなく、key は一意とします。最初の expanded は true、mode は rows、Details は明示 resource を使います。

次の boolean / string を `evals/attempts/<run>/control-flow-answers.json` に保存します。

- `requiresStableKey`: For に安定した primitive key が必要か。
- `sameArmRecreatesDom`: 条件を再評価して同じ arm だった場合も DOM を作り直すか。
- `surchargeReconcilesItems`: raise で products の membership / key を比較し直す必要があるか。
- `surchargeUpdatesAllActivePrices`: raise では active な全行の price 表示が更新候補になるか。
- `reorderPreservesOwner`: 別操作で同じ key のまま並べ替えた場合、row owner を保持するか。
- `opaqueReplacementAlwaysCostsOnlyChangedRows`: TS 本文が新しい配列全体を返せば、key があるだけで常に O(変更件数) の仕事量になるか。
- `duplicateKeyPolicy`: 重複 key を見つけた場合。`reject-before-commit` / `last-wins` / `index-fallback` のいずれか。
- `catchRollsBackRpc`: ErrorBoundary が、完了した mutation RPC の副作用まで巻き戻すか。
- `failedTryIncludesFallbackCost`: 失敗した prepare と fallback の両方を費用に数えるか。
- `unusedDirectiveHelpersShip`: どの directive も使わない Counter に、汎用制御構文 helper を含めるか。
- `resumeRepeatsSetup`: SSR の active arm と key order から再開するとき、component 初期化をやり直すか。

`node tools/eval.mjs control-flow-intent <answers.json>` で採点します。key が保証する identity と、差分の計算量を混同した箇所、ErrorBoundary と通常の try の解釈の違いを log.md に残してください。正答は設計の意味と一致したことを表し、実装の保証にはなりません。

記述課題は行内へ Show を追加し、同じ key の行を move / remove / 再挿入したときに、どの owner と DOM を保持・破棄するか説明することです。削除前に始まった非同期処理が、再挿入した同じ key へ適用されない理由も書きます。記述 grader は未実装です。


実行できる範囲の記述課題には `fixture.isle` を使います。Controls の行に `<Show when={item.value > 10}>...</Show>` を追加し、20 の行だけに説明を表示してください。reverse 後にも説明とハンドラが正しい行を参照し、empty → restore 後には新しい DOM が作られることを確認します。`just control-check` を受入の入口にし、記述時間・コンパイル診断・修正回数を log.md に記録します。これは参加者の未実施課題で、自動採点はコンパイルと機能の正しさに限定します。
