# 名前付きチャンク境界と計測

イベントブロックは、それ自体が遅延コードの境界です。関数を `$` で包む手順や、コード分割だけのための `async` は必要ありません。必要なブロックに名前を付けます。

```text
export client component Counter({ initial }: { initial: number }) {
  state count = initial;
  <div>
    <button>on click increment { count += 1; }{count}</button>
    <button>on click decrement { count -= 1; }{count}</button>
  </div>
}
```

`Counter.increment` と `Counter.decrement` が論理境界の名前です。前に別のイベントを挿入しても名前は変わりません。省略した `on click { ... }` は従来どおり使え、自動の `Counter.h0` 等になります。自動名の連番は編集で変わり得ます。名前は component 内で一意にし、自動名用の `h` + 数字は禁止します。同じ要素への同じ event の二重登録もエラーです。

文法は `on <event> [async] [name] { statements }`。対応イベントは click/input/change/submit/invalid、名前は ASCII 識別子です。親の DOM 要素に結び付きます。Form の入力値と標準検証は [Form の契約](forms.md)に従います。任意の function 定義や、ブロック内部の追加チャンク分割はまだ実装していません。

```text
<button>
  on click async save {
    title = (await remote renameDocument({ id, title })).title;
  }
  {title}
</button>
```

`async` は本文が `await remote` を使える契約です。この例の `Editor.save` は client のイベント境界で、`renameDocument` が別の server action 境界です。認証・認可は既存の server action 宣言と host adapter で検査します。

## 読み込むタイミング

構文で実行の意味と識別名を決め、初期転送の方針はページ側で指定します。

```js
isle({
  entry: '/absolute/path/app.isle',
  loading: 'auto', // 既定値。イベント・依存・gzip 予算から先読みを計画
  autoPreloadGzipBytes: 8192,
  profile: true,
  mounts: [/* ... */],
});
```

現在の loading 指定は component の有効 mount 単位です。auto は input/change、次いで submit/invalid の静的依存閉包を、追加 gzip 予算内で modulepreload します。click は操作時の取得を保ちます。判定は生成後の chunk に対して行い、manifest と chunks の resolution に理由を出します。[解決時期の最適化](resolution-optimizer.md)を参照してください。

`lazy` / `preload` / `eager` の明示指定も可能です。auto/preload は取得だけを前倒しし、eager は module 評価まで準備します。snapshot 復元・resource setup・handler 実行は対象の操作時です。同一 component の handler を個別に指定する API、手動のグルーピング、profile に基づく分割は未実装です。SSR 専用は loading/profile にかかわらず静的 HTML です。

compiler は境界を CodeRef と Vite/Rolldown の chunk entry に変換します。物理ファイルと静的依存は bundler が決定するため、サイズの判断には生成 manifest を使います。

小さい sibling entry は `handlerChunkBytes`（既定1024B）の予算で共有 chunk にまとめます。auto では input と click のような異なるイベント優先度を分け、先読みに巻き込まないようにします。名前付きの論理境界と profile ID は個別に維持します。同じ物理 URL が複数行に現れても、その byte 数を重ねて合計しません。eager の静的参照による facade や共通依存の追加も、manifest の `modules` から確認できます。

## ビルドを調べる

```sh
node tools/isle.mjs explain path/to/app.isle # 境界名・async・捕捉・書き込み・offset
just build
just chunks                              # dist/isle.manifest.json
just chunks path/to/isle.manifest.json
```

manifest は境界ごとに `source`、`event`、`async`、`captureNames`、`writes`、`actions`、有効な `loading` を持ちます。`source.file` は Vite root からの相対パス、行・列は1始まりの UTF-16 単位、offset は0始まり、end は終端の次です。本文とローカルの絶対パスは出力しません。ブロック位置は snapshot の schema hash に含めません。

`just chunks` は `Counter.increment` → `app.isle:4:13` → 捕捉した `count` → hash 付きの chunk URL を対応付け、次のサイズも返します。

| field | 意味 |
|---|---|
| `bytes` | 対象ファイル自体の UTF-8 bytes |
| `gzipBytes` | 対象ファイル自体の gzip level 6 |
| `coldGzipBytes` | 共通 runtime、静的 import、CSS 依存を含め、ファイル単位の gzip を重複排除した合計 |
| `styleGzipBytes` | CSS 依存の gzip 合計。CSS があるときだけ表示 |
| `modules` | cold の計算に含む module URL |

