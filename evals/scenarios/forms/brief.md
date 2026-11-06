# Form・検証・アクセシビリティを読む

docs/forms.md と fixture.isle を読んでください。実装、expect、過去の attempts は読まないでください。現行 v0 で実行でき、`just dev-form` で試せます。初期値 initial は空文字列です。

次のキーで `evals/attempts/<run>/form-answers.json` を作ってください。

- `submissionEntry`: submit の完全修飾 entry 名。
- `snapshotSlots`: snapshot に入る props/state 名を順番に並べた配列。
- `eventValueCapturedAt`: dispatch / after-import のどちらか。
- `preventDefaultBeforeImport`: submit を import 前に取り消すか。boolean。
- `nativeValidationWithoutJs`: SSR 専用でも必須・メール形式の検証が働くか。boolean。
- `checkboxEventField`: checkbox の状態を読む event の field 名。
- `placeholderIsLabel`: placeholder だけでラベル検査に通るか。boolean。
- `browserValidationReplacesServerChecks`: ブラウザー検証で server の入力検査・認可を省けるか。boolean。
- `a11yChecksProveWcag`: 検査成功だけで WCAG 適合を保証するか。boolean。

`node tools/eval.mjs form-intent <answers.json>` で採点できます。

記述課題は、メール入力を必須のユーザー名に変更し、3文字以上・12文字以下の英小文字という制約、可視ラベル、説明、エラーの関連付けを付けることです。新しい form を2つ mount し、JS 無効、不正入力、連続入力、Tab/Enter の操作を確認してください。エラー文はブラウザーの言語で変わるため、固定の英文に合わせないでください。迷った構文と修正回数を log.md に記録してください。参加者評価は未実施です。
