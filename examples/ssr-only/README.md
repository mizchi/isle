# HTML without browser JS / ブラウザー JS のない SSR

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Inspect the build: HTML and CSS, with no Isle runtime, snapshots or handler chunks. The mode applies to the whole page. A pure component also works on both server and client without a side annotation. External scripts added by your app are outside this guarantee.

From a repository checkout, run at the repository root:

```sh
just example ssr-only
```

Open <http://127.0.0.1:4321/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

ビルドに Isle runtime・snapshot・handler chunk が含まれないことを確認する。 SSR 専用の指定はページ全体に適用する。無指定の純粋 component は server/client 共通で使える。アプリが別途追加する外部 script は対象外。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
