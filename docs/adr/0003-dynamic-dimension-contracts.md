# ADR-0003: 動的寸法の入力契約と仮定の由来

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 2「動的寸法の入力契約」

## 背景

現行の`LayoutBoxContract`は十分な内容寸法のtrusted boundと、正確なauto-heightまたは
幅別の高さprofileを持つ。任意の最小・最大寸法区間や、その相関を表す一般モデルはない。
二状態の高さが同じ未知値なのか、独立に変化し得る値なのかも区別する必要がある。
[現行の入力の意味](../static-ui-verification.md)を維持しつつ、一般の動的内容へ拡張する。

## 判断

既存の「収めるのに十分な寸法」と、新しい「実際の内容寸法が取り得る範囲」を別の項目とする。
範囲は非負の有理数による閉区間、幅別profile、有限な候補の和集合から始める。
同じ入力変数への参照とcaseを持たせ、相関のある入力を独立な直積へ崩さない。
任意のユーザーSMTや実行関数を受け取る契約は追加しない。

### 契約と責務

汎用の`DynamicDimensionsIR`案は次の概念を持つ。

- 変数: ownerに依存しない入力ID、単位CSS px、許容区間。
- case: viewport/割当幅の条件、inline/block寸法の区分線形式、同時に許される値の組。
- 遷移対応: 前後で同じ入力を共有するか、各状態で独立に変わるか。
- 由来: `inferred`、`validated`、`trusted`と、根拠sourceまたは検査参照。

`validated`は実際に値を制約する入力検査等の根拠がある場合だけ付ける。
文字列の最大長からfontや折り返し後の高さを自動的に検証済みとは扱わない。
Isle adapterはschema・有限state・key付き要素から根拠を渡し、コアがIsleの型を直接解釈しない。
契約の入力範囲とCSSから抽出する配置は独立に保持し、CSSの`max-height`を内容の上界へ流用しない。

## 依存関係と変更箇所

必須の先行ADRはない。[0004](0004-async-layout-reservations.md)と
[0001](0001-static-layout-instability-verification.md)の動的内容検査の前提になる。
型と正規化は`packages/css-verifier/src/layout-contracts.d.ts`および独立module、
幾何への接続は同packageの`layout/`、Isleの値候補は`lib/layout/bounds.mjs`と`structure.mjs`を対象にする。
Node/Worker用の入口とcompat exportは同じ正規化器を使う。

## 実装計画

1. **探索**: 現行のmin bound・intrinsic heightの利用例を分類し、旧入力で変えてはいけない結果を固定する。
2. **Red**: 高さ24..80px、幅によって折り返す高さ、同じ寸法を共有する前後、独立な前後、相関のある候補をfixtureにする。端点だけの検査や相関を落とす故障版を検出する。
3. **Green: 契約**: JSON schema相当の厳密な型と正規化を追加し、逆転区間・重複ID・未被覆profile・不正な由来・上限超過を拒否する。
4. **Green: 解析**: 有界な入力変数を区分線形の寸法へ接続し、実装モデルの存在と領域被覆を保証のqueryから分離する。
5. **Green: 遷移**: 前後の共有変数を同じsymbolへlowerし、独立変数を別symbolにする。二状態の単独reportの一致から共有を推測しない。
6. **Green: adapter**: まず既存の環境JSON/APIで利用できるようにし、CLI・Vite・playgroundへ同じ入力を渡す。専用の寸法DSLは必要性をevalしてから別途決める。
7. **Refactoring**: 入力正規化、抽象値、式、由来の表示を分離し、既存のtrusted入力を意味を変えずに共通IRへlowerする。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 高さ24..80px、予約なし | 下の操作領域の移動候補を検出 |
| 同じ入力で高さが変わらない | 独立な二変数として誤って比較しない |
| 高さが独立に変わる | 同じ値と仮定して成功させない |
| 幅別profileの境界 | 境界一点・小数幅も被覆する |
| 相関するcompact/expanded | 許可した組を保存し、不可能な組を混ぜない |
| fontの情報がないtext | trustedな仮定を記録するかUnknown |

- [ ] 旧入力と旧fixtureの結果が一致する。
- [ ] 許可した全寸法・入力領域でfit/noshiftを検査し、代表値の成功で全域を受理しない。
- [ ] 由来と共有関係をJSONへ保存でき、NodeとWorkerで結果が一致する。
- [ ] 数値系とcase数の上限をversion付きにし、超過をUnknownまたは入力エラーで停止する。
- [ ] 同一アプリの配信HTML・JS・CSS増分0 byte。

追加evalは`evals/scenarios/dynamic-dimensions/`を計画する。
既存の回帰確認は`just css-verifier-check`、`just noshift-check`、`just check-types`。

## 代替案と未決事項

代表的な寸法の列挙だけでは連続区間を覆わないため、有限な構造と連続な寸法を分ける。
任意の数式言語は初版に導入せず、現在の区分線形モデルで解釈できる形から始める。
font metadataの自動抽出と任意の文章のline breakingは後続。数値上限は既存モデルと整合する値で固定する。

## Issue化

タイトル案: `動的内容寸法の区間・相関・由来をCSS検証の入力契約に追加する`。
契約、幾何、遷移への接続を実装順に分け、0004から参照する。
