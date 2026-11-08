# Form とアクセシビリティ

現行 v0 で入力、submit、HTML 標準の制約検証、ラベルと参照の静的検査を実装しています。`just dev-form` で http://127.0.0.1:4190/ を開けます。[実行するソース](../evals/scenarios/forms/fixture.isle)は読解・記述課題とも共用します。

共通 schema、相関・非同期検証、型付き FormData、server error、pending/reset まで扱う版は **`just dev-schema-form`（4191）** です。[ソース](../evals/scenarios/forms/shared.isle)と[デモ host](../examples/schema-form/host.mjs)を参照してください。下の primitive event 形式も引き続き使えます。

```text
state email = initial;
state invalid = false;
state error = "";
state submitted = "";

<form aria-label="Signup">
  on submit save { submitted = email; }
  <label for="email">Email address (required)</label>
  <input id="email" type="email" required minlength="6" value={email}
    aria-invalid={invalid} aria-describedby="email-help email-error">
    on input edit {
      email = event.value;
      invalid = event.invalid;
      error = event.validationMessage;
    }
    on invalid report {
      invalid = event.invalid;
      error = event.validationMessage;
    }
  </input>
  <p id="email-help">Use your work email.</p>
  <p id="email-error" aria-live="polite">{error}</p>
  <button type="submit">Save</button>
  <output aria-live="polite">{submitted}</output>
</form>
```

上は component 内の抜粋です。v0 の `on` は対象要素の内側に書くため、input にも DSL の閉じ tag を書きます。生成 HTML は void element の input に閉じ tag を出力しません。

## 入力と再開の契約

`event` は handler 内だけの予約参照です。入力、select、textarea の input/change/invalid entry で `event.value: string`、`event.invalid: boolean`、`event.validationMessage: string` を読めます。checkbox/radio では `event.checked: boolean` も読めます。DOM Event 全体や任意 property は渡せません。

loader はイベント発生時に primitive を捕捉し、runtime/handler の import 後に DOM から読み直しません。値は一回の呼び出しだけに渡し、snapshot の slot に加えません。更新が待機中でも新しいユーザー入力を上書きせず、同じ値の再代入で selection を動かさないようにします。内部では source control の DOM identity を保持しますが、ソース言語や保存形式には公開しません。

同一 owner の entry は順番に実行します。submit 本文は先行 input/change の commit 後の state を読みます。DOM を直接変更しただけで input/change を発生させない外部 script の値を、自動で state と同期する契約ではありません。

input の value / checked、textarea の text content、select の option selected を SSR 時点で設定します。textarea の先頭改行も HTML parser の規則に合わせます。value を束縛する select の初期値は、明示した option value のいずれかである必要があります。現在の保存値は primitive なので、複数選択値・File の取り込みは未実装です。

## 検証と submit

`required`、`type="email"` 等の形式、`minlength/maxlength`、`min/max/step`、`pattern` は標準 HTML の検証を使います。JS 無効・SSR 専用でも働きます。`required={false}` 等の false boolean 属性は出力せず、`required="false"` はコンパイルエラーにします。長さ・行列数は静的な整数 literal、pattern は静的な文字列に限定します。矛盾した静的上下限、不適切な対象要素、pattern の構文を検査します。Unicode sets の正規表現は Node 24 backend で検査し、独自の検証 runtime は送信しません。

通常の submit はブラウザーの対話的制約検証後に発火します。loader は接続した submit entry の既定動作を同期的に取り消し、標準 `reportValidity()` を再確認してから処理をキューへ入れます。合成 submit に対しても検証を省きません。invalid は capture listener で受け取ります。エラー文は UA の言語・実装で変わり、英語の固定メッセージを契約にしません。([HTML 制約検証と送信](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-submission-algorithm))

`mode: 'ssr'` では handler / marker / snapshot / JS を出さず、native validation は残します。このデモの submit は表示更新だけで、データを server へ送信しません。既存の明示 remote action は使えますが、server 側の schema・policy・認証 context の検査を省く根拠にはなりません。

## 静的なアクセシビリティ検査

MoonBit frontend が最適化前に次を検査し、失敗した要素の UTF-16 source span を返します。

| 検査 | 診断 |
|---|---|
| 可視 control に label、aria-label、aria-labelledby がない／空 | E_A11Y_LABEL |
| placeholder だけをラベルとして使う／一つの label に複数 control | E_A11Y_LABEL |
| local id の重複・空白・動的な id/reference | E_A11Y_ID |
| for、aria-labelledby/describedby/errormessage の参照切れ | E_A11Y_REFERENCE |
| label の参照先が control でない／hidden input | E_A11Y_REFERENCE |
| form 内の button の type 省略／form の入れ子 | E_FORM_BUTTON_TYPE / E_FORM_NESTING |

