# ES2023 向けの runtime 小型化

同じ2カウンターと非同期 Editor の fixture を使い、最適化前の [raw data](../benchmarks/results/history/before-es2023.json) とスロット化・minify 後の [raw data](../benchmarks/results/history/before-island-loader.json) を保存しています。下表は island loader を分離する前の計測です。値は gzip level 6、body ごとに圧縮した bytes です。

| Isle | 最適化前 | 最適化後 | 削減 |
|---|---:|---:|---:|
| 初期の外部 JS | 2,798 | 1,513 | 45.9% |
| HTML（CSS・snapshot 込み） | 1,012 | 937 | 7.4% |
| 最初の Counter handler | 118 | 90 | 23.7% |
| 最初の Editor handler | 148 | 129 | 12.8% |
| 共通操作で取得した asset 合計 | 4,076 | 2,669 | 34.5% |

圧縮前の初期 JS は 6,276 → 2,897 bytes、合計は 9,019 → 5,184 bytes です。この fixture の転送量を測定しており、一般の UI の処理速度や機能同等性の指標ではありません。

その後 [island loader](island-loader.md) を分離し、初期外部 JS を **697 bytes gzip** にしました。その時点の操作後合計は 3,261 bytes です。さらに [CodeRef と manifest](code-references.md) を導入した時点では、profile 無効で初期外部 JS **698 bytes**、操作後合計 **3,693 bytes** でした。Counter の [raw data](../benchmarks/results/latest.json) では、初期 loader と操作時の runtime/handler を区別しています。これらは操作時の並列取得を追加する前の記録です。その後の速度と転送量は[ダッシュボードの測定](../benchmarks/dashboard/README.md)を参照してください。SSR 専用ページの framework JS はゼロです。

## 静的部分と再開部分の分離

v0 の閉じた primitive 式に、定数伝播・定数畳み込みと静的 HTML の事前生成を追加しました。どのイベントからも書かれない state の初期化が定数なら、derive、handler、template へ伝播します。別のイベントから書かれる値は初期値が literal でも動的なままです。props 等の request ごとに変わる値を宣言だけからコンパイル時の定数とは扱いません。

例えば `state prefix = "Account: "; derive label = prefix + title + " points";` は title だけを保存値にします。prefix/suffix は HTML に置き、handler に同じ文字列を重複して入れません。Text node は一つに保ち、handler は可変文字列と UTF-16 の prefix/suffix 長を渡します。runtime は `Text.replaceData()` でその範囲を更新します。数値加算を文字列の断片として分割せず、CR/LF・NUL・孤立 surrogate 等で HTML parsing と更新時の値がずれる境界は保守的に全体更新を残します。

Text node の分割ではフォント描画に17 pixel の差を検出したため、文字範囲の更新へ変更しました。現在の SSR HTML と resumable 初期表示は、vlmkit 0.24.0 の3幅で raw pixel / computed style の差がゼロです。snapshot script による DOM 要素数の差は保持します。[比較レポート](../benchmarks/results/static/visual/diff.md)は初期表示の検査で、操作後の意味は Playwright で確認します。

再開用 DOM root は、全 handler と動的 binding を含む最小の共通祖先へ寄せます。静的 section の隣にボタンだけがある component なら、ボタンだけを root にし、静的 section を復元時に走査しません。外にも更新先があれば、それを含む祖先を root にします。DOM は作り直しません。

attribute-only build はテキスト用 TreeWalker / Text node 準備 / text patch を除去します。属性の target は初回解決後に owner 内で cache し、同じ binding の次の更新で再検索しません。文字範囲を使わない build に、そのための更新関数は残しません。

SSR の必要性も HTML と resume snapshot で分けます。SSR 専用では event だけが使う state を初期化・保存せず、HTML 用の値だけを評価します。props の契約、最適化前の構文・型・循環検査は維持し、resume では snapshot を検証します。

## 合成ケースの実測

`just compare-static` で production bundle を測ります。固定の長い装飾を持つ文字列、attribute-only、不変値の別名、数値 derive の重複計算の4ケースです。UTF-8 raw とファイル単位 gzip level 6 で、HTTP header、manifest、RPC と実行時間は含めません。最初の2ケースの[導入前](../benchmarks/results/static/before.json)と[現在](../benchmarks/results/static/latest.json)を保存しています。

