# 静的部分と再開部分を読む

docs/runtime-size.md と、このディレクトリの fixture.isle を読んでください。実装、expect、過去の attempts は読まないでください。この課題は現在の v0 構文で実行できます。

初期値は Draft です。次のキーで `evals/attempts/<run>/static-split-answers.json` を作ってください。

- `entry`: クリックで再開する完全修飾名。
- `snapshotSlots`: 保存値として転送する props/state の名前を順番に並べた配列。
- `serverStateInitializers`: SSR 時に必要な state 初期化の名前を宣言順に並べた配列。
- `resumeRoot`: component の section / 動的な button のどちらが再開用 DOM root になるか。tag 名。
- `textNodePolicy`: split-into-three / preserve-single-node の一つ。
- `browserReinitializesState`: ブラウザーで初期化をやり直すか。boolean。
- `prefixInSnapshot`: prefix を snapshot に含めるか。boolean。
- `prefixInHandler`: prefix の文字列リテラルを handler に含めるか。boolean。

`node tools/eval.mjs static-split-intent <answers.json>` で採点できます。区別が難しかったもの、readonly の props とコンパイル時に確定する定数を混同した箇所を log.md に残してください。

記述の追加課題は、数値 state と不変の step を使うカウンターに書き換え、step も別イベントから更新する版と比較することです。前者では step の保存値が不要になり、後者では最新の step を共有して読む必要があります。実装の都合に期待値を合わせず、snapshot と explain で契約を確認してください。新課題の参加者評価はまだありません。