local id と参照は mount ごとに `isle-<encoded-scope>:<local-id>` に変換します。2つの同じ component でも関連付けが混ざらず、SSR 専用にも同じ規則を使います。component 内の id/reference は静的文字列に限定し、component 外の id や外部の `#id` CSS selector をそのまま接続する機能はありません。class でのスタイリングは変換しません。

静的検査でラベルの業務上の適切さ、動的文字列の常時非空、実際の発話、色・フォーカス等の全ては判定できません。標準 label を基本とし、説明・エラーとの接続を検査します。([WAI の labeling controls](https://www.w3.org/WAI/tutorials/forms/labels/))

## CI とモデル

`just a11y-form` は production デモをビルドして一時 preview を起動し、vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions / contrast / touch / focus の8 gate を実行します。`just ci` に含みます。結果と desktop/mobile の初期・エラー時の画像は [evals/results/forms](../evals/results/forms/summary.json) に保存します。これはデモの受入検査で、任意のアプリの WCAG 適合を保証するものではありません。

MoonBit/veri 0.2.1 の forms model は、入力または submit 一回、2つの DOM/validity の組、import 一回の22状態を全探索します。入力を import 後に再取得、既定動作の取消を延期、検証を省略する3故障版の反例も再生します。対応する順序は production の [Playwright テスト](../e2e/forms.spec.mjs)で確認します。DOM / native validation / 全 UI を形式証明したモデルではありません。

## 共通 schema を使う Form

```text
schema Registration {
  email: string minLength(3) maxLength(80) format("email");
  confirmation: string minLength(3) sameAs(email);
  age: number min(18) max(120) integer();
  accepted: boolean equals(true);
}

view Registered { email: string; }
export server action register(input: Registration): Registered
  using request: RequestContext
  authorize grant = policy.signup(request, input.email)
  validate accounts.available effects { db.read }
  effects { db.write }
{ return await accounts.register(grant, input.email); }

// client component 内。register は Registration を入力に取る明示 server action。
<form schema="Registration" submit="register" aria-label="Create account">
  <label>Email (required)<input name="email" /></label>
  <label>Confirm email (required)<input name="confirmation" /></label>
  <label>Age (required)<input name="age" value="21" /></label>
  <label><input name="accepted" />I agree (required)</label>
  <button type="submit">Create account</button>
  <button type="reset">Reset</button>
</form>
```

schema が制約の正本です。各 field に静的な name を持つ control が一個ずつ必要で、余分な control、重複名、矛盾する HTML 制約、form の入れ子、手書き handler との混在はコンパイルエラーにします。純粋な component で control をまとめられますが、同じ schema Form の control 群を別 client owner や未確定の children に分割することはできません。named button や、framework が使う form DOM API を隠す field 名も拒否し、JS/native POST の入力差や DOM clobbering を防ぎます。型から input type を決め、length/range/pattern、必要な required 属性を投影します。string の password/search/tel/hidden は表示形式として指定できます。動的な control shape、disabled/multiple の field、File はこの契約に含めません。

対応する制約は minLength/maxLength、min/max、integer、equals、sameAs、pattern、format("email") です。integer は JavaScript の安全な整数、文字数は UTF-16 code units です。shared pattern は ES2023 の Unicode (u) と HTML pattern の両方で有効な全体一致に限定し、set 演算・inline flag は拒否します。email は HTML の ASCII grammar に合わせ、入力の trim や任意の coercion はしません。([HTML の email 定義](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address))

制約・名前・型を小さい descriptor に投影し、同じ `createValidator()` で browser と server を検査します。validator は契約のコピーを所有します。server-only helper 名・effects・request context を client descriptor に送りません。schema Form 専用の capture 処理と遅延 runtime は、使わない build から除去します。

### 認可付きの非同期検証

action の authorize の後の `validate accounts.available effects { db.read }` は、host の同名 validator を使う宣言です。schema は値の形と同期制約だけを持ち、同じ schema を使う別の action の検証には影響しません。省略した action は非同期検証を呼びません。[Schema IR と TS 宣言の比較](schema-contracts.md)も参照してください。登録例は次の形です。

```js
validators: {
  'accounts.available': {
    effects: ['db.read'],
    async validate({ input, context, permit, signal }) {
      return await exists(input.email, signal)
        ? [{ field: 'email', code: 'taken' }]
        : [];
    }
  }
}
```

input は freeze した primitive record、context と permit は server 側で作ります。公開できる結果は宣言 field と短い code だけで、未登録 adapter、宣言外 effect、不正な field/結果は拒否します。db.read は trusted host の宣言であり、本体が書き込まないことを compiler が証明した意味ではありません。

ブラウザーの同期検証を通った後、150ms の debounce と AbortController を使って `POST /__isle/validate/<action>` を呼びます。これは action と同じ入力・認証・resource policy を検査し、operation の prepare/commit は呼びません。検証待ち中に権限が失効したら、結果を返す前の policy 再検査で拒否します。相関は全 field、非同期 validator も全 record を対象にし、同期制約に失敗した record では非同期検証を実行しません。

`POST /__isle/action/<action>` は、preflight の成否を信用せず同期・非同期制約を再検査し、その後も従来の prepare→policy 再検査→同期 commit を維持します。検証エラーは HTTP 422 と `{ ok: false, error: 'validation_failed', issues: [{ field, code }] }`、検証専用の成功は `{ ok: true }` です。認証・認可や内部エラーは field error と区別します。

### FormData とエラー表示

イベント発生時の標準 FormData を捕捉し、schema の field/type だけを decode します。number は空文字・非有限値・負のゼロ・hex 等を拒否し、未チェックの checkbox は false、存在する checkbox は true にします。フォーム文字列の改行は LF に揃え、native POST の CRLF と textarea の API 値で長さ検証がずれないようにします。名前の重複、余分な名前、File、欠落した string/number も拒否します。native の URL encoded / multipart POST も同じ decoder と validator を通ります。SSR 専用には POST の action/method と制約を残し、JS・snapshot・イベント marker を出しません。現行の native POST response は JSON で、HTML に戻す route adapter は後続です。

field の保存値を component state と二重に作りません。ブラウザーの入力と発生時のデータを使い、Form の snapshot slot は空です。成功は response view を検証したうえで、標準 CustomEvent `isle:submit` の detail に value を渡します。

各 control に一意な id と error の aria-describedby を生成し、エラーは label の外側・直後に置きます。送信エラーはリンク付き role=alert の一覧と field の aria-invalid に反映し、最初の修正可能な control へ focus します。schema Form の invalid は JS が有効な場合に既定 UI を取り消し、標準 popup と一覧の重複を避けます。JS 無効時の native validation は維持します。hidden field しか直せない場合は一覧へ focus します。エラー文は現在は短い英語の既定文で、server の自由文や HTML をそのまま表示しません。

### dirty / touched / pending / reset

- dirty は SSR の defaultValue/defaultChecked と異なるかを表します。最後に保存した値との差ではありません。
- touched は input/change/focusout の field を記録し、submit では全 field を対象にします。
- pending は最初のコード読み込み前から submit button を無効化して保持します。追加 submit はその場で拒否し、成功・失敗・reset・dispose で元の disabled 状態へ戻します。
- reset はブラウザーの既定値と Form の状態を戻し、エラー・dirty/touched/pending を消し、待機中の検証・送信を中止します。

revision と owner generation の両方を確認して、古い検証結果・reset 前の応答・破棄後の完了を UI に適用しません。編集中に以前の送信が成功しても、入力を上書きせず、以前の送信値が保存されたことを表示します。reset/abort は server で既に完了した書き込みを rollback する契約ではありません。pending は同一 Form の二重送信を防ぐ UX で、HTTP の再送全般の exactly-once 保証ではありません。

DOM/HTTP から独立した [FormSession API](../runtime/form-session.d.mts) と、その上の小さい DOM adapter に分けています。`loader.settled()` は schema Form の非同期処理も待ちます。[form-session model](../models/form_session/model.mbt) は2 revision・2 generation・検証1回・送信1回と重複試行・reset 1回の186状態を全探索します。revision/generation/pending の3故障版の反例を含みます。全モデルの現在の件数と範囲は [形式検査の記録](formal-methods.md)を参照してください。

`just a11y-schema-form` は schema Form に同じ8 gate を実行し、初期・エラー・保存後の desktop/mobile 画像を保存します。`just ci` には primitive / schema の両 Form の a11y 検査が含まれます。

## 次に必要な機能

1. field array / list、File / 複数選択、fieldset と group の専用検査。
2. アプリ側の message / locale 設定、HTML の native POST response adapter。
3. DB 側の atomic 制約・idempotency と実認証 adapter。UI の pending だけで代替しません。

primitive event 版の native reset は、任意の手書き state と自動同期しません。上の reset 契約は schema Form が所有する control に適用します。

## 計算結果へのラベル

`output` と `button` も HTML 標準の labelable 要素です。`output` の表示名を
通常の `label` で付けられます。ID と参照は同じ mount にスコープ化されます。

```text
component ReviewCount(total: number) {
  <div><label for="total">Total reviews</label><output id="total">{total}</output></div>
}
```

[HTML Standard の labelable 要素](https://html.spec.whatwg.org/multipage/forms.html#category-label)
に従います。hidden input は対象にできず、一つの wrapping label に複数の
labelable 要素を入れることもできません。
