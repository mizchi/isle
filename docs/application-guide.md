# アプリを書く

`.isle` は、初期 HTML に残せる部分と、操作に必要な状態・コードを分けて生成します。ページへの配置は Vite の `mounts` で指定します。[最初の Counter](getting-started.md)の設定を起点に、機能を追加できます。

## 状態と表示

```text
export client component Counter(initial: number) {
  state count = initial;
  derive doubled = count * 2;
  <button type="button">
    on click increment { count += 1; }
    {count} / {doubled}
  </button>
}
```

props は `initial: number` のように名前と型を一度ずつ書きます。受け渡しは `props: { initial: 5 }` のままで、読み取り専用です。従来の `({ initial }: { initial: number })` も同じ契約として使えます。

イベントから変更する値を `state`、他の値から求める純粋な式を `derive` にします。`derive` は依存する値の更新に合わせて再計算されます。自己参照や間接的な循環はコンパイルエラーになります。

通常の HTML 要素、テキスト、`{式}`、`class` / `aria-*` / `data-*` などの属性を使えます。コンポーネントには一つの HTML root が必要です。対応する式は literal、変数、括弧、`+ - * /` などに限定されています。任意の関数呼び出しは使えません。

`a` の `href` は不変な string として記述できます。相対 URL・HTTP(S)・mailto・tel を受け付け、実行可能な URL scheme と制御文字を拒否します。server props の URL は SSR 時にも検査します。状態や derive でリンク先を変更する構文、および client の制御領域内の非 literal なリンクは現在の対象外です。

Vite plugin の `wrapMounts: false` は、デモ用の card / 見出しを付けずに component の HTML を挿入します。サイトの header・main・footer などを自分で構成する場合に使います。既定値は `true` です。

イベントの書き方は `on <event> [async] [名前] { ... }` です。`click` / `input` / `change` / `submit` / `invalid` / `keydown` / `dblclick` / `focusout` に対応します。コード分割のために関数を別途包む必要はなく、イベントブロックが論理的な境界になります。小さい境界は bundler が同じファイルにまとめることがあります。

TodoMVC のようなリストには、純粋な `array.filter(item => condition)`、`map(item => value)`、`some`、`every`、`concat(array)`、`string.trim()` と `condition ? yes : no` を使えます。callback は単一の新しい引数を取り、外側の binding を隠せず、副作用を持てません。現在の `map` は要素型を保持する変換に限定します。`JSON.stringify(value)` と `JSON.parse<ClosedType>(text)` は保存の境界に使えます。後者はこの DSL の明示的な型付き JSON decode で、通常の TypeScript の型引数なし `JSON.parse` より制約が強く、復元値を実行時にも検査してから state を commit します。

`keydown` / `dblclick` / `focusout` にも対応します。`keydown` 内では発生時点の `event.key` と入力要素の `event.value` を利用できます。保存、URL hash、フォーカスのような browser capability は host module に接続し、リスト描画・state 遷移は生成コードが担当します。[TodoMVC](../examples/todomvc/README.md) と[同じ機能のサイズ比較](../benchmarks/todomvc/README.md)を参照してください。配列式・三項演算子は現在の region backend を使うため、その component には control-flow と同じ owner / native control の制約が適用されます。

## 複数の UI を配置する

`mounts` に同じコンポーネントを複数登録できます。次は `isle()` オプションの抜粋です。

```js
mounts: [
  { component: 'Counter', props: { initial: 5 }, scopeId: 'first', label: 'First counter' },
  { component: 'Counter', props: { initial: 10 }, scopeId: 'second', label: 'Second counter' },
],
```

二つの Counter は状態を共有しません。最初の操作でもページ全体を再開せず、対象の instance を復元します。コンポーネント内で `<Counter initial={5} />` と配置する入れ子も使えます。[合成と children](composition.md)を参照してください。

## Component の実行側と HTML のみの出力

```text
export component Heading(title: string) {
  <h1>{title}</h1>
}
```

無指定の `component` は、server/client の両方で使える純粋なサブセットです。props・純粋な derive・HTML に限定し、state やイベントを追加しても自動で client へ切り替えません。操作が必要なら `client component` と宣言します。

server 側に限定する場合は、明示的に `server component` を使います。

