# Native form validation / 標準フォームの検証

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Try invalid input, required consent and successful submission with accessible labels. Read app.isle and vite.config.mjs together. State and view declarations are compiled; named handlers become traceable code boundaries.

From a repository checkout, run at the repository root:

```sh
just example form
```

Open <http://127.0.0.1:4190/>.

Check: `just a11y-form`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

不正入力・必須同意・送信成功を、ラベル付きのフォームで試す。 app.isle と vite.config.mjs を一緒に読む。状態・表示の宣言はコンパイルされ、名前付き handler が追跡できるコード境界になる。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just a11y-form`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
