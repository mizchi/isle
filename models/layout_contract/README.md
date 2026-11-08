# Layout contract conformance

ContractIR・LayoutIR・ObligationIR を分離した [形式仕様と API](../../docs/layout-contract-language.md)。

[contract.smt2](contract.smt2) は compiler と独立した4箱の参照仕様です。border-box、等幅列、40pxの行、外側の inset 0、固定列数に限定します。4箱・8px gap・responsive の160px境界・子の48pxの必要幅を照合します。小数の viewport をサンプルせず、生成した違反条件との XOR が UNSAT であることを検査します。40px→41pxの故障版は SAT です。

`tests/layout-contract.test.mjs` は独立抽出、被覆、三つの寸法、profile 適合、親子の要求、差し替えの入力範囲を検査します。`e2e/layout-contract.spec.mjs` は gap と responsive の SMT witness を Chromium で再現し、修正版を実測します。veri の有限状態モデルの件数には加えません。

この照合は全 CSS・parser・抽出器・ブラウザーの健全性や、任意の component 合成定理の機械証明ではありません。抽出器の complete 宣言・存在条件・到達候補が実装から漏れなく得られることは信頼する境界です。

```sh
just layout-contract-check
```
