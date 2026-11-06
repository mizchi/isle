# Template の制御構文と最適化

状態: 初期の実行実装あり。`@if` / `@else if` / `@else`、`@switch`、key 必須の `@for` / `@empty`、同期描画用の `@try` / `@catch` が MoonBit parser → 型検査 → Region IR → SSR / resume まで動く。以下は全体設計を含むため、実装範囲と将来の契約を分けて読む。

実装済みの [fixture](../evals/scenarios/control-flow/fixture.isle) と `just control-check` で、並べ替え時の DOM 同一性、index 更新、行のハンドラ、空配列、重複 key の commit 前拒否、入れ子、失敗境界、遅延取得中の要素差し替えを検査する。1 行と 4,096 行で同じ行 factory を共有する。

現時点の制約:

- 値は primitive と、既存の `schema` / `view` の閉じたレコード、その配列。schema のフィールドは primitive。`readonly Item[]` と `Item[]` を受理する。row / props / derive は代入不可で、配列の変更は state への全置換で表す。
- `@try` が捕捉するのは同期描画の prepare 失敗。`@catch (error)` の値は公開用の文字列 `Render failed`。非同期 resource / `@pending`、literal union と網羅性検査、inline 本文、構造化配列 delta は未実装。`@pending` は `E_RESOURCE_PENDING` で拒否する。
- 制御構文、または record / array の props / state を持つ component は Region backend を使い、native container を root にし、子は universal component の静的展開と通常の DOM を使う。独立 client owner、RenderFragment、schema Form、textarea / select / option はこの backend では `E_CONTROL_CONTRACT` で拒否する。既存 backend の入れ子・Form は引き続き利用できる。
- ID と ARIA / label の参照は同じ生成 frame 内で閉じる。反復行の ID は frame ごとに名前空間を分ける。
- 更新する block と text / attribute は依存する state から絞る。全配列の置換は key の比較に O(n) を要する。同じ key は DOM を保持し、削除後の再挿入では新しい DOM を作る。
- 描画 factory と patch 関数を生成し、ブラウザへ template AST は送らない。DOM ハンドルは初回の走査と新規 fragment 作成時に解決する。不要な配列・boundary helper は production から除く。型検査後に定数分岐を消し、分岐を消し切れた場合は従来 backend に戻す。
- Region の CostSummary の操作上限と page の DOM 数は、まだ `unknown` / `null` とする。明示 budget は失敗させ、0 として通さない。従来の固定 template の上限算出は継続する。active path、遷移、失敗した prepare + fallback の上限モデルは今後の実装対象。

通常 Counter の生成 JS は既存出力と同一で、増分 0 bytes。`@if` だけを使う場合は keyed move / 失敗境界の helper を含めない。SSR モードでは制御構文を含む場合も JavaScript、snapshot、resume marker を出力せず、event 専用の state 初期化を評価しない。

## 文法を採用する範囲

