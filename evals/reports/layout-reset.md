# CSS reset を含むボックスモデルの検査

2026-11-06。reset を明示した順序で app CSS より前に読み、実際の cascade と継承に従って box-sizing 等を解決する経路を追加した。[仕様と API](../../docs/layout-checking.md#css-reset-と継承)を参照。

```sh
just layout-reset
just layout-check
just layout-quality
```

CLI は sidecar の `reset: ["./reset.css"]` を sidecar 相対のファイルとして読み、API は `[{ css, file }]` を受け取る。app CSS と同じ author cascade に入れ、すべての box を border-box と仮定する方法は採らない。解析器は browser へ reset を自動挿入しない。

## Red と実装

先に reset 入力、inherit、selector / layer の順位、CSS-wide keyword、元ファイルの診断をテストし、未対応として失敗することを確認した。CLI の reset ファイル読み込みと読解 grader も別に Red を確認した。

`width:100%; padding:16px` を持つ box は content-box なら割当を越える。border-box reset を適用すると収まり、app 側で content-box へ戻すと再び違反する。典型的な `html {box-sizing:border-box}` と `* {box-sizing:inherit}` では、html / body の実際の祖先情報を与えて継承を解決する。component の root を document の :root として扱わない。

reset を扱う selector parser を分離し、universal、:root、:where、:is、before / after の reset を受理した。:where は specificity 0、:is は一致しない ID の枝も含む最大 specificity を持つ。生成された pseudo box は検査できないため、content で実体を生成する場合は unknown にする。

layer の順序を reset / app の全入力で共有する。通常は後の layer と layer 外の宣言、重要宣言は先の layer を優先する。flat な名前付き layer、順序宣言、再開、匿名 block を扱う。nested / 条件付きの layer 宣言と revert-layer は未対応のまま unknown。

inherit / initial / unset / revert、対応する shorthand と all を property ごとに解決する。UA の未知の margin は0としない。祖先のスタイルによって root の inline display を誤って Grid item として blockify しないよう、継承と配置を分離した。非表示の祖先は宣言した包含領域を提供できないため unknown にする。

`styleSources` に reset / app の入力順、`sizes` に有効な boxSizing と宣言元の file / line / selector / layer / specified value を保存する。reset の未対応構文を app CSS のファイル名で報告しない。

## 検証

`just ci` は MoonBit 53、Node 290、browser 123、既存の形式検査92ケース・想定反例35件を通過した。browser は既存67、制御構文4、resource15、自動取得計画3、CSS24、layout10。型契約、評価 corpus、Form a11y 2 suite・各8 gate も通過した。[検証記録](../results/layout-reset/validation.json)。

layout 対象の Node は42ケースで、今回の reset の9ケース、CLI の1ケース、読解 grader の1ケースを含む。既存の幅・高さ・container と1次元 / 2次元の arithmetic oracle は維持した。

browser には次の3ケースを追加した。

- reset 継承、app の上書き、reset の重要宣言の3版について、240×200・375×400・1000×600の9組で computed box-sizing と両軸の overflow を照合した。
- :where と :is の specificity の差を browser の computed value と比較した。
- ancestor の media 条件で400px未満だけ content-box へ切り替わること、initial / unset / revert が content-box へ戻ることを確認した。

[測定](../results/layout-reset/browser.json)、[reset 版](../results/layout-reset/reset.json)、[故障版](../results/layout-reset/override.json)、[重要宣言版](../results/layout-reset/important.json)に保存した。

`vlmkit/0.24.0` の375×400・1000×600の integrity と、width240〜1000px・height200〜600pxの responsive gate は通過した。少量の検査用テキストによる near-empty 警告は残す。両画像で、reset 後の本文が parent / child の padding 合計32pxの位置に収まることを確認した。[375×400](../results/layout-reset/375x400.png)、[1000×600](../results/layout-reset/1000x600.png)。

production counter の生成 JS は直前の container / block 対応と hash まで同一で、raw / gzip の増分0 Bだった。[サイズ記録](../results/layout-reset/size.json)。新しい npm 依存や browser runtime を追加していない。

## 前提と評価課題

ancestors は継承用の実要素列であり、host の寸法を自動推定するものではない。root の包含サイズと外部 query container の境界は従来の契約に従う。祖先が足りず明示 inherit を解決できない場合、未対応の UA 要素、外部 import、生成 pseudo box、未対応 selector / layer は成功としない。

font の計量や browser 全体の refinement 証明は追加していない。reset とアプリに配布する CSS の一致は caller の責任である。[記述・読解課題](../scenarios/layout-reset/brief.md)と `layout-reset-intent` grader を用意したが、独立した参加者による評価は未実施。
