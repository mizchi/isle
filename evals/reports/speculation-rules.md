# Speculation Rules の導入

Vite の `speculation` オプションから native JSON を HTML へ出力する。対象はページ遷移であり、CodeRef の manifest / eager / modulepreload と分ける。未設定・空の候補は出力しない。framework の追加 runtime JS はなく、SSR 専用でも data block だけを出せる。

受入テストで確認した内容:

- 同じ production fixture の設定前後で JS chunk の名前・内容が一致する。
- nonce 付き CSP でネイティブのルール解釈が成功する。
- 実際の prefetch GET を観測し、遷移先の script を実行せず、snapshot も展開しない。
- 別の一時 Chromium profile をデバッグ接続なしで起動すると prerender が実行される。ready 時点は `document.prerendering: true`、snapshot 展開0件。
- activation 後は `activationStart > 0`、snapshot 展開0件。初回 click 後だけ対象 scope を展開し、count 37 → 38、button の DOM identity を保持する。
- selector に一致しても `not` 条件で除外したリンクは取得されない。
- JavaScript 無効でも標準のリンクと SSR HTML で移動できる。

最初は Playwright と独立した CDP session の双方で `PrerenderingDisabledByDevTools` を観測した。そこで製品コードや browser feature flag を変更せず、fixture が load / prerenderingchange / 初回操作の観測値を HTTP で返すテストに切り替えた。手動の睡眠時間で同期せず、ready の報告後に遷移を開始する。CDP 付き prefetch の `Ready` は利用前の準備完了であり、`Success` という遷移後の状態と混同しない。

`just ci` は成功。型検査、MoonBit 27 tests、Node 107 tests、E2E 50 tests、veri 27 cases / 10 broken variants、native / schema Form 各8 a11y gates を実行した。既存の形式モデルは変更しておらず、Speculation Rules のブラウザー実装を形式証明したものではない。

読解課題を `navigation-loading-intent` として追加し、誤った回答を grader が拒否することを確認した。参加者評価は未実施。今回の検証は先読みの実行と resume の意味の確認であり、一般の LCP / INP 改善量を測った比較ベンチマークではない。