TSRX の template control flow の表記を参考にする。TSRX は各 block に setup statement を記述できるが、Isle は [宣言 DSL](component-declarations.md) の制約を維持する。表示構造は DSL、局所的なアルゴリズムや handler 本文は `inline(ts)` / `inline(moonbit)` に置く。TSRX 全体への準拠を主張しない。([TSRX Features](https://tsrx.dev/features), [Draft specification](https://tsrx.dev/specification))

全体設計の表記案は次のとおりである。下の `Details` と `@pending` は将来の resource 契約を含む。

```text
<section>
  @if (expanded) {
    @switch (mode) {
      @case "rows": {
        <ol>
          @for (const product of products; key product.id) {
            <li>{product.name}: {product.price + surcharge}</li>
          } @empty {
            <li>商品がありません</li>
          }
        </ol>
      }
      @case "summary": {
        <p>{products.length} 商品</p>
      }
    }
  } @else {
    <p>一覧は閉じています</p>
  }

  @try {
    <Details />
  } @pending {
    <p>読み込み中</p>
  } @catch (error) {
    <p role="alert">詳細を取得できませんでした</p>
  }
</section>
```

`Details` は、明示した resource を使う client component を別途宣言する想定である。名前や `@try` から I/O を暗黙に発生させない。

| 構文 | 初期の受理範囲と契約 |
|---|---|
| `@if` / `@else if` / `@else` | 純粋な boolean 式。独自の truthy 規則は導入しない |
| `@switch` / `@case` / `@default` | 閉じた primitive tag。case は literal、重複と fallthrough を禁止。閉じた union は網羅性を検査 |
| `@for (const item of items; key item.id)` / `@empty` | 閉じた codec を持つ readonly array。安定した primitive key を必須とし、任意 Iterable / async iterator は初期範囲外 |
| `@try` / `@pending` / `@catch` | 描画の prepare と明示 resource / factory の境界。一般の JS try statement と分ける |

block 内には template と純粋な derive 宣言を置ける。通常の JS statement、state 宣言、render 中の書き込み、`return` / `break` / `continue` は置かない。state が必要なら component 直下か明示 client component に所有させる。TS 本文内の局所的な制御構文は通常の TS の意味を保つ。

位置が必要なら `@for (const product of products; index i; key product.id)` と宣言する。i は読み取り専用で、key の代用にはしない。

component の root は、初期段階では現在と同様に HTML element または component tag とする。制御 block 自体は、その内側で0個以上の sibling node を持つ DOM range を表せる。各 block は lexical scope であり、loop item と catch の値を外へ流出させない。

## 構造を残す IR

構造を codegen まで次の region として保持する。

| Region | 保持する情報 |
|---|---|
| Select | region ID、selector と control dependency、arm ごとの template / data dependency |
| Each | source、item codec、key 式、row の factory / patch、empty arm、サイズの条件 |
| Boundary | protected body、pending / catch、関連 resource、失敗・中断の契約 |

`@if` と `@switch` は Select に正規化できる。row や arm の見た目を一般の render 関数に渡す前に、必要な create / patch / move / dispose を決める。論理 region と source span を manifest / CostSummary に対応付ける。

control dependency と data dependency を分ける。例えば surcharge だけを書いた操作では、products の key を比較し直したり、mode を再評価したりする必要はない。現在の arm が rows の場合に、その中で surcharge を読む binding を更新する。

同じ arm の更新では owner と DOM を保持する。別 arm への切り替えは、古い arm を dispose して新しい arm を作る意味とする。異なる arm の form、ref、child state を自動で同じ node として扱わない。共有できる static template のコードやデータと、DOM node の寿命を区別する。

inactive な arm と到達不能な arm も区別する。将来選択される factory が必要とする親の値は、snapshot / code の capture または明示 resource として保持する。初期 HTML に出ていないという理由だけで、後の生成に必要な値まで除去しない。

## 最適化する箇所

| 対象 | 最適化 | 条件と限界 |
|---|---|---|
| 定数の条件 | 不要な arm、専用 capture、factory、local CSS の到達不能部分を削除 | 構文と型は全 arm を検査。公開 server action は client から未参照という理由だけで削除しない |
| 同じ arm | active arm の依存 binding だけ patch | selector に関係のない write では再選択もしない |
| 大きな同形 list | row の create / patch 関数を共有し、行データと分離 | 全行分の式・DOM 操作を JS へ展開する必要がなくなる |
| 構造が変わらない list | reconciliation と key map の再構築を省略 | list source を書かない操作、または不変な順序と membership を証明できる場合 |
| 特定行の変更 | key / field の delta に応じて対象行と binding を絞る | 不透明な配列全置換を自動で O(変更件数) と扱わない |
| list 外の計算 | row に依存しない純粋な計算を共有 | 空 list では本来実行しない計算がある。throw / suspend と評価の必要性を検査 |
| SSR 済みの region | active arm / key order と既存 DOM から再開 | component 初期化を再実行せず、未接続 arm を勝手に展開しない |
| 失敗しない boundary | 不要な catch / pending helper を除去 | pure だけで判断せず、関連する resource・load・codec を含む失敗 / suspend の可能性を調べる |

loop の read set が小さくても、全行が同じ surcharge を読むなら n 行の patch は必要である。row のコード共有は JS の重複を減らすが、4,096行の DOM や layout を消すものではない。表示窓、ページング、CSS の containment 等は意味と対応環境を確認した別の選択とする。

## Key と row の所有権

key と DOM の対応を保持する方向は [Angular の tracking](https://angular.dev/guide/templates/control-flow) と [Svelte の keyed each](https://svelte.dev/docs/svelte/each) も参考にする。以下は Isle 側の制約である。

- key は string または safe integer とし、同じ list 内で一意にする。型を含めて符号化し、数値1と文字列"1"を混同しない。raw key を scope ID へ連結しない。重複は更新入力の不正として、state / DOM の commit 前に拒否する。
- index と外側の可変 state を key に使わない。新しい key は新しい行の identity を表す。重複を検査してから DOM を変更する。
- reorder で同じ key の row / owner を保持する。index を表示する場合だけ、位置に依存する binding も更新する。focus 等の browser state は DOM identity だけで保証せず、adapter と browser の検査対象にする。
- row を削除して同じ key を再挿入した場合は別の lifetime とする。旧 import / resource / handler の完了を新しい行へ適用しない。capture は dispatch 時の値であり、await 後に現在の index へ暗黙に差し替えない。
- pure な row ごとに island、snapshot、loader を作らない。必要な handle と key の構造を保持し、state / async / cleanup を持つ場合に必要な lifetime 情報を生成する。
- 現行の可変 client props の禁止は維持する。変わり得る item field は pure component の展開へ流せるが、client の子へは invariant と確認できる key 等だけを渡す。一般の reactive client props は別の契約が必要である。

任意の新しい配列を TS 本文から返す場合、key の列挙・検証・比較に O(n) の走査が必要になり得る。部分変更を保証したい場合には、検証できる insert / remove / move / per-key field patch を別の入力契約にする。key を指定しただけで差分の仕事量が得られるとはしない。DOM move を最小化する一般アルゴリズムも、helper の byte 数と比較して導入を判断する。

## @try の範囲

`@try` は render の prepare、対象 factory と stylesheet の準備、明示 resource の pending / ready / error を扱う。任意の Promise を投げて意味を推測する方式は初期範囲にしない。pending は状態であり、未完了の server Promise を snapshot へ保存しない。

prepare の失敗では未公開の patch / fragment を捨てて fallback を準備する。pending / catch 自体の失敗は外側へ伝える。同じ boundary が自分の fallback を再び catch してループしない。retry は明示 resource entry で revision を更新し、古い完了を拒否する。mutation RPC の自動再送はしない。

event handler の例外や RPC の副作用を、lexical な `@try` が一律に捕捉・rollback する意味にはしない。認証・認可・codec は server entry に残す。server 由来の失敗を表示する場合は公開可能な error view を使い、秘密や生の stack を client へ送らない。

任意の DOM commit 失敗や外部副作用まで巻き戻せるとは保証しない。DOM target と plan は commit 前に検証し、内部の commit 失敗は owner の無効化と error policy で扱う。SSR 専用では server の確定結果または明示 fallback を出し、browser の resource / factory 継続を生成しない。一般の streaming は別仕様とする。

## 今回の実負荷検証からの生成方針

[4,096商品版](../evals/reports/heavy-render.md) では、同形 row のコードを展開し、cold commit で attribute locator を4,096回検索した。`@for` の構造を保つことで、次の backend を検討できる。

```text
rowTemplate / createRow / patchRow: 一つの生成コード
rowData: item ごとの値
rowHandles: 解決済みの DOM 参照

list source が不変の操作:
  loop invariant の計算
  active rows に対する生成済み patchRow の呼び出し
```

SSR の resume では、必要な region の marker / target をまとめて解決し、初回 commit で binding ごとの広域 query を繰り返さない。新規 row は factory が DOM handle を返せる。prepare / commit と owner の guard を維持し、計算中に直接 DOM を変更して rollback の契約を失わないようにする。

不変な小 list は展開が小さくなる場合もある。共有 factory と row data の組合せを minify / 圧縮した合計で比較し、常に unroll または常に loop と決めない。private な request data を共通 client bundle に焼き込む最適化は行わない。

## Runtime と chunk の予算

Select / Each / Boundary の helper は、使う生成 entry からだけ参照する。flat Counter のために汎用の制御構文 interpreter や dependency graph を常駐させない。feature 未使用時の production gzip 増分0 byteを受入目標にする。

row のコードは共有し、item ごとに chunk を作らない。未接続 arm の factory は CodeRef として扱え、manifest で必要な JS / CSS を並列取得する。取得した code の評価と、owner の生成・再開は分離する。物理 chunk の共有は Vite / Rolldown が決めるため、論理 factory が一つでも余分な code が同じ file に入る可能性は manifest で確認する。

shared widget は、最初に読んだ widget の feature 集合に他の widget を従わせない。既存の版の一致を保ちつつ、feature helper を必要な ABI 単位で共有する設計が必要になる。新しい feature を complete engine に一律に取り込む方式は、サイズの観点から見直す。standalone でも使用する helper だけを含める。snapshot / registry の形を変える際は ABI / schema を version 管理し、旧形式へ黙って追加しない。

## CostSummary

条件付きの値として、少なくとも次の仕事量を分ける。式は計算・DOM・byte 等の次元ごとに扱い、millisecond と同一視しない。

```text
same-arm:          必要なら selector + active binding の patch
arm switch:        selector + old arm の dispose + new arm の create
for / shared data: invariant + n * row patch
for / delta:       検証・key 操作 + 対象 row の patch
failed try:        失敗した prepare + discard + fallback の prepare / create
```

steady state の排他的 arm は最大値で評価できるが、arm 切り替えや失敗した try の仕事を単純な max にしない。failed try は本体の試行と fallback の両方を実行し得る。

array / key / string の上限は codec の decode と更新時に検査する。未検証の件数は workload の仮定として表示する。未解析 TS helper、無制限の入力、browser の layout、opaque な配列置換を0として合格させない。固定の静的依存グラフには全候補を保持し、実行する仕事には active path の条件を残す。

## 実装と検証の順序

1. boolean / tag 式、Region IR、`@if` / `@switch` の SSR と検査。
2. Select の切り替え、owner lifetime、factory / CodeRef、active arm を保存した resume。
3. 閉じた record / array codec、構造不変の `@for`、共有 row factory / patch と handle。
4. keyed insert / remove / move、field delta と不透明な全置換の区別、`@empty`。
5. resource revision と prepare failure を結んだ `@try` / `@pending` / `@catch`。

Red は同じ arm の node identity、条件に無関係な state 更新、同じ key の reorder、重複 key の commit 前拒否、削除後の同じ key への stale 完了、SSR の active arm / key order、fallback 自身の失敗、未使用 helper の DCE に置く。Form の label / ID / ARIA は存在する経路と row の namespace を含めて検査する。control guard を付けても、現在拒否する component / derive の循環を無条件に許可しない。

MoonBit / veri では二つの arm / key / generation と resource revision を持つ有限モデルから始める。正常な insert / move / switch が可能なことも検査し、全拒否で safety を満たすモデルにしない。これは今後のモデルで、実 browser の時間や任意 TS の停止性の証明ではない。

[読解課題](../evals/scenarios/control-flow/brief.md) は設計意図だけを採点する。将来の resource 契約まで実装した証拠として扱わない。実装範囲の受入は冒頭の fixture と検証コマンドで確認する。


## 行の寿命の有限モデル

[models/regions/model.mbt](../models/regions/model.mbt) は親 owner が生き続けたまま、1 個の key に 2 世代の要素を割り当てる有限モデル。dispatch、remove、reinsert、move、drain を探索する。veri 0.2.1 による完全到達探索では Strict の 40 状態で stale 更新がなく、key だけを照合する KeyOnly には dispatch → remove → reinsert → drain の反例が出る。成功・キャンセルの到達性も確認する。

[ブラウザの回帰テスト](../e2e/control-flow.spec.mjs) では handler 取得を barrier で止め、同じ key を持つ要素を差し替えた後に取得を解放し、古い event が state を更新しないことを確認する。モデルは有限の寿命管理についての検査であり、compiler や DOM 操作全体の証明ではない。`just verify` で結果と反例の再生を更新する。


resource の非同期初期化と Once の公開・破棄の参照意味論は [時相的な値とモデル検査](temporal-resources.md)を参照。時相モデルは実行済みで、resource DSL / runtime への接続は未実装。
