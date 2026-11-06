# 静的な負荷予測と実測の接続

状態: **現行 v0 の最適化済み plan に対する CostSummary、CLI、Vite sidecar、budget による build 失敗を実装した。** 別の CLI pass として [Grid / container / 両軸のサイズ契約検査](layout-checking.md)を追加した。任意 TS、list / branch の記号式、CSS layout の実時間の予測、時間の校正モデルと専用の形式モデルは未実装である。後半の将来要件と区別する。既存の [manifest と User Timing](chunk-profiling.md) を併用できる。次段階の構文は [Component を実行計画として宣言する](component-declarations.md) を参照する。

## 現在の利用方法

まず source だけで、handler ごとの仕事量を調べる。

```sh
just cost examples/counter/app.isle
just cost evals/scenarios/static-cost/fixture.isle
```

JSON の `entries` に、入口名、書き込み先、capture、`work`、`phases`、更新先の `updates`、原因の DAG `reasons` を出す。計算回数は共有計算を選んだ後の plan に基づく。一つの handler の一回の呼び出しに対する上限であり、browser の実行時間や必ず変更される node 数ではない。

Vite build は既定で `isle.cost.json` を出力する。final manifest から code の URL 集合・byte 数を結合し、指定した mounts から実際の component instance と SSR / resume を区別する。

```sh
just build
just cost dist/isle.cost.json
```

`entries[].code` は対象 handler と共通 runtime の static import closure、report 直下の `code` は全有効入口の集合である。後者は初期ページの転送量ではない。共有 URL を重複排除し、mount 数を byte 数へ掛けない。`gzipBytes` は gzip level 6 の基準値であり、HTTP の圧縮方式や cache hit は含まない。`dynamicImports` はその集合の外側に残る動的依存、`unresolvedReferences` は参照を解決できなかった入口を示す。後者がある全体量は byte 数を不明に保つ。

`scenario.domElements` は component template から出す element の合計で、host document、Vite の mount wrapper、snapshot / debug の script は含めない。`resumableOwners` と `snapshotSlots` は有効な resume instance だけを数える。SSR 専用でも DOM 規模を保持するが、有効な `entries` は空になる。

### Budget

次のような JSON array を作り、source または build 済み report に適用する。

```json
[
  { "entry": "Counter.h0", "metric": "textPatchCalls", "max": 16 },
  { "entry": "Counter.h0", "metric": "coldGzipBytes", "max": 8192 }
]
```

```sh
just cost dist/isle.cost.json path/to/budgets.json
```

上限超過、費用不明、対象が見つからない場合は `ok: false` と非ゼロの終了コードを返す。`entry: "*"` は有効な全入口を個別に検査し、`entry: "$page"` は明示 mount シナリオの `domElements` / `snapshotSlots` / `resumableOwners` を検査する。source だけの解析には mount シナリオと実 byte 数がないため、それらの budget は不明になる。

Vite で同じ制約を build の受入条件にできる。

```js
isle({
  entry,
  mounts,
  diagnostics: false,
  cost: {
    budgets: [
      { entry: 'Counter.h0', metric: 'textPatchCalls', max: 16 },
      { entry: 'Counter.h0', metric: 'coldGzipBytes', max: 8192 },
    ],
  },
});
```

全 metric 名と API は [cost-contracts.d.ts](../lib/cost-contracts.d.ts) と [cost.d.mts](../lib/cost.d.mts) に定義する。`stateWrites` / `slotReads` / `binaryOperations` などは生成 handler 内の操作数で、runtime 内部や browser の仕事は含まない。`coldBytes` / `coldGzipBytes` は上記 static closure の量に対する制約である。`durationMs` は現段階で常に不明で、時間 budget を合格させない。schema form の内部処理も不明として扱い、単なる wrapper の短さから軽いと判定しない。

CodeRef の静的な CSS 依存も cold byte budget に含める。CSS のサイズが不明なら0にせず unknown とする。font / image の取得や CSS layout の時間を、このファイル単位の byte 数へ読み替えない。[CSS-ready の契約](style-resolution.md)を参照。

