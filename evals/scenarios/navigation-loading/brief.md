# ページ先読みと island 再開を読む

docs/speculation-rules.md と fixture.mjs だけを読んでください。expect、実装、過去の attempts は読まないでください。fixture は Vite plugin に渡す設定値を取り出したもので、それだけで動くアプリではありません。

`evals/attempts/<run>/navigation-loading-answers.json` に次を回答してください。

- `pagePrefetchSelector` / `pagePrerenderSelector`: それぞれのリンクを選ぶ CSS selector。
- `chunkLoading`: このページ内の handler / runtime の読み込み方針。
- `prefetchExecutesPageScripts` / `prerenderExecutesPageScripts`: それぞれの仕組みが遷移先の JS を実行するか。boolean。
- `speculationResumesIslands`: Speculation Rules だけで island の snapshot を展開し handler を実行するか。boolean。
- `ssrRulesNeedExecutableJS`: SSR 専用ページが rules を使うために framework の実行用 JS を必要とするか。boolean。
- `browserMustHonorRules`: 対応ブラウザーは常に先読みを実行しなければならないか。boolean。
- `unsupportedBrowserCanNavigate`: 非対応でも通常のリンクで移動できるか。boolean。

`node tools/eval.mjs navigation-loading-intent <answers.json>` で採点できます。記述課題では、prerender を conservative に変更し、`data-no-speculation` の除外を維持したまま URL リストによる prefetch を追加してください。URL リストに selector の除外が自動適用されるかを説明してください。文書だけで分からなかった点と、修正回数を記録します。参加者評価は未実施です。