cold は bootstrap・HTML・RPC と、無関係な dynamic import を含みません。境界間で runtime が共有されるため、各行の cold の和をページ転送量として扱いません。HTTP cache の状態や実際の転送量も測っていません。この metadata は manifest に置き、通常の browser registry や初期 loader には含めません。

## 操作を計測する

`profile: true` のときだけ標準の `performance.measure()` に記録します。デモでは `ISLE_PROFILE=1 just dev`、production の検査には `ISLE_PROFILE=1 just build` を使えます。既存の開発 server があれば設定を反映して再起動します。

[User Timing](https://www.w3.org/TR/user-timing/) の数値 timestamp と `detail` を使い、同じ handler の並行操作にも別の invocation ID を付けます。共有 mark 名を使わず、DevTools の Timings、`PerformanceObserver`、`getEntriesByType` から読めます。

| phase | 区間 |
|---|---|
| `interaction` | 委譲イベントを受けてから transaction 完了／中止／エラーまで |
| `loader-queue` | loader の配送待ち |
| `runtime` | 共通 runtime の import と初期準備。再利用時は短い待機のみ |
| `queue` | 同じ island 内の先行操作待ち |
| `code` | handler export の解決。URL と resolver の `cached` を記録 |
| `resource-code` | 設定された setup export の解決待ち。URL を記録し、handler と並列に取得する |
| `resource-setup` | component の resource 登録。初回だけ実行し、取得の完了は含めない |
| `styles` | 必要な stylesheet の準備待ち。適用済みの依存では省略 |
| `restore` | その island の初回 snapshot 検証・DOM locator 復元 |
| `run` | handler、await、state/DOM commit を含む transaction |

名前は `isle:Counter.increment:code` 等です。detail は `handlerId`、`scopeId`、`event`、`invocation`、`phase`、`status` を持ちます。status は `ok` / `cancelled` / `error`。同じ island の2回目以降には restore は出ません。別 instance の初回には出ます。code の cached は runtime 内の解決 Promise の再利用で、HTTP cache hit の意味ではありません。先読み済み module の初回解決が cached: false になることもあります。

production eager entry は callable を起動時に準備するため、初回から code の `cached` が true になります。起動時の取得・評価は event の interaction 区間に含まれません。初期転送量、Resource Timing、ページ読み込みの指標と併せて比較します。preload は評価まで行わないため、この eager の準備とは区別します。

```js
const entries = performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('isle:'));
console.table(entries.map(entry => ({
  handler: entry.detail.handlerId,
  scope: entry.detail.scopeId,
  invocation: entry.detail.invocation,
  phase: entry.detail.phase,
  status: entry.detail.status,
  ms: entry.duration,
})));
// JSON.stringify(entries) で保存可能。古い計測は必要に応じて消す。
for (const entry of entries) performance.clearMeasures(entry.name);
```

manifest の同じ handlerId から source と chunk に辿れます。まず cold/warm、次に code/restore/run を比較します。run は await の待ちを含む経過時間で、CPU 時間ではありません。interaction は描画や INP を測っていません。CPU profiler 用の `.isle` sourcemap は未実装です。

実行前の [静的な負荷予測](static-profiling.md) は、`just cost path/to/app.isle` または build 後の `just cost dist/isle.cost.json` で調べられます。最適化後の計算と更新候補、owner の復元、共有 chunk の量を扱い、budget の超過や不明な費用で CI を失敗させられます。`explain` にも component ごとの `cost` を含みます。時間予測と任意 TS の計算量解析は未実装です。通常の配布 JS に解析情報は含めません。

profile は開発時も既定で false。false の production build では計測関数・timestamp 取得・profile helper を除去します。サイズ比較には profile を無効にします。

## 検証

Node では構文・診断、UTF-16/CRLF の位置、名前と schema hash の安定性、byte 数・捕捉、計測コードの除去を確認します。Playwright は production profile build の cold/warm、エラー時の rollback、import 中の dispose を検査します。記述・読解の新課題は `evals/scenarios/author-chunks` と `chunk-intent` です。新課題の参加者評価はまだありません。

名前付き境界の導入時点では、匿名イベントの共通 fixture が初期外部 JS 699 bytes、全操作後の asset 合計 3,690 bytes（gzip level 6）でした。静的部分の分離後は 698 / 3,693 bytes です。[直前の記録](../benchmarks/results/history/before-chunk-profiling.json)は 700 / 3,692 bytes でした。名前付きイベントでは識別子の文字列長もサイズに影響します。[最新の結果](../benchmarks/results/latest.md)を参照してください。
