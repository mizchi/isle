# Selective DOM updates / 動的な表示だけ更新

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Change one value while the static heading and unrelated output keep their DOM identity. Inspect generated handler chunks: increment writes count and its derived text; editing the note does not touch count. Browser tests observe actual DOM mutations.

From a repository checkout, run at the repository root:

```sh
just example partial-updates
```

Open <http://127.0.0.1:4322/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

一つの値を変更し、静的見出しと無関係な出力の DOM が保持されることを確かめる。 生成 handler では increment が count と派生テキストを更新する。note の編集では count に触れない。ブラウザー検査で実際の DOM mutation を確認する。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
