# Resource lifetime and cleanup / リソースの寿命と破棄

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [setup.mjs](setup.mjs) · [vite.config.mjs](vite.config.mjs)

Activate an owned timer and listener, remove the component, and observe one cleanup. First activate the session, then use Remove component. The resource owner clears the timer and removes the listener when the root disconnects; the outside status reports one disposal. Setup lives in an ordinary JavaScript module.

From a repository checkout, run at the repository root:

```sh
just example resources
```

Open <http://127.0.0.1:4325/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

所有された timer と listener を活性化し、component を削除して一度だけ破棄されることを見る。 まず Session を活性化し、Remove component で削除する。root が切断されると owner が timer と listener を破棄し、外側の status が一度だけの破棄を示す。setup は通常の JavaScript module に書く。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
