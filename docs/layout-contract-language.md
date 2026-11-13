# レイアウト契約の言語と適合性検査

状態: 独立した検査 IR と、component 本文の `layout SafeGrid { ... }` / `layout PositionedGrid { ... }` を実装しました。Vite・playground・CLI がソースの宣言を検査します。任意の profile 定義、一般の述語構文、子の本体を省略する合成証明は設計段階です。

CSS解析・幾何モデル・契約IR・Z3検査の実装は、汎用の[`@mizchi/css-verifier`](../packages/css-verifier/README.md)へ分離しています。Isleはテンプレートと状態候補を汎用box treeへ変換するadapterです。[保証範囲と静的モデルの方針](static-ui-verification.md)を参照してください。

状態間の比較には[`noshift/1`](layout-transitions.md)があります。DOM要素への`@noshift`を基本にし、`ensures { noshift ".action"; }`も外部・集約指定として使えます。Isle adapterが有限な候補を汎用APIへ渡し、対象boxの存在・位置・寸法を比較します。fit保証だけからnoshiftを推論することはありません。

## 三つの境界

1. **ContractIR** は profile・必要な割当領域・保証を宣言します。CSS から逆算して契約を変更しません。
2. **LayoutIR** は component・CSS の解析結果です。ContractIR を受け取らず、配置・条件領域・到達候補・信頼する仮定を保存します。
3. **ObligationIR** は両者の照合結果です。必要条件の範囲で、入力の被覆と保証違反を別の query にします。

ソース宣言の参照と位置は LayoutIR の binding metadata に引き継ぎますが、その内容を寸法・到達領域を求める前提には使いません。

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

component 本文では template より前に次の宣言を書きます。state・derive・event と並べて配置でき、component ごとに一つです。Node と browser で同じ ContractIR へ lower します。requires の両軸は必須、ensures 全体を省略すると両軸 fit です。区間の両端には px を付けます。

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

## 絶対配置: PositionedGrid

`positioned-grid/1`は、Gridに局所的なabsolute配置を加える別profileです。[実行できる例](../examples/layout-contracts/positioned.isle)の宣言は次の形です。

```text
layout PositionedGrid {
  requires { inline-size: 320px..960px; block-size: 240px..720px; }
  space map = ".map";
  overlay ".controls" within map;
  ensures { overflow-inline: fit; overflow-block: fit; }
}
```

`space`は各到達caseで一意な所有boxを命名し、実CSSの`position: relative`と照合します。`overlay`は、対象boxのactual containing blockがそのspaceであること、padding box内に収まること、同時に存在するpeer overlay同士が正の面積で重ならないことを要求します。宣言がposition・寸法・insetを生成することはありません。絶対配置はGrid trackの寸法計算から外します。

各軸でstart/endの片側とinline/block-sizeを明示します。insetはpx・固定百分率・加減算のcalc、寸法は既存解析が解決できるpx/百分率に対応します。padding/border、実際のbox-sizing、media/container分岐、有限なShow/For候補を考慮します。Showやdisplay:noneで消えるoverlayに配置は作りません。どの到達候補でも対象が見つからないselector、宣言のないabsolute、基準の取り違えは失敗します。

transform、scroll/clipを持つ途中の祖先、subgridの基準box、非ゼロのrelative移動、auto inset、auto size、auto margin、absoluteのgrid-area指定など、モデル化していない意味はUnknownです。別componentのabsoluteは、後述の明示的な親子契約で接続します。宣言のない境界やopaqueなSDKのDOMを暗黙に無視することはありません。詳しい[座標モデルと検査範囲](proposals/positioned-layout.md)を参照してください。

APIでは`profile: 'positioned-grid/1'`、`spaces: [{name:'map', selector:'.map'}]`、`overlays: [{selector:'.controls', within:'map'}]`を`createContractIR`へ渡します。selectorは単純なtag/id/classの組合せ、各binding配列は1〜64件に制限します。profileやbindingの異なる契約同士のrefinementは受け付けません。

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

LayoutIR は以下の寸法を区別します。

| 寸法 | 意味 |
| --- | --- |
| allocated | in-flowではGridからの割当。明示サイズのabsoluteではCSSが決めたused border rectangle。子の要求と照合する入力 |
| border | 実装 CSS が作る border box |
| padding | border を除いた padding box。absolute の局所座標系の基準 |
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

