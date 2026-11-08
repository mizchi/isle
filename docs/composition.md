# コンポーネントを組み合わせる

コンポーネントは `<Counter initial={5} />` のようにタグで配置します。引数の名前が props の名前になり、呼び出し側の属性の順番は問いません。分割代入と型を二重に書かない方針は、[Flow の Component Syntax](https://flow.org/en/docs/react/component-syntax/)を参考にしています。

```text
component Card(title: string, children: RenderFragment) {
  <section><h2>{title}</h2>{children}</section>
}

client component Counter(initial: number) {
  state count = initial;
  <button type="button">
    on click increment { count += 1; }
    {count}
  </button>
}

server component Page(seed: number) {
  <Card title="Counters">
    <Counter initial={seed} />
    <Counter initial={seed + 10} />
  </Card>
}
```

Vite の mounts には Page だけを登録します。seed=5 なら二つの Counter は5と15で表示され、それぞれ独立して操作できます。

```js
mounts: [{ component: 'Page', props: { seed: 5 }, scopeId: 'page', label: 'Page' }],
```

全ての定義はファイルのトップレベルに置きます。後ろで宣言した component も参照できます。コンポーネント名には大文字で始まる名前を使い、普通の関数のように `Counter(...)` と呼ぶことはできません。

## デモを動かす

```sh
just dev-composition
```

<http://127.0.0.1:4192/> を開きます。親のボタンは親の表示だけ、子 A / B / C のボタンは各子の状態だけを変更します。[ソース](../examples/composition/app.isle)には純粋な表示用 component、状態を持つ親子、children を受け取る Card が含まれます。

## 実行側の組み合わせ

| 呼び出し元 | 呼び出せる component |
|---|---|
| 無指定の `component` | 無指定の component |
| `client component` | 無指定の component、client component |
| `server component` | 無指定の component、server component、client component |

無指定の component は props・純粋な derive・HTML の範囲に制約します。client の state / on や server 専用の処理を、呼び出しによって暗黙に取り込むことはありません。client から server component を直接生成する呼び出しは `E_COMPONENT_PHASE` になります。

この制約は、server 側で作った内容を children として client の枠へ渡すことを妨げません。内容は呼び出し元のスコープに属し、受け取った component は表示位置を決めます。

```text
server component Note(message: string) { <p>{message}</p> }
client component Panel(children: RenderFragment) {
  state count = 0;
  <section>
    <button type="button">on click add { count += 1; }{count}</button>
    {children}
  </section>
}
server component Page() {
  <Panel><Note message="Server content" /></Panel>
}
```

## Children の契約

`children: RenderFragment` を宣言し、本文に `{children}` を一度だけ置きます。渡す内容がない場合は空になります。children を宣言していない component へ本文を渡したり、複数箇所へ展開したりすると `E_COMPONENT_CHILDREN` になります。

RenderFragment はコンパイラが扱う描画用の値です。props の JSON、state、derive、属性、snapshot に入れたり、文字列の HTML として注入したりする用途には使えません。Flow の React.Node 全体を実装する型ではなく、静的な template の合成に限定しています。

## 純粋な子と client の子

無指定の component と server component は、呼び出し先の props・derive を展開して HTML を生成します。純粋な子を増やすだけで、新しい runtime owner や snapshot は追加しません。例えば次の表示は、親の count に追従します。

```text
component Value(value: number) { <output>{value}</output> }
client component Parent(initial: number) {
  state count = initial;
  <div>
    <button type="button">on click increment { count += 1; }Add</button>
    <Value value={count} />
  </div>
}
```

client の子は独立した状態と再開範囲を持ちます。現在、この境界を越える props は、親の操作で変化しない初期値に限定しています。`<Counter initial={seed} />` は使えますが、親が変更する count を渡す `<Counter initial={count} />` は `E_COMPONENT_CAPTURE` で拒否します。初期化をやり直したり、更新が追従しないまま受理したりはしません。

client の枠へ渡す children も、親の mutable な値や親が所有するイベントを持たせられません。静的 HTML、既に server で描画する内容、独立した client component は渡せます。親の値に追従する表示用の子には、無指定の component を使ってください。

## Resume と破棄

client の各 instance に固有の scope と snapshot を生成します。同じ Counter を何個配置しても、コードは共有し、状態は共有しません。子の最初の操作で親や兄弟の snapshot まで復元することはありません。

親の文字・属性の更新先は子の領域と分離します。純粋な component 内の id と label / ARIA 参照も配置ごとに変換するため、同じ template の繰り返しで混ざりません。component の外にある id を label の参照先にする機能は提供していません。

`dispose(parentScope)` は、まだ再開していない子も含めて停止します。`dispose(childScope)` は親や兄弟を停止しません。所有関係は最適化後の DOM の親子とは別に保持するため、親の再開 root がボタンだけに縮んでも、この関係を維持します。native import 自体は中止できませんが、破棄後に届くコードで状態の復元や更新を行いません。

## チャンクと SSR

生成するコードは mounts から到達できる client component に限定します。`loading` は入れ子の子にも継承し、同じ component に複数の指定が届く場合は従来どおり最も早い方針を使います。

`lazy` では、操作された entry とその静的依存を取得します。入れ子の下にある handler 全部を無条件で取得する方針ではありません。Vite / Rolldown が同じファイルへまとめたコードは一緒に届くため、物理的な分割は manifest で確認します。共通 runtime / registry はページ内で使います。

`mode: 'ssr'` は全ての子と children に伝わります。通常ページでは framework の実行用 JS・snapshot・イベント marker を生成しません。widget では表示用 SDK を使いますが、SSR 専用 descriptor に動的 module や UI engine を展開しません。

```sh
node tools/isle.mjs check examples/composition/app.isle
node tools/isle.mjs explain examples/composition/app.isle
node tools/isle.mjs ssr examples/composition/app.isle Page '{"seed":5}'
```

独自の SSR adapter からは、単体の renderComponent の代わりに program 全体を準備します。

```js
import { compileFile, requireIR } from './lib/compiler.mjs';
import { prepareProgram } from './lib/codegen.mjs';

const ir = requireIR(await compileFile('examples/composition/app.isle'));
const program = prepareProgram(ir);
const result = program.render('Page', { seed: 5 }, { scopeId: 'page' });
const html = result.html + result.snapshotHtml;
```

複数の top-level mount は `program.renderAll(mounts)` で描画できます。明示した scopeId と自動生成した子の scope が衝突する場合も拒否します。

## コンパイル時の診断

| code | 確認すること |
|---|---|
| E_COMPONENT_UNKNOWN | 呼び出す component を同じファイルで宣言します |
| E_COMPONENT_PROPS | props の名前、型、欠落、余分な値、重複を確認します |
| E_COMPONENT_PHASE | 上の実行側の組み合わせに合わせます |
| E_COMPONENT_CHILDREN | RenderFragment の宣言と一度だけの投影を確認します |
| E_COMPONENT_CAPTURE | client 境界を越える mutable 値・親のイベントを取り除きます |
| E_COMPONENT_CYCLE | 診断の循環経路を読み、直接・間接の再帰を解消します |
| E_COMPONENT_HTML / E_FORM_NESTING | 展開後の DOM と form の入れ子を確認します |

Form は同じ client owner 内で control を構成します。純粋な component を使って control をまとめられますが、schema Form の control 群を別の client owner や未確定の children に分割することはできません。フォーム自体を client component として入れ子にする構成は使えます。

Flow の optional/default/rest、renaming、ref、renders 型、props spread、dynamic component、list / branch は今回の対象に含みません。従来の TS 分割代入表記は互換用に残し、ドキュメントでは個別の名前付き引数を基本にします。

[ユーザーガイド](README.md) · [構文リファレンス](prototype-guide.md) · [チャンクと計測](chunk-profiling.md)


## For 内で親のボタンを子へ配置する

親が書いたボタンを universal な子の `children` へ渡します。子は配置と表示を担当し、
イベントは親の state と行の値を参照します。子が条件式・分岐・反復を持つ場合も静的に展開します。

```text
component ReviewCard(title: string, done: boolean, children: RenderFragment) {
  <article><h2>{title}</h2><p>{done ? "Done" : "Open"}</p>{children}</article>
}
client component Reviews(items: string[]) {
  state selected = "none";
  event choose(e: EventSnapshot<MouseEvent>, id: string) { selected = id; }
  <main><output>{selected}</output><For each={items}>{(id) =>
    <ReviewCard key={id} title={id} done={false}>
      <button type="button" on:click={(e) => choose(e, id)}>Choose</button>
    </ReviewCard>
  }</For></main>
}
```

見出しと余白に handler は付きません。ボタンの `on:click` だけが親のイベントへ接続され、
関数や fragment が snapshot に入ることもありません。親子でループや callback の変数名が
一致しても、コンパイラが名前を区別して呼び出し元の値を保持します。投影した要素のCSSも呼び出し元のscopeを使うため、ボタンのstyleとresetは親に記述します。
別の client owner へ
親のイベントや可変値を渡す制限は維持します。Region backend の client が実行時に
opaque slot を受け取る機能、任意の callback props は含みません。

`{children}` の記述位置は一箇所です。子の反復内に置いた場合は各行へ展開されます。
未指定時は空として描画します。SSR専用ビルドはボタンのHTMLを残し、イベント参照・snapshot・
JavaScript chunkを出しません。

[SafeGrid と親所有の行操作を組み合わせた実行例](../examples/lexical-events/README.md)は
列の切替、content-size bounds、button resetを含みます。
