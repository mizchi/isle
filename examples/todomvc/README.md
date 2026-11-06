# TodoMVC

## English

Add a trimmed title with Enter. Toggle individual todos or all todos, switch All / Active / Completed, edit a title with double-click or keyboard activation, save with Enter or blur, cancel with Escape, and delete completed or individual items. Empty edits delete the item. Reload to restore localStorage and the hash filter.

```sh
just example todomvc       # http://127.0.0.1:4331/
just example-build todomvc
just todomvc-check         # same browser flow for all four implementations
just todomvc-size          # production build + correctness + raw/gzip/Brotli
```

`app.isle` owns the state, pure collection expressions, keyed regions and split event handlers. `host.mjs` connects browser storage, hash changes and focus; it does not render or change component state directly. `browser.mjs` boots the loader. The production demo runs on static hosting, including GitHub Pages.

[Comparison method](../../benchmarks/todomvc/README.md) · [Measured sizes](../../benchmarks/results/todomvc/latest.md). The benchmark uses the same host module, UI and behavior in Isle, Qwik stable, Qwik 2 RC and Preact. Custom accessible CSS replaces the official TodoMVC styling; this is not an official TodoMVC distribution.

## 日本語

Enter で前後の空白を取り除いた Todo を追加します。個別・全件の完了切替、All / Active / Completed の絞り込み、ダブルクリックまたはキーボードによる編集、Enter・フォーカス移動で保存、Escape で取消、個別削除・完了済み削除に対応します。空の編集は削除になり、再読み込み後も localStorage と URL hash から復元します。

```sh
just example todomvc       # http://127.0.0.1:4331/
just example-build todomvc
just todomvc-check         # 4実装に共通のブラウザー操作
just todomvc-size          # production build・動作検証・raw/gzip/Brotli 計測
```

`app.isle` に状態・純粋な配列式・key 付き領域・分割イベントを記述します。`host.mjs` は保存・hash・フォーカスの接続だけを担当し、描画や state の直接書き換えは行いません。`browser.mjs` で loader を起動し、GitHub Pages を含む静的ホストで動作します。

[比較条件](../../benchmarks/todomvc/README.md)・[サイズ実測](../../benchmarks/results/todomvc/latest.md)。共通の host module・UI・操作を Isle / Qwik stable / Qwik 2 RC / Preact に実装しています。見やすさと操作性を考慮した独自 CSS のため、公式 TodoMVC 配布物そのものの比較ではありません。
