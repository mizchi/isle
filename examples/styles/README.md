# Lazy CSS readiness / 遅延 CSS と準備完了

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [card.css](card.css) · [setup.mjs](setup.mjs) · [vite.config.mjs](vite.config.mjs)

Load component CSS with its setup module and inspect the style seen by setup. Inspect card.css and setup.mjs. data-style-at-setup becomes ready on activation, showing that CSS was applied before setup. Vite handles CSS splitting; class-level CSS dead-code elimination is not implemented.

From a repository checkout, run at the repository root:

```sh
just example styles
```

Open <http://127.0.0.1:4326/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

setup module と CSS を読み込み、setup から見える適用済み style を調べる。 card.css と setup.mjs を読む。活性化後の data-style-at-setup が ready になり、setup 前に CSS が適用されたことを示す。CSS 分割は Vite が扱い、class 単位の CSS DCE は未実装。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
