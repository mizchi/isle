# ブラウザーコンパイラと Playground

[テンプレート内 CSS と Z3](inline-css.md) に対応しています。Inline CSS プリセットで、scoped な `<style>`、SAT の反例、responsive 修正版を比較できます。Layout contract に幅・高さを指定し、Verify layout · Z3 で検査します。solver はコンパイラ・プレビューとは別の Worker 内で実行します。

[Playground](https://mizchi.github.io/isle/playground/) では `.isle`、props の JSON、CSS を編集し、ブラウザー内でコンパイルして実際に操作できます。Counter、Show / For によるリスト、Fragment の key でまとめる複数要素の行、入れ子の独立した owner、静的な server component のプリセットがあります。[制御コンポーネント](control-components.md)の仕様も参照してください。Component と Resume / SSR only を選択でき、コンパイル失敗時には診断をクリックしてソース位置へ移動できます。

Auto-run は 250ms の debounce で動きます。無効にした場合は Compile または Cmd / Ctrl + Enter で実行します。Inspect output で HTML と snapshot、生成モジュール、解析結果、IR を確認でき、Download output でソース・props・CSS とプレビューの成果物を JSON 保存できます。入力を変更すると古いプレビューを破棄し、古いコンパイル結果やプレビューからの通知は反映しません。

Source・Props・CSS・Layout contract の editor は textarea に装飾用のハイライトを重ねます。Isle の宣言・型・タグ・埋め込み CSS、CSS、JSON を字句単位で色分けし、未完成の入力もそのまま表示します。折り返さず、縦横スクロールと高さのリサイズに追従します。選択・undo・カーソル移動は textarea の標準動作です。IME の変換中と forced-colors 表示では通常の文字表示へ切り替えます。構文の正しさはハイライトとは独立してコンパイラが判定します。

## npm パッケージから使う

コンパイラ本体は MoonBit の JavaScript ESM 出力です。ブラウザー版と Node 版は同じ frontend、依存解析、コード生成を使い、Node 版にだけ `compileFile` があります。ブラウザー版には Node 組み込みモジュールもコンパイルサーバーも必要ありません。アプリのコードと同じ Worker に置くことを推奨します。

```js
// compiler.worker.mjs
import { compilePreview } from '@isle/prototype/compiler/browser';

self.onmessage = ({ data: { id, source, options } }) => {
  self.postMessage({ id, result: compilePreview(source, options) });
};
```

```js
// Browser entry, bundled with Vite
import { mountPreview, previewRuntimeURL } from '@isle/prototype/preview';

const frame = document.querySelector('iframe');
const runtimeResponse = await fetch(previewRuntimeURL);
const runtimeSource = await runtimeResponse.text();
const worker = new Worker(new URL('./compiler.worker.mjs', import.meta.url), {
  type: 'module',
});
worker.onmessage = ({ data: { result } }) => {
  if (result.ok) {
    mountPreview(frame, result.preview, { css: 'body { margin: 16px; }', runtimeSource });
  } else {
    console.log(result.stage, result.diagnostics);
  }
};
worker.postMessage({
  id: 1,
  source: 'client component Counter() { state n = 0; event add(e: EventSnapshot<MouseEvent>) { n += 1; } <button on:click={add}>{n}</button> }',
  options: { component: 'Counter', props: {}, mode: 'resume' },
});
```

`compile`、`checkDependencies`、`requireIR`、`explain` も `@isle/prototype/compiler/browser` から利用できます。`compilePreview` は最後に宣言した component を既定で選び、構文検査と SSR・生成を実行します。イベントハンドラはコンパイル時には実行しません。`mode: 'ssr'` では動的属性、snapshot、クライアントモジュールを生成しません。

`PreviewArtifact` は version 付きの JSON データです。HTML、snapshot、生成モジュール、エントリー、schema、イベントを持ちます。`createPreviewDocument` はその artifact から `srcdoc` 用 HTML を作り、`mountPreview` は iframe に sandbox と referrer policy を設定してから挿入します。`previewRuntimeURL` のテキスト asset も配信してください。Vite はこれを自動でコピーします。

## 実行と分割の範囲

コンパイルは module Worker で実行します。ソースは 128 Ki UTF-16 単位、HTML と snapshot の合計は 100 万単位、モジュールは合計 200 万単位までです。Playground は 5 秒で Worker を終了できるようにし、CSS にも 128 Ki の上限を設けます。これはリソース消費の完全な上限を証明するものではありません。

プレビューは `allow-scripts allow-forms` の opaque-origin iframe に閉じ込めます。`allow-same-origin` を付けず、親の DOM にアクセスできません。CSP で外部リソース、fetch、フォーム送信先、埋め込み先を制限します。親は現在の iframe・channel・ランダム token を照合して通知を受け取ります。ユーザーのコードをアプリ本体の DOM に直接挿入しないでください。

プレビューは生成 ESM を Blob にして読み込み、prepared-handler registry で接続します。初回操作までは snapshot の復元を行いません。SSR 専用のプレビューには bootstrap もランタイムも入りません。通常配信向けの resolver、ランタイム、schema fingerprint は変更しません。

Playground の modules 数と bytes は論理的な生成ソースの値です。Vite / Rolldown の最終チャンク数、minify / gzip 後のサイズ、production の CSS 最適化結果ではありません。サーバー action を含むプログラムには `E_PREVIEW_HOST` を返します。外部 CSS・画像・ネットワークに依存するリソースやページ遷移は、このプレビューでは実行できません。

## イベントを試す

すべての対話型プリセットは `event` 宣言と `on:click` 属性を使います。Events は明示した snapshot 引数から入力値・キーを読み、`.preventDefault` を遅延処理の前に実行します。Fragments は `(event) => select(event, item.id)` で row の値を型付きで渡します。本文に `inline(ts)` は不要です。対応する式・型と制限は [イベント宣言](events.md) を参照してください。

## 開発

```sh
just playground          # http://localhost:4334
just playground-check    # API + actual browser operations
just playground-build    # dist/playground
just playground-quality  # fixed seven UI quality gates
just site-build          # includes /isle/playground/ for GitHub Pages
```

現在は Rust を使わないため wasm-pack は不要です。将来 Rust backend を採用する際は wasm-pack の web target を Worker 内で初期化し、同じ artifact と診断コントラクトに接続できます。
