# Minimal counter / 最小の Counter

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Increment and reset a server-rendered value. Read app.isle and vite.config.mjs together. State and view declarations are compiled; named handlers become traceable code boundaries.

From a repository checkout, run at the repository root:

```sh
just example hello
```

Open <http://127.0.0.1:4320/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

SSR した値を増やし、初期値へ戻す。 app.isle と vite.config.mjs を一緒に読む。状態・表示の宣言はコンパイルされ、名前付き handler が追跡できるコード境界になる。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
