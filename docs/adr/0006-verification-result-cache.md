# ADR-0006: 検証成功のキャッシュと確実な失効

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 5「検証結果のキャッシュ」

## 背景

構造候補・条件領域・対象が増えると、同じ入力への抽出とsolver実行を繰り返す負担が増える。
既存のbuild certificateは入力と結果を記録するが、証明済み部分を再利用する一般の仕組みはない。
CSS内容だけをkeyにすると、reset、親の割当、内容の仮定、identity、検査器の変更を見落とす。

## 判断

初版は**同一の検証入力への成功結果の再利用**に限定する。
子の保証だけを仮定して本体の検査を省くmodular verificationは別の課題とする。
純粋な解析・検証APIと、Node/Workerのcache storage adapterを分離する。

### 契約と責務

version付きの正規化済み入力からdigestを求める。最低限、次を含める。

- CSS、resetの順序、CSS変数、祖先、構造、props/state候補、target対応、owner世代・遷移の被覆。
- 契約、profile、viewport、host割当、scrollbar、内容寸法と相関、trustedな前提。
- parser/抽出器/正規化器/検証器/solverのversion、IR version、必要な実行option。
- 検査のscope、完全性の判断に使った上限、参照仕様のversion。

hashは短縮しない。cache entryに入力digest、結果digest、完全性、依存一覧を保存する。
型と整合性を確認した完全な`verified`だけを成功として再利用する。
Unknown・timeout・破損・version不一致は再検証へ回し、以前の成功へ置き換えない。
cache missや書き込み失敗は正しさに影響させない。

初版は同じ環境のローカルcacheのみを信頼境界とする。
digestの一致だけで外部から取得した結果の正当性が証明されるとは扱わない。
Node/Wasm間の共有は検証器の同等性とversionを照合できる段階まで別namespaceにする。
source位置の変更は当初digestへ含め、古い位置を表示する事故を防ぐ。

## 依存関係と変更箇所

必須の先行ADRはないが、対象とするIRのversion・正規化規則を固定してから有効にする。
[0003](0003-dynamic-dimension-contracts.md)や[0005](0005-key-generations-and-frame-transitions.md)の
変更時はcache namespaceを更新する。

keyの生成とentryの型は汎用packageへ、storageと失効・evictionは外側のadapterへ置く。
`lib/layout-build.mjs`、Vite、CLI、playground Workerが同じ入力digestを参照する。
cacheの内容・統計はアプリsnapshotや配信registryへ追加しない。

## 実装計画

1. **探索**: 同じfixtureの再検証で抽出回数・solver呼出数・cold時間を計測し、再利用単位を決める。
2. **Red**: viewport、reset順、親のCSS、key対応、trusted bound、solver versionを一つずつ変える。失効しない故障版を検出する。
3. **Green: key**: 数値の有理数表現と順序に意味のある配列を保存する正規化器を作る。object key順等の非意味的差だけを統一する。
4. **Green: entry**: 完全性と全検査結果を検証するentry readerを追加し、破損・欠落・他のscopeの結果を再利用しない。
5. **Green: storage**: Nodeの原子的な書き込みと重複実行の集約、Workerの任意cacheを追加する。storage無効でも同じproofを得られるようにする。
6. **Green: 統計**: hit/miss、失効理由、solver回数、時間をbuild/debugレポートへ出す。初回と二回目の処理を分けて測る。
7. **Refactoring**: canonicalization、依存解決、storage、証明処理を分離し、cache削除で保証が変わらないことを確認する。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 同一入力の二回目 | warm時の対象solver呼出数0、意味的なproof結果は同一 |
| 親・reset・内容boundのみ変更 | 依存する検証を失効 |
| identity/遷移の変更 | 古い成功を再利用しない |
| cacheファイル破損・途中終了 | 再検証し、壊れた成功を返さない |
| Unknown/timeoutの後に再実行 | 過去のverifiedを代わりに返さない |
| cacheなし/あり | status、被覆、仮定、反例の正本が一致 |

- [ ] 入力ごとの失効matrixを自動検査する。
- [ ] cold/warmの中央値、solver回数、cache容量を同じ入力・環境で記録する。
- [ ] 速度目標の数値はbaseline採取後に決定し、ここで未測定の高速化率を宣言しない。
- [ ] cacheを無効化・削除でき、証明の正しさをstorageの可用性へ依存させない。
- [ ] 同一アプリの配信HTML・JS・CSS増分0 byte。

追加evalは`evals/scenarios/verification-cache/`を計画する。
既存の回帰確認は`just css-verifier-check`、`just noshift-check`、`just check-types`。

## 代替案と未決事項

子契約のsummaryだけを再利用する合成証明は、健全性の義務が別に必要なため初版から分離する。
外部共有cacheや署名付き証明の配布は後続。
容量・eviction、source mapを再利用する最適化はbaselineから決める。

## Issue化

タイトル案: `完全な検証入力をkeyにした成功cacheと失効matrixを実装する`。
最初はNodeで正しさと回数削減を確認し、その後にWorkerのstorage adapterを接続する。
