# Qwikから移植する意味論と、Isleを使う理由

状態: 2026-11-08の設計提案。現在の実装と、次に実装する意味論を区別する。`live`引数など、この文書で「提案」と記す構文は未実装である。

Isleの中心的な価値を、**状態の所有者・純粋な計算・入力・寿命が明示されたUIから、必要な取得・復元・更新だけを行うプログラムを生成し、その条件を検査できること**に置く。現状は通常テンプレートでの最適化が先行し、制御構造やcomponent境界まで同じ保証を提供できていない。

## TSを使う場合との差

Qwik自体がTSXとoptimizerで高度な最適化を実現している。自動分割や細粒度更新を、専用言語だけに可能な性質として説明してはならない。TSに十分な静的制約と解析器を加えれば、ここで提案する最適化の多くは実現できる。

Isleが引き受けるのは、解析できる範囲を言語の契約として保つこと。`derive`の純粋性、stateのsingle writer、閉じたtemplate、明示したevent / action、wire値とlocal resourceの分離を検査する。受理したプログラムについて依存グラフを確定でき、証明できない箇所は診断できる。純粋性はTSの型だけからは分からず、未知のcall、getter、alias、外部mutationなどの扱いが別途必要になる。

これらの制約から、利用者が手で列挙するdependency配列、signal購読、capture指定、dynamic importを減らす。任意のTS helperを取り込むときも、検査済みのeffect summaryか、明示したopaque境界が必要になる。pureという自己申告を証明済みとして扱わない。

ユーザーの操作頻度、ネットワーク、実際のlist長、browserのlayout時間は実行時に決まる。コンパイル時に確定するのは、許される依存・効果・更新先と、その実行計画の範囲である。

## 調査したQwik

