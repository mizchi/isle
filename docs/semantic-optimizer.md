# 観測・片方向の分岐・record captureの最適化

通常の`.isle`構文から、不要なイベント、再生成されないarmのfactory、readonly recordの不要フィールドを除去する。解析器はビルド時だけ動き、browser runtimeやsnapshotのwire ABIは追加・変更しない。

## 観測されないstateとイベント

```text
client component Idle() {
  state count = 0;
  event increment(e: EventSnapshot<MouseEvent>) { count += 1; }
  <button type="button" on:click={increment}>No visible effect</button>
}
```

`count`は表示・分岐・他の観測される処理から読まれない。この更新は、検証済みの有限numberに対して失敗しないため、代入とイベント入口を消せる。このcomponentだけをmountするproduction buildは、静的HTMLになり、snapshot・loader・handler chunkを出力しない。

表示、属性、controlの条件・配列・keyを起点に、deriveとstate初期化の依存をたどる。残す代入が読む値も固定点まで保持する。代入の除去には、右辺と必要な初期化が例外を起こさず、代入先の値契約を満たすと証明できる必要がある。

除算、任意の乗算、配列index、parse、remote actionなど、失敗や副作用の可能性が残る処理は保持する。`preventDefault`、formの入口も観測される。未知の処理をpureと仮定しない。元のソースは最適化前に型検査するため、消える部分に不正な名前や型を書いても受理されない。

外部の`resources` setup、専用の`clientEntry`、client子を所有するcomponent、`RenderFragment`を持つcomponentでは、入口の活性化や破棄が外部から観測され得る。この場合はイベント除去を止める。外部setupと専用entryがある場合は、後述のfactory・projectionも止める。

## 片方向の分岐

```text
client component Details(summary: string) {
  state opened = false;
  event open(e: EventSnapshot<MouseEvent>) { opened = true; }
  <section>
    <button type="button" on:click={open}>Open</button>
    <Show when={opened} fallback={<p>{summary}</p>}>
      <p>Expanded</p>
    </Show>
  </section>
}
```

すべての書込みが`opened = true`なら、開いた後にfallbackへ戻らない。初回fallbackはサーバーがHTMLにするため、その再生成factoryと、factoryだけが必要としていた`summary`のsnapshotを省ける。`!opened`も扱う。逆方向の代入やtoggleがあれば省かない。

対象は再生成されないrootの要素の下にある、booleanを直接読む単一条件の分岐に限る。Forの行、別のarm、ErrorBoundaryの下では、初期状態のまま後から生成され得るためfactoryを保持する。省いたarm内でも、表示中に変わるtext・属性のpatchと必要なstateは残す。この変換はarmのchunkを別々に遅延取得する機能ではない。

## readonly recordのprojection

```text
schema User { name: string; biography: string; }
client component Details(user: User) {
  state opened = false;
  event open(e: EventSnapshot<MouseEvent>) { opened = true; }
  <section>
    <button type="button" on:click={open}>Open</button>
    <Show when={opened}><p>{user.name}</p></Show>
  </section>
}
```

再開後に`user.name`だけを読むなら、snapshotへprimitiveのnameだけを保存する。deriveによる別名も解決する。browser側でUserを再構成するdecoderは増やさず、生成式を該当slotの読取りへ置き換える。入力時にはbiographyを含むUser全体を検査する。

現在はregion backendのreadonly propから、静的なproperty pathのprimitive leafを取り出す。mutable stateの分割、動的index、arrayの分割、object全体の受渡しやidentityを観測する用途には適用しない。たとえば`JSON.stringify(user)`があればUser全体を保持する。これは入口ごとのcapture分割や、ownerの一部だけをJSON parseする機能ではない。

## 再現と結果

### コンパイル警告

観測されないコードには、ビルドを止めずに次のwarningを出す。

