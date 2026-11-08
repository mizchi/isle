# Parent-owned actions in universal cards / 子へ配置する親のイベント

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs) · [reset.css](reset.css).

A parent-owned button is passed as `children: RenderFragment` into a universal card inside `For`. Click Toggle or press Enter: only that row changes. Clicking a card heading or padding does nothing. Filter rows, toggle again, and add a fourth review. Both parent and child declare SafeGrid contracts; the build verifies allocations over 320–960 × 640–960px. Cards switch to two columns at 600px.

```sh
just example lexical-events
just lexical-events-check
just lexical-events-quality
```

Open <http://127.0.0.1:4341/>. SSR-only build: `pnpm exec vite build --config examples/lexical-events/vite.config.mjs --mode ssr`.

For a consumer app, use the [npm setup](../../README.md#quick-start), copy these files, and change the plugin import to `@isle/prototype/vite`. No callback prop, parent click wrapper, or function in a snapshot is needed. This static projection cannot carry parent events across an independent client owner.

## 日本語

親が書いたボタンを `children: RenderFragment` として `For` 内の universal なカードへ渡す。Toggle または Enter はその行だけを更新し、見出し・余白のクリックは更新しない。絞り込み後の操作と4件までの追加も試せる。親子の SafeGrid 契約は配布範囲320–960 × 640–960pxで検査し、600px以上で2列にする。

リポジトリのルートで上記コマンドを実行する。利用者のアプリでは[npm導入手順](../../README.ja.md#はじめる)に従ってファイルをコピーし、pluginを `@isle/prototype/vite` からimportする。

callback props、親のclick wrapper、snapshotへの関数の保存は不要。投影したイベントは親が所有し、別のclient ownerを越えて渡すことはできない。[合成の契約](../../docs/composition.md)を参照。
