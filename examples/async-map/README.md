# Harbor: async local map / 非同期ローカル地図

[All examples](../README.md) · [サンプル一覧](../README.ja.md) · [Experiment report / 評価](../../docs/async-map-experiment.md)

## English

A fictional neighborhood with 36 places. Drag, wheel/pinch zoom, use arrow keys, search, filter, select a marker or result, and save a place. Search and details have independent abortable requests and latest-result checks. The details view is a separate lazy chunk. Data is fetched from local JSON assets with 180ms controlled latency; no Google Maps key, external service, or real geographic data is used.

```sh
just example async-map
# http://127.0.0.1:4342/
just async-map-check
just async-map-eval
just async-map-quality
```

For an npm app, copy the files in this directory and use the [package setup](../../README.md#quick-start). The relevant public configuration is:

```js
import {isle} from '@isle/prototype/vite';
import {fileURLToPath} from 'node:url';
// Inside your Vite plugins:
isle({
  entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
  wrapMounts: false,
  loading: 'lazy',
  mounts: [{component: 'Explorer', scopeId: 'map', props: {}, label: 'Map'}],
  resources: {Explorer: './setup.mjs'},
});
// Keep build.assetsInlineLimit: 0 to retain real JSON asset requests.
```

`app.isle` owns search/category/activation and a keyed For of category buttons. `setup.mjs` is a **trusted SDK adapter** owning the Canvas, result list, and detail subtree. The compiler does not analyze its requests or DOM mutations. This example demonstrates host integration and identifies missing typed resource-result ingress; it does not establish native declarative async UI support. Saved places are session-local, not persisted.

The browser tests inject failures, hold the detail chunk, race requests, pinch zoom, mount two maps, and remove an owner during a request. `ISLE_MAP_SSR=1 just example-build async-map` produces a static preview with no JS, snapshots, setup or search/detail data assets. Static SVG/CSS still load.

## 日本語

36件の架空の場所を持つ地図。ドラッグ、ホイール・ピンチズーム、矢印キー、検索、カテゴリ、マーカー・検索結果の選択、場所の保存を試せる。検索と詳細は独立した中止可能な要求で、古い結果の採用も防ぐ。詳細画面は別の遅延チャンク。ローカルJSONへ実際にfetchし、180msの遅延を加える。外部サービス・APIキー・実際の地理データは使わない。

リポジトリでは上記の`just`コマンドで起動・検査・計測できる。npmから使うアプリでは[導入手順](../../README.ja.md#はじめる)に従い、このディレクトリと上記の公開設定を参照する。地図用の追加パッケージは不要。保存した場所はこのセッション内だけで保持する。

`app.isle`は検索・カテゴリ・開始状態と、key付きForのカテゴリボタンを所有する。Canvas、非同期の結果リスト、詳細領域は`setup.mjs`以下のtrusted adapterが所有する。**その通信とDOM操作はコンパイラの解析対象に入らない。** 外部UIとの連携が動くことと、DSLだけで非同期UIを書けることを区別して評価する。[状態モデル](model.mjs)、[DOM接続](setup.mjs)、[評価レポート](../../docs/async-map-experiment.md)を参照。

ブラウザ検査で通信失敗、詳細コードの遅延、応答順、ピンチ、複数mount、取得中のunmountを再現する。`ISLE_MAP_SSR=1 just example-build async-map`は、静的なプレビューだけを生成する。JS・snapshot・setup・検索/詳細のJSONは含まず、SVGとCSSは配信する。
