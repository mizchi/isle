# Subgrid の意図と実行検査

[実行する例](../../../examples/layout-contracts/subgrid.isle)・[CSS](../../../examples/layout-contracts/subgrid.css)・[sidecar](../../../examples/layout-contracts/subgrid.json)。`just layout-subgrid-check` で再現する。

読み取り課題:

1. group の幅が同じでも、親トラックを共有する場合と `minmax(0, 1fr)` 2本を作る場合で、内部境界はなぜ違うか。
2. 親の gap 16px、子の gap 8px、padding 8px と border 1px をどのトラックへ反映するか。
3. `.b { grid-column:3; }` を violated、親を `grid-template-rows:auto auto` に変えた場合を unknown とする理由は何か。
4. 375px の画面だけを見る検査と、media/container 条件を含む全域の検査で、どの保証が違うか。

記述課題: 親の2列目から2本を共有する版に変え、ローカル line 1/2 が何を指すかを説明する。次に nested subgrid と別 gap を加え、元の共有境界の中央が変わらないことを確認する。

自動検査は型付き IR、静的な affine サイズ、有限モデル、ブラウザーの矩形を照合する。参加者による書きやすさ・意図の読み取り評価は未実施であり、これを言語全体の形式証明とは扱わない。