意図的な上限超過と、静的化による改善を [評価シナリオ](../evals/scenarios/static-cost/brief.md) で試せる。診断を通すために予算を緩める代わりに、不要な行の dependency を外す課題を用意した。

### Debug と通常配布

動的入口のある `diagnostics: true` の build と既定の dev では、HTML に `script[type="application/json"][data-isle-cost="1"]` を埋め込む。実行可能な script ではなく、DevTools から読めるデータである。

```js
JSON.parse(document.querySelector('script[data-isle-cost="1"]').textContent);
```

dev には最終 chunk の byte 数がない。build 後は sidecar と同じ report を埋め込む。SSR 専用出力には debug script も追加しない。`diagnostics: false` では HTML に埋め込まず、cost による通常 JS / HTML の増分を 0 byte に保つ。`cost: false` は sidecar と debug JSON の両方を無効にする。

cost の有効・無効、通常・debug を比較する [build テスト](../tests/cost-build.test.mjs) で、通常 JS の内容と HTML が同一であることを検査する。browser runtime、registry、snapshot と ABI は変更しない。

実際の負荷で確かめるには [大量商品行の検証](../benchmarks/heavy-render/README.md) を使う。4,096商品の一括操作を browser で実行し、静的な更新上限と全行の mutation 数を照合する。cold / warm と layout を含む計測は [結果表](../benchmarks/results/heavy-render/latest.md) に分けて記録する。`restore.bindingLocators` は cold owner の復元候補数であり、attribute の locator は初回 commit 時に遅延解決されることがある。費用をすべて User Timing の `restore` phase に帰属させない。

## 目的と出力の確かさ

実行前に、高負荷になり得る入口、更新の波及経路、入力サイズによる増え方を示す。負荷予測を compiler の成果物に含め、同じ論理 ID と原文位置から実測へ辿れるようにする。最適化後の実行計画から算出し、ソースの行数や component 数だけで負荷を判定しない。

結果の各項目には、単位・根拠・成立条件を付ける。単一の confidence score へまとめない。

| 分類 | 例 | 意味 |
|---|---|---|
| 構造から確定 | 生成計画の binding 数、static import の到達集合 | 指定した build と入口について数えた構造 |
| 検証された条件付き上限 | `rows.length <= 1000` のとき、更新候補が最大3000箇所 | 境界検査と解析の条件が成立する範囲の上限 |
| 未検証の仮定 | 利用者が指定した最大件数、外部 helper の計算量宣言 | 仮定が破られる可能性を持つシナリオ |
| 校正した推定 | 特定端末・browser・入力分布での時間予測 | 計測データを使った見積もり。時間の保証ではない |
| 不明 | 未解析 TS call、上限のない入力、外部 CSS の layout 時間 | 0 や定数時間に置き換えず、理由を表示する |

生成計画の binding 数は確定しても、毎回すべての値が変化するとは限らない。DOM 更新の候補数・呼び出し数・実際に変更された箇所を分ける。時間、byte 数、計算回数、DOM 操作数も別の次元として報告する。

## 数える範囲

以下の表は後続の拡張を含む目標である。v0 が現在出すのは、warm handler の操作数、cold resume の owner / slot / locator 数、static code closure、mount シナリオの component DOM / owner 数である。SSR 初期計算の操作数、HTML / snapshot の byte 数、dispose の仕事量はまだ算出しない。

| phase | 主な予測対象 |
|---|---|
| SSR | 必要な初期計算、HTML の node 数、入力依存の出力量、snapshot の保存量 |
| 初期表示 | HTML / CSS / bootstrap、eager / preload の取得対象、初期 DOM の規模 |
| cold resume | 未取得 code、対象 owner の復元、必要な入力と DOM locator、初回の計算と commit |
| warm update | state write から波及する計算、更新候補、作成・移動・削除する node |
| dispose | 対象 owner と子の解放、登録済み cleanup。外部 adapter の処理は別途 summary を要求 |

SSR 専用出力では browser の更新 JS がなくても、HTML / CSS を描画する負荷は残る。初期表示と更新の評価を混同しない。await の待ち時間、ネットワーク、操作 queue の待ちも、同期処理の仕事量と分ける。

## 依存と実行回数

入口から次の経路を辿り、負荷の理由として保存する。

