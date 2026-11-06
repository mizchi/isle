# Cloudflare Workers widget / Workers からの widget 配信

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [host.mjs](host.mjs) · [vite.config.mjs](vite.config.mjs) · [worker.mjs](worker.mjs)

Use two terminals for widget-dev and widget-host; embed fixed-size Shadow DOM widgets on another origin. Start just widget-host in another terminal and open http://127.0.0.1:8788/. The widget host itself runs at 8787. Width/height reserve layout space; the runtime must match the exact version. See the deployment guide for host policy.

From a repository checkout, run at the repository root:

```sh
just widget-dev
```

Open <http://127.0.0.1:8787/>.

Check: `just widget-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

widget-dev と widget-host を別 terminal で起動し、別 origin に固定サイズの Shadow DOM widget を埋め込む。 別 terminal で just widget-host を起動して http://127.0.0.1:8788/ を開く。widget 自体は8787で動く。width/height で領域を予約し、runtime の版は完全一致させる。host policy は配備ガイドを参照。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just widget-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。

This larger example uses the [dashboard source](../../benchmarks/variants/isle/dashboard.isle) and [dataset](../../benchmarks/dashboard/model.mjs).

大きい widget の例なので、上記の dashboard ソースと dataset も参照する。