stable側の[Optimizer](https://qwik.dev/docs/advanced/optimizer/)と[QRL](https://qwik.dev/docs/advanced/qrl/)に加え、Qwik 2の[Think Qwik](https://next.qwik.dev/docs/concepts/think-qwik/)と[State](https://next.qwik.dev/docs/core/state/)を確認した。Qwik 2は調査時点で[2.0.0-rc.4](https://next.qwik.dev/roadmap/)。既存ベンチもこのRCとstable 1.20.3を分けている。

実装の参照点はQwik mainの [`e1fc74f386a1812a377fc50384ebbbcc4984deb7`](https://github.com/QwikDev/qwik/tree/e1fc74f386a1812a377fc50384ebbbcc4984deb7)。ドキュメントの概念と同一のリリース成果物であるとは仮定しない。

| Qwikの仕組み | Isleの現状 | 移植する意味論・受入条件 |
|---|---|---|
| QRLによるsymbolとcaptureの抽出 | 名前付きevent→CodeRef、Vite/Rolldown、manifestがある | 分割候補をすべて同じIRで扱う。symbolと物理chunkを区別する |
| Signals・購読先への直接更新、out-of-order rendering | 通常templateは静的依存から直接patch。client子への可変propは拒否 | ownerを越えるread-only live入力と、条件付き依存を静的に生成する |
| 条件分岐で変化する購読先 | regionにはdirty集合と分岐がある | 非アクティブなconsumerの計算・factory取得・state復元を区別して抑制する |
| lazyなstate rootの復元 | owner単位にJSON全体をparse・validate | slot群の独立性を求め、初回操作が無関係な大きいstateをmaterializeしない |
| computedのpush/pull | 同期deriveの展開、通常経路でphaseごとの共有計算 | branch guardと依存versionを持ち、必要なconsumerまで計算を遅らせる |
| smart bundling / Insights | 最終gzipサイズとevent種別によるgreedy計画 | 意味的に必要な依存と、profileから予測した依存を分ける |
| async computedの追跡・cleanup・abort | resource owner kernelと外部setupがある | sourceのtask key / read version / scopeから、結果採用・破棄を生成する |
| syncイベントと遅延handlerの分離 | EventSnapshotとpreventDefault modifier | 同期capabilityを有限の操作として型付けする |

QwikもoptimizerでpropsやJSXを変換している。たとえば[propsの変換](https://github.com/QwikDev/qwik/blob/e1fc74f386a1812a377fc50384ebbbcc4984deb7/packages/optimizer/core/src/props_destructuring.rs)は再代入を検出して変換を控える。Isleではpropsへの再代入を言語として拒否できるため、許可した範囲全体に同じ規則を適用できる。

Qwik 2の[computed実装](https://github.com/QwikDev/qwik/blob/e1fc74f386a1812a377fc50384ebbbcc4984deb7/packages/qwik/src/core/reactive-primitives/impl/computed-signal-impl.ts)には同期computedのQRL解決、dirty状態、非同期job、abort/cleanupの管理がある。Isleで利用する意味論は依存・version・需要の管理であり、同じ汎用runtimeをそのまま追加する方針ではない。

## 現行コードで再現した不足

`just resume-semantics-audit` で[fixture](../evals/scenarios/resume-semantics/brief.md)を実行できる。[baseline](../evals/results/resume-semantics/baseline.json)はcompiler `d719172` で採取した。

| 観測 | 通常のbutton | Showを持つcomponent |
|---|---:|---:|
| 未使用propを空文字で渡すsnapshot | 31 bytes | 40 bytes |
| 同じpropへ65,536 bytesを渡すsnapshot | 31 bytes | 65,576 bytes |
| incrementのcapture | n | unused, n, open |

サイズは `JSON.stringify(snapshot)` のUTF-8 bytesであり、gzipやネットワーク転送量ではない。両componentのUI全体は同一ではない。未使用入力の増分は、それぞれ同じcomponentに空文字と大きい文字列を渡して比較するため、追加されたToggleやShowでは説明できない。

通常経路は[codegen](../lib/codegen.mjs)でcaptureを絞る。一方、[region codegen](../lib/region-codegen.mjs)は全props/stateをfieldsへ入れ、すべてのhandlerへ全fieldsを渡す。またownerのregion factory一式を同じmoduleに生成し、各handlerが静的importする。閉じた分岐を実行しないことと、そのコードを取得しないことは現状では異なる。

親のstateをclient子へ渡す[再現例](../evals/scenarios/resume-semantics/reactive-props.isle)は `E_COMPONENT_CAPTURE` になる。これは既存のimmutable prop契約どおりだが、Qwikのような独立したclient同士の連携には足りない。

監査の通常実行が成功しても、目標達成を意味しない。`node tools/audit-resume-semantics.mjs --require-targets` は現在終了コード1になる。この不足を将来の実装で埋めるための受入条件として残す。parent/childのbrowser上の伝播・独立再開は、compile受理とは別の検査を必要とする。

## 最初に揃えるIR

通常templateとregionの両方から、次を同じ契約へ下げる。これは新しい文法を要求しない。

```text
Value   = { owner, type, phase, readPaths, writeSites, lifetime }
Compute = { inputs, output, guard, purity, source }
Binding = { inputs, guard, DOMTarget, region, lifetime }
Entry   = { reads, writes, effects, syncPrefix, asyncSegments }
Code    = { captures, factories, CSS, evaluateAfter, activateWhen }
```

`phase`はserver初期化、再開後にも必要な値、local resourceを区別する。`readPaths`は `user.name` のようなprojectionを表す。動的index、全objectのescape、identityの観測、未知のcallがあればprojectionを止める。wire schemaとsnapshotのbuild指紋も変換へ追従させる。

handler `h` が書くstate集合を `W(h)`、binding `b` の読取り集合を `R(b)` とする。候補は次で求め、実行時には生成済みguardだけを判定する。

```text
candidate(h, b) := W(h) ∩ R(b) != ∅
active(h, b, state) := candidate(h, b) AND guard(b, state)
```

guardが変化する操作は、新しいarm・keyed rowの生成を別のobligationとして持つ。branchのために必要な値、既に表示されている値、将来factoryが必要とする値、handlerだけが必要とする値を区別する。すべてを「今表示されていない」として捨てると、後のShowやForの挿入が壊れる。

目標は実行時にdependencyを学習するProxyやsubscriber探索を不要にすること。動的なkeyed rowやowner instanceの住所、version、生存情報は実行時にも必要であり、これらのmetadataが0になるとは主張しない。

この段階は有限集合の閉包とguardの検査で始められる。最初からLeanでcompiler全体を証明する必要はない。参照評価器と最適化後の出力を比較し、到達可能なbranch切替と入力境界を反例にする。async/disposalを接続する段階では既存のowner/resource有限モデルへversion遷移を加える。

## 次に導入するlive入力

**提案・未実装**:

```text
client component Badge(live value: number) {
  state local = 0;
  derive total = value + local;
  event increment(e: EventSnapshot<MouseEvent>) { local += 1; }
  <button type="button" on:click={increment}>{total}</button>
}

client component Counter() {
  state count = 0;
  event increment(e: EventSnapshot<MouseEvent>) { count += 1; }
  <main>
    <button type="button" on:click={increment}>Parent +1</button>
    <Badge value={count} />
  </main>
}
```

`live`は受け取る値の時間的な変化を表すcomponent引数のmodifierとし、本文の `value` はnumberとして読む。component全体に書込み権限を付与するものではない。signal wrapperや `.value` を利用者に要求しない。無指定の引数は従来どおりimmutableな初期値とする。

- stateのwriterはCounter、Badgeはread-only consumer。Badgeで `value += 1` は拒否する。
- Counterの更新で親子の初期化は再実行しない。Badgeの該当bindingを更新し、関係のないBadgeのhandlerは取得しない。
- `total`を計算するにはBadgeのlocal値が必要。このslotの復元まで不要とはしない。必要なbindingコード・slotと、handler/setupのactivationを分ける。
- eventのreadはtransaction開始時のversionに固定する。awaitを越えた結果採用ではread version / task key / owner generationを照合する。外部副作用のあるactionを勝手にretryしない。
- keyed rowの削除・owner破棄でconsumerの寿命を終える。遅れて届くコードや結果でconsumerを復活させない。

この組合せで、任意のTS閉包から解析できた場合だけの最適化を、受理したUIに対する契約へ移す。動的なcomponent値や未知のmutationを許す拡張は、解析対象の境界を明示する必要がある。

## 読み込みと非同期への適用

region/armのfactoryもCodeRefにし、未来のbranchだけが必要とするコードを通常のincrementから切り離す。static importが残っていればbrowserへ届くので、意味的な境界と最終manifestの両方を検査する。

Qwikの[bundle最適化](https://qwik.dev/docs/guides/bundle/)も、利用頻度がユーザーの行動に依存する点を明示している。Isleは必須のconsumer edgeと、profileで予測したedgeを分ける。正しさを予測に依存させず、予測はpackingとprefetch順にだけ使う。既存のfetch/evaluate/activate/commit分離と、[loading plan](resolution-optimizer.md)へ接続する。

Qwik 2の[State Prewarm](https://next.qwik.dev/docs/advanced/state-prewarm/)はstate rootの遅延復元と、必要に応じてyieldしながら事前復元する方式を持つ。Isleではまず、各entryが復元する必要のあるslot群を削減する。大きい群が残り、profileにlong taskが出る場合にprewarm/yieldを評価する。総仕事量が減る施策と、仕事を別時刻へ移す施策を計測で区別する。

async derive/taskには、key、read version、ownerの生存、再計算・結果採用・cleanupを結び付ける。Qwik 2のasync computedでは最初のawait後のreadに明示trackが必要になる。Isleの閉じた式・明示actionからはこの境界もIRへ残せるが、任意の非同期TSまで自動で追えるとはしない。

## 実装順と合格条件

1. **通常/region共通の依存・capture・phase IR**。Showを足しても未使用64KiB入力のsnapshot増分0、incrementのcaptureはnだけ。初期化専用入力と再開後の値を分ける。
2. **guard付きconsumerとregionのCodeRef分割**。閉じた大きいpanelの状態・factoryが通常操作で不要。開いた瞬間には必要依存を並列取得し、keyed rowの追加・移動・削除が正しく動く。
3. **read-only live入力とowner間の伝播**。親だけ・子だけ・同じ子を複数mount・休眠中の子・unmount直後を検査。初期化回数、関係ないhandlerの取得数は0増分を要求する。
4. **需要に応じたderiveとasync version意味論**。diamond、非表示branch、逆順に完了するrequestを比較。pureな計算の共有と外部effectを区別する。
5. **profileを使ったchunk packingと局所prewarm**。同じ正しさのまま、転送量とcold interactionの実測を改善する。初期表示のLCP/CLSも回帰検査する。

各段階で、plain TS/Preact、Qwik stable、Qwik 2 RCに同じ振る舞いの課題を実装する。HTML / snapshot / bootstrap / 実際に取得・評価したJS / CSSを別々に数え、runtimeの小ささだけで勝敗を決めない。現行TodoMVCの結果を、新しい意味論の効果として再利用しない。

専用言語を採用する根拠は、これらの受入条件を、通常の書き方だけで満たせることになる。現状はその保証が部分的であり、この設計のすべてが実装済みであるとは説明しない。