```text
event -> writes -> derive -> template binding -> DOM patch
      -> action / capability
      -> CodeRef -> physical modules
```

state を書くと、どの derive と binding が更新候補になるかを静的に求める。条件分岐は到達可能な候補の和を保持し、同じ phase で相互排他的と検証できる場合には最大値として評価する。複数の await 後の処理や別 transaction を、相互排他的という理由だけで一回分にまとめない。

共有された derive は、生成計画が一度だけ評価するときに一回と数える。diamond の経路数だけ足したり、逆に同じ derive 名だから常に一回と仮定したりしない。現行 codegen は stable-value phase ごとに数値計算の共有を選択するため、その最適化結果と再計算箇所を使う。state write や await を越えて無条件に共有したと見積もらない。

将来の list / branch では、入力件数、可視件数、nested list の積、挿入・削除・移動の上限を記号として残す。keyed list であることだけでは比較や更新を定数時間と認定しない。文字列も長さを持つ入力とし、純粋な処理を一律に安価と扱わない。

最大件数を設定ファイルで指定しただけでは、検証された上限にならない。schema の decode と更新境界で上限を検査し、途中の変換もその上限を保つことが必要である。外部から与える workload の件数は、まず仮定として扱う。長さの取得、列挙回数、helper の call 数とその内部の仕事量を区別する。

## Component と widget の集計

純粋な子は展開後の更新計画に含め、独立した client の子は owner の境界を保つ。親の resume だけで子の handler・snapshot がすべて必要になるとは数えない。明示的な同期呼び出し、必要な factory、コードの static import など、実際の実行・取得の edge を辿る。

同じ component を複数 mount すると、DOM・保存値・復元の仕事は instance ごとに増える。共有 runtime と同じ物理 module の取得量は URL 集合で重複排除する。per-instance の値、ページ全体の値、同時操作を仮定した値を分ける。一つの instance の state write が、同型の全 instance を更新すると仮定しない。

owner や ShadowRoot は browser の layout が必ずそこで閉じる保証ではない。子の JS を動かさなくても、祖先の text / class / size の変化が子の描画へ影響し得る。第三者ページに置く widget は外側の DOM / CSS を完全には解析できないため、framework 内の更新範囲と layout の不確実さを分けて報告する。

## TS と CSS に必要な summary

TS adapter は capture / effects に加え、解析できた列挙回数、loop bound、call graph と未解析箇所を返す。任意の TS 本文について計算量や停止を自動で保証する要件にはしない。解析できる有限 loop などから広げ、再帰・未知 call・入力依存の処理で上限を得られなければ不明とする。型検査の成功、純粋性、計算量の小ささは別の性質である。

外部 helper の summary には、解析で得たものか、作者が宣言したものか、実測モデルかを付ける。対象 module の identity と結び付け、実装が変わった後に古い summary を無条件で再利用しない。本文の文字数や TS AST node 数を実行時間へ直接変換しない。

CSS は到達可能な rule と変更対象を保持し、幾何に関係する property、広範囲な class / custom property の変更、DOM の write 後の layout read などを負荷の候補として示す。selector の字面だけで layout 時間を断定しない。browser の layout 負荷は DOM の規模とレイアウトの複雑さに関係し、DOM の読み書きの順番によって強制同期 layout も起きる。([Avoid large, complex layouts and layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing))

## CostSummary と生成物

compiler は最適化済み plan に対応する CostSummary を出力し、bundler adapter が物理 module の情報を結合する。新しい性能専用 DSL は初期導入せず、既存の型・schema・依存グラフと project の workload 設定を使う。

現在の型と、後続の記号式を含む契約には以下を含める。

- build / plan の identity、論理 entry ID、原文位置、対象 phase。
- 次元と単位、定数または記号式、入力サイズの変数。
- 確定・検証された上限・仮定・校正・不明の区別と、その根拠。
- 成立条件、外部 helper の信頼、解析できなかった理由。
- writes から計算・binding・module へ至る説明経路。

