# Checked dynamic layout

## English

Add up to four cards, clear the list, and toggle its style. The compiler checks every inferred list length, both finite class values, and both `@if` arms, including states absent from the initial SSR. It derives the four-item bound from the guarded update; a configuration assertion cannot waive an unbounded loop.

```text
state items = [0];
on click {
  items = items.length < 4 ? items.concat([items.length]) : items;
}
```

Use the npm API `isle` from `@isle/prototype/vite`, with the [layout configuration](vite.config.mjs). It declares width320–1280px × height360–900px and exact native scrollbar profiles for overlay (0px) and classic (15px) environments. These profiles are trusted environment contracts, not a promise that every OS uses those sizes. Add the actual metrics of your supported environments; `thin` needs its own metrics.

`scrollbar-gutter:stable` reserves the inline space before content overflows. The analyzer subtracts the gutter from Grid/content/query sizes, including both edges and horizontal scrollbar height. It conservatively checks auto visibility combinations. The example retains visible native scrollbars, a keyboard-focusable scroller, and native buttons with explicit appearance and box resets.

Your normal Vite build rejects violations and unknowns and emits `isle.layout.json`. In this checkout: `just example responsive-dynamic`, `just layout-dynamic`, `just layout-check`, and `just layout-dynamic-quality`. Remove the length guard to see the cardinality rejection. Change `.tile` to `min-width:280px` to see a narrow-width failure.

The supported structure budget is32 repetitions and256 variants. Text-only state is excluded from the structural product. Content/font bounds remain trusted; browser rounding, arbitrary setup scripts, unknown native controls and positive scrollbar insets on shared subgrid axes remain outside this profile. Body overflow propagation needs explicit overflow on `html`. See [semantics](../../docs/layout-checking.md) and [results](../../evals/reports/layout-dynamic.md).

## 日本語

最大4件の追加、全削除、表示切り替えを試す。初期 SSR にない状態も含め、推論した全件数・有限な class・`@if` の両側を検査する。4件の上限は更新のガードから導く。設定値で無制限のループを成功扱いにはできない。

npm アプリでは `@isle/prototype/vite` の `isle` に[設定例](vite.config.mjs)の `layout` を渡す。幅320〜1280px × 高さ360〜900px、scrollbar は overlay の0pxと classic の15pxを宣言する。これは利用者の信頼する環境契約であり、全OSでこの太さになるという保証ではない。対応環境の実測値を追加する。thin は専用の寸法を指定する。

`scrollbar-gutter:stable` は overflow 前から横の領域を確保する。解析ではその幅、both-edges、横 scrollbar の高さを Grid・内容・query のサイズから差し引き、auto の表示組み合わせを保守的に検査する。サンプルは標準 scrollbar を表示し、キーボード操作できる scroller と、appearance・box model を明示した native button を使う。

通常の Vite build で違反・解析不能を拒否し、`isle.layout.json` を生成する。この checkout では `just example responsive-dynamic`、`just layout-dynamic`、`just layout-check`、`just layout-dynamic-quality` を実行する。上限ガードを削除すると件数が解析不能になり、`.tile` を `min-width:280px` にすると狭い幅で拒否される。

解析上限は繰り返し32件・構造256候補。text 更新だけの状態は構造の直積に含めない。内容/font の上界は信頼する契約で、丸め・任意 setup・未知の native control・共有 subgrid 軸への正の scrollbar inset 等は未対応。body の overflow 伝播には html の overflow 指定を要求する。[意味論](../../docs/layout-checking.md)・[検証結果](../../evals/reports/layout-dynamic.md)。
