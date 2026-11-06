# 同じ UI による Qwik / Preact 比較

[TodoMVC](todomvc/README.md) は追加・編集・絞り込み・保存を4実装で揃え、`just todomvc-size` で raw / gzip / Brotli と実取得量を比較します。[実測表](results/todomvc/latest.md)。

Counter より大きな [作業計画ダッシュボード](dashboard/README.md) も追加しました。`just dashboard` で64項目・検証付きフォームの共通操作、速度測定、表示比較を実行します。[速度の実測表](results/dashboard/latest.md)を参照してください。

[大量商品行の検証](heavy-render/README.md) は4,096商品の一括更新を使い、Isle の静的解析と実際の DOM mutation・Event Timing・layout を照合します。`just heavy-bench` で再現でき、[結果表](results/heavy-render/latest.md)に負荷の増え方を記録します。

`just compare` で production build → 転送量集計のテスト → Playwright の共通操作 → 3幅の視覚比較を実行します。Node.js 24+、pnpm、MoonBit、Playwright Chromium が必要です。

```sh
pnpm install
pnpm exec playwright install chromium
just compare
just compare-serve  # http://127.0.0.1:4180/{isle,qwik,qwik-next,preact}/
```

[実測表](results/latest.md) / [全リクエストと raw/gzip の JSON](results/latest.json) / [視覚比較](results/visual/summary.json) / [小型化前後の記録](../docs/runtime-size.md)。出力はコマンドで上書きされます。ビルド後は `just compare-test` / `just compare-visual` だけでも再計測できます。

## 共通シナリオ

独立した Counter を 37 と 5 から SSR し、各ボタンに `count / count * 2` を表示します。最初を2回、次を1回押すと `39 / 78` と `6 / 12` になります。Editor は `Draft` から始め、1回押すと同じ POST API を経由して `Draft!` になります。

初期値・見出し・CSS・HTML shell は [shared/scenario.mjs](shared/scenario.mjs) で共有します。各フレームワークには同じ表示と操作を実装します。Isle のみ制約された専用構文、Qwik は `component$` / `useSignal` / `useComputed$` / `onClick$`、Preact は通常の `useState` / SSR / `hydrate` を使います。

RPC は全実装が同じ `/__isle/action/renameDocument` を使います。共通 server が Isle の既存 action handler とデモ用 host adapter で認証コンテキスト・入力・policy・出力を検査します。Qwik City、Preact の router、framework 固有の RPC 実装のサイズは含めません。デモの server principal は固定値で、実ログインの比較ではありません。

Playwright は各実装を JavaScript 無効でも表示できること、SSR 値を保持した動作、インスタンス間の独立性、繰り返し操作、非同期結果、最初の SSR button DOM の保持、browser error / 404 がないことを確認します。視覚比較は Isle → Qwik 1 / Qwik 2 RC / Preact の各組み合わせで実行します。

## 測定条件

| 実装 | バージョン固定 | ビルド |
|---|---|---|
| Isle | 0.0.1 | Vite 8.3.5 / Rolldown |
| Qwik stable | @builder.io/qwik 1.20.3 | Vite 7.3.7 / Rollup |
| Qwik next | @qwik.dev/core 2.0.0-rc.4 | Vite 8.3.5 / Rolldown |
| Preact | 11.1.1 | Vite 8.3.5 / Rolldown |

Qwik 1 の peer dependency は Vite `<8`、Qwik 2 RC は Vite `>=8 <9` です。それぞれ対応範囲のビルドを使い、Qwik 2 は RC と明記します。バンドラーの差が含まれるため、フレームワーク単独の差と解釈しません。パッケージは pnpm workspace ごとに分離しています。

全実装を minify あり、source map なし、ES2023 target、Vite の `modulePreload: false` でビルドします。Qwik 独自の loader / preloader は標準設定のままです。Isle は解析済みの JavaScript 専用 handler をバンドラーの `emitFile` で分割し、標準の動的 import で直接ロードします。Preact にも同じ ES2023 / Vite 設定を適用し、互換 module-preload polyfill を含めません。

