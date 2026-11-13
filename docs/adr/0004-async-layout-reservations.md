# ADR-0004: 非同期表示の予約領域検査

- 状態: Proposed
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: 3「非同期表示の予約領域検査」

## 背景

既存のnoshiftは有限stateを比較できるが、非同期のloading/ready/error、CSSの準備、画像や
外部内容の寸法を一つの表示契約として扱う機能はない。
固定した外枠も、内部のbuttonや後続の要素が動かないことまでは意味しない。
[resourceの寿命](../resource-disposal.md)と[CSS-ready](../style-resolution.md)の実行規則は
既にあり、その規則と表示候補を接続する必要がある。

## 判断

表示phaseと内容寸法を明示した有限なモデルから、予約領域への包含と周囲の安定を検査する。
予約領域は実装CSSから求める。要求の宣言がCSSやplaceholderを自動生成して自己証明する構成にしない。
初版はAPI/環境データでphaseを与え、専用のresource/予約領域DSLは別途必要性を評価する。

### 契約と責務

`ReservationContractIR`案は、slotのtarget、各phaseの内容、許可した寸法、安定を要求する対象を持つ。
少なくとも次の義務を分離する。

1. slotの領域が各phaseで定義され、宣言した入力領域を覆う。
2. 各phaseの内容が実際のslotのcontent boxに収まる。
3. 外枠や後続の要素等、明示した対象がphase切替で動かない。

同じphaseでもdataやCSS状態で配置が変わる場合は別caseとする。
phase名や「ready」という値だけを根拠にCSS適用済みとみなさず、実行規則またはtrustedな前提を記録する。
初版の保証は有限caseの全比較。時系列の被覆を証明した結果とは別に表示する。
opaqueなiframe/SDK内部は境界の寸法だけが対象で、内部のshiftまで保証しない。

## 依存関係と変更箇所

- 必須: [0003](0003-dynamic-dimension-contracts.md)の内容寸法・相関・由来。
- 初版は明示したphaseの全候補比較で実装できる。
- 時系列の被覆と中間frameの保証には[0005](0005-key-generations-and-frame-transitions.md)を接続する。
- shift score/CLSへ結び付けるのは[0001](0001-static-layout-instability-verification.md)の責務。

汎用の義務は`packages/css-verifier/src/`に、phaseをIsleの構造へ結び付ける処理は`lib/layout/`に置く。
初版は検査用metadataのみで、`runtime/resource-owner.mjs`等の実行規則を変更しない。
phaseを静的に導出できない外部setupは、閉じたモデルの前提を与えるかUnknownにする。

## 実装計画

1. **探索**: 既存の80px予約slot、地図のdetails、フォームのpending/errorを題材に、必要なphaseと寸法の前提を記録する。
2. **Red**: loading/readyは同じでもerrorだけ背が高い例、外枠は固定でも内部buttonが動く例、CSS適用前だけ崩れる例を用意する。readyだけを見る故障版を検出する。
3. **Green: コア**: slotのcontent boxと内容の寸法を照合し、明示した安定対象を既存の遷移義務へlowerする。slot自身の保証を子孫へ継承しない。
4. **Green: phase**: loading/ready/error、retry、CSS未準備/準備済みを有限caseに正規化する。不可能な組の除外には根拠を要求し、未完了の遷移情報を完全と呼ばない。
5. **Green: 利用経路**: CLI・Vite・playgroundで同じ契約を使い、違反phase・寸法・slot・移動対象を表示する。
6. **Green: 時間接続**: 0005の完成後、完了・abort・unmount・CSS適用順から隣接frameを生成する。初版との被覆の違いを証明結果に残す。
7. **Refactoring**: slot選択、寸法義務、phase生成、resource由来の根拠を分離する。

## evalと完了条件

| シナリオ | 受入条件 |
| --- | --- |
| 24..80pxの内容と80px slot | 内容の包含と後続要素の安定がverified |
| errorのみ96px | error phaseの不足を検出 |
| slot固定、内部操作領域が移動 | 内部対象のnoshift違反 |
| CSSが結果より遅く適用 | 未準備caseを検査、または実行規則で排除した根拠を記録 |
| retry中に古い結果が到着 | 世代・遷移接続後、古い結果を有効なcommitにしない |
| 画像寸法・font境界がない | 根拠不足をUnknownとして表示 |

- [ ] 包含、外枠の安定、内部対象の安定を別々に報告する。
- [ ] 全phase・全寸法・全viewport領域の被覆を確認する。
- [ ] 静的モデルの反例を、遅い応答とCSS適用順を制御したPlaywrightで再現する。
- [ ] 有限caseの比較を完了した段階と、時間的な被覆を完了した段階を区別する。
- [ ] 同一アプリの配信HTML・JS・CSS増分0 byte。

追加evalは`evals/scenarios/layout-reservations/`を計画する。
既存の回帰確認は`just noshift-check`、`just style-check`、`just resource-disposal-check`。

## 代替案と未決事項

CSSを自動生成する予約componentは実装補助として将来検討できるが、検査器の前提にはしない。
任意の画像デコード・font shaping・外部SDKのDOMは初版の範囲外。
将来のDOM側注釈の名前、phaseのsource表現、slot境界の公開方法はeval後に決定する。

## Issue化

タイトル案: `非同期表示の全phaseについて予約slotへの包含と周囲の安定を検査する`。
0003完了後に有限case版を実装し、0005との時間接続を別のチェック項目として残す。
