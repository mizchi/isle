# ページ遷移の先読み

Vite plugin の `speculation` に標準の Speculation Rules JSON を指定できます。ビルド時に `<script type="speculationrules">` を HTML の head へ出力し、ブラウザーがページの prefetch / prerender を判断します。既定では無効です。追加の loader JS、hover listener、polyfill は配信しません。

```js
isle({
  entry,
  mounts,
  loading: 'lazy', // このページ内の CodeRef / island は従来どおり遅延する
  speculation: {
    tag: 'isle-docs',
    prefetch: [{
      where: {
        and: [
          { href_matches: '/*' },
          { selector_matches: 'a[data-isle-prefetch]' },
          { not: { selector_matches: '[download], [data-no-speculation]' } },
        ],
      },
      eagerness: 'moderate',
    }],
    prerender: [{
      where: {
        and: [
          { href_matches: '/*' },
          { selector_matches: 'a[data-isle-prerender]' },
          { not: { selector_matches: '[download], [data-no-speculation]' } },
        ],
      },
      eagerness: 'moderate',
    }],
  },
});
```

```html
<a data-isle-prefetch href="guide.html">ガイド</a>
<a data-isle-prerender href="next.html">次のページ</a>
<a data-no-speculation href="account.html">アカウント設定</a>
```

属性の名前はこの例の selector に対応する通常の HTML 属性です。framework の予約構文や特別な listener ではありません。`data-no-speculation` の除外も上の `not` 条件によるもので、URL リストを含め自動で全ルールに適用する機能ではありません。

遷移先が固定なら `prefetch: [{ urls: ['guide.html'], eagerness: 'immediate' }]` と指定できます。URL は通常の document-relative な意味を保持し、Vite base や chunk manifest を使って書き換えません。ルート相対パスや HTTP(S) の絶対 URL も使えます。origin を限定する場合は上の `href_matches` のような条件を含めてください。

## ページとチャンクの違い

| 対象 | 指定方法 | 動作 |
| --- | --- | --- |
| 遷移先の HTML | `speculation.prefetch` | ページを取得し、遷移に備える |
| 遷移先のページ全体 | `speculation.prerender` | 非表示のページでレンダリングと JS 実行を開始する |
| 入力・送信の handler / runtime | `loading: 'auto'`（既定） | compiler が追加 gzip 予算内で `modulepreload` を選ぶ |
| このページの handler / runtime | `loading: 'preload'` | manifest の依存関係を `modulepreload` する |
| このページの handler / runtime | `loading: 'eager'` | manifest の module を事前に import / 評価する |

Speculation Rules はページ遷移用です。QRL 相当の CodeRef や JS ファイルの URL を渡してチャンクを取得する用途には使いません。ナビゲーション用 JSON を追加しても、既存の JS graph・chunk hash・manifest の loading policy は変わりません。[HTML Standard の定義](https://html.spec.whatwg.org/multipage/speculative-loading.html)

`immediate` / `eager` / `moderate` / `conservative` はネイティブの eagerness です。省略時は標準の既定値（URL list は immediate、document rule は conservative）を使います。先読みはヒントであり、設定・リソース制約・対応状況により実行されない場合があります。未対応でも通常のリンク遷移を続けられます。[HTML Standard](https://html.spec.whatwg.org/multipage/speculative-loading.html)

## resume と SSR

prerender 中も、生成した handler はイベントが来るまで実行せず、snapshot を展開しません。ページが activation された後も、最初の操作で必要な island だけを再開します。任意の clientEntry や外部スクリプトの起動処理は prerender 中に実行され得ます。分析・表示に伴う処理を遅らせる場合は、標準の `document.prerendering` と `prerenderingchange` を使います。登録した server action は、先読みや prerender を理由に検証・認可を省略しません。[Chrome のライフサイクルの説明](https://developer.chrome.com/docs/web-platform/prerender-pages?hl=ja)

`mode: 'ssr'` でも navigation rules は出力できます。JSON の data block だけで、framework の実行用 JS・snapshot・イベント marker・modulepreload は出しません。GET 自体で状態が変わるページや、起動時に意図しない処理を実行するページは、対象に含めない設計が必要です。

## 契約と確認方法

現在受け付けるルールは `urls` または `where` のどちらか一方と、任意の `eagerness` / `tag` / `referrer_policy` です。where は `and` / `or` / `not` / 文字列または文字列配列の `href_matches` / `selector_matches` を扱います。未知のキー、不正な型、非 HTTP(S) URL、循環 predicate はビルド時に拒否します。CSS selector と URL pattern 自体の文法・一致条件はブラウザーが検査します。URLPatternInit オブジェクト、外部 ruleset、`requires` / `target_hint` / No-Vary-Search は未対応です。

Vite の `html.cspNonce` を data block にも引き継ぎます。CSP のレスポンスヘッダーは配信側で設定し、同じ nonce を許可してください。JSON に含まれる `<` は escape し、script 終端として扱われないようにします。

Chrome DevTools の Speculative loads でルールの解釈と成否を確認できます。サーバーでは `Sec-Purpose: prefetch` / `prefetch;prerender`、対応実装の `Sec-Speculation-Tags` で区別できます。activation 後は `performance.getEntriesByType('navigation')[0].activationStart > 0` が prerender 利用の確認になります。これらは実行・利用の観測であり、LCP や INP の改善量の計測とは別です。[Chrome の検出・計測方法](https://developer.chrome.com/docs/web-platform/prerender-pages?hl=ja)

`tests/speculation.test.mjs` で JSON、CSP、SSR、dev、chunk 不変性を検査します。`e2e/speculation.spec.mjs` では実際の Chromium による prefetch と prerender、snapshot の未展開、activation 後の初回操作を検査します。今回の Chromium 環境では Playwright の通常の page 接続で prerender が無効化されたため、prerender のケースは一時プロファイルの Chromium をデバッグ接続なしで起動します。fixture が標準 API と loader の観測値を HTTP で返し、ready → activation → 初回操作を同期させます。製品の loader にこの計測処理は含めません。
