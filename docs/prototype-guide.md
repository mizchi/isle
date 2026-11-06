# Isle prototype v0: 記述ガイド

初めて利用する場合は[はじめる](getting-started.md)、機能別の手順は[アプリを書く](application-guide.md)を参照してください。このページは現在動く構文と意味規則のリファレンスです。

UI 言語は TypeScript の式・型を基にした専用構文です。分岐・反復は [Show / For などの制御コンポーネント](control-components.md) を使います。For のインライン描画関数も含め、現在は解析できる部分言語だけを実装しています。任意の TS、import、一般の関数定義、class、cast、任意 callback は未対応で、暗黙の動的実行へ逃がさずエラーにします。

## ソースを読むための意味規則

| 表記 | この言語の契約 | ソースだけでは決まらないこと |
| --- | --- | --- |
| `component` | server/client 両方で使える純粋なサブセット。state・イベントから実行側を推論しない | 配置先と、将来の合成先 |
| `client component` | SSR した HTML と保存値から再開し、browser で state 初期化を繰り返さない | 復元形式と実際の byte 数 |
| `server component` | server 側の HTML 描画。state・browser event は持たない | 配信基盤 |
| `server action` | 外部から直接呼べる RPC entry を登録する | transport adapter の配備先 |
| `using request: RequestContext` | server の `host.context(request)` が現在の request から注入する。wire input には含めない | ログイン方式と principal の生成実装 |
| `authorize grant = policy.name(request, input.field)` | その field の resource に対する policy の成功が必要 | policy の業務条件。名前だけから所有者判定等を推測しない |
| `effects { db.write }` | 登録 adapter の宣言 effect がこの集合内であることを要求する | adapter 本体の副作用を完全に証明するものではない |
| `view` | 許可する response field の契約 | field の値が公開可能かを一般に自動証明するものではない |

これらは言語の意味規則です。構文を読めることと、runtime/host が契約を満たすことの検証は別に行います。

## 検査する

Node 24+、pnpm、MoonBit が必要です。プロジェクトで `pnpm install`、`just build-compiler` の後に実行します。

```sh
node tools/isle.mjs check path/to/example.isle
node tools/isle.mjs explain path/to/example.isle
node tools/isle.mjs emit path/to/example.isle Counter
node tools/isle.mjs ssr path/to/example.isle Counter '{"initial":37}'
```

失敗時は exit 1 と `diagnostics` を返します。`start/end` は原文の UTF-16 offset、`code` は安定した診断種別、`hint` は次に直す箇所です。文法はまだ変更します。

## Props の宣言

推奨表記は `name: type` をコンマで並べる形です。component 専用 DSL の名前付き props 宣言で、TS の位置引数の関数として呼び出すものではありません。Vite の `mounts` は引き続き `props: { id: 'demo', title: 'Draft' }` のように object で渡し、キーの順番は問いません。

従来の TS 分割代入の表記も使用できます。次の二つは同じ props 契約です。

```text
export component Label(title: string, count: number) {
  <p>{title}{count}</p>
}
```

```text
export component Label({ title, count }: { title: string; count: number }) {
  <p>{title}{count}</p>
}
```