```text
export server component Heading(title: string) {
  <h1>{title}</h1>
}
```

server component は HTML と props の描画に使います。`state` やイベントは置けません。client component も初期表示は SSR され、操作に必要なコードだけがブラウザーへ渡ります。

イベントを持つコンポーネントを HTML のみで出力したい場合は、`isle()` に `mode: 'ssr'` を指定します。個別の mount にも同じ指定ができます。以下はオプションの抜粋です。

```js
mounts: [
  { component: 'Counter', props: { initial: 5 }, label: 'Preview', mode: 'ssr' },
],
```

この Counter は初期値を表示しますが、クリックしても値は変わりません。SSR 専用 mount の snapshot・イベント marker・動的コードを生成しません。ページ内の全 mount が静的なら Isle の browser JS も出力しません。`details` / `summary` など、標準 HTML だけで動く UI はそのまま使えます。

## Server action を呼ぶ

サーバー越境は `remote` として明示します。次は単独で検査できる `.isle` ソースです。action と client component は同じファイルに置きます。

```text
schema RenameInput { id: string; title: string; }
view DocumentView { id: string; title: string; }

export server action renameDocument(input: RenameInput): DocumentView
  using request: RequestContext
  authorize grant = policy.documentEditor(request, input.id)
  effects { db.write }
{
  return await documents.rename(grant, input.title);
}

export client component Editor(id: string, initial: string) {
  state title = initial;
  <button type="button">
    on click async save {
      title = (await remote renameDocument({ id, title: title + "!" })).title;
    }
    {title}
  </button>
}
```

`schema` は受け取る入力、`view` は返す field の契約です。`using request` の値はサーバーが現在の request から作ります。`authorize` は対象 resource に対する許可、`effects` は操作に認める能力を宣言します。`async` は await を使う指定で、server component へ自動的に切り替わる意味ではありません。

JavaScript 側には、同名の policy と operation を持つ `host` が必要です。[Counter デモの host](../examples/counter/host.mjs)はこの action に対応します。`isle({ ..., host })` で登録し、Editor の props に `{ id: 'demo', initial: 'Draft' }` を渡すと、クリックで `Draft!` が返ります。`just dev` で実行済みのデモを試せます。

ローカルデモの principal は固定です。実アプリでは `host.context(request)` で認証済みの利用者を特定し、`host.policies` で対象の操作権限を確認します。入力や出力の形は直接 HTTP request に対しても検査します。

`host.operations` の effect 宣言や実装はアプリ側の責任です。現在の commit は同期の in-memory 処理を対象にしています。

開発サーバーと Vite preview は登録した host を使います。production の server action には、[createActionHandler()](../lib/server.d.mts) を Request / Response を扱うサーバーへ接続します。HTML と JS を静的配信するだけでは RPC は動きません。動く配布例は[Workers](worker-widget.md)と[Node adapter](../examples/portable-widget/server.mjs)を参照してください。

## 検証付きフォームを作る

共通 schema を使うフォームでは、入力制約と送信先を宣言します。以下は [schema Form デモ](../evals/scenarios/forms/shared.isle)と同じ構成です。

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

export client component SchemaSignup() {
  <form schema="Registration" submit="register" aria-label="Create account">
    <label>Email (required)<input name="email" autocomplete="email" /></label>
    <label>Confirm email (required)<input name="confirmation" /></label>
    <label>Age (required)<input name="age" value="21" /></label>
    <label><input name="accepted" />I agree (required)</label>
    <button type="submit">Create account</button>
    <button type="reset">Reset</button>
  </form>
}
```

schema の各 field に、同じ `name` の control を一つずつ置きます。型と制約から input type、required、範囲などを生成します。schema Form の control に手書きの入力・submit handler を混在させることはできません。値を保存するためだけの `state` も不要です。

このソースには `policy.signup`、`accounts.available`、`accounts.register` を登録した host が必要です。[デモ host](../examples/schema-form/host.mjs)を使う設定は [vite.config.mjs](../examples/schema-form/vite.config.mjs)にあります。

```sh
just dev-schema-form
```

<http://127.0.0.1:4191/> で試せます。`taken@example.com` はデモで登録済みのため非同期検証に失敗します。確認用 email を一致させ、年齢と同意を満たし、別の email を送信すると保存できます。データはメモリ内だけに保持します。

送信前にブラウザーと共通 validator が検査し、server action でも入力・認可・非同期検証を再確認します。field error と送信エラーの一覧、`aria-invalid`、修正する control への focus を生成します。

送信中は submit を抑制し、reset では初期値・エラー・待機中の UI 処理をリセットします。reset で完了済みのサーバー書き込みを取り消すことはできません。

成功時は検証済みの response を `isle:submit` の `detail` で受け取れます。必要なら自分の client entry に次の処理を書き、その module を `isle()` の `clientEntry` に指定します。

```js
import { boot } from 'virtual:isle-loader';

