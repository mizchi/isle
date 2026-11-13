# ADR-0008: client境界を越える読み取り専用live入力

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 7「読み取り専用のlive props」

## 背景

client componentのpropsは現在immutableな初期値であり、親stateを子へ渡す例は
`E_COMPONENT_CAPTURE`になる。[resume意味論](../resume-semantics.md)にはlive入力の案があるが、
source型・生成コード・owner間の配送は未実装。通常のアプリで必要な親子連携を閉じた依存として表現したい。

## 判断

component引数の`live` modifierとして、読み取り専用の時間変化する入力を導入する。
writerは親のstate owner一つとし、子は通常の型の値として読む。
初版はprimitiveの入力と同期更新から開始する。無指定propsの不変性は維持する。

以下は**提案構文**であり、現行parserで実行できる例ではない。

```text
client component Badge(live value: number) {
  derive doubled = value * 2;
  <output>{doubled}</output>
}

client component Counter() {
  state count = 0;
  event increment(e: EventSnapshot<MouseEvent>) { count += 1; }
  <section>
    <button type="button" on:click={increment}>+1</button>
    <Badge value={count} />
  </section>
}
```

### 契約と責務

compile-onlyの入力edgeはproducer slot、consumer binding、型、guard、owner/lifetimeを持つ。
source型検査は書き込み、型不一致、所有の循環、未宣言の境界を拒否する。
生成アプリには必要なedgeの最小情報とbindingコードだけを残し、解析graph全体を送らない。
依存解決とslot選択は既存ValuePhasePlanへ接続する。

親の更新で親子の初期化を再実行しない。子の必要なbindingとlocal slotの復元は許すが、
無関係なhandler取得やresource setupのactivateとは分ける。
休眠中の子も最新versionを読めるようにし、配送先はowner世代とDOM identityで照合する。
event内のreadはその処理のversionとして扱い、await後の採用規則は対応段階まで明示的に制限する。

snapshot、registry、widgetのABI変更が必要ならversionとbuild fingerprintを更新し、旧版の混在を拒否する。
server専用値やlocal resourceをlive wire値として流さず、serializableな入力境界を維持する。

## 依存関係と変更箇所

既存ValuePhasePlan、component型検査、owner generationが前提。
[0009](0009-lazy-region-factory-chunks.md)の完了は必須にせず、共通の依存計画を共有する。
layoutへ接続する際は[0003](0003-dynamic-dimension-contracts.md)の入力範囲と
[0005](0005-key-generations-and-frame-transitions.md)の生存情報を利用する。

source/parser/type境界は`compiler/`と`lib/contracts.d.ts`、計画とcodegenは`lib/resume-plan.mjs`、
`lib/region-codegen.mjs`等、配送は`runtime/`の必要なmoduleへ限定する。
For内のclient islandは現行region backendが拒否するため、後半のkeyed子対応で明示的に拡張する。

## 実装計画

1. **探索**: 現行reactive-props fixtureの拒否と、parent/childの初期化・復元・取得量をbaselineに保存する。
2. **Red: 型と直接の子**: primitiveのlive入力、親からの更新、子からの不正な代入、immutable propへの可変値を検査する。
3. **Green: 契約/IR**: parserと型にmodifierを追加し、producer/consumer edgeと必要なslot閉包を導出する。循環とopaqueなmutationは拒否する。
4. **Green: 直接の子**: 親commitから子bindingへversion付き更新を生成する。子が休眠中・複数mount・local stateを持つ場合を検査する。
5. **Red/Green: 寿命**: unmount中の遅いbinding取得、owner ID再利用を再生する。まず直接の子で世代を確認し、For内client islandの生成・移動・削除をbackendへ追加する。
6. **Green: 統合**: keyed子、derive依存、widget/standaloneの境界を接続する。非同期eventへの対応はread versionと採用規則のモデルを通して追加する。
7. **Refactoring**: 不変初期値、live edge、local resourceを分離し、利用しないアプリから配送moduleを除去する。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 親から直接の子へ数値更新 | 出力更新、初期化の追加実行0 |
| 休眠中の子とlocal state | 必要なslotだけを復元し、最新入力と整合 |
| 同じ子を複数mount | instance間で値・配送を混同しない |
| 子の無関係なhandler/setup | 親の更新による取得・activate増分0 |
| keyed子のmove/remove/reinsert | 同じ寿命を保持し、旧世代への配送を拒否 |
| 子からlive値へ代入 | source位置付きの型エラー |

- [ ] 型、参照評価器、生成DOM更新、ownerの有限モデルが同じsingle-writer規則を持つ。
- [ ] SSRと初回resume、親だけ/子だけの操作、破棄の順序をPlaywrightで検査する。
- [ ] 未使用の既存Counter/SSR-only fixtureはproduction配信サイズ増分0 byte。
- [ ] 使用時は共通runtime、snapshot、binding、操作時取得量を別々に測定する。
- [ ] 直接の子の初版とkeyed子の拡張を別milestoneとして完了判定する。
- [ ] 対応した項目だけresume-semantics auditの目標を有効化する。

追加evalは`evals/scenarios/live-props/`を計画する。
既存の回帰確認は`just resume-semantics-audit`、`just resume-phases-check`、`just check-types`。
auditの`--require-targets`は他の未実装目標も含むため、このADRだけで全体の成功を主張しない。

## 代替案と未決事項

callback propsと汎用subscriber runtimeでは、閉じたproducer/consumer依存を維持しにくいためlive入力を採る。
初版は任意objectの共有mutationや双方向bindingを提供しない。
wire edgeの最小表現、複数owner間のcommit順、非同期read versionはmilestoneごとにモデルとサイズを比較して決める。

## Issue化

タイトル案: `読み取り専用live propsとowner世代に沿ったclient間の部分更新を実装する`。
直接の子、寿命、keyed子、非同期readの順に切り出し、初版と最終完了を区別する。