| code | 対象 |
|---|---|
| `W_UNOBSERVED_VALUE` | UI・残る処理・初期化の依存から読まれないprop、state、derive |
| `W_UNOBSERVED_UPDATE` | 効果のあるイベント内で、一部だけ除去される代入 |
| `W_UNOBSERVED_EVENT` | 効果がなく除去されるイベント、またはどこにも接続されない宣言 |

初期HTMLだけに使う値や、例外・外部効果を保持するために必要な値は対象にしない。readonly recordの一部をsnapshotから除くだけでも警告しない。専用client entry、resource setup、子ownerなどのopaque境界では、内部の観測性を断定しない。未接続のevent宣言はその場合も警告する。定数畳込み前の検査済みプログラムを保守的に解析するため、全ての到達不能コードを検出するunused lintではない。

`compile(source)`はwarningがあっても`ok: true`で、`diagnostics`へ`severity: "warning"`、code、hint、UTF-16のソース範囲を返す。成功時の`diagnostics`が空とは限らないため、成功判定には`ok`を使う。`requireIR`はwarningで失敗しない。`compilePreview`もwarningを返し、renderエラー時にはエラーの後ろに残す。

```js
const result = compile(source);
if (result.ok) {
  for (const warning of result.diagnostics) console.warn(warning);
  // result.ir can be built even when warnings were emitted.
}
```

CLIの`check` / `explain` / `emit` / `ssr` / `cost` / `layout`はstderrへ位置付きのwarningを出し、warningだけでは終了コードを失敗にしない。`check`のJSONにもdiagnosticsが入る。Viteのdev/buildでも表示し、playgroundではReadyを保ったまま警告一覧と件数を表示する。一覧の項目から編集箇所へ移動できる。

コンパイラAPIを独自のopaqueな連携に使う場合は、`compile(source, {externalObservers: ['Counter']})`でそのownerを保守的に扱う。`true`は全てのclient ownerを対象にする。これは単なるwarning抑止ではなく、イベント除去などの最適化も止める。Viteの`resources` / `clientEntry`は自動で接続する。

### 実行とサイズ

```sh
just semantic-optimizer-check
node tools/isle.mjs explain examples/semantic-optimizer/app.isle
node tools/eval-semantic-optimizer.mjs
```

`explain`の`analysis.observability`に削除した入口・代入と停止理由、`monotonicFactories`に省略したarm、`recordProjections`にcapture元とpathが出る。metadataは配信するregistryには入らない。

[実行fixture](../examples/semantic-optimizer/app.isle)では、summaryとbiographyへそれぞれ65,536文字を渡す。比較対象は**同じ検査済みプログラムで、opaque observer境界によって3つの変換を止めた出力**である。以前のリリースやQwikの測定値ではない。

| 対象・指標 | 変換を止めた出力 | 最適化後 |
|---|---:|---:|
| Detailsのsnapshot JSON | 131,140 bytes | 41 bytes |
| Detailsの生成module source | 1,160 bytes | 959 bytes |
| Detailsのarm factory | 2 | 1 |
| Idleのsnapshot JSON | 31 bytes | 0 bytes |
| Idleの生成module source | 54 bytes | 0 bytes |

snapshotは`JSON.stringify(snapshot)`のUTF-8 bytes。module sourceはbundling前の生成handlerとregionの合計で、共有runtimeを含まない。転送量・minify後のサイズ・速度の比較ではない。summaryは引き続き初期HTMLに必要であり、HTMLから消した値ではない。frameworkのmarkerを除いた初期HTMLは比較で一致する。

[結果JSON](../evals/results/semantic-optimizer/latest.json)を保存している。[Nodeテスト](../tests/semantic-optimizer.test.mjs)では例外・外部効果・再生成・全object利用の保持と、booleanの有限遷移を検査する。[ブラウザテスト](../e2e/semantic-optimizer.spec.mjs)では2つのDetailsの独立した初回resume、繰り返し操作、Idleの入口除去をproduction buildで確認する。これらはcompiler全体の形式証明ではない。

dirty集合の数値mask化、validationの差分化、regionの計算共有、keyed差分更新、入口ごとの部分復元は後続の課題として残る。
