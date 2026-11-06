# Portable Web Components / ポータブルな Web Components

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [server.mjs](server.mjs) · [static.isle](static.isle) · [vite.config.mjs](vite.config.mjs)

Mount independent widgets, compare shared and standalone distributions, and reject a version mismatch. Open http://127.0.0.1:8793/portable/. Its Node server serves a custom asset path, shared/standalone builds and a mismatch case. The descriptor and generated loader are the public embed interface.

From a repository checkout, run at the repository root:

```sh
just widget-portable-dev
```

Open <http://127.0.0.1:8793/portable/>.

Check: `just widget-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

複数 widget をマウントし、共有版・standalone 版・版の不一致の拒否を確認する。 http://127.0.0.1:8793/portable/ を開く。Node server が任意の配信パスと共有版・standalone 版・版不一致の例を配信する。埋め込みには descriptor と生成 loader を使う。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just widget-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
