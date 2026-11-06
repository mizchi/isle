# unmount と所有リソースの破棄

状態: 2026-11-05。`models/resource_disposal` の時相モデル、所有・破棄カーネル、モデル由来の schedule 再生に加え、Vite の `resources` 指定から component / widget の寿命への自動接続を実装した。resource / Once / `Suspense` の専用 DSL と temporal type checker は未実装。

`Once<T>` は結果を公開する回数の契約である。`Owned<T>` は解放する責任の契約であり、別の軸にする。非同期取得の結果が `Once<Owned<T>>` なら、取得済みの T ごとに解放権を一つ持ち、owner の寿命の終了で消費する。読み取り側は解放権を複製・呼び出しできない。失敗して T を取得できなかった場合は、その T の destructor を呼ばない。

## 破棄を三段階に分ける

1. **論理的な無効化**: owner と全ての子 owner を同期的に閉じる。新しい初期化、handle の読み取り、結果の公開を禁止する。
2. **abort の要求**: 進行中の処理へ AbortSignal を通知する。abort は、処理が停止したことや取得済みリソースが解放されたことの証明ではない。
3. **取得済みの値の解放**: destructor を一度だけ呼び、その成功・失敗を記録する。unmount より後に取得結果が届いた場合は、公開せずに解放する。

