# Prototype verification models

[CSS layout の Z3 仕様](css_layout/README.md) を追加した。これは公式 Z3 Wasm を使う別の検査であり、既存の `veri/model_check/smt.exhaustive` による有限状態の全探索とは区別する。

[レイアウト契約の適合性](layout_contract/README.md)は、契約と CSS 抽出を独立させ、被覆・親子の入力・差し替えを Z3 で照合します。

依存は `mizchi/veri@0.2.1`。モデルは不変な状態と有限の入力を持ち、UI / DOM / HTTP / bundler の実装から独立している。

## 実行

```sh
moon test models/owner --target js
moon test models/resource_once --target js
moon test models/resource_disposal --target js
moon test models/security --target js
moon test models/forms --target js
moon test models/form_session --target js
moon test models/verification --target js
moon test models/permit --target js
moon test models/layout_subgrid --target js
moon run cmd/subgrid-model --target js
moon run cmd/verify --target js
moon prove models/permit
node models/check-negative.mjs
```

`moon test models` というディレクトリ再帰指定は使わず、package を指定する。

## 検査対象

| package | 対象と範囲 |
| --- | --- |
| owner | 1 scope ID、2 generation、1 event、1 chunk。load 成功・失敗、dispose、ID 再利用、drain |
| security | 2 actor、2 document、1 request、1 回の失効。wire の主体と server 認証主体、resource ごとの Permit、await 後の失効 |
| forms | 入力または submit 一回、2 DOM/validity の組、1 import。発生時の捕捉、同期的な既定動作の取消、標準検証 |
| form_session | 2 revision・2 generation、検証1回・送信1回と重複試行、reset。186状態の入力/応答順序 |
| resource_once | 1 resource・2 owner generation・2 tickets の Once、安全性・公平な応答性。2個の Once の合成も検査 |
| resource_disposal | 2 resources・owner 2世代の1,452状態。取得・abort・破棄の安全性と公平な応答性、実装への外部 schedule 再生 |
| style_resolution | 1 owner の cold CSS 解決。取得・準備・適用・評価・活性化・commit。30状態で順序と寿命を検査 |
| verification | `veri/model_check/smt.exhaustive` で92ケースを実行し、得た witness を実際の `step` / `holds` で再生 |
| permit | 純粋な 2 record store。非認可時の不変性、許可された更新、他 record を変更しない frame 条件を `moon prove` で検証 |
| layout_subgrid | 162構成の共有トラック、gap 中央と全体幅。均等再配分する故障版の反例を再生し、JS kernel と2段の値を照合 |

`cmd/verify` の report v2 は、結果・式・公平性の仮定・有限領域・探索完了・状態数・反例の操作列と状態列・循環の開始点を含む。29件の故障版に加え、公平性の仮定を外した4件と不十分な契約2件、合計35反例を含む。全てを実装バグとは扱わず、category で区別する。期待した反例の検出と再生も成功条件とし、正常処理へ到達できることも検査して全拒否の空虚な安全性を避ける。

`negative.mbt.txt` は普通の build / prove に含まれない偽の postcondition。`check-negative.mjs` は独立した一時 module で型検査後に証明し、構文エラーや単なる終了コードではなく `negative_control` の proof failure report を確認する。一時 module は終了時に削除する。

## 保証の境界

- finite-exhaustive は宣言した有限モデルの到達閉包の全検査であり、任意の規模・実ブラウザ・生成 JS の正しさの証明ではない。
- safety は順序の全組合せを調べるが、ネットワークの応答性や任意 async handler の liveness はここでは証明しない。
- security の ownership は Alpha→Alice、Beta→Bob の固定関係。失効は commit 時に即時反映する policy を採用する。全アプリの業務 policy や実際の認証 adapter は別の検査対象。
- `moon prove models/permit` は外部 DB ではなく、返された store の値と frame 条件を検証する。整数の算術は使わないため generation の機械整数 overflow を証明したとは扱わない。
- 反例は現在のモデルの `step` で再生する。対応する disposal / forged input / revocation の schedule は e2e/resume.spec.mjs と tests/server.test.mjs でも検査するが、汎用の model trace → runtime adapter は追加課題。
- forms は strict の22状態を完全探索する。capture / 同期 preventDefault / 不正 submit 拒否の順序は e2e/forms.spec.mjs で確認する。ブラウザー標準の検証アルゴリズム、DOM、複数入力の全 interleaving をこのモデルで証明したとは扱わない。

form-session の古い検証・reset 後の応答・二重 submit の witness は、tests/form-session.test.mjs と e2e/schema-forms.spec.mjs の制御した promise/import 待ちで確認する。実ブラウザー・HTTP 全体の形式証明ではない。

`models/regions` は parent owner が残る場合の行の寿命を検査します。同じ key の move は event の参照先を維持し、remove → 同じ key の reinsert は別の要素として扱います。Strict の完全到達集合は 40 状態。key だけを照合する broken variant には stale delivery の反例があり、ブラウザで handler 取得を止めた差し替え操作を回帰テストにしています。


`models/resource_once` は [時相的な値の意味論](../docs/temporal-resources.md)の参照モデル。Cold 126状態、SSR ready 22状態の完全な到達集合を検査する。公平性を付けた応答性、公平性を外した永久待機、完了を失う故障の循環反例を区別する。resource DSL / codegen の接続は未実装。

所有リソースの終了処理は [unmount とリソース破棄](../docs/resource-disposal.md)を参照。独立カーネルに9故障版の外部 schedule を再生して検査する。現在の report v2 は92ケース、35反例を含む。CSS は [解決契約](../docs/style-resolution.md)を参照。いずれも browser / compiler 全体の refinement 証明ではない。
