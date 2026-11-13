# ADR-0005: keyの世代、寿命、描画され得る状態遷移

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 4「keyの世代と正確な寿命のモデル化」

## 背景

現在の[静的key対応](../layout-transitions.md)は、Forのsite・親のkey列・typed keyを使い、
生存する行を対応付ける。同じkeyを削除後に再挿入する別の寿命は保守的にまとめる場合がある。
一方、runtimeと[regionsの有限モデル](../../models/README.md)には、古い配送を別の行へ
適用しないための寿命の区別がある。静的検査側もこの意味へ接続する。

Layout Instabilityの検査には、状態の集合に加えて「どの状態が隣接frameになり得るか」が必要になる。
event途中の代入順と、DOMへcommitした後の描画機会は別のものとして扱う。

## 判断

静的identityを、component/ownerの世代と行の生存区間へ拡張する。
同じkeyの移動はidentityを維持し、削除後の再挿入は別の世代とする。
同期eventから小さい遷移系を抽出し、非同期完了・CSS適用・描画機会へ段階的に広げる。

### 契約と責務

`FrameTransitionIR`案は状態ID、遷移種別、guard、変更・commit集合、生成/終了するidentity、
描画機会、被覆根拠を持つimmutableなJSONとする。
汎用コアへ渡すidentityは不透明なtokenで、key式やeventを解釈する責任はIsle adapterに残す。

初版の描画モデルは、runtimeが公開する同期commitの前後を観測点とし、実行規則を確認した上で定める。
同期task中にDOMへ一時的な値を入れても、描画されない値を独立frameとして断定しない。
逆に、await等を挟んで公開され得る中間状態を削除しない。

遷移の根拠が不足する場合は、現在の全候補比較へ保守的に戻すかUnknownとする。
利用者の許可リストだけで遷移を消して検査を弱める機能は追加しない。
世代の個数・探索深さの上限へ到達しただけでは完全性を宣言しない。
有限抽象化のsimulation関係、到達閉包または帰納不変条件を確認してから完全とする。

既存`@noshift`の同一寿命中の存在・矩形不変という意味を維持する。
新しい時間付き検査は既存の全候補比較と別のcoverage modeで導入し、結果と差を明示する。

## 依存関係と変更箇所

同期eventの初版は既存key対応のみで開始できる。
動的寸法は[0003](0003-dynamic-dimension-contracts.md)、resourceの表示phaseは
[0004](0004-async-layout-reservations.md)と統合する。両ADRの初版の完了を阻害する循環依存は作らない。

- 静的側: `lib/layout/identities.mjs`、`bounds.mjs`、`structure.mjs`、`lib/layout-noshift.mjs`。
- 照合対象: `runtime/regions.mjs`、owner/resource kernel、CSS-readyからcommitまでの規則。
- 参照モデル: `models/regions/`、`models/owner/`、`models/resource_disposal/`、`models/style_resolution/`。

モデルの計画には既存の`mizchi/veri@0.2.1`を利用する。
これは開発用の有限モデルであり、アプリのTSロジックへMoonBitを要求する変更ではない。

## 実装計画

1. **探索**: remove→同keyのreinsertと単なるmoveについて、runtimeのDOM identity、世代、既存静的結果の差を固定する。
2. **Red: 寿命**: 別の寿命を誤って比較する例と、生存中の対象消失を見逃す例を作る。keyだけを照合する故障版の反例をモデルとruntimeで再生する。
3. **Green: 同期遷移**: 閉じたboolean/enum/有界配列のguard・代入・For差分から遷移を作り、生成・移動・削除をlowerする。未知のcallや外部更新は被覆不足にする。
4. **Green: 公開点**: 同期eventのcommitと実際の描画機会を照合する。A→B→Aが一commitで完結する例と、二つの公開点を持つ例を区別する。
5. **Green: 有限モデル**: 小さいowner/行/世代の全遷移を参照モデルと比較する。正常なmount・move・unmountが到達できることも検査する。
6. **Green: 非同期接続**: start、complete、publish、abort、dispose、CSS-readyを追加する。完了順は過大近似し、古いownerへのpublishを有効にしない。
7. **Refactoring**: 状態探索、世代の抽象化、frame抽出、幾何比較を分離する。遷移と反例をCLI/Workerで共有する。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 同じkeyのmove | DOM identityと静的identityを維持して位置を比較 |
| remove→同keyのreinsert | 別世代として比較範囲を分ける |
| 生存中の行の対象だけ消失 | presence違反を維持 |
| 一commit中のA→B→A | 未描画のBをframeと断定しない |
| 別commit/frameのA→B→A | 中間状態の移動を検出 |
| 遅いchunk/resultが旧世代へ到着 | 現世代を更新せず、古い世代も復活しない |
| 無界な再生成・外部mutation | 根拠不足の完全性を宣言しない |

- [ ] runtime、有限参照モデル、静的loweringが同じidentity/lifetimeを使う。
- [ ] 全候補比較と時間付き比較のcoverage mode・被覆根拠・fallbackを出力する。
- [ ] 寿命の区別を入れても、生存中のnoshift違反を成功へ変えない。
- [ ] 正常例と故障版、探索未完了のUnknownを検査する。
- [ ] 同一アプリの配信HTML・JS・CSS増分0 byte。初版はruntimeの寿命規則を変更しない。

追加evalは`evals/scenarios/layout-lifetimes/`、frame参照モデルは`models/layout_frames/`を計画する。
既存の回帰確認は`just noshift-check`、`just test-models`、`just resource-disposal-check`。
Playwrightでは既存region/ownerのfixtureへ、取得とcommitを制御する再生を追加する。

## 代替案と未決事項

世代なしの全候補比較は安全側のfallbackとして残す。
任意の非同期TSから完全なscheduleを復元する機能は初版に含めない。
有限な世代抽象化の具体的な関係とcoverage modeの公開名は、同期段階の反例で決定する。

## Issue化

タイトル案: `静的layout検査をkeyの世代とcommit/frame遷移へ接続する`。
同期寿命・同期公開点・非同期公開点の順にチェック項目を設け、0001の時間モデルへ関連付ける。
