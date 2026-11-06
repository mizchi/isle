# Cloudflare Workers と Web Components widget

埋め込みタグの使い方と配布モードの選択は[widget ユーザーガイド](widgets.md)を参照してください。このページは付属の Worker を動かし、配布する手順です。

`examples/worker-widget/` は64項目の dashboard と検証付き Form を、`<isle-widget>` Custom Element と Shadow DOM に展開します。iframe は生成しません。Workers Static Assets が定義用 ESM、コンパイル済み HTML と snapshot の descriptor、manifest、分割 ESM を配信し、Worker が RPC / 非同期検証を処理します。

Provider: https://isle-widget.mizchi.workers.dev/

共通層と任意の配置先・アプリへの適用は [widget の共通設計](widget-architecture.md)を参照してください。現在は Vite の widget 設定から直接生成し、descriptor の検査、mount、Custom Element、HTTP と host adapter を分離しています。共有版の SDK はページ内で版・ABI が完全一致するランタイムを共有し、不一致なら後続 SDK を停止します。独立した standalone 版も生成します。

## 埋め込み

```html
<isle-widget
  src="https://isle-widget.mizchi.workers.dev/"
  role="region" aria-label="Work planner"
  width="640" height="640" loading="lazy"
  style="display:block;width:640px;height:640px;max-width:100%;overflow:auto;contain:layout paint style;border:0;box-sizing:border-box"
>
  <a href="https://isle-widget.mizchi.workers.dev/">Open Work planner</a>
</isle-widget>
<script type="module"
  src="https://isle-widget.mizchi.workers.dev/widget.js"
  crossorigin="anonymous"></script>
```

**Custom Element の width/height 属性だけでは領域は予約されません。** 上の寸法 CSS も初期 HTML に含めます。定義 JS、descriptor、runtime の到着より前から幅640px・高さ640pxを確保します。幅は親に合わせて縮め、高さは維持します。内容の増減はタグ内部のスクロールで扱い、自動高さ変更はしません。親が後からタグを挿入・移動したり寸法 CSS を上書きする場合は別の layout change になります。

[`renderWidgetEmbed()`](../lib/widget.d.mts) と CLI でも同じタグと module script を生成できます。サイズは1〜8192の整数 CSS pixel が必須で、百分率・auto・省略は拒否します。URL とラベルは HTML escape します。

```ts
import { renderWidgetEmbed } from './lib/widget.mjs';
const html = renderWidgetEmbed({
  src: 'https://isle-widget.mizchi.workers.dev/',
  title: 'Work planner', width: 640, height: 640,
});
```

`src` は provider の絶対 HTTP(S) base URL です。そこから `widget.js`、`widget.json`、`__isle/` を解決します。`loading="lazy"` は viewport の200px手前まで descriptor を取得しません。すぐ使う配置では `loading="eager"` を指定します。これは内部コードの eager / preload policy とは別です。複数タグが同じ module script を参照しても、Custom Element の定義と ESM の評価は共有されます。

JavaScript が無効なら固定領域内のリンクを表示します。provider の通常ページでは SSR の64項目を表示できます。Custom Element 内の SSR HTML は descriptor の到着後に挿入するため、埋め込み先の初回 HTML に実内容を配信する Declarative Shadow DOM は現時点では未実装です。

## standalone 版を埋め込む

同じビルドで `/standalone/` 以下にも成果物を生成します。共有版は `/widget.js` と `/widget.json`、standalone は `/standalone/widget.js` と `/standalone/widget.json` です。

```ts
renderWidgetEmbed({
  src: 'https://isle-widget.mizchi.workers.dev/standalone/',
  runtime: 'standalone',
  title: 'Work planner', width: 640, height: 640,
});
```

`<isle-widget-standalone>` と standalone SDK を出力し、同じ寸法 CSS で領域を予約します。共有 pool に参加せず、異なる版の共有 SDK とも併用できます。異なる standalone 版同士には別のタグ名を割り当ててビルドします。版・配布モードの違う descriptor や mount module は拒否します。コード分割した assets と `/__isle/` API を配信する方式で、単一 JS ファイルやオフライン版ではありません。

