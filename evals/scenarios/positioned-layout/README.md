# PositionedGrid compiler evaluation

Run `just positioned-layout-check` from the repository root. This checks actual
compiled source; the earlier hand-authored model remains separately under
`evals/scenarios/component-structure/`.

The eight scenarios cover padding-box end insets, axis-specific percentages,
overflow, the wrong containing block, unsupported transforms, fractional peer
collisions, a corrected minimum width and a responsive correction. Positive
compiled geometry is measured in Chromium at 320, 375, 641 and 960px.

Results: [report](../../results/positioned-layout/report.json),
[integrity](../../results/positioned-layout/integrity.json),
[phone](../../results/positioned-layout/preview-375.png),
[desktop](../../results/positioned-layout/preview-1280.png).

実コンパイラ・独立したCSS抽出・Z3の契約検査を接続した評価。Nodeの回帰テストは
Show/Forの有限候補、selectorの曖昧さ、途中のrelativeな親、container query、Viteで
配布するCSSとの一致も検査する。playgroundのWorkerではZ3 Wasmを実行する。

375px/1280pxの画像を目視確認した。見出し、地図の枠、右下の40×40の矩形、説明が
表示され、矩形のはみ出しや文字の衝突はない。これは座標fixtureの検査であり、地図
SDK全体やhit testing、ink overflow、browserの画素丸めを証明するものではない。
