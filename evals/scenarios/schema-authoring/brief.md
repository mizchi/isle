# スキーマの記述方法を比較する

DSL 版と TS データ宣言 API 版で同じ変更を行います。参加者へ渡すのはこの brief、docs/schema-contracts.md、割り当てられた fixture 一つです。expect、solutions、他の参加者の attempts は読まないでください。

fixture の Registration を Passwords に変更し、password と confirmation の順に2個の string field を定義してください。どちらも8文字以上・64文字以下、confirmation は password と同じ値にします。変換、認証、非同期検証は schema に含めません。

- DSL 版: `evals/attempts/<run>/schema-dsl.isle`。`node tools/eval.mjs author-schema-dsl <file>` で採点します。
- TS 版: `evals/attempts/<run>/schema-ts.ts`。API の import はこの位置なら `../../../lib/schema.mjs`。default export し、`node tools/eval.mjs author-schema-ts <file>` で採点します。TS 版の採点は信頼するローカルコードを Node で実行します。

初回出力を保存して採点し、診断と修正ごとの出力を記録してください。所要時間、初回成功、修正回数、迷った記法、型補完の有用性を log.md に書きます。読解では「共通の値制約と action ごとの認可・非同期検証の違い」「どこで文字列長が数えられるか」を自分の言葉で説明してください。

比較時は担当形式を無作為に割り当てるか、実施順を半数ずつ入れ替えます。同じ参加者の2回目には学習効果があることを記録してください。ソースの bytes/行数は参考値で、書きやすさの点数にはしません。参加者評価は未実施です。
