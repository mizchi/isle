# 値のスキーマと action の契約

スキーマは、通信可能な値の形と意味が固定された制約を表します。認可、非同期検証、DB 操作、任意の変換は action / host 実装へ分けます。TS と MoonBit の間で共有する小さな契約言語として維持し、汎用のバリデーション言語には広げません。

正規化した Schema IR の型は `lib/schema-contracts.d.ts`、正規化は `lib/schema.mjs` の `toSchemaIR()` です。MoonBit frontend の診断用 source span と `optional: false` を除き、名前・kind・field・制約だけにします。field と制約の宣言順は、検証結果の順序として保持します。Form の client descriptor と server adapter はこの契約を使います。

宣言データの構造検査と正規化は build/server 側の `lib/schema-normalize.mjs` に置き、browser へ配信しません。入力値の検証は browser / server の共通 validator に残します。

## DSL の範囲

```isle
schema Registration {
  email: string minLength(3) maxLength(80) format("email");
  confirmation: string sameAs(email);
}

view Registered { email: string; }
export server action register(input: Registration): Registered
  using request: RequestContext
  authorize grant = policy.signup(request, input.email)
  validate accounts.available effects { db.read }
  effects { db.write }
{ return await accounts.register(grant, input.email); }
```

`validate` は省略可能な action の契約です。同じ Registration を別の action が使っても、検証は継承されません。各 action が自身の policy、validator、operation を明示します。validator の `effects { db.read }` と、operation の `effects { db.write }` は別の宣言です。

順序は decode → 共通の同期制約 → authenticate → authorize → 任意の非同期検証 → authorize 再確認 → prepare → authorize 再確認 → commit → output 検査です。検証専用 endpoint は非同期検証後の認可再確認までで返し、prepare / commit は呼びません。非同期検証の結果は、権限失効後には開示しません。送信時も preflight を信用せず再検証します。

以前の `schema ... async validate ...` は `E_SCHEMA_VALIDATION` で拒否し、action の authorize の後へ移す診断を返します。v0 の構文・IR の変更なので、compiler と adapter は一緒に更新してください。古い schema 上の validation メタデータを `toSchemaIR()` に渡した場合も拒否します。

対応する値は required の string / number / boolean、制約は minLength / maxLength / min / max / integer / equals / sameAs / pattern / format("email") です。文字列長は UTF-16 code units、integer は安全な JS 整数、number は有限値で負のゼロを含みません。equals(-0) も拒否します。optional、配列、object、任意の predicate、coercion、transform は現在受け付けません。pattern は ES2023 と HTML の共通部分に限定します。

## TS データ宣言との比較

```ts
import { defineSchema, type InferSchema } from '../lib/schema.mjs';

const Registration = defineSchema('Registration', {
  email: { type: 'string', minLength: 3, maxLength: 80, format: 'email' },
  confirmation: { type: 'string', sameAs: 'email' },
});
type RegistrationInput = InferSchema<typeof Registration>;
```

これは同じ Schema IR を作る実験用の入口です。制約の型、参照 field 名・型、未知の rule を型検査し、実行時にも不正な descriptor を拒否します。返す IR は入力と参照を共有しません。

**TS モジュールの静的抽出、`.isle` から外部 schema の import、Content Mapper、MoonBit の schema 宣言 API は未実装です。** 現段階ではビルド側の通常の JS/TS として宣言を評価し、DSL が作る IR との一致を比較します。データ API の制約は、呼び出す TS コード全体の副作用を禁止する sandbox を意味しません。この API を browser へ配信する必要はありません。

任意の schema library を採用しても、変換・独自関数を黙って落としてこの IR に変換してはいけません。将来の adapter は対応する共通部分だけを受け付け、表現できない部分を診断する方針です。アプリの業務検証は registered host validator に残します。

## 検証と評価の範囲

- `tests/action-validation.test.mjs`: 同じ schema の action ごとに validator を選び、認可失敗時は実行せず、client へ helper 名・effects を送りません。
- `tests/schema-ir.test.mjs`: DSL / TS の IR と検証結果の一致、未知の規則・矛盾・入力の別名参照を検査します。
- `tests/types/schema.mts`: 値型の推論と、不正な制約・参照の型エラーを確認します。`just check-types` を CI に含めます。
- `evals/scenarios/schema-authoring/brief.md`: 同じ変更を DSL / TS で書く課題です。正解例と故障例で grader を確認しています。参加者による書きやすさの評価は未実施です。

今回の差分は、値契約の分離と action による validator 選択です。既存の veri 有限モデルが扱う owner / 認可 / commit / Form の寿命は変更せず、選択の違いは実装の回帰テストで確認します。既存モデルの成功を、新しい schema frontend 全体の形式証明とは扱いません。文字列・数値・regex の全入力に対する DSL / TS の等価性も、現在のテストだけでは証明していません。

制約は現在、共通 runtime の `createValidator()` が一度処理して検証関数を作ります。schema ごとの完全なコード生成、native validation との意味の一致を条件にした client 検証の省略は後続です。スキーマの記法を採用しただけで、それらの最適化が完成したとはしません。
