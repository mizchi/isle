# ADRと実装計画

2026-11-13の機能提案8件と、Layout Instabilityの静的検証方針を記録する。
各ADRは実装の切り出し単位であり、背景、判断、依存関係、TDDの手順、eval、完了条件を持つ。

上位の目的は[Qwik型の事前コンパイルUIとCSSレイアウト契約の型システムへの統合](../project-purpose.md)。
環境の再構築と作業の再開は[引き継ぎ手順](../handoff.md)を参照する。

0002は **実装中**(コアとCLI)、0010は **実装中**(1行テキスト)、他は **Proposed**。計画の記録と機能の実装承認を区別する。
GitHub Issueは未作成で、各文書の「Issue化」を承認後の起票に使う。
記載した新しい型・profile・成果物名は設計案であり、現在の公開APIではない。

## 一覧

| ADR | 先の提案 | 実装すること | 必須の依存 |
| --- | --- | --- | --- |
| [0001](0001-static-layout-instability-verification.md) | 追加の上位方針 | 記号的レンダラによるLayout Instabilityの静的検証 | 段階ごとに0002〜0005を利用 |
| [0002](0002-layout-counterexample-explanations.md) | 1 | 反例の可視化と原因追跡 | 既存LayoutIR・noshift |
| [0003](0003-dynamic-dimension-contracts.md) | 2 | 動的寸法の入力契約と前提の由来 | 既存CSS検証コア |
| [0004](0004-async-layout-reservations.md) | 3 | 非同期表示の予約領域検査 | 0003 |
| [0005](0005-key-generations-and-frame-transitions.md) | 4 | keyの世代、寿命、描画され得る遷移 | 既存key対応・owner/regionモデル |
| [0006](0006-verification-result-cache.md) | 5 | 検証成功のキャッシュと失効 | 対象IRのversion・依存情報 |
| [0007](0007-static-contrast-contracts.md) | 6 | 単色・不透明な色の静的コントラスト検査 | 既存CSSカスケード |
| [0008](0008-readonly-live-props.md) | 7 | client境界を越える読み取り専用live入力 | 既存ValuePhasePlan・owner管理 |
| [0009](0009-lazy-region-factory-chunks.md) | 8 | 分岐factoryのCodeRef化と遅延チャンク分割 | 既存resume計画・manifest |
| [0010](0010-font-derived-text-metrics.md) | 追加の指示 | mizchi/fontによる1行テキストの幅・高さの導出 | 既存CSS検証コア |

0001は上位の設計方針であり、残るADRの完了を一括して宣言するものではない。
0006・0007は独立して進められる。0008・0009も互いの完了を必須条件にしない。

## 推奨する実行順

1. **説明可能性**: 0002で反例の出典と前後の幾何を読めるようにする。
2. **入力と寿命**: 0003と0005の同期event段階を進め、寸法の相関とkeyの世代を定義する。
3. **非同期表示**: 0004で有限な表示phaseを検査し、0005の非同期・frame接続段階へ渡す。
4. **観測モデル**: 0001のshiftゼロ検査を接続し、具体的なshift score、その後に時間付きCLS上限へ進む。
5. **検証の運用**: IRのversionを確定した単位から0006を追加する。0007は別の述語群として進める。
6. **resumeの改善**: 0009の取得量削減と0008のcomponent間連携を、共通の依存IRを使って進める。

0001のshiftゼロ検査は、0005の初版が保証する同期遷移の範囲から開始できる。
非同期・text・scroll等の被覆が揃うまでは、結果にその範囲を明示する。

## 全ADRに共通する実装条件

- **探索 → Red → Green → Refactoring**。現行の不足を再現するfixtureと壊した実装の検出を先に置く。
- 契約、実装由来の事実、証明義務を分離する。要求した保証を実装の前提へ追加しない。
- 未対応・入力不足・被覆不足・上限超過・timeoutを`verified`へ変換しない。
- CSSコアはIsleの構文やProgramIRに依存せず、Isle adapterが状態・所有・source位置を供給する。
- 0001〜0007の検査用metadataはbuild/debug成果物に置く。同じアプリの注釈あり・なしで、配信HTML・JS・CSSの増分0 byteを検査する。
- 0008・0009はES2023、標準DOM/ESM、Vite/Rolldownを使う。未使用時の配信サイズ増分0 byteを要求する。
- サイズはHTML、snapshot、bootstrap、全JS、CSS、操作時に取得したJS/CSSを分ける。rawとファイル別gzip合計を記録し、bundling前のsource bytesを転送量と呼ばない。
- ブラウザーによる差分evalは、静的モデルの誤りを見つける補助。利用者のソースを静的検証で受理する際にブラウザー描画を必要としない。
- evalには入力・期待status・実際のstatus・被覆・仮定・反例・測定条件を残す。未実行の計画を測定結果として記載しない。

## 検証コマンドの扱い

各ADRにある「既存の回帰確認」は、現在のjustfileに存在するコマンドである。
「追加する検証」は将来の実装作業であり、本変更ではrecipe、テスト、eval、モデルを追加しない。
検証対象に合わせてNodeテスト・型検査・有限モデル・Playwrightを選び、同じ目的の検査を重複させない。

## Issue化と状態の更新

承認されたADRごとに、記載したタイトルと完了条件でIssueを作り、ADRへURLを戻す。
0001は上位Issueとして段階別に進捗を記録し、0002〜0005のIssueへ関連付ける。
「採用」「実装中」「実装済み」へ更新する際は、判断・commit・eval成果物への参照を追加する。
仕様変更が必要なら理由をADRへ追記し、期待値だけを変更して失敗を隠さない。

現行の保証範囲は[静的UI検証の方針](../static-ui-verification.md)、
[レイアウト契約](../layout-contract-language.md)、[noshift/1](../layout-transitions.md)、
[resume意味論](../resume-semantics.md)を参照する。