[DOM Standard の AbortController](https://dom.spec.whatwg.org/#aborting-ongoing-activities) は、対応する API に中止を通知する仕組みである。API が abort を無視する可能性をモデルと実装の両方へ残す。

```text
Acquiring ──成功──> Acquired ──生存中なら公開──> Published
    │                 │                         │
    │ unmount         └──────── owner終了 ───────┘
    ▼                                │
abort要求                            ▼
    │                      Releasing ──成功──> Released
    └─遅い成功──> 非公開の値 ──┘       └─失敗──> ReleaseFailed
```

`dispose()` が同期的に終わるのは無効化・abort 通知・既に取得済みの値の解放開始まで。初期化や非同期 destructor の完了は `settled()` で別に待つ。非協調的な初期化や destructor が永遠に返らなければ、settled も完了しない。通常の UI unmount はこれを await して待機しない。

## 実行できるカーネル

通常の component では次の自動接続を使う。単独の `createResourceOwner()` は独自 adapter を作る場合の API である。

## Component へ自動接続する

```js
isle({
  entry: '/absolute/path/app.isle',
  mounts: [{ component: 'Page', props: {}, label: 'Page' }],
  resources: { VideoPanel: './video.resources.mjs' },
});
```

値は `.isle` entry からの相対パスで、Vite が扱えるローカル ESM / TypeScript module を指定する。キーはイベントを持つ client component 名。server / universal / 非対話 component は拒否する。handler がない component を visibility から開始する機能は含まない。

```ts
// video.resources.ts（上の設定も .ts に変更する）
import type { ClientResourceSetup } from '../lib/client-contracts.d.ts';

export const setup: ClientResourceSetup = ({ root, owner }) => {
  const resize = new ResizeObserver(entries => {
    // ready の結果を外部 API へ通知するなど、adapter 内の処理を書く。
    console.log(entries[0]?.contentRect.width);
  });
  owner.own(resize, observer => observer.disconnect());
  resize.observe(root);

  owner.acquire(async signal => {
    const response = await fetch('/api/connection', { signal });
    if (!response.ok) throw new Error('connection failed');
    return response.body;
  }, body => body?.cancel());
};
```

`setup({ root, owner, id })` は対象 instance の初回 resume で handler より前に一度だけ実行する。module のトップレベルにはリソース取得を書かない。先読み時の評価は複数 instance の初期化を意味しない。setup 自体は同期関数で undefined を返し、非同期取得は `owner.acquire` に登録する。取得の完了は handler 開始を待たせない。ready / failed を UI state へ反映する DSL はまだ提供しない。

- `controller.dispose(id)` は対象と子孫を先に無効化し、子から親へ破棄する。`close()` は root 内の全 component を無効化してから破棄する。
- native DOM の削除は、resource owner が初めて作られた時だけ登録する MutationObserver で検出する。同じ root 内の同期的な remove → append は保持する。確定的な同期破棄が必要なら DOM 削除前に `dispose(id)` を呼ぶ。
- Custom Element の実際の disconnect は既存 mount の abort → loader.close → owner.dispose に接続する。別 widget の scope ID が同じでも owner を共有しない。独自 ShadowRoot adapter は host の切断時に `close()` を呼ぶ。
- setup の途中で throw した場合は部分的な登録も破棄し、その instance の handler を実行しない。code import の失敗は初期化前なので次の操作で再試行できる。
- resource 対応 build では `await controller.resources(id)` から同じ owner を明示的に取得できる。snapshot を検証し setup を一度だけ行う。close 後・DOM 切断後は拒否する。

setup は `VideoPanel.$resources` / symbol `setup` の CodeRef として manifest に載り、component の各 handler の `requires` へ入る。初回操作では handler と setup を並列取得する。`lazy` / `preload` / `eager` に従いコードを取得・評価しても、setup の実行は対象 instance の resume まで遅延する。cleanup は取得側 module の依存として先に読み込み、unmount 時の import に依存しない。

SSR 専用 mount は resource module を解決・出力しない。resource を使わない通常の production build は owner カーネル・監視・公開 API を dead code elimination で除去する。共有 widget engine は、最初の app の機能削減が後続 app を壊さないよう resource 機能を含む。snapshot ABI は v2 のまま、registry の位置6へ schema ID → setup CodeRef を追加した。現在の共有 engine は CSS-ready を含む `isle/client/6` である。

実行例は [resource-bindings fixture](../e2e/fixtures/resource-bindings/vite.config.mjs)、検証は `just resource-binding-check`。

サイズ検査は `just resource-binding-size`。ES2023・diagnostics/profile 無効の同一 Counter では、adapter を含む全 JS の増分は raw 4,901 B / ファイル別 gzip 合計 1,789 B。[測定条件と通常アプリの差分](../evals/reports/resource-bindings.md)を参照する。

## 独自 adapter から使う

```ts
import { createResourceOwner } from '../runtime/resource-owner.mjs';

const owner = createResourceOwner({
  signal: mountSignal,
  onError(error) { reportCleanupError(error); },
});

const connection = owner.acquire(
  signal => connect(url, signal),
  value => value.close(),
);

// ready の場合だけ読み取る。pending / failed / disposed では read が throw する。
if (connection.state === 'ready') {
  connection.read().send('hello');
}

// mountSignal の abort からも同じ破棄経路に入る。
owner.dispose();
await owner.settled(); // 管理側やテストが必要に応じて完了を待つ
```

- `own(value, release)` は取得済みの値を引き取る。owner が閉じた後に渡された値も即座に解放へ回す。
- 「一度だけ」は取得・所有権の登録 token ごとの保証。同じ生の T を二重に所有させないことは adapter の契約であり、任意 JavaScript の alias をカーネルが検出したとは扱わない。共有する実体には、参照計数などで独立した解放責任を持つ lease が必要。
- `acquire(initialize, release)` は初期化前に解放責任を登録する。unmount 中や後に初期化が成功しても取りこぼさない。initialize が失敗する前に部分的に取得したものは、返されていないため adapter 側が解放する。
- `fork()` は子 owner を作る。親の終了では、全子孫を無効化してから host callback を呼ぶ。子から親へ、各 owner 内では登録の逆順に destructor を開始する。独立した destructor は一つが待機・失敗しても残りを開始する。
- 非同期 destructor の**完了順**まで LIFO にする契約ではない。子の cleanup 完了まで親リソースを使う依存関係・構造化 task join は追加の契約が必要。
- `errors` と onError は cleanup 失敗を通知する。失敗を Released と偽らず、同じ解放権で自動 retry しない。再実行や外部の物理解放成功には adapter の別契約が必要。
- 処理が済んだ子 owner は親の保持集合から外す。初期化中に dispose が再入した場合や遅い解放がある場合は、それが終わるまで drain の対象へ残す。

取得・解放には関数を明示して渡す。ES2023 の Promise と Web 標準の AbortController を使い、Symbol.dispose / Symbol.asyncDispose の実行時機構や polyfill を要求しない。Vite は resource 未使用時に接続部分ごと除去する。

既に read で渡した T の生参照を JavaScript から回収することはできない。カーネルが防ぐのは、閉じた handle からの新たな読み取りと、取得結果の新たな公開。borrow の外部保存、await を越える利用、解放関数自身の物理動作には、今後の DSL の検査または trusted adapter の契約が必要。

## 時相的な契約

r は取得試行に付いた identity と元 owner の世代、`abandoned(r)` は元 owner が閉じたか世代が変わった状態とする。

| 性質 | 式の例 | 条件 |
|---|---|---|
| 二重解放しない | `G(releaseCalls(r) ≤ 1)` | 無条件の安全性 |
| 未取得の値を解放しない | `G(releaseCalls(r) > 0 ⇒ acquired(r))` | 無条件の安全性 |
| 生存中に勝手に解放しない | `G(releaseBegin(r) ⇒ abandoned(r))` | owner による寿命管理 |
| 破棄済み・旧世代へ公開しない | `G(publish(r) ⇒ currentOwner(r))` | 公開時にも照合 |
| 進行中の取得へ abort を要求 | `G(abandoned(r) ∧ acquiring(r) ⇒ abortRequested(r))` | 論理的な要求の記録 |
| 遅い取得結果も解放へ回す | `G(abandoned(r) ∧ acquired(r) ⇒ F releaseAttempted(r))` | 解放開始の弱公平性 |
| 解放処理が終端へ進む | `G(releasing(r) ⇒ F(released(r) ∨ releaseFailed(r)))` | destructor が成功か失敗を返すという追加仮定 |

`G(unmounted ⇒ F released)` と無条件に書かない。まだ取得されていない値や、永久に返らない destructor、throw する解放処理まで「物理解放できた」としてしまうためである。線形な責任は「高々一度呼ぶ」という安全性と「取得済みの責任を取り残さない」という活性を合わせて表す。

## 検査結果と実装との照合

Strict の到達集合は1,452状態。対象は2 resources・owner 2世代・取得・abort・公開・解放開始・解放成功／失敗で、初期化の実体と物理リソースの内部は抽象化する。深さや状態数の上限で探索が未完了なら検査を失敗させる。完了した有限グラフの循環と弱公平性を調べることで、そのグラフの無限経路を検査する。

故障版は二重解放、未取得の解放、生存中の解放、owner 無視、abort 忘れ、二重 abort、遅い取得の取りこぼし、公開済みの値の解放漏れ、一つの cleanup 失敗による残りの放棄。9種類それぞれに反例を検出し、veri の step / holds で再生する。開始・完了の公平性を外した循環反例と、destructor が失敗するため物理解放成功を保証できない反例も区別する。

[tests/resource-disposal-replay.test.mjs](../tests/resource-disposal-replay.test.mjs) は保存済み fixture ではなく、実行した MoonBit verifier から9反例の操作列を受け取る。取得の成功・失敗、unmount、再生成、cleanup の成功・失敗の外部 schedule を、Promise barrier と Node の task 境界でカーネルへ再生する。公開と解放開始はカーネルが自動で行い、テスト側からその権限を呼ばない。修正版では漏れ・二重解放・早すぎる解放・古い handle の再公開が起きないことを確認する。

[再生結果](../evals/results/resource-disposal/replay.json)は外部 schedule に対する回帰検査であり、実装とモデルの全トレースの refinement 証明ではない。子 owner の順序・再入・エラー継続・mount AbortSignal は [resource-owner.test.mjs](../tests/resource-owner.test.mjs)、component / widget への接続は [resource-bindings.spec.mjs](../e2e/resource-bindings.spec.mjs)で別に検査する。専用 resource DSL の意味保存証明とは区別する。

```sh
just resource-disposal-check
just verify
```

verifier 全体は report v2 の92ケース、応答性16ケースを含む。全35反例は故障版29件、仮定不足4件、契約不足2件に分け、想定結果と再生が一致して初めて成功にする。

## DSL と chunk へ接続する方針

将来の構文候補は値の確定回数と所有を分ける。

```text
client component VideoPanel(deviceId: string) {
  resource once camera: Owned<MediaStream>
    start(resume)
    = inline(ts) {
      return await openCamera(deviceId, signal);
    }
    release(stream) inline(ts) {
      for (const track of stream.getTracks()) track.stop();
    };

  // template 側は ready/pending/failed を処理し、解放権は保持しない。
}
```

これは未実装の DSL 案。camera を取得する module は、取得開始前に release 関数も用意する。cleanup chunk を unmount 時に初めて import し、取得失敗によって destructor が不在になる設計にはしない。compiler は owner の終了経路へ release を結び付け、取得処理と合わせて依存として chunk manifest に載せる。

`Owned<MediaStream>` のような client の生リソースは snapshot に載せない。server の DB connection 等は server の request / streaming の寿命に属し、client の unmount へ移送しない。scope ID の再利用でも解放責任を新しい owner へ付け替えない。component の DOM move は寿命の終了と区別し、mount adapter が確定した unmount を通知する。
