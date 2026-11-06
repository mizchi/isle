# Branches, keyed lists and errors / 分岐・key 付きリスト・例外

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Try Show, Switch / Match and For, then empty the list to reach the For fallback and ErrorBoundary. Each returned Row carries its key. Reverse only while there are two rows; use Restore rows after emptying. ErrorBoundary catches synchronous render failures, not arbitrary Promise or server mutations. [fragments.isle](fragments.isle) groups multiple roots under one Fragment key; try the Fragments preset in the [playground](https://mizchi.github.io/isle/playground/).

From a repository checkout, run at the repository root:

```sh
just example control-flow
```

Open <http://127.0.0.1:4323/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

Show・Switch / Match・For を切り替え、行のルートに key を付けて並べ替え、空配列で For の fallback と ErrorBoundary を確認する。Reverse rows は2行あるときに使い、空にした後は Restore rows で戻す。ErrorBoundary は同期 render の失敗を扱い、任意 Promise や server mutation は取り消さない。fragments.isle は複数要素を Fragment の key でまとめる例で、Playground の Fragments プリセットから操作できる。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
