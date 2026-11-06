# 大きめのアプリの境界を読む

benchmarks/dashboard/README.md、model.mjs、../variants/isle/dashboard.isle、../variants/isle/vite.dashboard.config.mjs を読んでください。expect と実装 runtime、他の参加者の試行は読まないでください。

`evals/attempts/<run>/dashboard-answers.json` に回答します。

- `workItems`: 独立した作業項目の数。number。
- `scopes`: フォームを含む Isle scope 数。number。
- `planPolicy` / `planTarget`: 作業保存の policy 名と入力の target field 名。
- `asyncValidationOwner`: 非同期の project 検証を宣言する場所。`schema` または `action`。
- `descriptionInSnapshot`: 静的な description を snapshot に保持するか。boolean。
- `firstClickRestoresAllItems`: 初回操作で全作業項目を復元するか。boolean。
- `nativeNotesNeedHandler`: Delivery notes の開閉に framework handler が必要か。boolean。
- `filterMutatesReactiveList`: チーム切替が framework の動的リストを書き換えるか。boolean。
- `preflightReplacesSubmissionValidation`: 検証 endpoint が成功したら、送信時のサーバー検証を省けるか。boolean。

`node tools/eval.mjs dashboard-intent <answers.json>` で採点できます。

記述課題では、作業項目に「時間を2増やす」名前付き entry と「予定分数」の派生表示を追加してください。元ファイルを変更せず、attempt directory にコピーして作業します。description / title / team を新しい capture に含めないこと、時間と金額と差分が一緒に更新されること、他の項目が変わらないことを確認してください。初回成功、診断、修正回数、迷った境界を log.md に記録します。参加者評価は未実施です。