| 指標 | 前 | 後 |
|---|---:|---:|
| Decorated の snapshot slots | prefix / suffix / title | title |
| snapshot raw | 880 | 37 |
| HTML raw | 2,068 | 1,225 |
| HTML + JS raw | 6,757 | 5,926 |
| HTML + JS gzip | 3,017 | 3,007 |
| AttributeOnly の JS gzip | 2,504 | 2,384 |
| AttributeOnly の HTML + JS gzip | 2,793 | 2,676 |

snapshot raw は95.8%減りますが、HTML と snapshot の同じ文字列は gzip でも重複圧縮されるため、asset 合計 gzip の減少は0.3%です。attribute-only JS は4.8%減りました。共通 Qwik/Preact fixture はすでに小さく、直前の [3,690 bytes](../benchmarks/results/history/before-static-split.json) に対して今回は3,693 bytes gzipです。全ケースで同じ割合の削減を主張しません。

実行時には、静的 section の mutation がゼロ、復元の TreeWalker の root が button、attribute-only の TreeWalker がゼロ、属性の5回更新で target query が1回であることを確認します。これらは work の数で、CPU 時間や INP の測定ではありません。

## 不変値の別名と重複計算

現行 v0 の props は component の寿命中に変更されません。`state copied = base; state copiedAgain = copied;` のような初期コピーも、どのイベントからも書かれず型が同じなら、base を読む式へ置き換えます。snapshot と handler は元の slot を共有します。値が等しいという理由では統合せず、コピー元が可変なら初期値を独立して保存します。書き込みの有無は component 内の全イベントから判定し、props と残る state の型検証も維持します。

数値の derive が同じ式から何度も参照される場合、handler 内のローカル変数へ取り出します。対象は primitive の純粋な数値演算で、生成する宣言も含めてソースが短くなる場合です。各代入の右辺と、代入を終えた後の DOM 更新を別の計算範囲にし、書き込み・await・イベントをまたいで結果を再利用しません。文字列や property 読み出し、remote を含む範囲は対象外です。snapshot に cache 値を加えず、算術の括弧や有限数の検証、失敗時の rollback も保ちます。

```ts
state count = 1;
derive base = count * 2 + factor;
// factor=3 の場合、最初は30、その書き込み後の base=63 を使って4032になる。
count = base * base + base;
count = base * base + base;
```

新しい2ケースの[変更前](../benchmarks/results/static/before-alias-cse.json)と[変更後](../benchmarks/results/static/latest.json)は次の通りです。既存の Decorated / AttributeOnly の出力サイズは変わりません。

| 指標 | 前 | 後 |
|---|---:|---:|
| Aliased の snapshot slots | base / copied / copiedAgain / count | base / count |
| Aliased の snapshot raw | 40 | 34 |
| Aliased の HTML + JS gzip | 2,680 | 2,674 |
| Repeated の handler raw | 316 | 132 |
| Repeated の handler gzip | 126 | 126 |
| Repeated の HTML + JS raw | 5,681 | 5,497 |
| Repeated の HTML + JS gzip | 2,852 | 2,852 |

Repeated は数値 derive が diamond を作り、同じ値を2つのテキストと1つの属性へ書きます。生成 handler のテストでは、1回の更新での count 読み出しが16→2回、factor が15→1回になりました。変更後の minify 済み handler でも Proxy による slot 読み出し数は2回・1回です。これは計算の重複とコード量の削減であり、実行時間や gzip 転送量の改善を示すものではありません。この変更時点の共通 Qwik/Preact fixture は初期外部 JS 698 bytes、操作後 asset 合計3,693 bytes gzipでした。

[計算の寿命の読解課題](../evals/scenarios/computation-lifetime/brief.md)も追加しています。fixture の実行結果と期待値を照合しますが、参加者評価は未実施です。

## 再利用できる server artifact

`prepareComponent(component)` は入力 IR のコピーを所有し、静的 HTML、初期化の必要性、capture、binding と handler の計画を共有します。render ごとの状態と snapshot は共有しません。generate で返す metadata から内部計画も変更できません。Vite adapter は同じ解決済み file/source なら artifact を再利用し、mount ごとの再解析・静的 HTML 生成を省きます。

```js
const prepared = prepareComponent(component);
const client = prepared.generate();
const first = prepared.render({ initial: 'Draft' }, { scopeId: 'a' });
const second = prepared.render({ initial: '' }, { scopeId: 'b' });
```

