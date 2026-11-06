# Subgrid の意味論と照合

基準は [CSS Grid Level 2](https://www.w3.org/TR/css-grid-2/#subgrids) と、このプロトタイプの[検査 subset](../../docs/layout-checking.md#subgrid-の共有トラック)。親の track 定義をコピーして再配分する実装は採用せず、解決済みの track vector を共有する。

## 有限モデル

[MoonBit モデル](../../models/layout_subgrid/model.mbt)は `mizchi/veri@0.2.1` の exhaustive 検査を使う。親の track は4/8/12、gap は2、共有開始位置と span は有効な6通り、子 gap は0/2/4、前後 inset はそれぞれ0/1/2。162構成を全て到達可能にして、gap 中央の位置と全体の extent が保存されることを検査する。actions はパラメータの選択であり、UI の時間的遷移を主張するものではない。

均等なトラックへ作り直す故障版では、開始0・span 2・gap 0・inset 0 の反例を検出・再生する。親の4pxと8px、gap 2px の全体は14px。共有を保つ子の幅は5px/9pxになるが、単純な均等分割は7px/7pxになり、全体幅が合っても内部境界は2pxずれる。

この反例と同じ4px/8px・gap 2px・子 gap 0pxをブラウザーにも与え、native subgrid の5px/9pxと standalone Grid の7px/7pxを照合する。

空の subgrid も通常の leaf として高さ0にはしない。非共有軸の明示100px row が親の auto 高さへ寄与すること、空の Grid の明示 track overflow を検査することも回帰テストにし、100px の高さをブラウザーと照合する。

[JS kernel の照合](../../tests/subgrid-model.test.mjs)は162構成と、その結果をさらに共有する2段目について、有理数の値を MoonBit の doubled / quadrupled 単位と比較する。これは有限な整数入力のモデルと実装の照合であり、任意の CSS 値・任意の深さの refinement 証明ではない。

## ブラウザー

`just layout-subgrid-check` は [検査器](../../tools/check-subgrid.mjs)から8パターンを生成する。両軸、gap の増減、入れ子、media、親の container query、viewport 高さ依存、content-box を、8幅×2高さの128ケースで検査する。各 box の inline/block サイズは0.04 CSS px以内、共有境界は親の gap 中央と一致することを要求する。この許容差はブラウザーの端数丸め用で、静的検査は有理数で実行する。

通常の均等 Grid を作る対照実験でも内部境界の不一致を検出する。これは有効な standalone Grid として静的解析できるコードであり、意図が subgrid であると仮定しなければ拒否すべきではない。対照は共有 line の検査器が違いを検出することを確認する。

subgrid 自身に `container-type:inline-size` を付けると、記録した Chromium 156.0.8078.4 では320px幅の最初の子が71pxから55.125pxへ変わり、共有が失われた。[Grid 2 の independent formatting context 条件](https://www.w3.org/TR/css-grid-2/#valdef-grid-template-columns-subgrid)と、[Conditional 5 の layout containment 変更](https://drafts.csswg.org/css-conditional-5/#changes)には版の差がある。この前提を安全とせず、検査 subset では subgrid 自身の size query containment を unknown にした。親を query container に置く修正版は128ケースに含む。将来のブラウザーが同じ旧挙動を保つことは要求せず、実測値と適用した制約を原本に記録する。

元の例は script 要求0、描画時の layout shift 0。integrity / copy / scroll / handlers / interactions / responsive の6ゲートを固定し、phone と desktop の画像で A・B・Peer のトラック位置と入れ子の枠を確認する。画像は `.subgrid/screenshots/`。

[要約 JSON](../results/layout-subgrid/latest.json)・[完全な symbolic checks と実測 JSON gzip](../results/layout-subgrid/full.json.gz)。intrinsic な親行への contribution は未対応で unknown、共有 span 外への配置は検査契約違反として violated。全ブラウザー、任意フォント、全 CSS の正しさを保証した結果ではない。
