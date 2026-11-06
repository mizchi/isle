# Explicit server action / 明示的な server action

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [host.mjs](host.mjs) · [vite.config.mjs](vite.config.mjs)

Compare independent counters and rename a document through a validated, authorized server boundary. The host uses a fixed demo principal and an in-memory document. Production authentication and atomic database authorization/write behavior belong to your server adapter.

From a repository checkout, run at the repository root:

```sh
just example counter
```

Open <http://127.0.0.1:4173/>.

Check: `just e2e`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

独立した Counter と、検証・認可を経由する文書名変更を試す。 host は固定のデモ principal とメモリー内の文書を使う。実認証と、DB の認可・更新の原子性は利用者の server adapter に実装する。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just e2e`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
