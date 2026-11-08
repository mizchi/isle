# レイアウト契約の言語と適合性検査

状態: IR と独立した適合性検査 API を実装。component 本文の `layout SafeGrid { ... }`、任意の profile 定義、一般の述語構文は設計段階です。既存の CSS 解析・Vite build gate の動作は維持します。

## 三つの境界

1. **ContractIR** は profile・必要な割当領域・保証を宣言します。CSS から逆算して契約を変更しません。
2. **LayoutIR** は component・CSS の解析結果です。ContractIR を受け取らず、配置・条件領域・到達候補・信頼する仮定を保存します。
3. **ObligationIR** は両者の照合結果です。必要条件の範囲で、入力の被覆と保証違反を別の query にします。

すべて JSON にできる immutable な build-only データです。検査器・IR・Z3 を生成アプリへ追加しません。数値の正本は rational string で、数値表示は近似値です。

## 最初のメタ文法

`safe-grid/1` は閉じた profile です。子 box を配置する container は Grid、positioning は horizontal-tb/ltr の in-flow、すべての box は実際の computed style が border-box であることを要求します。geometry は既存解析器の有理数による区分線形式の部分集合です。初版の保証は両軸の `fit` に限定します。

API の入力文法は次の形です。JSON 自体を外部ファイルにする必要はありません。

```text
ContractInput := {
  component: ComponentName,
  profile?: "safe-grid/1",
  requires: {
    inlineSize: ClosedInterval,
    blockSize: ClosedInterval
  },
  ensures?: { inline: "fit", block: "fit" }
}
ClosedInterval := { min: CSSPixels, max: CSSPixels }
```

CSSPixels は0以上100万以下、既存の数値系が扱う小数点以下6桁までです。両軸の区間を要求し、逆転・未知の項目・未知の profile は拒否します。省略した ensures は両軸 fit です。profile の JS 実行関数や、任意の SMT 文字列を契約として入力する文法はありません。

case は2048、fact は合計32768、各 query の obligation は8192、SMT 文字列は200万文字までに制限します。不正な入力・IR や上限超過は例外で停止し、検証成功にはしません。

`requires` は親が提供する **割当領域** の条件です。CSS 宣言ではなく、viewport の範囲とも区別します。CSS の reset を挿入する指定ではありません。例えば border-box の reset が実装に存在しなければ、profile 違反になります。

将来の component 内の表記は次を候補とし、まず同じ ContractIR へ lower します。現在の compiler はこの表記を受け付けません。

```text
layout SafeGrid {
  requires {
    inline-size: 160px..640px;
    block-size: 40px..640px;
  }
  ensures {
    overflow-inline: fit;
    overflow-block: fit;
  }
}
```

## 実装の意味と保証

環境を e、到達可能状態を s、配置を b とします。契約の必要条件を R、外部の信頼仮定を A、保証を G、実装の抽象意味を M と置きます。

```text
Conforms(I, C):
  Admissible(I, C.profile)
  AND every permitted input/state has a defined model
  AND forall e, s, b:
    R(e) AND A(e, s) AND M(I, e, s, b) => G(e, s, b)
```

`R` は検査範囲を選びます。`G` は実装モデルへの仮定に追加せず、`R AND A AND M AND NOT G` で反例を探します。信頼仮定をラベルから数式として解釈したり、内容が収まるという宣言を自己証明に使ったりしません。

初版の外部仮定は既存解析の `LayoutIR.assumptions` から証明結果へ引き継ぎます。ContractIR から `assume` 文や任意の述語を入力する機能は未実装です。

LayoutIR は以下の三つを区別します。

| 寸法 | 意味 |
| --- | --- |
| allocated | 親からの割当領域。子の要求と照合する入力 |
| border | 実装 CSS が作る border box |
| content | padding・border・適用される scrollbar gutter を除いた content box |

既存 report の `inlineSize` / `blockSize` は border 寸法のままです。`allocatedInlineSize` / `allocatedBlockSize` と、常時記録する `contentInlineSize` / `contentBlockSize` を追加しました。auto row 等で割当高さが definite でなければ allocated.block はありません。その地点へ両軸の子契約を接続すると Unknown です。

