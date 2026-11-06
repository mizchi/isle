# Branches, keyed lists and errors / 分岐・key 付きリスト・例外

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [vite.config.mjs](vite.config.mjs)

Switch branches, reorder keyed rows, then empty the list to reach @empty and synchronous @catch. Reverse only while there are two rows; use Restore rows after emptying. @try catches synchronous render failures, not arbitrary Promise or server mutations.

From a repository checkout, run at the repository root:

```sh
just example control-flow
```

Open <http://127.0.0.1:4323/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

分岐を切り替え、key 付き行を並べ替え、空配列で @empty と同期 @catch を確認する。 Reverse rows は2行あるときに使い、空にした後は Restore rows で戻す。@try は同期 render の失敗を扱い、任意 Promise や server mutation を取り消す構文ではない。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
