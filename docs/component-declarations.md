# Component を実行計画として宣言する

component 本体は状態・依存・描画・実行入口の宣言です。任意の TS statement を置かず、コンパイラが初期化・更新・再開の計画を作ります。通常の関数を render ごとに先頭から実行する意味は持たせません。

```text
client component Counter(initial: number) {
  state count = initial;
  derive doubled = count * 2;
  event increment(e: EventSnapshot<MouseEvent>) { count += 1; }
  <button type="button" on:click={increment}>{count} / {doubled}</button>
}
```

これは現在動く構文です。本文の既定言語は TypeScript 風の閉じた部分言語とし、`inline(ts)` は要求しません。`event` と `on:click` の契約、イベント引数、同期操作の制限は [イベント宣言](events.md) に記載します。任意の TS 本文や Content Mapper は未実装です。

| 場所 | 記述すること | コンパイラが決めること |
| --- | --- | --- |
| component の引数 | 名前付き readonly props | 入力型、実行側を越える値の契約 |
| `state` | 保存する値と初期式 | owner、初期化の依存、snapshot の配置 |
| `derive` | 副作用のない計算 | 静的依存、循環検出、必要な再計算 |
| `event` | 明示した入力と state の代入 | capture、write、action、CodeRef |
| `layout SafeGrid` | 割当領域の requires とレイアウトの ensures | 独立した契約 IR、native box への接続、配布範囲での適合性検査 |
| `on:click` などの属性 | DOM 要素と宣言した入口の接続 | 型検査、row の環境、同期キャンセル |
| template のタグ | HTML、制御領域、子 component | 静的 HTML、DOM 更新先、独立した owner |

component 直下の任意の `const` / `let`、文としての `if` / `for`、call、`await` は許しません。`state` と `derive` の式は閉じた純粋な式に保ちます。描画の分岐・反復は `Show` / `For` / `Switch` / `ErrorBoundary` として解析し、構造が変わらない更新、arm の切り替え、keyed row の寿命を IR で区別します。

component は通常の TS 関数として呼び出せません。`<Counter initial={0} />` の合成はコンパイラが解決します。readonly props、純粋な子の展開、独立した client owner は [合成契約](composition.md) に従います。

## 依存と更新先を推論する

上のイベントから reads(count) と writes(count) を静的に求め、`doubled` と DOM への波及を決めます。ソースに reads / writes を重ねて列挙することは要求しません。未定義名、readonly な props・引数への代入、循環する derive は拒否します。実行中の購読登録は行いません。

イベント宣言のスコープは component の props / state / derive と明示した入力です。For の中へ接続しても、その row の変数を宣言本文に暗黙に持ち込みません。row 値を渡す接続を型付き component 引数と同じ規則で検査し、検査用の内部表現は生成前に除去します。

CodeRef と計測は `Counter.increment` に結び付きます。物理 chunk と読み込み方針は Vite / Rolldown が決めます。宣言名は eager loading を要求せず、分割・先読み・評価時点は [解決時期の最適化](resolution-optimizer.md) に従います。

## TS 本文を広げるときの条件

TS の型検査だけでは純粋性を証明できません。同じ型でも時計・乱数・未知の関数・module 初期化には効果があります。今後本文の局所変数や制御構文を広げる際も、名前解決・capture・効果・停止や例外の仮定を別々に検査する必要があります。型の一致や pure の自己申告だけで derive を任意の TS へ開放しません。

server action は明示した認証・認可・入出力 schema・effect の境界を保ちます。dispose 後の UI 更新の抑止と、外部で完了した副作用の rollback は別の問題です。[server / client 境界](security-boundaries.md)を参照してください。

## 最適化と形式モデル

SSR 済み owner は保存値と既存 DOM から再開し、初期化を繰り返しません。必要な consumer のない derive、未接続イベント、不要な capture・更新コードを除去します。任意の TS を実行してから削除できる、という意味ではありません。

[静的な負荷予測](static-profiling.md)では、依存の波及、計算、DOM 更新候補、static code closure を調べます。通常の browser payload に解析 metadata を載せません。構造から予測できる費用と実時間の保証は区別します。

形式モデルの対象は依存グラフ、更新先、owner の寿命、解決と commit の順序です。閉じた DSL の検査結果を、任意の TS の副作用・停止性や、業務上の認可条件の証明に広げません。
