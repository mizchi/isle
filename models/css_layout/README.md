# CSS layout: Z3 reference contract

[contract.smt2](contract.smt2) は4箱の例の独立した参照仕様です。等幅 track、各箱の border-box 最小幅40px、高さ40px、gap/inset なし、正の行・列数に限定します。

通常版は columns=4, rows=1、responsive 版は幅160px未満で columns=2, rows=2 です。`layout_bad` は、その幅・高さに収まらない条件を表します。テストは、この述語と CSS から生成した全違反条件の排他的論理和が UNSAT になることを確認します。最小幅を41pxへ壊した仕様では SAT になり、比較が実際に違いを検出することも確認します。

```sh
node --test tests/layout-z3.test.mjs
just playground-check
```

一般の CSS は `lib/layout/` が静的構造・cascade・box model・media/container の領域を抽出し、`lib/layout-z3.mjs` が QF_LRA へ変換します。Z3 はそのモデル上で違反条件を満たす viewport と obligation を探索します。SAT は反例、完全なモデルでの UNSAT は宣言範囲内で反例なし、未対応・不明・timeout は Unknown です。

この仕様は CSS 全体、parser、モデル抽出器やブラウザーの正しさを証明するものではありません。文字の intrinsic bounds、host のサイズ、scrollbar profiles、丸めを含む仮定は report に残します。Chromium で生成モデルの反例を再現し、修正版も照合する受入検査を併用します。