byte 数は Vite / Rolldown の最終 manifest から得る。logical entry の byte 数を単純合計せず、共有 chunk / runtime の集合を数える。gzip の基準値と実際の HTTP 転送量は別である。preload / eager / cache の条件も保存し、cold の推定を warm に流用しない。static import の深さを、そのままネットワークの RTT 回数とは解釈しない。

成果物は開発・CI 向けの sidecar として保持し、通常の browser loader、snapshot、registry に dependency graph や費用表を追加しない。ローカルの絶対パス、入力の実値や秘密情報も公開 artifact に含めない。通常 build の profiler 無効時に計測コードを除去する現行方針を保つ。

## 表示と budget の例

以下は将来の list 描画を想定した説明用出力であり、現行 compiler の実測結果ではない。各行に三つの text binding があり、共通の scale の変更が全行へ波及する構成を想定する。

```text
Table.changeScale / warm update
  given: rows.length <= 1000 (境界で検査)
  text patch candidates: <= 3 * rows.length
  maximum candidates: 3000
  cause: scale -> row values -> 3 bindings per row
  nested client resume: none required by this update
  browser style/layout time: unknown
  budget: maximum candidates <= 1000 -> exceeded
```

この診断から、可視行だけの更新、ページング、依存の分離などを検討できる。SSR の出力や入力契約を変える最適化は、自動で意味を変えて適用しない。

budget は project の設定で次元・対象 entry・workload・cold/warm を指定する。例えば DOM 更新候補の上限、cold の gzip 基準 byte 数、入力ごとの増加率を対象にする。不明な費用が hot path に残る場合は、strict 設定で CI を不成立にできるようにする。「不明」を安価として合格させない。全端末に同じ millisecond の保証や、一律の固定フレーム予算を置かない。

## 実測との照合

既存の論理 entry ID と invocation ID を使って User Timing に接続する。現在の `run` は await と commit を含む経過時間であり、CPU 時間ではない。次段階では compute / commit などの同期区間も分け、予測した仕事量と測った時間を比較する。

DOM commit の完了だけで描画時間や INP を測ったとは扱わない。Event Timing は入力処理と後続の描画に関する情報を与えるが、遅延 import や RPC を待った最終結果の描画が常に同じ entry に含まれるわけではない。論理的な処理完了と browser の interaction 指標を別に記録する。([Event Timing API, Working Draft](https://www.w3.org/TR/event-timing/))

対応環境では Long Animation Frames などの browser 計測と接続し、style / layout を調べる。API と field の対応を検出し、未対応は欠測として扱う。これらを core runtime の必須依存にはしない。trace や laboratory の計測を補助に使い、実時間の予測は browser・端末・入力・cache 条件を含む校正データとして別に保持する。([Long Animation Frames API, Editor's Draft](https://w3c.github.io/long-animation-frames/))

## 実装順と検証

まず現行 v0 の最適化済み plan から、入口ごとの更新候補、計算の評価箇所、capture / snapshot slot、owner の範囲を取り出す。次に manifest と結合し、条件付きの件数・loop・文字列長のモデルを TS / list の導入に合わせて広げる。時間推定や自動 loading policy の変更は、構造の診断と実測の比較ができてから導入する。

TDD では、未使用計算の除去、diamond、write を挟む再計算、条件付き処理、未知 call、instance ごとの増加と module の共有、親だけの resume、SSR 専用でも残る DOM 負荷を Red にする。生成 handler を実行し、Proxy と呼び出し counter で数えた slot read・state write・text / attribute patch が対応する上限を超えないことを確かめる。browser 時間そのものの上限テストとは分ける。

記述・読解の eval では、少数の重い計算と多数の軽い更新、独立した子、上限のない入力、不明な helper を使い、参加者が原因と確かさを説明できるかを評価する。変更前後で出力を比較し、上限や不明箇所の悪化を CI で検出する。

MoonBit / veri では、有限の plan・入力サイズ・分岐について、観測仕事量が条件付き上限以下になること、共有と owner の集計を誤らないことをモデル化できる。これはモデル内の性質であり、任意の TS や実 browser の時間上限の証明ではない。一般の式や compiler pass を含む健全性は、別途帰納的な証明と実装との対応付けを必要とする。専用の形式モデルは後続課題であり、今回の実装結果を形式証明済みとは扱わない。
