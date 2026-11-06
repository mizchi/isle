# Island loader と SSR 専用出力

既定の auto では初回に小さい event loader だけを実行し、入力・送信の依存コードを予算内で先読みします。未取得の runtime と handler は対象 island の最初の操作で並列取得します。manifest から生成した inert な modulepreload リンクを操作時に有効にし、state の復元は対象 island の dispatch まで待ちます。[Qwikloader](https://qwik.dev/docs/advanced/qwikloader/) の、イベントを委譲して必要なコードを遅延取得する役割を参考にしています。出力は ES2023 と標準 ESM / DOM / fetch / AbortController のみです。[CodeRef と manifest](code-references.md) によって `lazy` / `preload` / `eager` も明示できます。

## 通常の使い方

HTML に `<!--isle:ssr-->` を置き、Vite plugin に mount を渡します。起動用の script tag は plugin が必要なときだけ追加します。

```js
isle({
  entry: '/absolute/path/app.isle',
  mounts: [
    { component: 'Counter', props: { initial: 37 }, scopeId: 'counter', label: 'Counter' },
  ],
});
```

HTML に framework の起動 script を手で追加する必要はありません。初期ローダーは root の識別と event listener の登録だけを行い、snapshot を parse せず、binding の DOM 探索も行いません。最初の対象イベントで runtime/registry を取得し、対応する handler を取得してから、その island の保存値と locator を復元します。別の island の snapshot は未展開のままです。component 初期化やテンプレート描画を browser で再実行しません。

初期ローダーは document ごとに一度だけ登録します。`dispose` は import 待ちのイベントも中止し、`close` は AbortSignal で listener を除去します。入力値はイベント発生時に捕捉します。DOM に合成イベントを再送しないため、他の listener とブラウザーの既定動作を重ねて実行しません。click/input/change/submit/invalid に対応し、submit は import 前に既定動作を取り消して native validation を検査します。invalid は capture で受け取ります。任意の Event 参照や一般の preventDefault 構文は未実装です。[Form](forms.md)を参照してください。

## SSR のみにする

ページ全体では `mode: 'ssr'` を指定します。mount に `mode: 'resume'` があっても、ページ全体の SSR 専用指定が優先します。

```js
isle({
  entry: '/absolute/path/app.isle',
  mode: 'ssr',
  mounts: [
    { component: 'Counter', props: { initial: 37 }, label: 'Static counter' },
  ],
});
```

props・state 初期値・derive を server で評価し、数値や文字列を通常の HTML に描画します。client component に `on click` が書かれていても、SSR 専用 mount には event 属性、binding comment、snapshot を出力しません。loader、復元 runtime、handler chunk も出力しません。

`server component` および handler のない `client component` は、既定の `mode: 'resume'` でも自動で静的出力になります。静的 mount しかなければ、plugin は起動 script を追加しません。SSR 専用モードが対象にするのは Isle のコードであり、HTML に別途書かれた汎用 script は保持します。

JS adapter を直接使う場合は `renderComponent(component, props, { mode: 'ssr' })` です。`snapshot` は `null`、`snapshotHtml` は空文字列になります。server の認証・action API の契約は SSR の描画指定と独立しています。

## 混在させる

```js
isle({
  entry: '/absolute/path/app.isle',
  mounts: [
    { component: 'Counter', props: { initial: 37 }, mode: 'ssr', label: 'Static' },
    { component: 'Counter', props: { initial: 5 }, scopeId: 'active', label: 'Interactive' },
  ],
});
```

静的な Counter は通常の HTML、再開する Counter は marker と snapshot を持ちます。静的部分の操作では runtime を取得しません。SSR 専用 component のためだけに必要な handler・schema・remote action 名は client registry から除外します。同じページで共通の runtime/registry chunk を取得し、状態の復元と handler の取得を island ごとに行います。

[component の入れ子](composition.md)にも対応します。子の操作で親や兄弟の snapshot を復元せず、親の更新先から子の marker を除外します。親の dispose は未再開の子にも伝わります。各 component が独立した runtime bundle を持つ方式ではありません。

## 起動時の hook を使う

`clientEntry` に framework 起動用 module を指定できます。この module も、再開する mount がある場合だけ plugin が読み込みます。

```js
// vite.config.mjs の isle option
clientEntry: '/absolute/path/main.mjs'
```

```js
// main.mjs
import { boot } from 'virtual:isle-loader';
const controller = boot({ onError: error => console.error(error) });
```

`boot()` は同じ document に対して同じ controller を返します。`dispose(scopeId)` / `settled()` / `close()` は runtime が未ロードでも使えます。`metrics` は `diagnostics: true` の場合だけ有効で、`loads` は handler の初回解決、`restores` は snapshot の復元を数えます。ネットワーク要求数は eager/preload や ESM cache の状況と区別します。`runtime/client.mjs` の `resume` は loader 用の engine 入口で、DOM event listener を登録しません。

Vite 以外の adapter からは [loadIslands](../runtime/loader.mjs) に標準 Document、動的 import を行う関数、event 種別を渡せます。契約は [client-contracts.d.ts](../lib/client-contracts.d.ts)、Vite option は [vite.d.mts](../lib/vite.d.mts) に定義しています。

## 計測と検証

loader 分離時点の共通 fixture では、gzip level 6 の初期外部 JS は 1,513 → **697 bytes**、全操作後の合計は 2,669 → **3,261 bytes** でした。CodeRef 導入時点では profile 無効で初期外部 JS **698 bytes**、全操作後の合計 **3,693 bytes** でした。これらは操作時の並列取得を追加する前の記録です。初期転送量と合計転送量は別に評価します。初回操作の時間は[ダッシュボードの測定](../benchmarks/dashboard/README.md)を参照してください。INP の測定ではありません。

分離前の [記録](../benchmarks/results/history/before-island-loader.json) と [最新の比較](../benchmarks/results/latest.md) を保存しています。SSR 専用 fixture は出力 JS がゼロで、JS 有効のブラウザーでも script/fetch/xhr 要求がゼロになることを確認します。

`just ci` と `just compare` で次を再検査できます。

- SSR 専用・server component のみ・handler なしの各 build が HTML のみを出力する。
- 初期表示では loader だけを取得し、JSON parse と binding 探索を行わない。
- manifest 由来の modulepreload は対象イベントで有効にし、runtime の応答待ちでも handler を取得できる。取得だけでは評価・復元しない。
- 最初の操作で対象 island のみを復元し、静的 mount の操作では取得しない。
- runtime/handler の import 中に dispose/close しても状態を更新しない。
- 非同期 import の前に input 値を捕捉し、連続操作の順番を保持する。
- hash 付きの loader → runtime → handler の URL と manifest が整合し、handler の変更が親の hash に伝播する。
- 既存の共通操作と3幅の画素・computed style の一致を維持する。