document.addEventListener('isle:submit', event => {
  console.log('保存した値', event.detail);
});
boot({ onError: error => console.error(error) });
```

通常は client entry を書かなくても plugin が起動コードを追加します。自分で指定する場合は `boot()` を呼んでください。JS 無効・SSR 専用の schema Form では native POST が使えますが、現在の応答は JSON です。入力イベントを細かく制御する書き方、制約一覧、非同期検証、エラー表示の詳細は [Form ガイド](forms.md)を参照してください。

## アクセシビリティを検査する

control の label、id の重複、`for` / `aria-describedby` 等の参照、form 内の button の `type` をコンパイル時に検査します。例えばラベル不足は `E_A11Y_LABEL`、参照切れは `E_A11Y_REFERENCE` になります。

```sh
node tools/isle.mjs check examples/hello/app.isle
just a11y-form
just a11y-schema-form
```

`check` は指定したソースを検査します。後ろの二つは、付属のフォームデモをビルドし、keyboard / contrast / touch / focus 等を検査するコマンドです。自分のアプリの見た目・読み上げ・キーボード操作も別途確認してください。

## Component の寿命にリソースを結び付ける

`isle({ resources: { VideoPanel: './video.resources.ts' }, ... })` で、イベントを持つ client component に setup module を指定できます。module は `setup({ root, owner, id })` を export し、`owner.own(value, release)` または `owner.acquire(signal => initialize(signal), release)` で解放責任を登録します。初回 resume の handler より前に instance ごとに一度実行し、DOM 削除・dispose・widget の切断で自動破棄します。setup は同期関数です。非同期の取得完了は handler を待たせません。

module のトップレベルは先読みで評価され得るため、取得処理は setup 内に置きます。SSR 専用では resource code を出力しません。ready / failed を UI へ反映する専用 resource 構文は未実装です。[実行例と寿命の契約](resource-disposal.md)を参照してください。

## コードを読み込むタイミング

`isle()` の `loading`、または各 mount の `loading` で指定します。

| 値 | 操作前に行うこと | 状態の復元とイベント実行 |
|---|---|---|
| `auto`（既定） | 入力・送信の依存コードを gzip 予算内で先読みします | 操作時 |
| `lazy` | 必要なコードの取得を操作まで遅らせます | 操作時 |
| `preload` | manifest の依存に基づき modulepreload します | 操作時 |
| `eager` | module の import・評価まで準備します | 操作時 |

先読みしても、全 instance の状態を一括で復元することはありません。manifest による依存チャンクの並列取得と、操作された UI の resume は別の処理です。`mode: 'ssr'` は loading 指定より優先します。

ページ遷移先の先読みには別の `speculation` オプションを使います。[Speculation Rules の設定](speculation-rules.md)を参照してください。

## ビルドと操作を調べる

```sh
node tools/isle.mjs explain examples/hello/app.isle
just chunks dist-hello/isle.manifest.json
```

`explain` は状態・依存・イベント境界の解析結果を返します。`chunks` は production build の manifest を読み、イベント名とソース位置、ファイル、共通依存を含むサイズを対応させます。

`isle()` に `profile: true` を指定すると、DevTools の User Timing にコード取得・状態復元・実行の区間が出ます。`diagnostics: true` は production に詳細エラーと controller の metrics を残す設定です。計測や診断を有効にした成果物のサイズは、通常の production build と分けて扱います。[チャンクとプロファイル](chunk-profiling.md)に出力の読み方をまとめています。

[ユーザーガイド](README.md) · [widget を使う](widgets.md) · [構文リファレンス](prototype-guide.md)
