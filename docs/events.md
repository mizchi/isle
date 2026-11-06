# イベント宣言と実行時点

`event` はコンパイラが分割・計測する入口、`on:click` は DOM 要素への接続です。本文に `inline(ts)` は不要です。現時点では TypeScript 風の閉じた式と state 代入を使い、任意の TypeScript 文や import は受け付けません。

```text
client component Counter(initial: number) {
  state count = initial;
  event increment(event: EventSnapshot<MouseEvent>) { count += 1; }
  <button type="button" on:click={increment}>{count}</button>
}
```

引数は必ず明示します。`EventSnapshot<T>` は組み込みの宣言型です。元の DOM Event を遅延実行へ持ち越さず、ローダーがイベント発生時に取得した値だけを渡します。引数名は `event` 以外でも構いません。未使用のイベント宣言も検査し、出力から除去します。

## 入力を読む

```text
client component Editor() {
  state text = "";
  state key = "";
  event edit(e: EventSnapshot<InputEvent>) { text = e.value; }
  event press(e: EventSnapshot<KeyboardEvent>) { key = e.key; }
  <section>
    <label for="message">Message</label>
    <input id="message" type="text" on:input={edit} on:keydown={press} />
    <output>{text} / {key}</output>
  </section>
}
```

| 属性 | Snapshot の型 |
| --- | --- |
| `on:click`, `on:dblclick` | `EventSnapshot<MouseEvent>` |
| `on:input` | `EventSnapshot<InputEvent>` |
| `on:change`, `on:invalid` | `EventSnapshot<Event>` |
| `on:keydown` | `EventSnapshot<KeyboardEvent>` |
| `on:submit` | `EventSnapshot<SubmitEvent>` |
| `on:focusout` | `EventSnapshot<FocusEvent>` |

基底の `EventSnapshot<Event>` は各イベントに接続できます。型に加え、接続先の要素も検査します。現在のフィールドは、keydown の `key`、input/change/invalid/keydown/focusout の入力要素の `value` / `invalid` / `validationMessage`、checkbox/radio の `checked` です。MouseEvent の座標、DOM の `target` / `currentTarget`、snapshot 全体の保存や引数への転送は未対応です。

## ループの値を明示的に渡す

```text
schema Item { id: string; title: string; }
client component List(items: Item[]) {
  state selected = "none";
  event select(e: EventSnapshot<MouseEvent>, id: string) { selected = id; }
  <section>
    <output>{selected}</output>
    <ul><For each={items}>{(item) =>
      <li key={item.id}><button type="button" on:click={(e) => select(e, item.id)}>{item.title}</button></li>
    }</For></ul>
  </section>
}
```

接続用の arrow は、一つの名前付きイベントを直接呼ぶ式に限定します。実行時に closure を生成せず、row の環境とコード参照を接続します。宣言本文からループの変数を暗黙に参照することはできません。引数の型、読み取り専用、宣言のスコープをそれぞれ検査します。

追加引数は不変の props・row の値へのパス、literal、これらの配列・record に限定します。可変 state、state に依存する derive、計算・index・JSON decode などの式は接続用引数に置けません。値の再評価や例外の順序を通常の引数評価と食い違わせないための制限です。可変な owner の値は本文から読み、計算も本文に置きます。本文のコレクション callback が同名のローカル変数を持つ場合は、コンパイラが変数を区別します。

## 同期のキャンセルと遅延処理

```text
client component Cancel() {
  state clicks = 0;
  event record(e: EventSnapshot<MouseEvent>) { clicks += 1; }
  <button type="button" on:click.preventDefault={record}>{clicks}</button>
}
```

`.preventDefault` はローダーがイベント配送中、非同期 import と snapshot 復元の前に実行します。cancelable でないイベントの既定動作は取り消せません。遅延本文の `e.preventDefault()` は `E_EVENT_PHASE`、`.stopPropagation` / `.stopImmediatePropagation` / `.capture` / `.passive` などは `E_EVENT_MODIFIER` で拒否します。委譲先に到達してからの伝播停止では、途中の listener を止めたことにならないためです。任意の同期処理、`sync event`、clipboard・fullscreen などのユーザー操作権限が必要な API は未対応です。

現行ローダーは最寄りの接続一つに配送します。複数の祖先へフレームワークのイベントを順に配送する動作は対象外です。

`async event save(e: EventSnapshot<MouseEvent>) { ... }` は既存の明示 server action 呼び出しに接続します。任意の async 関数や外部 API を許可する構文ではありません。認証・認可・schema の検査は server 側に残ります。

## 出力と診断

名前付きイベントは、従来の `on click name { ... }` と同じ handler/update code へ変換します。通常の接続には追加のランタイムラッパーがありません。キャンセルを使う場合だけ HTML のイベント参照に方針を付け、production では未使用の処理を除去します。SSR 専用出力にはイベント参照・snapshot・handler chunk を含めません。

`explain` の entry は component とイベント名で追跡でき、`source` は宣言、`binding` は接続属性の原文位置です。同じ宣言を複数箇所へ接続した場合は入口を区別し、`declaration` に元の名前を残します。宣言・引数検査用の内部 component は IR を公開する前に除去します。

従来の子要素内 `on click ...` ブロックは互換構文として残っています。新規のコードは属性形式を使ってください。[playground](playground.md) の Events と Fragments で、入力・同期キャンセル・明示的な row 引数を試せます。
