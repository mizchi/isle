# Manifest-driven loading / manifest による読み込み

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [setup.mjs](setup.mjs) · [vite.config.mjs](vite.config.mjs)

Inspect preload decisions in the manifest; typing activates Search while Details stays inactive. Open Network and isle.manifest.json. Search.edit is eligible for fetch-only preload. data-setup stays absent until interaction. Change loading to lazy, preload or eager in the config to compare policies; eager allows startup evaluation. profile emits User Timing only in this demo.

From a repository checkout, run at the repository root:

```sh
just example loading
```

Open <http://127.0.0.1:4324/>.

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

manifest の先読み判断を調べ、入力時には Search だけが活性化することを確認する。 Network と isle.manifest.json を調べる。Search.edit は取得のみの先読み対象になり、操作まで data-setup は付かない。config の loading を lazy/preload/eager に変えて比較できる。eager は起動時の評価を許す。この例の profile は User Timing を出力する。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。