## 被覆を先に検査する

適合性の数値 query の前に、別の query で次を検査します。

- requires の入力が空でないこと。
- 契約が要求する領域を、CSS を抽出した領域が覆うこと。
- 到達候補・scrollbar profile の各 case で、root の配置が定義されること。
- 各 box の存在条件で、その box の border/content の両軸と割当幅が定義されること。

被覆違反・未対応 CSS・解析不完全・solver 不明は Unknown です。部分的な領域の UNSAT を全体の成功にはしません。clip / scroll / visible など、既存 API で fit を弱めた解析結果も、この最初の profile では Unknown にします。既存 API 自体の各 overflow 方針を削除したわけではありません。

hostInset が20pxなら、割当幅160–640pxを調べるための viewport は180–660pxです。640pxまでしか抽出していなければ、被覆不足になります。

## API

```js
import { compile, requireIR } from '@isle/prototype/compiler';
import { analyzeLayout } from '@isle/prototype/layout';
import {
  createContractIR, createLayoutIR, createObligationIR,
} from '@isle/prototype/layout/contracts';
import { verifyContractObligation } from '@isle/prototype/layout/contracts/node';

const contract = createContractIR({
  component: 'Four',
  requires: {
    inlineSize: { min: 160, max: 640 },
    blockSize: { min: 40, max: 640 },
  },
});
const report = analyzeLayout(requireIR(compile(source)), {
  css: '',
  viewport: { min: 80, max: 640, height: { min: 40, max: 640 } },
});
const implementation = createLayoutIR(report);
const obligations = createObligationIR(contract, implementation);
const result = await verifyContractObligation(obligations);
// result.coverage と result.proof を独立して確認できる。
```

Worker では `verifyObligationIR(obligations, z3API)` を使います。Node adapter は公式 bindings の初期化と thread の破棄を所有します。独立した検査 API であり、playground・Vite gate への契約の自動接続は未実装です。

## 親子と差し替え

`createObligationIR(parent, implementation, { children })` の children は `{ path, contract }` の配列です。native box の明示した path へ子契約を接続し、**border 寸法ではなく allocated 寸法**を子の requires と照合します。存在しない path はエラーです。binding と component 名の対応は呼出し側の宣言であり、frontend が自動検査する構文ではまだありません。

40px以上を要求する子4個なら160px、48pxを要求する子なら192pxが必要です。後者は CSS が40pxのままでも拒否できます。現段階では実際の子の内部も展開して検査し、子の保証を仮定して本体を省略する modular verification は行いません。

`createRefinementObligationIR(previous, next)` は、同じ名前・同じ SafeGrid/Fit 保証の二契約について `R_previous => R_next` を検査します。最小幅160px→120pxは許可し、184pxへの強化は拒否します。これは入力範囲の互換性であり、差し替える CSS・任意の保証・外部仮定の同値性を証明する API ではありません。返る operation は refinement です。その witness の width/height 座標は割当寸法を表します。conformance の witness は元の viewport 座標です。

## 根拠と今後の証明

[独立 SMT 仕様](../models/layout_contract/contract.smt2) と CSS 由来の違反式を XOR で照合します。4箱・gap 8px・responsive の境界・子48pxの要求について UNSAT、40pxを41pxへ壊した実装では SAT になります。gap と159pxの故障した境界は Chromium で反例を再現し、184pxの割当・160pxの分岐へ修正した場合も実測します。

これらは定義した例の照合です。抽出器全体について必要な健全性、すなわち「許可した実ブラウザーの観測が M にすべて含まれる」の一般的証明は未実装です。到達状態・CSS parser・box model 抽出器を信頼し、text/font の bound・native scrollbar・host・ブラウザー丸め等の仮定も証明結果へ残します。

今後の順序は、component 文法への接続、一般の profile/述語 AST、子 summary のインポート、部分集合の抽出の健全性と合成定理です。契約文法を増やす際も ContractIR と LayoutIR の独立性を維持します。

```sh
just layout-contract-check
```