Isle の production 計測は `diagnostics: false`（既定値）です。メトリクスと詳細な診断文を除去します。`examples/counter` の操作検証用デモは `diagnostics: true` にしており、こちらのサイズとは区別します。状態の型・slot 数・build hash・scope・RPC 検査は両方に残ります。

Isle は初期表示で event loader のみを取得し、最初の操作で共通 runtime/registry と対象 handler を取得します。未操作の island の snapshot は parse しません。初回 Counter の追加 JS 列には runtime と Counter handler の両方を含めます。loader 分離前との転送量の差と SSR 専用出力は [island loader](../docs/island-loader.md) に記録しています。

比較 fixture は `loading: 'lazy'` の既定値です。[CodeRef / manifest](../docs/code-references.md) の eager/preload は別の E2E fixture で検証します。生成した `isle.manifest.json` は通常の表示では取得せず、要求された body の合計にも含めません。

ビルド時間や compiler 本体のサイズは browser の転送量に含めません。SSG 済みの Isle HTML と、request ごとにレンダリングする Qwik / Preact HTML を同じ Node server で配信します。SSR CPU 時間は今回の比較対象に含めません。

各実装で新しい Chromium context を作り、service worker を禁止して cold load します。Qwik の loader / preloader / chunk 戦略は標準設定を保ちます。初期フェーズは load 後2秒待ち、さらに network idle を待つ範囲です。この間の投機的プリロードも初期取得に含めます。操作フェーズは最初の Counter、同じ Counter の再操作、別 Counter、最初の remote に分け、リクエスト開始時点で分類します。

レスポンスの展開済み body を記録し、各 body を gzip level 6 で個別に圧縮して合計します。server の HTML/asset 配信も同じ設定です。HTML は inline loader、snapshot、CSS を含み、別の JS として二重計上しません。Qwik の bundle graph JSON などは補助 asset として合計に含めます。RPC request/response、HTTP header は asset 合計から除外し、RPC response は JSON に別記します。

プリロード後の再利用を二重に数えないよう、asset は最初に取得した URL ごとに1回計上します。したがってこれは、共通操作で取得した**固有 asset body の転送量**です。再送・HTTP cache の詳細・ネットワーク全体の実転送量を測るものではありません。配信された asset の合計と、未使用 chunk を含むビルド済み全 JS の合計を別の列で示します。Qwik の復元データに生成 ID が含まれるため、HTML の圧縮後サイズは再実行で数 bytes 変動し得ます。

## 視覚比較と範囲

vlmkit 0.24.0 の migration compare で 1440 / 1280 / 375px の画素差分と computed style を検査します。今回 Crater BiDi は利用できず、Playwright の DOM / computed style による検査を使いました。DOM 要素総数には framework ごとの script / preload / snapshot の違いがあり、element-count-mismatch 警告が出ます。表示・操作部分の一致は画像・style・共通操作で確認し、警告は JSON に保存します。

この小さいシナリオは配信コードの比較です。汎用機能の同等性、複雑な UI、実ネットワーク下の応答時間、runtime の処理速度を代表する結果にはしません。Isle は現在対応する構文が狭いプロトタイプです。次のシナリオを追加するときは全実装へ同じ要求を実装し、共通の表示・操作テストも追加します。

Qwik 2 RC の SSR bundle は import 時に scheduler の MessagePort を保持します。計測 CLI は report 書き込み・browser/server の close を完了してから終了するようにしており、計測対象の browser runtime は変更していません。

参照: [Qwik SSR API](https://qwik.dev/api/qwik-server/)、[Qwik 2 Vite integration](https://next.qwik.dev/docs/advanced/vite/)、[Preact SSR](https://preactjs.com/guide/v11/server-side-rendering/)。実際のバージョンと peer 条件は固定した依存の package.json / pnpm-lock.yaml に基づきます。
