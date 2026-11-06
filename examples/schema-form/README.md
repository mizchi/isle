# Shared schema and server validation / 共通 schema とサーバー検証

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [host.mjs](host.mjs) · [vite.config.mjs](vite.config.mjs)

Submit taken@example.com, correct it, then submit and reset the shared-schema form. taken@example.com is reserved in memory. Async validation and submit return public field issues. The host uses a fixed demo principal, not production authentication.

From a repository checkout, run at the repository root:

```sh
just example schema-form
```

Open <http://127.0.0.1:4191/>.

Check: `just a11y-schema-form`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

taken@example.com の重複エラーを確認し、修正・送信・reset を試す。 taken@example.com はメモリー内で使用済み。非同期検証と submit が公開可能な field issue を返す。host の principal はデモ固定値で実認証ではない。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just a11y-schema-form`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
