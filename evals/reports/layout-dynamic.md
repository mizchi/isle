# 動的構造と scrollbar の検査

2026-11-06。[構造展開](../../lib/layout/structure.mjs)・[値/件数の抽象解釈](../../lib/layout/bounds.mjs)・[scrollbar geometry](../../lib/layout/scrollbars.mjs) を build-only の解析へ追加した。loader、handler、runtime には解析や件数ガードを追加していない。

```sh
just layout-dynamic
just layout-check
just layout-dynamic-quality
moon run cmd/layout-dynamic-model --target js
```

[利用者の設定とコード](../../examples/responsive-dynamic/)、[意味論と制限](../../docs/layout-checking.md)、[記述・読解課題](../scenarios/layout-dynamic/brief.md)。

回帰検査は Node403件、MoonBit55件、layout Playwright16件、Pages Playwright24件、公開型の検査が成功した。静的/動的サンプルの vlmkit 固定7 gate はそれぞれ全て pass。

## 検査

- 分岐の非表示側、switch の各候補、同期 catch、有限 class も検査する。上限付きの配列では全件数を展開し、無制限の増加は unknown とする。handler の逐次代入と途中の値を保守的に含める。text-only の状態は構造の直積から除外する。
- scrollbar profile ごとに content box を減らし、Grid と container query を計算する。100pxの子に classic15px の領域が必要なら、親115px未満を拒否する。stable both-edges、横方向の高さ、auto の両軸の組み合わせ、thin の専用寸法、content-box の辺、viewport への一回の適用も回帰テストに含む。
- 配信 HTML が解析した native tree 集合に属することと、snapshot が件数解析の初期値と一致することを確認する。後続 HTML transform の snapshot 改変も拒否する。未知の metric、body 特別伝播、共有 subgrid への正の gutter 等を成功扱いにはしない。
- 動的サンプルを検査あり/なしでビルドし、全 JS チャンクの名前と内容が同一であることを比較する。証明レポートはブラウザーから取得しない。

## Browser oracle

幅320/375/640/1280 × 高さ360/600/900 × 件数0〜4 × 表示2種 × overlay/classic の **240通り**で、構造・profile に対応する寸法式と実測値が0.04 CSS px以内で一致した。overlay は0px、classic は Chromium の overlay 機能を無効化して実際の15pxを確認する。

全条件で page overflow と横の意図しない overflow はなかった。4件の上限が Enter/クリックで維持され、短い画面では focus した scroller を End キーでスクロールできた。初期24条件の raw layout-shift entry は空。[実測サマリー](../results/layout-dynamic/latest.json)・[全解析と実測](../results/layout-dynamic/full.json.gz)。

別の oracle で、viewport の gutter が一回だけ差し引かれること、html の overflow 指定で body の scroll を local にできること、container query が scrollbar を除いた content 幅で切り替わることも確認した。

375px と1280pxの短い画面で、空状態と4件を screenshot でも確認した。3つの button、見出し、説明文が見え、4件では native scrollbar が表示される。card の切り取りは scroller 内に限られ、page 全体ははみ出していない。画像は `.responsive-checked/screenshots/` に再生成する。vlmkit 0.24.0 の固定7 gate は全て pass（[結果](../results/layout-dynamic/quality.json)）。

## MoonBit/veri 0.2.1

[有限モデル](../../models/layout_dynamic/model.mbt)は40pxセルの縮約例で、サンプルアプリ全体を自動変換したものではない。件数0〜4、表示、viewportの選択、gutter、横 scrollbar の組み合わせ **240状態**を完全探索する。件数上限と gutter を含めた fit が不変条件を満たした。上限ガードを外した版は5件へ到達し、幅を差し引かない版は viewport160px/gutter15pxで反例を得る。反例を再生し、同じ幅の CSS を JS 解析器でも拒否する。[接続テスト](../../tests/layout-dynamic-model.test.mjs)・[モデルと反例](../results/layout-dynamic/model.json)。

これは有限モデルの検査であり、抽象解釈、領域計算、CSSOM や browser 実装全体の健全性を機械証明したものではない。native profile と内容/font のサイズ上界は信頼する契約。ピクセル丸め・ink overflow は対象外で、profile 間の連続した scrollbar 寸法の保証も主張しない。
