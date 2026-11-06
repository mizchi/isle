# 静的な負荷予測の初版

現行 v0 の最適化後の計算・更新計画を対象に、CostSummary、CLI、Vite sidecar と budget を実装した。操作回数の上限を出すもので、実行時間の予測ではない。任意 TS、list / branch の記号式、CSS のリスク解析と専用の形式モデルは後続である。

## 検出と改善

[評価 fixture](../scenarios/static-cost/fixture.isle) の Board.recalculate は、8行の text patch が最大16回、attribute patch が最大8回となる。独立した Child.increment は text patch が最大1回で、親の再開時の child owner 復元は0である。

text patch の budget を8にすると失敗する。8行のうち4行の入力を不変にすると、同じ budget を通ることをテストした。Page を二つ mount するシナリオは component template の element が22、resume owner が4となる。共有 module の byte 数には mount 数を掛けない。

diamond、write を挟む計算、最大256行の純粋な合成を検査した。生成した handler を実行し、slot read・state write・text / attribute patch の観測回数と上限を照合した。文字列長・remote の時間・form runtime の不明な費用を0にせず、不明・上限超過・対象なしの budget は不合格になる。source と別 schema の manifest の結合も拒否する。

## 配布サイズ

Counter、入れ子の Composition、schema form の3構成で実装前後の全 JS ファイル名と SHA-256 が一致した。raw / gzip level 6 の増分はどちらも0 byteである。[比較データ](../results/static-cost/size-comparison.json) を保存した。

cost を無効にした build と通常 build の JS / HTML が同一であることを build テストで確認した。通常は sidecar だけを追加し、debug HTML にのみ JSON を埋め込む。DevTools から情報を読んでも handler を取得せず、操作して初めて owner が再開することを dev / production の browser で確認した。runtime ABI と snapshot は変更しない。

## 検証の範囲

`just ci` は MoonBit 36件、Node 182件、E2E 66件、型検査、既存形式モデル、Form a11y 16 gate が成功した。`just widget-check` は Node 28件、E2E 24件が成功した。cost 専用の新しい形式証明と、参加者による記述・読解評価は実施していない。

[シナリオの解析結果](../results/static-cost/scenario.json)、[既存 dashboard の解析結果](../results/static-cost/dashboard.json)、[検証記録](../results/static-cost/validation.json) を置く。意図的に厳しいシナリオの `ok: false` は、budget 超過を検出できた結果である。
