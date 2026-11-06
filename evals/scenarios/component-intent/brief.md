# Component の境界と props を読む

docs/prototype-guide.md と fixture.isle を読んでください。実装、expect、solutions、過去の attempts は読まないでください。

`evals/attempts/<run>/component-answers.json` に次のキーで回答します。

- `labelPhase`: Label の実行側の契約。`universal` / `server` / `client` のいずれか。
- `serverNotePhase`: ServerNote の実行側の契約。同じ選択肢。
- `counterPhase`: Counter の実行側の契約。同じ選択肢。
- `universalInfersClient`: Label に state / on を追加すると、自動で client になるか。boolean。
- `universalHasSnapshot`: Label を通常の resume mode で描画すると、保存状態が生成されるか。boolean。
- `propsArePositional`: Counter への値の受け渡しは、名前ではなく引数の順番で決まるか。boolean。
- `directPropsReadOnly`: initial 自体をイベントから代入できないか。boolean。
- `legacyEquivalent`: `Counter({ initial }: { initial: number })` は同じ props 契約になるか。boolean。
- `destructureColonIsType`: TS の `({ initial: number })` の number は、initial の型注釈か。boolean。
- `counterAfterClick`: initial=5 の Counter を1回クリックした表示。string。

`node tools/eval.mjs component-intent <answers.json>` で採点できます。どちらの側でも使える宣言と、実行側を省略して推論する宣言を混同した箇所、props のキーと型を読む際に迷った箇所を log.md に残してください。

記述課題は、Label に `count: number` を追加し、title と count を表示することです。次にイベントを追加する場合の宣言変更を説明してください。デフォルト値や optional props の追加は課題に含めません。参加者評価はまだ実施していません。