Worker では `verifyObligationIR(obligations, z3API)` を使います。Node adapter は公式 bindings の初期化と thread の破棄を所有します。

## ソース宣言と配布環境

[動くソース](../examples/layout-contracts/declared.isle)には CSS と4箱も含めています。Vite で到達可能な宣言があると、検査付きビルドを自動的に有効にします。

```js
isle({ entry, mounts: [{ component: 'Four', props: {} }], wrapMounts: false });
```

viewport を指定しない場合は root の requires の区間を既定の配布範囲にし、`layout.viewport` を明示した場合はその範囲を使います。**実際の allocated 寸法が requires 内にあることも検査し、requires を仮定して不都合な入力を除外しません。** body の inset 等があれば viewport と割当寸法は異なります。

既存の closed-document gate と同じく、一つの unwrapped mount、所有する CSS、生成 loader を要求します。宣言が子だけで root に範囲がなければ、明示的な `layout.viewport` が必要です。widget・resource setup・未所有の stylesheet/script 等は既存 gate の制限に従い、宣言を黙って無視しません。

証明書の `declarations` に instance の path・契約・被覆・適合を記録します。html/body は既存の document 検査を行い、SafeGrid はその component の native subtree に適用します。宣言は位置付き metadata として保持し、HTML・snapshot・イベントの実行コードへ出力しません。

playground の **Declared layout · SafeGrid contract** で試せます。宣言がある間は検査が必須です。**Layout environment · JSON** の `{}` は root の既定区間を使い、明示的な viewport は宣言を変更せず配布範囲を指定します。Layout proof には宣言ごとの結果、SMT 出力には CSS・各宣言の coverage / conformance を別 query として表示します。

CLI も同じ宣言を検査します。環境 JSON と外部 CSS は省略できます。

```sh
node tools/isle.mjs layout examples/layout-contracts/declared.isle
node tools/isle.mjs layout app.isle environment.json
```

`compile` / `check` は文法・型と IR を検査します。CSS に対する solver の検査は `layout` コマンド、production build gate、playground Worker の責務です。

## 親子と差し替え

API の `createObligationIR(parent, implementation, { children })` の children は `{ path, contract }` の配列です。native box の明示した path へ子契約を接続し、**allocated 寸法**を子の requires と照合します。存在しない path はエラーです。in-flowの子では、CSSで小さく描画していても親Gridの割当を使います。明示サイズのabsoluteでは、次の公開境界の規則に従います。

ソース宣言では compiler が pure / alias / client component の root へ契約を引き継ぎ、解析器が native path と到達 case を記録します。`createDeclaredObligations(implementation)` が自動で接続し、同じ path を異なる分岐の component が使う場合も、それぞれの case だけで検査します。Node adapter の `verifyDeclaredLayouts(report)` はまとめて検査します。

`createInstanceObligationIR(contract, implementation, { path, cases? })` は配布環境の実際の入力で要求・保証を検査します。`createObligationIR` は従来どおり requires の全範囲で保証を検査します。API で手動指定する path / cases の対応は呼出し側の宣言です。

40px以上を要求する子4個なら160px、48pxを要求する子なら192pxが必要です。後者は CSS が40pxのままでも拒否できます。現段階では実際の子の内部も展開して検査し、子の保証を仮定して本体を省略する modular verification は行いません。

`createRefinementObligationIR(previous, next)` は、同じ名前・同じ SafeGrid/Fit 保証の二契約について `R_previous => R_next` を検査します。最小幅160px→120pxは許可し、184pxへの強化は拒否します。これは入力範囲の互換性であり、差し替える CSS・任意の保証・外部仮定の同値性を証明する API ではありません。返る operation は refinement です。その witness の width/height 座標は割当寸法を表します。conformance の witness は元の viewport 座標です。

## 子componentの公開rootとprivateな座標系

[実行できる例](../examples/layout-contracts/positioned-components.isle)では、親のmapへin-flowのMapLegendとabsoluteなMapPanelを置きます。各子は自分のレイアウト契約とprivateな座標系を持ちます。親には子の公開native rootだけを見せ、内部のclassを親のspace/overlay selectorから参照できないようにします。

```text
// 親の宣言の一部
space map = ".map";
overlay ".map-panel" within map;
```