版は package.json の `version` で固定します。共有 SDK は不一致時に vendor の取得・タグ定義を始めず、すでに動いている widget は維持します。standalone へ自動的には切り替えません。配布モードと版の契約は[共通設計](widget-architecture.md#standalone-配布)を参照してください。

## resume と lifecycle

```text
publisher document
  └─ isle-widget: fixed size before upgrade
       └─ ShadowRoot: scoped CSS + SSR DOM + inert snapshots
            ├─ widget.json → manifest-derived parallel modulepreload
            ├─ provider ESM → mount(ShadowRoot, options)
            └─ /__isle/action/*, /__isle/validate/* → provider Worker
```

`loadIslands()` / `resume()` は Document と ShadowRoot を受け取ります。listener、snapshot 検索、root ID、復元状態をその root ごとに管理します。同じ scope ID を持つ widget を複数置いても状態・フォームのラベル・team filter は独立します。CSS は Shadow DOM 内に置き、狭い widget には container query を適用します。

descriptor から manifest の依存 closure を得て、provider の chunk を並列で modulepreload します。eager の code を準備しても snapshot は操作まで parse しません。handler の URL と export は既存 CodeRef のままで、親ページの URL を基準に解決しません。共有版の vendor は factory で一つだけ読み込みます。最新の構成とサイズは[版の固定と standalone 配布の評価](../evals/reports/runtime-distributions.md)を参照してください。

取り外した要素は fetch、observer、listener、FormSession を解放します。共通 mount の所有権と AbortSignal を検査し、古い mount が再接続後へ書き込まないようにします。同期的な DOM 移動では状態を維持し、実際に切り離して再接続した場合は初期表示から読み直します。[Custom Elements の lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)に合わせています。

`isle:ready`、`isle:error` をタグから通知します。Form の `isle:submit` は validated output を detail に持ち、Shadow DOM の外でも受け取れる composed event です。エラー一覧のリンクは同じ ShadowRoot 内の入力へ直接フォーカスします。

## origin と server の境界

Web Component の JS は**埋め込み元の権限で実行されます**。Shadow DOM は DOM / CSS のスコープであり、origin や JavaScript のセキュリティ境界にはしません。provider のコードを信頼する埋め込み方式です。

RPC の送信元 Origin は publisher になります。mount の `actionBaseURL` で provider の `__isle/` を指定し、通常 action と Form の action / validate が同じ transport を使います。この widget は `credentials: 'omit'` で Cookie を送信しません。既存の通常ページは同一 origin の経路と `same-origin` credentials を維持します。

```ts
const worker = createWorkerHandler(contracts, host, {
  allowedOrigins: ['https://publisher.example'],
});
```

`createWorkerHandler()` の既定値は引き続き同一 origin 限定です。明示した origin list、または公開デモ用の `'*'` のときだけ CORS / OPTIONS を許可します。preflight は POST と content-type に限定し、通常応答だけでなく422等にも CORS header を付けます。null / 不正 origin、cross-origin の Cookie / Authorization は拒否し、Access-Control-Allow-Credentials は返しません。公開・非 credential の CORS は[標準の構成](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS)に従います。

このデモの host は公開・stateless なので `allowedOrigins: '*'` を明示しています。保存は検証済み DTO を画面へ反映するだけで、DB には永続化しません。入力型、schema 制約、resource policy、operation effects の検査は全て server に残します。origin list 自体をユーザー認証の代わりには扱いません。private な認証・token protocol はこの例には含みません。

descriptor の module / preload URL は同じ provider に限定し、HTML はコンパイラが生成した inert markup を前提にします。任意の未検査 HTML を安全化する機能ではありません。

## Workers と CSP

`assets.run_worker_first: ["/__isle/*"]` により、RPC だけを Worker 優先にします。公開ファイルは `dist/worker-widget/client/`、server 契約はその外の `server/` に置きます。境界型検査と HTML encoder は codegen から独立し、Worker runtime に compiler・filesystem・Node API は不要です。`nodejs_compat` を使いません。[ASSETS binding](https://developers.cloudflare.com/workers/static-assets/binding/)を使う薄い Request/Response adapter です。

公開 ESM / descriptor は CORS を許可します。hash 付き assets は immutable、`widget.js` / `widget.json` / HTML / manifest は再検証、RPC は no-store です。asset の header は `_headers`、RPC の CORS は Worker の応答で設定します。[Cloudflare の header 適用範囲](https://developers.cloudflare.com/workers/static-assets/headers/)を区別します。

親ページに CSP がある場合は provider を script-src と connect-src に許可します。現在はタグの寸法と Shadow DOM の CSS に inline style を使うため、親側の style-src もその使用を許可する必要があります。nonce の伝播や外部 stylesheet 用の生成は未実装です。provider ページの CSP が親へ引き継がれるわけではありません。

## 実行・検証

```sh
just widget-check        # compiler/build、Wrangler dry-run、unit、workerd E2E
just widget-dev          # terminal A: http://127.0.0.1:8787/
just widget-host         # terminal B: http://localhost:8788/ への埋め込み
just widget-quality     # terminal C: 親 / provider の14 gateと初期画像
just widget-deploy
just widget-embed https://isle-widget.mizchi.workers.dev/ 640 640
just widget-host https://isle-widget.mizchi.workers.dev/
just widget-embed https://isle-widget.mizchi.workers.dev/standalone/ 640 640 standalone
just widget-host https://isle-widget.mizchi.workers.dev/standalone/ standalone
just widget-quality http://127.0.0.1:8787/standalone/ standalone
just widget-check-remote https://isle-widget.mizchi.workers.dev/
```

`just ci` が共通 compiler / runtime、`just widget-check` が Workers を含む追加検査を行います。他 example の build が dist/ を消すため、widget には build 付きタスクを使います。

Playwright では定義 JS、descriptor、残りの code を個別に遅延させます。1280pxの親では640×640px、375pxでは343×640pxを保持し、後続要素の位置は読み込み・RPC・Form 操作後も同一です。計測した CLS は0で iframe は0個です。Shadow DOM 内の shift も親 document の PerformanceObserver の対象になります。任意の親ページ全体や、将来の動的内容の CLS を保証するものではありません。

[評価記録](../evals/reports/widget-elements.md)、[PC 計測](../evals/results/widget-elements/layout-1280.json)、[モバイル計測](../evals/results/widget-elements/layout-375.json)を参照してください。以前の iframe 版は[過去の評価](../evals/reports/worker-widget.md)として残します。

公開 Workers に対する最新の検査と standalone の寸法計測は[配布モードの評価](../evals/reports/runtime-distributions.md)を参照してください。従来の共有版の[PC](../evals/results/widget-elements/remote/layout-1280.json)・[モバイル](../evals/results/widget-elements/remote/layout-375.json)の計測も保持しています。
