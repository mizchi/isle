# ADR-0009: 分岐factoryのCodeRef化と遅延チャンク分割

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 8「分岐factoryの遅延チャンク化」

## 背景

現在はValuePhasePlanで不要なsnapshotを削減し、一方向にしか変化しない分岐のfactoryも除去する。
ただしownerのregion factory一式は同じmoduleに生成され、handlerから静的importされる。
閉じたpanelを実行しなくても、そのコードまで取得する場合がある。
[現状の不足](../resume-semantics.md)と[取得・評価・activate・commitの分離](../resolution-optimizer.md)を
同じ依存計画で接続する。

## 判断

Show/Switch等のarmとForの生成factoryを、guardと依存を持つCodeRef候補にする。
論理的な分割点はcompilerが作り、物理的なchunkのpackingはVite/Rolldownへ渡す。
CodeRefとchunkを一対一に固定しない。小さいfactoryや共有部分は最終サイズを見てまとめられるようにする。
初版はJSの分割を中心とし、SSRの初期表示に必要なCSSをcritical pathから外さない。

### 契約と責務

compile-onlyの計画はfactory ID、guard、必要なslot/capture、生成するregion、CSS依存、sourceを持つ。
生成したCodeRefの参照先と最終manifestの依存閉包を照合し、通常操作から不要なfactoryへの
static importが残っていないことを検査する。
親・子・resourceのすべてを一括取得する閉包へ戻さない。

遅延解決は新しい非同期境界を作るため、DOM変更を次の順で扱う。

1. 現在の入力と書き込み結果から、必要なfactoryとCSSを含む純粋なpatch計画を作る。
2. manifestの依存を並列取得し、CSSの準備とowner/regionの生存を確認する。
3. versionとidentityを再確認してcommitする。古くなった計画は破棄または純粋な計画部分だけを再計算する。

外部effectを持つevent/action本文を、import待ちの後に勝手に再実行しない。
途中まで変更したDOMをコード不足のまま公開しない。
取得失敗は既存のエラー経路へ伝え、直前のcommit済みDOMを保持する。
同一ownerのevent順とdispose規則は既存契約を維持する。

## 依存関係と変更箇所

必須の先行ADRはないが、既存の依存・phase計画をguardとentryごとの需要へ拡張する作業を含む。
[0008](0008-readonly-live-props.md)の完了は必須にしない。
新しい取得待ちとcommitの観測点は[0005](0005-key-generations-and-frame-transitions.md)へ渡し、
layoutへ影響する変換は[0001](0001-static-layout-instability-verification.md)の対象scopeと整合させる。

主な対象は`lib/resume-plan.mjs`、`lib/region-codegen.mjs`、`lib/code-manifest.mjs`、
`lib/loading-plan.mjs`、Vite adapter、runtimeの解決/commit部分。
wire/CodeRef/registryを変更する場合はABIとbuild fingerprintを明示的に更新する。

## 実装計画

1. **探索**: 重い閉じたpanelと軽いCounterを持つfixtureで、Counter操作が取得するmodule・gzip bytes・slot復元をbaselineに保存する。
2. **Red: 需要**: Counter操作にpanelのfactory codeが届く場合を失敗にする。未表示armが後で正しく生成できることも同時に要求する。
3. **Green: IR**: guard付きconsumerとentryの必要閉包を生成する。今は不要でも、将来のarm/row生成に必要なcaptureを保持する。
4. **Green: 分割**: region factoryを独立したmodule候補へ出し、CodeRefを登録する。最終bundleからstatic/dynamic importとCSSの閉包を検査する。
5. **Red/Green: 非同期commit**: importを停止したままowner破棄、複数入力、行のmove/removeを再生し、世代/versionを照合してからcommitする。
6. **Green: 並列解決**: handler・factory・必要CSSの分かっている依存をmanifestから並列取得する。開いたarmが必要とする将来の子全体までは再帰取得しない。
7. **Green: packingと説明**: 物理chunkの共有費用を含めて分割を評価し、prefetchの根拠と必須の依存を分けて表示する。
8. **Refactoring**: 需要計画、factory生成、物理packing、取得、commitを分離する。unusedの解決支援を既存の小さいアプリから除去する。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 重いpanelを閉じてCounter操作 | panel専用factory取得0、不要な状態の復元0 |
| 初めてpanelを開く | 必要依存を並列取得し、正しいDOMを一回commit |
| 再度開く | 解決済みmoduleを再利用し、別instanceの状態を混同しない |
| Forの初回行生成と並べ替え | factory生成と既存DOMのmoveを区別 |
| import待ち中のunmount | 遅い完了でowner/行を復活させない |
| CSS遅延/取得失敗 | 未準備のDOMを公開せず、失敗を所定の経路へ返す |
| 小さいarm・共有依存 | chunk増加の費用を計測し、意味的な分割と物理配置を区別 |

- [ ] productionの実取得module/JS/CSS bytesで削減を確認し、source分割だけで完了にしない。
- [ ] 説明用IRやplannerをアプリへ配信しない。
- [ ] 未使用の既存Counter/SSR-only fixtureのproduction配信サイズ増分0 byte。
- [ ] 使用時の共有runtime、全JS、初回操作、panel初回操作のraw/gzipを別々に記録する。
- [ ] 元と同じUI・操作列で、cold/warmの時間と取得量を比較する。速度改善率は測定後に報告する。
- [ ] Playwrightで取得・評価・activate・commitの順序とkey付きDOM identityを確認する。
- [ ] SSRに必要なCSSと予約領域を保持し、最初の表示のlayout回帰を検査する。

追加evalは`evals/scenarios/lazy-factories/`を計画する。
既存の回帰確認は`just resume-phases-check`、`just loading-check`、`just style-check`、`just check-types`。
最終manifestの解析は`just chunks`、ブラウザーの取得順は制御したPlaywright fixtureで確認する。

## 代替案と未決事項

利用者がdynamic importを記述する方式は可能だが、compilerが確定できる境界から先に生成する。
profileによる予測はpacking/prefetchの改善に使い、正しさの根拠にはしない。
物理分割の閾値、captureの表現、失敗時のUI、loading policyとの優先順はbaselineと有限モデルから決定する。

## Issue化

タイトル案: `region factoryを需要ごとのCodeRefへ分割し、manifestから遅延解決する`。
guard/entry計画、factory分割、安全なcommit、packing/計測の順に実装する。