explain の analysis は folded、aliases（不変値の別名と参照元）、serverStates（snapshot も含む初期化）、htmlStates（HTML 専用）、snapshotSlots、textRanges、staticFragments、resumeRoot を表示します。handler の computations は、重複計算を除いた derive 名と `statement:0` 等の代入位置、または `patch` を示します。これらは explain / manifest の metadata で、通常の browser registry へは送りません。API は [codegen.d.mts](../lib/codegen.d.mts) に定義します。新しい inline/live/CSS parser や CSS DCE はこの変更の実装範囲には含めません。

schema hash は source 全体から capture layout と動的 handler/binding の契約へ切り替えました。同じ長さの固定文言や静的 layout の変更は、動的計画が同じなら JS の hash を変えません。文字範囲の長さが変われば更新コードも変わり、hash が変わります。snapshot は v2 のままですが生成規則を `static-plan/2` とし、旧 plan の snapshot を誤って受け入れません。

## 境界と mangle

ユーザーの記述・MoonBit IR・server API の field 名は意味を保持します。browser snapshot は `[2, schemaId, scopeId, values[]]` にし、必要な props/state だけを `fields` の順番で番号に変換します。component 名・状態名の文字列を復元のために送る必要がなくなります。

生成 handler は位置引数で値と操作を受け取ります。各 chunk のローカル変数を独立に mangle でき、property 名の変換表を chunk 間で共有しません。使わない末尾引数も生成しません。binding は root 内の番号付き locator と短い comment にします。閉じ comment は残し、隣接する静的文字列と動的文字列が HTML parser で一体化することを防ぎます。

runtime の `_values` / `_queue` などの内部 property だけを、Vite が公開する Oxc minifier で module 単位に mangle します。対象は `runtime/client.mjs` のみです。JSON の field、DOM property、公開 controller、ユーザーのコードには適用しません。最終 bundle も通常の Oxc minify を通します。インストール済み Rolldown の bundle 全体の property mangle は単一 chunk 制約があるため、遅延分割を維持したまま使える範囲に限定しています。

## 標準機能と静的に確定する機能

- 出力 target は ES2023。標準の ESM、動的 `import()`、fetch、DOM TreeWalker、Map/WeakMap、Promise を使います。旧ブラウザー用 polyfill は含めません。
- event listener の破棄は標準 AbortController / AbortSignal で行います。独自の listener 削除リストを持ちません。
- handler は現在の文法上 JavaScript のみで、CSS やユーザー import を含みません。Vite/Rolldown の公開 `emitFile` / `resolveFileUrl` API に chunk と content hash の解決を任せ、ブラウザー標準の import を直接出力します。汎用の CSS/preload/error helper を載せません。失敗は既存の event queue の error hook に渡します。
- native import の依存関係を出力 chunk の `dynamicImports` に登録し、Vite manifest にも残します。code 変更時に handler と親 chunk の hash が変わること、manifest と URL が実在する chunk を指すことをテストします。
- production では解析済みの component が使う attribute / remote capability のみ残します。開発時は全機能を残し、HMR で capability を追加しても利用できます。
- production の計測値・詳細診断文は既定で除去します。`diagnostics: true` で有効にできます。機能の検証用デモは診断あり、比較用ページは診断なしです。

## 維持する検査

snapshot の version、schema hash、scope、slot 数、各 primitive 型、有限数と負のゼロの制約を検査します。未知の schema は prototype 由来の property も含めて拒否します。staged write、scope の破棄判定、直列 event queue、import 失敗後の再試行、remote action の allowlist と response 成功判定は残します。server の入力・policy・認証 context・出力検査も変更していません。

Node の契約・build テストに加えて、minify 済みの出力で属性更新、空文字、連続操作、AbortSignal による close、不正 snapshot の拒否を Playwright で確認します。比較用 fixture は4実装共通の操作と3幅の視覚比較に通しています。これらは実装テストであり、既存 MoonBit/veri モデルの対象を compiler/browser 全体へ広げるものではありません。

比較側も ES2023 / `modulePreload: false` に揃えたため、Preact の観測合計も 7,070 → 6,752 bytes に縮みました。Qwik 独自の loader/preloader は既定値を維持しています。最新の全比較は [比較結果](../benchmarks/results/latest.md)を参照してください。

参照: [Vite build options](https://vite.dev/config/build-options)、[Rolldown property mangle](https://rolldown.rs/reference/Interface.ManglePropertiesOptions)、[Rolldown emitted chunks](https://rolldown.rs/reference/Interface.EmittedChunk)。実際の単一 chunk 制約と API 型は lockfile が固定する Rolldown 1.2.16 の宣言も確認しています。
