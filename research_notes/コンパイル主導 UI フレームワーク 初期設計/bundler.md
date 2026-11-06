# Vite と Rolldown を前提とする再開コードの分割

## 確認できた契約

### Takeaway
独自 chunker は作らず、compiler は論理 symbol と ESM graph、Vite/Rolldown は物理 chunk・URL・asset を担当する。以下は 2026-11-02 時点の公式資料で確認した仕様と、それを使う設計案。

### Cited Findings
- Vite の `resolveId` / `load` / `transform` は dev と build の共通経路。virtual module は `virtual:` を公開名、`\0` を内部名にできる。dev では出力生成 hook が呼ばれないため、`generateBundle` を必須にしたロード機構にはできない。[Plugin API](https://vite.dev/guide/api-plugin)
- Rolldown は dynamic import を遅延 entry として扱い、共通依存を別 chunk にする。標準の自動分割は静的 import の関係に基づき、読み込み時間や cache の最適化を自動で解くものではない。現行の手動調整 API は `output.codeSplitting.groups`、size 設定等であり、`advancedChunks` を前提にしない。[Automatic splitting](https://rolldown.rs/in-depth/automatic-code-splitting), [Manual splitting](https://rolldown.rs/in-depth/manual-code-splitting)
- Vite の現行設定は `build.rolldownOptions`。`build.manifest` は元 entry/asset と hashed file の対応、`build.ssrManifest` は SSR の CSS / preload 用。SSR manifest も **client build** が生成する。[Build options](https://vite.dev/config/build-options), [SSR manifest](https://vite.dev/guide/ssr#generating-preload-directives)
- 現行 dev SSR は `server.environments.ssr.runner.import(...)` を利用でき、従来の `ssrLoadModule` の後継となる。plugin は `this.environment` で処理先と cache を分離できる。Environment API 自体は RC 扱いなので対応 Vite major を固定する。[Framework environments](https://vite.dev/guide/api-environment-frameworks), [Plugin environments](https://vite.dev/guide/api-environment-plugins)

## 最小 plugin 構成

### Takeaway
ユーザーの「チャンク分割は Vite / Rolldown に組み込む」方針を採用する。handler の抽出単位と配信 chunk の単位を分ける。

### Inferences
1. compiler は `.isle` から SSR module、handler/update ESM、capture schema、論理 ID を出す。plugin は source map と原文への依存関係を保って各 virtual module を解決する。
2. boundary ごとに registry を生成し、例えば `h0: () => import('virtual:isle/handler/A').then(m => m.run)` を含める。import 先は生成時に確定した文字列 literal とする。snapshot は `h0` と capture 参照を持ち、runtime が任意文字列から URL を推測しない。
3. client build が literal import を実 URL へ変換するため、dev は Vite の module URL、本番は hashed URL を同じ registry 契約で読める。経路は **snapshot logical ID → generated registry → dynamic import → bundler URL**。巨大な全体 registry を初期配信しないため boundary / route 単位にする。
4. `1 handler = 1 chunk` は ABI に含めない。共通依存と物理 grouping は Rolldown に任せ、測定後に `build.rolldownOptions.output.codeSplitting` で調整する。chunk filename や export の配置を compiler が予測しない。
5. SSR は同じ logical ID set / build identity を使い、client manifest から registry entry と CSS の URL を取得する。SSR manifest を handler export table と混同しない。別々に build しても同一 source/config revision の生成物を deployment 単位で揃える。
6. dev の capture schema / ID が変わった場合、MVP は関連 server graph と virtual module を invalidate し、client は full reload する。古い snapshot に新 handler を適用しない。一般の npm package として使う pure compiler core と、Vite の environment / watch / HMR adapter は分離する。

## 検証で残る点

### Gaps
virtual module の manifest key、`base` / CDN 配下の URL、CSS 読み込み、複数 handler の grouping は未実測。fixture で dev と本番の最初の操作、client/SSR identity 一致、非同期ロード失敗を確認する。出力 metadata を使う追加 manifest は必要時のみ設け、hash 確定前の filename 置換や独自 import-map を必須にしない。
