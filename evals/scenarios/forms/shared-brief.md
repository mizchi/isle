# 共通 schema と Form の寿命を読む

docs/forms.md と shared.isle を読んでください。実装、expect、過去の attempts は読まないでください。`just dev-schema-form` で試せます。

`evals/attempts/<run>/shared-form-answers.json` に、次を答えてください。

- `schema` / `action`: Form が参照する schema と server action の名前。
- `validationOwner`: 非同期検証を持つ宣言は `schema` と `action` のどちらか。
- `validationRunsAfterAuthorization`: 非同期検証は認可を通った後に呼ばれるか。boolean。
- `schemasCanShareDifferentValidators`: 同じ schema の別 action が別の非同期 validator を持てるか。boolean。
- `validationOnlyCanWrite`: 検証専用 request が operation の commit を呼ぶか。boolean。
- `submissionRevalidates`: preflight に成功した後も送信時に再検証するか。boolean。
- `uncheckedCheckbox`: 未チェックの checkbox を型付き FormData に変換した値。boolean。
- `fieldValuesInComponentSnapshot`: field の値を component snapshot に重複保存するか。boolean。
- `pendingBeforeImport`: 初回 import 前から二重 submit を止めるか。boolean。
- `staleValidationApplies`: 古い入力の検証完了が新しい入力のエラーを上書きするか。boolean。
- `resetRollsBackServerWrites`: reset が既に完了した server 書き込みを戻すか。boolean。
- `nativePostUsesServerRules`: JS 無効の native POST も同じ server 検証を通るか。boolean。

`node tools/eval.mjs shared-form-intent <answers.json>` で採点できます。

記述課題は、email/confirmation を password/confirmation に変更し、8文字以上・64文字以下・同じ値という契約を schema に置き、password 表示、ラベル、Reset を維持することです。action の validate 宣言は外し、2つの Form の独立性、相関エラー、native POST、reset を確認してください。追加した HTML 制約が schema と矛盾した場合の診断も記録してください。参加者評価は未実施です。