TS の `({ title: string })` は title を string という変数に改名する分割代入であり、型注釈ではありません。この形を短い型宣言として再解釈しません。[TypeScript の説明](https://www.typescriptlang.org/docs/handbook/2/objects.html)

値を渡す props は required の `string` / `number` / `boolean` に限定します。children に限って描画専用の `RenderFragment` を使えます。個別の名前付き引数・読み取り専用・タグによる合成は [Flow Component Syntax](https://flow.org/en/docs/react/component-syntax/)を参考にしています。省略可能な field、デフォルト値、rest、型 alias、分割代入での改名は未対応です。末尾コンマは使えます。引数リストの区切りはコンマで、型 object 内では従来どおりセミコロンも使えます。

## 実行側を限定しない component

```text
export component Heading(title: string) {
  derive text = title + "!";
  <h1>{text}</h1>
}
```

`client` / `server` を省略した component は、読み取り専用 props・純粋な derive・HTML を扱う共通サブセットです。IR の side は `universal` で、通常の mount では静的 HTML となり、snapshot・handler・UI runtime を必要としません。client/server どちらの契約とも整合する描画として扱います。

state は `E_COMPONENT_STATE`、on block は `E_COMPONENT_EVENT` で拒否します。利用する場合は `client component` を明示します。schema Form も client 専用です。純粋な derive から remote を呼ぶことや、イベント payload を参照することはできません。別の component は `<Label title="Text" count={5} />` の形で配置します。[入れ子・children・実行側の制約](composition.md)を参照してください。

## Client component

```text
export client component Counter(initial: number) {
  state count: number = initial;
  derive doubled: number = count * 2;

  <button class="counter">
    on click { count += 1; }
    {count} / {doubled}
  </button>
}
```

- props は `Counter(initial: number)` の形で宣言する読み取り専用の名前付き値です。複数は `Editor(id: string, title: string)`。引数なしは `Counter()`。
- `state` は mutable な保存対象候補です。初期化は SSR で行い、resume 時は再実行しません。
- `derive` は純粋な式です。依存は解析され、循環を拒否します。
- 型は `number/string/boolean`。式は literal、変数、括弧、`+ - * /`。型注釈を省略した state は初期値から推論します。
- template は一つの HTML root。通常の要素・text・`{式}`、`class/id/title/type/name/value/role/aria-*/data-*` などの属性を使えます。`data-isle-*` は予約です。
- `a` の `href` は不変な string とし、relative / HTTP(S) / mailto / tel を使えます。危険な scheme と制御文字を拒否し、props の URL は SSR 時にも検査します。client の制御領域内では literal なリンク先に限定します。
- 空白だけの text fragment（改行・字下げ等）は出力しません。文字を含む text は原文を保持し、通常の HTML の空白規則で表示します。式の間の ` / ` も保持します。表示上の改行には `<br>` 等を使います。`pre` の厳密な whitespace-preserving 仕様は未確定です。
- `on click increment { ... }` は親要素の event handler と遅延チャンクの境界です。名前は省略でき、`on click { ... }` も使えます。`=`、`+=`、`-=` で state を変更します。props と derive は書換不可です。
- 同期 handler の中の state 更新が終わったら、影響する binding を生成済みコードで更新します。

`on click async save { ... }` の `async` は本文の await を表します。名前・分割・計測の詳細は [チャンクとプロファイル](chunk-profiling.md) を参照してください。

derive の自己参照や間接循環は `E_DERIVE_CYCLE` になります。例えば `derive a = b + 1; derive b = a + 1;` は、`Counter.a -> Counter.b -> Counter.a` という閉じた経路を返します。`start/end` は循環を閉じる参照の UTF-16 位置、`cycle` は経路、`related` は各宣言の位置です。template から未使用でも、最適化前に検査します。forward reference や共有する依存は循環でなければ許可され、依存先を先に評価する順序になります。

parser から独立した graph の検査には `checkDependencies(graph)` と `node tools/isle.mjs dependencies graph.json` を使えます。詳細は [設計 §2.4](design.md#24-循環参照の検出と診断) を参照してください。

コンパイル時に確定する不変 state は定数伝播し、HTML の固定文字列を snapshot / handler に重複して入れません。文字列の一部だけが変わる場合も Text node は一つに保ち、可変範囲を更新します。再開用 root は全イベント・更新先を含む最小の祖先になり、component の root element と異なる場合があります。`explain` の analysis で保存 slot・初期化・文字範囲・DOM root を確認できます。[チューニングと測定](runtime-size.md)を参照してください。

client component も初期 HTML は SSR されます。browser には必要な state/props と handler/update code を渡し、初期 setup を再実行しません。イベントは click/input/change/submit/invalid/keydown/dblclick/focusout です。入力 entry では `event.value`、keydown では `event.key`、checkbox/radio では `event.checked`、標準検証には `event.invalid` / `event.validationMessage` を使います。Event 全体を保存・参照せず、発生時点の primitive だけを渡します。[Form の構文・標準制約・アクセシビリティ検査](forms.md)を参照してください。

作業メモの開閉には標準の `details` / `summary` も使えます。ネイティブの開閉に framework handler は不要です。[64項目のダッシュボード](../benchmarks/dashboard/README.md)では、静的な説明文とこれらの標準要素を残し、計算・保存する部分だけを再開します。

ブラウザー向け出力は ES2023 と標準 DOM / ESM / fetch / AbortController を前提にします。互換 polyfill は含めません。通常の client 出力に MoonBit/Wasm runtime は不要です。`disabled={false}` は SSR では属性を省略し、再開後は標準の `disabled` property を更新します。

復元データは [client-contracts.d.ts](../lib/client-contracts.d.ts) の v2 です。snapshot は `[2, schemaId, scopeId, values[]]` で、slot の並びは codegen の `fields` と一致します。生成 handler は `run(values, set, text, attribute, remote, event)` の位置引数を使い、使わない末尾引数は省略します。現在の `values` は [CodeRef](code-references.md) の捕捉 index に対応する local 配列です。MoonBit→JS の ProgramIR は引き続き v1 です。snapshot / registry / handler は同じビルドで配備し、旧形式や異なる schemaId の復元はエラーにします。

Vite plugin は production で未使用 capability と診断を除去します。`isle({ ..., diagnostics: true })` で詳細エラーと controller の `metrics` を残せます。既定の production では短いエラーコードを返し、`metrics` は `undefined` です。`dispose` / `settled` / `close` / `onError` は両モードで使えます。開発時は全 capability を含め、HMR で属性や remote を追加できます。

起動は [island loader](island-loader.md) が担当します。HTML の `<!--isle:ssr-->` へ描画し、再開する mount があるときだけ plugin が loader を追加します。既定の auto では初回に loader だけを実行し、入力・送信の依存を予算内で先読みします。最初の操作で未取得の runtime と handler を並列取得し、その island だけを復元します。ページ全体または mount に `mode: 'ssr'` を指定すると HTML のみを描画し、復元データ・event marker・動的 chunk を省略します。handler のない component も自動で静的になります。起動 hook が必要な場合は `clientEntry` で指定した module から `virtual:isle-loader` の `boot()` を呼びます。

既定の `loading: 'auto'` は入力・送信イベントの依存を、生成後の gzip サイズと追加予算から modulepreload します。クリックは操作時の取得を保ちます。`lazy` / `preload` / `eager` の明示指定もできます。preload は標準 modulepreload、eager は module 評価までで、操作前に handler を実行しません。SSR 専用指定は loading より優先します。[compiler の計画](resolution-optimizer.md)を参照してください。

## Server component

```text
export server component Heading(title: string) {
  <h1>{title}</h1>
}
```

server component には state と on を置けません。HTML と props を描画し、他の server / universal / client component を入れ子にできます。一般の async server render は未実装です。

## 公開 action

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
```

`schema` は wire の入力、`view` は出力 field の契約です。どちらも現在は primitive field の record のみ。action の return 型は TypeScript と同じ `: DocumentView`。以前の設計案の `->`、`Result`、`expose` は v0 の構文には含みません。

field には `minLength(3)` / `maxLength(80)` / `min(18)` / `max(120)` / `integer()` / `equals(true)` / `sameAs(other)` / `pattern("...")` / `format("email")` を付けられます。非同期検証は server action の authorize の後に `validate qualified.validator effects { db.read }` と宣言します。同じ schema の action ごとに検証を変えられます。[Schema IR の責務](schema-contracts.md)、Form への接続・field error・reset は [Form ガイド](forms.md#共通-schema-を使う-form)を参照してください。

`using request` は server が注入する context、`authorize grant` は対象 resource の許可、`effects` は宣言する能力です。body は `return await qualified.operation(grant, input.field, ...);` に限定します。最初の引数は必ず grant。policy は `qualified.policy(request, input.resourceField)` の形です。`resourceField` は input schema 内の field で、`id` は必須の固定名ではありません。`input.noteId` 等も使えます。

`check` は policy/operation 名の構文と境界を検査し、host の実登録は調べません。名前と schema を持つ source だけを記述できます。実行時には server host へ同名の policy/operation を登録する必要があり、未登録なら処理は成功しません。通常の server helper の自動公開は行いません。

client の async handler は、次の明示 RPC と出力 field の取得を使えます。action と component は v0 では同じファイルに置きます。

```text
export client component Editor(id: string, initial: string) {
  state title = initial;
  <button>
    on click async {
      title = (await remote renameDocument({ id, title })).title;
    }
    {title}
  </button>
}
```

`async` は中断、`remote` は server 越境です。`await` はこの形だけを許し、任意 Promise を保存しません。失敗は runtime の error hook へ渡り、state と DOM を更新しません。component 破棄後の client 更新は中止しますが、server 変更の rollback はしません。

## Host を登録する

実例は [examples/counter/host.mjs](../examples/counter/host.mjs)、公開する形は [ServerHost](../lib/contracts.d.ts) を参照してください。Vite plugin の `host` option に次の対応を渡します。

- `context(request)`: server が検証した subject/tenant。wire の値から principal を選びません。
- `policies[qualifiedName](context, resource)`: この request の対象操作を許す boolean。v0 の commit 直前は同期関数を要求します。
- `operations[qualifiedName]`: 対応する policy 名、effect 集合、任意の async prepare、同期の commit。prepare で書込みを行わず、commit の直前に policy を再検査します。

`lib/server.mjs` の `createActionHandler(ir, host)` は標準 Request→Response の入口です。cookie による browser action を想定して POST / same-origin を要求し、JSON と型付き native FormData を受け取ります。デモでは context を server 固定値にし、実認証として提供していません。wire の schema/view は余分な field も拒否します。公開 error は `invalid_input` / `validation_failed` / `forbidden` / `internal_error` 等の短いタグです。

## 保証の範囲

compiler は構文・名前・依存・実行側・境界契約を検査します。server runtime は直接 request に対しても入力、request principal、resource policy、出力を検査します。host の prepare は副作用を持たず、commit は同期の in-memory mutation であることを信頼します。実 DB transaction、実ログイン、完全な情報フロー保証、TypeScript の Content Mapper はまだ実装していません。

MoonBit/veri の有限モデル、`moon prove` の小さい契約、browser のテストはそれぞれ対象が違います。モデル検査成功を runtime や compiler 全体の証明とは呼びません。

## Template control flow

`Show`、`Switch` / `Match`、`For`、同期描画用の `ErrorBoundary` を利用できます。行のルート要素、または複数要素をまとめる `Fragment` に key を指定します。全 arm と fallback を型検査した後、定数で到達不能と分かる arm を取り除きます。旧ディレクティブ構文は受理しません。具体例は [制御コンポーネント](control-components.md) を参照してください。

配列は `Item[]` / `readonly Item[]`、レコードは既存 schema / view で型を付けます。`state items: Item[] = initial;`、`items = [items[1], items[0]];`、空配列 `[]`、文脈で型が決まるレコード literal を扱います。行と index は readonly。key は行だけに依存する string または safe integer とし、重複は state / DOM の commit 前に拒否します。

実行できる例は [control-flow/fixture.isle](../evals/scenarios/control-flow/fixture.isle)。独立 client owner、schema Form、RenderFragment などに関する現在の制約と、resource / `Suspense` の未実装範囲は [制御構文の契約](control-flow.md)を参照してください。
