# ADR-0001: 記号的レンダラによるLayout Instabilityの静的検証

- 状態: Proposed（方針と段階実装の計画）
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: Layout Instability APIが観測する条件を自前レンダラで静的検査する

## 背景

現在の[CSS検証コア](../../packages/css-verifier/README.md)は、閉じたCSS部分集合から
有理数・区分線形の矩形を抽出する。[noshift/1](../layout-transitions.md)は明示した対象の
存在・位置・寸法を二状態間で比較し、Isle adapterは有限な状態候補とkeyを対応付ける。
可視領域、text fragment、frameの順序、入力時刻をモデル化する機能はまだない。

[Layout Instability API](https://wicg.github.io/layout-instability/)はframe間の開始位置と
可視領域を使ってshiftを観測する。APIのdraftは2026-11-13に確認した版を参照し、
実装時には参照commitまたは取得した仕様のdigestを観測profileへ固定する。
CSSとAPIの意味論、ブラウザー実装、[CLSの集計規則](https://web.dev/articles/cls)を区別する。

## 判断

CSSコアを、ブラウザーの意味論に沿った**記号的レイアウトエンジン**として拡張する。
許可した入力・寸法・状態遷移・描画順の全域を静的に検査する。生成アプリは通常のHTML/CSSを
ブラウザーで描画し、検査エンジンやZ3を配信する必要はない。

責務を次の三つへ分ける。以下のIR名は設計案である。

| 層 | 入力と出力 | 責任 |
| --- | --- | --- |
| レイアウト | CSS・BoxTree・環境 → SceneIR | 要素、text fragment、座標系、可視性の事実を抽出 |
| 観測 | 前後のSceneIR・対応・ObservationProfile → shift義務 | 開始位置、可視領域、除外条件、影響領域を解釈 |
| 時間 | 状態遷移・owner世代・描画機会 → FrameTransitionIR | 起こり得る隣接frameとその被覆、必要に応じて時刻を提供 |

IsleのASTやeventを解釈するのはadapterの責務とし、汎用コアは不透明なidentityと遷移を受け取る。
契約が抽出結果を都合よく変えないように、SceneIRの抽出はContractIRと独立させる。

### 既存契約との互換性

`@noshift`と`noshift/1`の存在・寸法の厳密な等価性を維持する。
サイズだけの変化や対象の誕生を扱うAPIの述語とは意味が異なるため、新しい観測profileを設ける。
element契約、部分treeの観測、閉じたdocument全体の観測を結果のscopeで区別する。
一つの固定外枠の証明から内部のtextや兄弟への影響を保証しない。
`@noshift`で選んだ対象だけの成功を、document全体のshiftゼロへ読み替えない。
document保証には、textを含む観測対象の完全なinventoryと、host・兄弟・外部変更の被覆を要求する。

### 保証の条件

目標とする関係は次のとおり。実装済みの定理ではない。

```text
Obs(Browser(P, e, schedule)) ∈ γ(AbstractRender(P, domain))
forall trace ∈ γ(AbstractRender(P, domain)): NoShift(trace)
--------------------------------------------------------
domain内のbrowser実行で、対象scopeのshiftが発生しない
```

包含関係にはCSS抽出、丸め、text/fontの境界、rootの配置、外部変更、描画順が含まれる。
範囲外の操作やopaqueなSDKを無視して成功にしない。入力仮定とprofileの被覆を証明結果へ保存する。
現状はこの包含関係全体を機械証明しておらず、差分evalの成功だけでも証明したとは扱わない。

## 依存関係

- [0002](0002-layout-counterexample-explanations.md): source・矩形・原因を追跡する共通の説明データ。
- [0003](0003-dynamic-dimension-contracts.md): 動的内容の範囲と相関。
- [0004](0004-async-layout-reservations.md): 非同期表示と予約領域の有限case。
- [0005](0005-key-generations-and-frame-transitions.md): identityの世代と描画され得る隣接状態。
- [0006](0006-verification-result-cache.md)は性能改善であり、観測の正しさの前提にしない。

## 実装計画

### M0: 観測profileと参照評価器

1. **探索**: 仕様の各条件を「対応」「制限して除外」「未対応」の表へ落とす。既存矩形モデルとの不足を記録する。
2. **Red**: 固定box、サイズだけの変化、key付き移動、初回frame、textだけの移動、A→B→Aを独立fixtureにする。最終状態だけを比べる故障版を必ず失敗させる。
3. **Green**: 具体的な矩形と明示したidentityからshiftを評価する純粋な参照関数と、version付きObservationProfileを作る。
4. **Refactoring**: source説明、観測規則、幾何抽出を別moduleにし、NodeとWorkerで同じJSON入力を使う。

初期profileは有限のbox、horizontal-tb/ltr、固定viewport・scroll位置、既知の不透明な可視領域から始める。
textを含むsceneは、開始位置とfragmentを導出するか検査可能な境界が揃うまでUnknownにする。
未対応のscroll、transform、clip、丸めを暗黙の恒等変換にしない。

### M1: shiftゼロの全域検査

1. ADR-0005の被覆された遷移とSceneIRを接続し、許可した各隣接frameで開始位置の不変性を検査する。
2. significanceの閾値はprofileに持たせる。最初は任意の非ゼロ移動を拒否する保守的な条件とする。
3. viewport・内容寸法の区間、media/container分岐、ownerの生存領域の被覆を別に検査する。
4. CLI・Vite・playgroundへ結果と反例を渡す。最初の部分profileとdocument全体の保証を区別して表示する。

この保守的profileでの違反は「モデル上に移動候補がある」という意味になる。
ブラウザーが実際にAPI entryを報告することとは区別し、反例の実現可能性と再現結果を別に記録する。

### M2: 具体的なshift scoreと上限

1. 具体的な反例の前後の可視矩形から、和集合の面積と最大移動距離を計算する。重なりを二重加算する故障版を用意する。
2. APIの意味に沿うscoreを、仕様version・環境・時刻条件付きで出力する。
3. 全域のscore上限は別段階とする。面積・正規化・積により非線形になるため、既存の線形solverへそのまま流さない。
4. 検査できる有限領域か健全な上界を定義し、計算できなければUnknownとする。代表viewportの評価を全域証明へ読み替えない。

### M3: 時間付きCLS上限

1. FrameTransitionIRに入力時刻、commit時刻の範囲、session window、page lifecycleの条件を追加する。
2. 非同期遅延を一つの固定値にせず、許可した順序・時間の全域で集計する。
3. 周期的にshiftし得る実行や発火頻度が無制約のモデルは、有限traceだけで安全とせず、帰納的な上界またはUnknownを返す。
4. API entryの観測とCLSの集計を別の結果として保存する。入力直後という自己申告だけで遷移を除外しない。

## evalと完了条件

| シナリオ | 期待する検出 |
| --- | --- |
| 固定slot内の非同期結果 | slot外の対象はshiftゼロ |
| 外枠固定、内部buttonだけ移動 | 内部scopeの違反 |
| 初期と完了は同じ、途中だけ高さが変化 | 中間frameの違反 |
| 行追加、既存keyが押される | 新しい行と既存行の移動を区別 |
| 固定box内でtextが折り返す | text未対応ならUnknown、対応後はfragmentから判定 |
| 一部のviewportだけ移動 | 境界を含む正確な反例 |
| 非同期結果とCSS適用の順が逆転 | 可能な順序を被覆、古いownerへのcommitを拒否 |

- [ ] M0〜M3ごとに対応profile・対象scope・完全性・trusted前提を機械可読で記録する。
- [ ] 正常例、違反例、Unknown、故障版の期待結果をNodeとZ3 Wasmで照合する。
- [ ] 対応範囲の反例をPlaywrightで再現し、モデルとの不一致を回帰fixtureにする。
- [ ] 静的検証の受理にブラウザー起動を必要としない。
- [ ] 同一アプリで観測契約の有無による配信HTML・JS・CSSの増分が0 byte。

追加するevalは`evals/scenarios/layout-instability/`、モデルは必要な段階で`models/layout_frames/`へ置く計画。
既存の回帰確認は`just css-verifier-check`、`just noshift-check`、`just check-types`。
各milestone専用のjust recipeは、その実装時に追加する。

## 代替案と未決事項

ブラウザー計測のみの受理は全入力の被覆を与えないため、差分oracleとして利用する。
汎用ブラウザーエンジン全体の再実装は初期範囲に含めず、意味論を定義できるprofileから広げる。
観測profileの最終名、text/fontの具体的な導出方法、丸めの抽象化、時間モデルの上限はM0で決定記録を追加する。

## Issue化

タイトル案: `静的レンダラからLayout Instabilityを検査する観測・時間モデルを構築する`。
上位IssueとしてM0〜M3を管理し、0002〜0005を関連付ける。
各段階を独立に完了判定し、M1の成功をCLS全体の保証とは記載しない。