子のsource契約と、親の明示的なoverlay bindingがそろった場合だけ、子のrootをabsoluteな公開境界として接続します。CSSは引き続きrootのposition・サイズ・insetを指定します。rootに余分なwrapperを生成しません。子自身のSafeGridは公開rootの内部をin-flowとして検査でき、子のPositionedGridはprivateなrelative boxとoverlayを検査できます。in-flowの子がprivateなPositionedGridを持つ構成も許可します。

absoluteのallocatedは、子のrequiresへ依存せずCSSから解決したused border boxです。160×120pxなら、containing blockが316×236pxでも割当は160×120pxです。padding/borderはこの中に含みます。寸法は既存の明示サイズの部分集合に限定し、originとcontaining blockは別の事実として保存します。absoluteのallocatedとborderが一致することも検査し、IR上で割当を水増ししてrequiresを満たすことはできません。

親のObligationIRには子のrequires、profile、privateな配置、coverageを再帰的に含めます。親だけを検査して子の違反を見落とすことはありません。子の独立したinstance検査にも、呼出し元のspaceとの一致・包含・peer非重複を含めます。`dependencies`は子のcomponent/path、`placementTransfers`は呼出し元・case・`used-border-box`による割当を記録します。これらはbuild-onlyで、子の保証を仮定して本体を省略する証明ではありません。

同じCBのpeer検査には、親のnative overlayと子の公開rootを含めます。子のprivateなoverlayはその子のCB内で検査します。Show/Forのcaseとnative pathの組合せで境界を特定し、別分岐の同じpathにあった子の宣言を借用しません。

未宣言の子のabsolute、曖昧な呼出し元、未知のCSSやopaqueなDOMはUnknownです。子がCSSでdisplay:noneになる範囲を別契約として合成する検証は未対応で、coverage不足としてUnknownになる場合があります。合成の深さは64、work見積りは200万を上限にし、超過時は検証成功にせず停止します。

```sh
node tools/isle.mjs layout examples/layout-contracts/positioned-components.isle examples/layout-contracts/positioned-components.json --summary
just positioned-components-check
```

playgroundの **Absolute layout · child component contracts** でも試せます。[評価結果](../evals/results/positioned-components/report.json)は、CSSを変えずに子の必要幅を161pxへ強化した違反、private profile違反、root同士の衝突、未宣言境界を区別して記録します。

## 根拠と今後の証明

[独立 SMT 仕様](../models/layout_contract/contract.smt2) と CSS 由来の違反式を XOR で照合します。4箱・gap 8px・responsive の境界・子48pxの要求について UNSAT、40pxを41pxへ壊した実装では SAT になります。gap と159pxの故障した境界は Chromium で反例を再現し、184pxの割当・160pxの分岐へ修正した場合も実測します。

これらは定義した例の照合です。抽出器全体について必要な健全性、すなわち「許可した実ブラウザーの観測が M にすべて含まれる」の一般的証明は未実装です。到達状態・CSS parser・box model 抽出器を信頼し、text/font の bound・native scrollbar・host・ブラウザー丸め等の仮定も証明結果へ残します。

次は一般の profile/述語 AST、子 summary のインポート、部分集合の抽出の健全性と合成定理です。契約文法を増やす際も ContractIR と LayoutIR の独立性を維持します。

```sh
just layout-contract-check
```

## CLI で診断を読む

```sh
pnpm exec isle --help
pnpm exec isle layout app.isle environment.json --summary
pnpm exec isle layout app.isle environment.json --json > layout-report.json
```

`--summary` は status、配布区間、宣言instanceの検証件数、違反のファイル・行・列、
instance path、不正になる区間を表示します。同じ違反はまとめます。
`unknown` も失敗として終了します。自動処理との互換性のため、無指定時と
`--json` は完全な JSON を返します。CSS の診断位置は CSS の出典、要素の位置は
テンプレート上の位置です。原因となる親 grid / media 宣言までの説明は未対応です。

複数 component を含むファイルでは `environment.json` の `component` で配布rootを
指定します。省略時の対象はファイルの最初の component です。

```json
{"component":"Board","viewport":{"min":320,"max":960,"height":{"min":640,"max":960}}}
```

`requires` は親から受け取る領域の条件です。`verified` は所有する CSS、コンテンツ寸法の
信頼済み上限、対応するレイアウト部分集合を仮定した結果です。画素丸めや ink overflow、
未申告の外部 CSS まで保証するものではありません。
