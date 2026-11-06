# 制御コンポーネント

`Show`、`For`、`Switch` / `Match`、`ErrorBoundary` で表示構造を宣言します。これらと `Fragment` はコンパイラ組み込みで、import は不要です。同名の component 宣言は拒否します。通常の component として実行せず、既存の分岐・反復・失敗境界 IR に変換するため、追加の DOM や制御コンポーネント用ランタイムは配信しません。

[Playground](https://mizchi.github.io/isle/playground/) の List と Fragments プリセットで操作できます。[複数要素の行のソース](../examples/control-flow/fragments.isle)も参照してください。

## Show

```tsx
<Show when={visible} fallback={<p>Hidden</p>}>
  <p>Visible</p>
</Show>
```

`when` は副作用のない boolean 式です。現段階では Solid の truthy な任意値や `keyed` は扱いません。選ばれた側だけを描画し、同じ側を維持する更新で DOM を再作成しません。非選択側と fallback も型検査しますが、描画式は選択されるまで評価しません。

## For と key

```tsx
<ul><For each={items} fallback={<li>No items</li>}>
  {(item) => <Row key={item.id} item={item} />}
</For></ul>
```

`each` は既存の閉じた値型の配列です。描画関数の引数は配列から推論し、`item => <Row ... />` と `(item) => (<Row ... />)` の両方を受理します。第二引数を付けた `(item, index) => ...` の `index` は number で、並べ替え時に更新されます。Solid の index accessor とは異なります。

各行が返すルートに一つの `key` が必要です。その行だけに依存する string / number の式に制限し、配列の index、外側の state、定数を拒否します。`keyBy` は使いません。

`key` は反復 IR に取り込み、component の props と DOM 属性から取り除きます。ルートより下に付けた key と、For の行ルート以外に指定した key は拒否します。重複 key は SSR の出力・更新の commit 前に検出します。

同じ key の移動は行の DOM を保持します。key の変更・削除は行の寿命を終了し、再挿入時には新しい行を作ります。終了した行で待機していたハンドラを、新しい行に適用しません。

## 複数要素の行と Fragment

```tsx
<For each={items}>
  {(item) => (
    <Fragment key={item.id}>
      <Row item={item} />
      <Details item={item} />
    </Fragment>
  )}
</For>
```

Fragment は解析時に取り除き、複数ノードを一つの行として移動・破棄します。追加の HTML 要素も制御 frame も生成しません。入れ子の通常の Fragment と `<>...</>` も透明です。`<>...</>` 自体には属性を付けられないため、For の返り値のルートを複数要素にする場合は名前付きの Fragment を使います。

## Switch / Match

```tsx
<Switch fallback={<p>Other</p>}>
  <Match when={mode === "list"}><ListView /></Match>
  <Match when={mode === "summary"}><Summary /></Match>
</Switch>
```

最初に条件が true になった Match を表示します。Switch の直下には Match だけを許可し、Match の単独使用は拒否します。各 when は boolean です。

## ErrorBoundary

```tsx
<ErrorBoundary fallback={(error) => <p>{error}</p>}>
  <p>{items[0].title}</p>
</ErrorBoundary>
```

既存の同期描画境界です。fallback はテンプレート、純粋な表示値、または `(error) => template` で記述できます。error は公開用文字列 `Render failed` です。fallback 自体の描画失敗は外側の境界へ伝わります。イベント処理、RPC の副作用、任意 Promise の失敗を捕捉する意味にはしません。reset 引数と非同期 Suspense は未対応です。

## 静的検査と現在の範囲

- For の children とエラーの function fallback はインラインの template 式に制限します。statement body、外部 render 関数、動的な component 選択は受理しません。
- component 自体には一つの native container root が必要です。root を直接 Show / For / Fragment にする場合は、section などで包みます。
- Region backend の既存の制約を引き継ぎます。独立 client owner、RenderFragment の投影、schema Form、textarea / select / option は反復・分岐を持つ owner では未対応です。純粋な universal component の静的展開は使えます。
- 型検査の後に定数分岐を除去し、動的な値・属性・構造だけの更新を生成します。レイアウト検査には全 branch / fallback と、証明できる全反復回数を渡します。SSR 専用では snapshot、動的属性、クライアント JS を出しません。
- 旧 `@if` / `@for` / `@switch` / `@try` は互換用に受理します。新しい利用例と playground は制御コンポーネント表記を使います。

この追加の解析層はブラウザーで動く JavaScript で実装しています。既存の閉じた式・型検査エンジンを再利用し、元ソースの UTF-16 位置に診断と profile の位置を戻します。MoonBit 側の文法やアプリ用ランタイムには変更を加えません。

## English

Use Show, For, Switch / Match, and ErrorBoundary as compiler intrinsics. Put a stable row-dependent string or number key on the returned row root. Use a named Fragment with a key for multiple sibling roots. Keys are consumed by the compiler and never forwarded as component props or DOM attributes; Fragments add no DOM wrappers.

The examples above use the supported syntax. when requires a boolean; For accepts a typed array and one inline template function. Its optional index argument is a number. Arbitrary render helpers, statement bodies, keyBy, and ErrorBoundary reset callbacks are unsupported. Components still need one native container root. Existing static checks, keyed lifetime handling, SSR-only output, and bounded layout analysis apply to the generated IR. Legacy @ controls remain accepted for compatibility.
