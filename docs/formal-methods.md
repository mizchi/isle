# 形式手法の採用方針

状態: 最初の形式モデルと検査を実装。2026-11-02。形式モデルは MoonBit＋`mizchi/veri@0.2.1` を採用する。v0 は TypeScript 風の閉じた専用構文、frontend は MoonBit、codegen と Web adapter は JS である。次段階の [宣言 DSL＋TS/MoonBit 本体の案](design.md#21-宣言-dsl-と処理本体を分ける案) は未実装である。以下は実装済みの小モデルと、今後の検証計画を区別する。

`just verify` は92ケースを検査する。owner 33状態、security 69状態、forms 22状態、form-session 186状態、regions 40状態、CSS 解決30状態に加え、Once の Cold 126状態、SSR ready 22状態、2 resource の合成4状態、所有リソースの破棄1,452状態を完全探索する。29故障版・仮定を外した4例・不十分な契約の2例、計35反例を実際の step で再生する。応答性16ケースには公平性と循環反例を記録する。`moon prove models/permit` は純粋な2 record store の不変性と frame 条件を証明し、負例の偽 postcondition の拒否も検査する。完全な記録は [formal.json](../evals/results/formal.json)、範囲は [models/README](../models/README.md) を参照。Lean の意味保存証明は未着手。

## Once の時相的な参照契約

2026-11-05 追加。[時相的な値の意味論](temporal-resources.md)に `Once<T>` の状態遷移、安全性、応答性と弱公平性を定義した。`models/resource_once` と `just verify` で、SSR の確定値、破棄・再生成、二重開始・公開、古い結果、完了配送の永久待機を検査する。Cold は126状態、SSR ready は22状態、独立する2個の Once の合成は4状態。検査件数は破棄モデルを含む [formal.json](../evals/results/formal.json)を正とする。

この追加は参照意味論の実装であり、resource DSL / browser runtime や compiler の意味保存証明を実装したものではない。有限グラフ全体の無限経路の検査と、任意規模のプログラムの証明を区別する。

## 推奨する入口

**MoonBit＋mizchi/veri 0.2.1 で実行可能な状態遷移モデルを作り、仕様が安定した小さな意味論を必要に応じて Lean 4 で証明する**構成を採用する。最初から二つの言語で同じシステム全体を記述しない。ユーザーがプロト実装を指示したため、最初の model と runtime を実装した。最終的な compiler の言語をこの prototype の選択だけで固定しない。

| 問い | 第一候補 | 得られるもの |
| --- | --- | --- |
| import、event、dispose の順序で壊れるか | veri の有限モデル検査 | 問題を起こす操作列、または定義した有限範囲内の検査結果 |
| 遷移関数や graph checker が不変条件を保つか | MoonBit `moon prove` | 仮定・対応範囲内の関数契約の証明 |
| 任意サイズの IR で変換前後の意味が等しいか | Lean 4 | 帰納的な意味論と意味保存の定理 |
| 実装がモデルと同じ結果になるか | 操作列の差分検査、将来の Playwright | 対応する実装に対する回帰検査 |

MoonBit の検証は experimental で、Why3 と SMT により契約を検査する。`moon prove` 自体を時間的モデル検査器とは扱わない。`veri/model_check` には上限付きの検査、有限モデルの完全探索、反例の再生が別途ある。参照は `main` ではなく `v0.2.1` の公開 interface を基準にする。README に未公開の追加分について古い注記が残るため、利用可能性は versioned interface と実際の依存解決で確認する。([MoonBit 検証仕様](https://docs.moonbitlang.com/en/latest/language/verification.html)、[veri 0.2.1 公開 interface](https://github.com/mizchi/veri/blob/v0.2.1/model_check/pkg.generated.mbti))

### 依存と検証環境

`moon view mizchi/veri@0.2.1 --json` で公開済み・非 yank を確認し、このリポジトリの依存として取得した。`just verify` は解決済みの veri が 0.2.1 であることも確認する。

| 対象 | 採用・確認した値 |
| --- | --- |
| 形式モデルの依存 | `mizchi/veri@0.2.1`。導入時に実際の解決結果も 0.2.1 であることを確認 |
| 対応する source commit | `4aeb9b9b5cb79d02c0b1bfb6a6320263c12d8e07` |
| registry checksum | `e04e9766487ee5f74d38568bb000fce5ce63230415288d485316726c95cc4259` |
| verifier CI の compiler pin | `moonc v0.10.19+97801ee1b`。手元の compiler も同じ値 |
| CI の Z3 pin | `4.16.0`。手元の同版を使い小契約の prove と負例を実行済み |
| モデル構築 | `mizchi/veri/model_check` の `Spec` / `build_client` |
| 有限モデルの完全探索 | `mizchi/veri/model_check/smt` の `exhaustive` |
| 将来の実装比較 | `mizchi/veri/testing/state_machine` |

環境 pin は説明文より versioned の [.github/toolchain.env](https://github.com/mizchi/veri/blob/v0.2.1/.github/toolchain.env) を優先する。README や検証手順に以前の compiler pin が残る箇所がある。v0 では公開 interface を使った finite exhaustive と witness replay を実行し、CLI 全般や未使用の solver 経路まで検査済みとはしない。

各検証結果には veri の版、compiler と solver、通常整数 / 機械整数のモデル、有限領域、探索完了の有無を記録する。`moon check` の成功、有限モデルの検査、`moon prove` の証明結果は別々に扱う。

## 最初のモデルは event と owner の寿命に絞る

宣言 DSL と本体を分ける案では、まず DSL の境界と owner/commit を検証対象にする。本体を入力→成功結果/失敗/中断という抽象操作にし、許可した write set・schema・capability 契約と owner generation が一致したときだけ適用できる規則を検査する。任意の TS/MoonBit 本体の純粋性や正しさを自動的に証明したとは扱わない。summary の信頼仮定と実装側の検査・ABI の対応が別途必要である。この拡張モデルはまだ追加していない。

最初は DOM、ネットワーク、Vite の実体を入れず、必要な完了イベントだけを入力として与える。

v0 の owner model は scope ID 一個、generation 二個、event 一個、chunk 一個に限定する。生存、待機・適用・中止・失敗、読み込み状態、stale write を持つ。複数 event の順序、cleanup 回数、複数 scope の相互作用は今後の拡張であり、F01〜F05 全体をこのモデルだけで証明済みとはしない。

操作は `Dispatch / LoadSucceeded / LoadFailed / Dispose / CreateScope / Drain` を候補にする。`LoadSucceeded` が実行可能であることと、必ず発生することは別に扱う。DOM への書込みは owner、generation、event ID を伴う抽象的な出力記録にする。

| ID | 検査したい性質 | 想定する故障・健全性の確認 |
| --- | --- | --- |
| F01 | 破棄された generation に event の効果を適用しない | generation guard を除く変種で違反を探す |
| F02 | 同じ event を二度適用しない | 重複した load 完了で二重 drain する変種を入れる |
| F03 | 生存中 scope の受理済み event が仕様の順序に従う | chunk 完了順を入れ替える。正常に二件処理できる到達性も確認 |
| F04 | cleanup は各 generation で高々一回 | Dispose の重複を許した入力で調べる |
| F05 | scope ID の再利用で旧 event が新 scope に流入しない | 同じ ID を別 generation で作り直す |

手作業で想定する反例は、`Dispatch(A,g1) → Dispose(A,g1) → CreateScope(A,g2) → LoadSucceeded(old) → Apply(old,A,g2)` である。これは未実行の仮説であり、実装のバグを発見したという意味ではない。

応答性は「受理した event が、いずれ適用・中止・失敗のいずれかに到達する」とする候補を置く。chunk の成功または失敗がいずれ通知されることと、処理可能な待ち列が公平に drain されることを前提にする。ネットワークが永遠に応答しない実行まで、必ず処理完了するとは約束しない。失敗・retry の意味は仕様判断として残す。

## 次に resource と同期 commit を分けて追加する

resource は `(ownerGeneration, resourceKey, requestRevision)` を token にし、古い結果を適用しないことと、独立した二 resource が互いの結果を無効化しないことを調べる。一般の event action には一律の latest-wins を適用しない。

同期更新は write、compute、commit の小さなモデルとし、diamond の途中値が外へ出ないことを観測で定義する。handler 内の state／derive read の意味、外部 effect の順序、例外時の扱いは先に仕様へ書く。単に最終 DOM が一致するだけでは、途中の read や外部 effect の正しさまで保証しない。

モデルは mathematical integer と実行時の整数を区別する。現行 MoonBit 検証の通常の整数モデルは実行時 overflow を検証しない。generation や revision を無制限に増やせると仮定したモデルだけでは、実装で桁あふれして古い token と一致する問題を除外できない。実装側の非再利用 ID、checked increment と上限到達時の明示的失敗などを別に仕様化し、その橋渡しを検証する。([MoonBit trust model](https://docs.moonbitlang.com/en/latest/language/verification.html#trust-model-and-limitations))

## Lean を使うなら、まず resume の観測同値性

Lean には、許可した小さな source／IR、値と state cell の参照、純粋な導出、event trace、観測、実行規則を定義する案を置く。HTML parser、任意の TypeScript、ブラウザ全体、Rolldown 全体を最初の証明対象にしない。

最初の定理候補は、有効なプログラムと保存可能な状態に対して、次の二系統が同じ event trace に同じ観測を返すことである。

1. SSR が作った論理状態をそのまま継続する参照実行。
2. SSR の snapshot を別の実行環境へ引き継いで resume する実行。

観測は表示値、公開 state、規定した effect の記録、scope と node の対応を含む。異なる実行環境の object identity の直接比較は要求しない。ID の付け替えを許した対応で、共有 cell の参照関係が保存されることを要求する。実ブラウザの resume 前後では、既存 DOM node を交換しないことを別の受入条件とする。

その後に、必要性解析の soundness、更新計画と参照評価の一致、最適化 pass の意味保存を一つずつ追加する。最初は「将来必要な依存を落とさない」を証明し、最小 byte や最適 chunk 配置の証明は目標にしない。

Lean の証明は定義したモデルに対して成立する。完成した定理は `sorry` や追加公理への依存を監査する。実行による証明の採否と trust boundary も記録する。([Lean axioms](https://lean-lang.org/doc/reference/latest/Axioms/))

## モデルと実装を結ぶ

### inline / live / CSS の追加モデル案

[設計 §2.2〜2.3](design.md#22-live-の型と静的な依存関係) に対応する次の統合モデルは未実装である。R06 の CSS-ready と owner 生存の部分は、後述の CSS 解決モデルで検査する。generation の再利用は既存 owner model が扱い、両者の合成は未実装である。style の観測を有限 token として抽象化し、実際の CSS selector/cascade の意味保存は parser/minifier と browser の差分検査で補う。抽象グラフが正しくても CSS の依存抽出の完全性までは証明できない。

| ID | モデルで確認する性質 | 故障版 / negative control |
|---|---|---|
| R01 | root と保持 node の全 prerequisite が keep 集合に含まれる | CSS binding→live の辺を欠落させる |
| R02 | root を追加したとき keep が減らず、二度の解析が同じ結果になる | 一回の走査だけで閉包を打ち切る |
| R03 | state/live の DAG と一括 commit が参照評価の最終観測に一致する | diamond の途中値を CSS/text に適用する |
| R04 | SSR 専用では JS root がなくても style の観測を保持する | browser root だけで全 target を削除する |
| R05 | 許可する将来状態の style token を初期状態だけで削除しない | 初期 class / hover 状態だけで CSS を purge する |
| R06 | CSS-ready と owner generation の両方を確認して適用する | CSS の await 後の生存検査を削除する |

最初は state 2個・分岐条件1個・live の小さな DAG・style token 2個・owner generation 2個を候補にする。inline(ts)/inline(moonbit) の本文は契約を持つ抽象操作として扱い、実行時 read の追跡や live guard の付け替えはモデルに追加しない。CSS の specificity/layer/custom property と opaque code の副作用は、この有限 token モデルが自動で解決する性質ではない。受入ケースは [評価課題](../evals/scenarios/inline-live-css/brief.md) に置く。

### 現行のモデルとの対応

server / client を分けた非同期関数の検証は、owner の寿命とは別の security model とする。型付き呼出しだけでなく攻撃者からの直接 request、resource の取り違え、認可後の await と失効を入力に含める。対象となる性質 B01〜B06 と未確定の policy は [server / client 境界](security-boundaries.md#6-形式モデルへ追加する性質) に記載する。UI の generation と認可の revision は同一視しない。

将来は command と trace の安定した形式を定義し、独立した参照モデルと runtime adapter に同じ操作列を渡す。import 完了や resource 完了の順序は adapter 側で制御する。veri のモデル内で反例を再生できることと、実 runtime に同じ問題があることを区別する。後者は実装の差分検査で再現させる。([veri 0.2.1 の実装比較](https://github.com/mizchi/veri/blob/v0.2.1/docs/model-workflows.ja.md))

compiler 全体の証明を最初から要求せず、生成した計画に証明可能な checker を設ける案も残す。例えば graph の依存閉包、順序、capture 参照の整合などを対象にする。ただし checker が検査する構造的性質だけで JS codegen 全体の意味保存まで保証したとは扱わない。モデルと実装の差分検査にも、無制限の同値性の証明という名称は使わない。

| 記録項目 | 今回の状態 |
| --- | --- |
| 正本 | design.md のユーザー確定方針。未確定の意味論は仮説と明記 |
| 採用 | MoonBit＋mizchi/veri 0.2.1 を入口、必要に応じ Lean の意味論へ進む |
| 機械結果 | 有限モデル92ケース、35反例の witness replay、小契約1 goal、偽 postcondition の拒否 |
| 反例 | formal.json に実際の操作列と状態列を保存。本文の例示と区別 |
| 実装再現 | 対応する disposal / forged input / revocation の schedule を browser / server tests で検査。汎用 trace adapter は未実装 |
| 未決 | event 順序、失敗／retry、commit、整数上限、最初の観測集合 |
| 次の作業範囲 | evals の次の課題から機能を選び、model と runtime の対応範囲を拡張 |

### 共通 schema Form の追加モデル

models/form_session は検証/送信各1回、2 revision、2 generation、reset1回と重複 submit の試行に限定する。strict の186状態を全探索し、revision 無視、generation 無視、pending 無視の3故障版で反例を再生する。対応するスケジュールは pure FormSession と production Playwright で検査する。共通 validator の全入力での意味保存、DB transaction、ブラウザーの FormData 実装まで証明したモデルではない。

## 所有リソースの破棄

[unmount とリソース破棄](resource-disposal.md)では2 resources・owner 2世代の1,452状態を完全探索し、取得・abort・解放開始・成功／失敗を分けた。独立カーネルに対し、9故障版から得た外部 schedule を Promise barrier で再生する。現在の report v2 は92ケース、応答性16ケース、想定反例35件。browser / codegen 全体への refinement は未証明であり、専用 resource DSL も未接続。

CSS 解決は [models/style_resolution](../models/style_resolution/model.mbt)で cold な1 ownerの30状態を完全探索する。fetch と CSS の準備・適用、module 解決、setup と commit を区別し、CSS-ready を無視する版・owner を無視する版に反例を得る。成功と破棄への到達性も検査する。取得順序と破棄を入れ替える browser barrier tests は独立した受入検査であり、このモデルが CSSOM、任意の module side effect、shared stylesheet cache 全体を形式的に実装したとは扱わない。

## Grid と連続寸法の契約

[Grid / container / 両軸の静的検査](layout-checking.md)は、有理数の affine 式と凸領域の切り出しを使う独立した compiler adapter である。幅・高さを少数のサンプルに離散化して veri の時相モデルへ入れる方法は採らない。bounded な1次元・2次元の独立 oracle、故障版の browser 再現、正例の全宣言領域での義務判定を組み合わせる。判定器の健全性や browser への refinement は未証明であり、font / 自動高さの summary は caller の trusted 契約とする。既存92ケースの件数はこの追加で変えない。
