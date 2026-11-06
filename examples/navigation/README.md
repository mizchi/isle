# Native navigation hints / 標準の遷移先読み

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Inspect a native Speculation Rules data block and follow an ordinary link; no Isle browser JS is emitted. Speculation Rules are browser hints, not a promise of prefetch. Unsupported browsers still follow the link normally. This example uses prefetch only; prerender may evaluate scripts on the destination. It does not preload handler chunks.

From a repository checkout, run at the repository root:

```sh
just example navigation
```

Open <http://127.0.0.1:4327/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

Speculation Rules の data block と通常リンクを確認する。Isle の browser JS は出力しない。 Speculation Rules は browser のヒントであり、取得の実行を保証しない。未対応環境でも通常リンクで遷移できる。この例は prefetch のみ。prerender は遷移先の script を実行し得る。handler chunk の先読みとは別機能。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
