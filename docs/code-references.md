# CodeRef と manifest による読み込み制御

QRL に相当する抽象として、**チャンク URL・export 名・捕捉する状態スロット**の組を CodeRef と呼びます。[Qwik QRL](https://qwik.dev/docs/advanced/qrl/) の、コードの配置と export と lexical capture をシリアライズする考え方を参考にしています。Isle では専用文法の handler から参照を生成し、ユーザーに `$` 関数や手作業の chunk 分割を要求しません。

## 参照と解決

```js
import { codeRef, encodeCodeRef, decodeCodeRef, createCodeResolver } from '../runtime/code-ref.mjs';

const ref = codeRef('./counter.js', 'run', [2, 0]);
encodeCodeRef(ref); // ./counter.js#run[2,0]
const saved = decodeCodeRef('./counter.js#run[2,0]');
const resolver = createCodeResolver(registryURL);
const handler = await resolver.resolve(saved);
```

実体は `[url, symbol, captures[]]` の tuple です。`codeRef` と decoder は tuple と capture 配列を freeze します。`CodeRef<F>` は export の関数型を保持する TypeScript の型です。`resolve` は callable export を返し、呼び出しは行いません。同じ resolver では同一 URL の import を共有し、別の export を解決しても再取得しません。失敗した import Promise は resolver の cache から除去します。ブラウザー自身の ESM cache は標準の挙動に従います。

URL は呼び出し元が渡す基準 URL で解決します。browser の暗黙の module 位置や document の位置に依存させません。HTTP(S) と file URL に対応し、Node の native ESM でも利用できます。manifest の参照を解決するときは、その manifest の URL を渡します。Isle の runtime 内では、registry を定義した module の `import.meta.url` を使います。

空の URL、曖昧な fragment、関数名でない export 名、不正・重複した capture index を拒否します。export は own property で callable であることを確認します。任意 JavaScript の closure graph を保存する機能ではなく、現在の捕捉対象は primitive の props/state に限定します。

## 捕捉と状態更新

compiler/codegen は handler の read/write と DOM update の依存から必要な slot を計算します。例えば island の保存値が `[a, b]`、CodeRef の capture が `[1]` なら、handler が受け取る値は `[b]` です。handler 内の `set(0, next)` は元の slot 1 に対応します。

更新は既存の transaction で stage し、型・index・owner の生存を確認してから対応する保存値と DOM に反映します。他の slot を書き換えません。`run(values, set, text, attribute, remote, event)` の位置引数 ABI を維持し、`values` は CodeRef の捕捉順に並ぶ local 配列になります。snapshot は v2 のままですが、schema hash に CodeRef の生成規則を含めています。

HTML のイベント属性は引き続き `scopeId|handlerId` という小さい識別子です。import する URL と export は compiler が生成する registry から解決します。イベント属性の文字列を module URL として import しません。初期 loader の bootstrap は同じコード参照計画を native import にコンパイルし、汎用 resolver は遅延 runtime に含めます。並列取得用の URL は、manifest から生成する後述の inert な HTML metadata にも置きます。

## loading policy

production では同じ component の小さな handler を共有 chunk にまとめます。`handlerChunkBytes` の既定値は1024で、UTF-8 の生成 handler source の合計 byte 数を上限にします。minify / gzip 後のサイズではありません。component の境界は越えず、schema Form と上限を超える handler は独立したままです。`handlerChunkBytes: 0` で従来の entry ごとの分割に戻せます。

例えば `WorkItem.increment` / `reset` / `lock` / `save` が共有 chunk に入っても、manifest の ID、capture、source、event、async、action は個別に保持します。CodeRef の URL は共通になり、export 名で関数を区別します。取得・評価しただけで他の handler を呼ぶことや、他の scope を復元することはありません。開発時は従来の個別 module URL を使います。

小さな entry を一度に使うアプリでは、初回の取得で少し多くの code を受け取る代わりに、次の操作の通信を省けます。Form のように依存 runtime が大きいものを、source byte 数だけを見て小さな handler に混ぜません。生成計画は [chunk-plan.mjs](../lib/chunk-plan.mjs)、契約は [chunk-plan.d.mts](../lib/chunk-plan.d.mts) です。

`on click increment { ... }` のように境界を命名できます。参照 ID は `Counter.increment` になり、manifest のソース位置・捕捉・サイズと計測を同じ名前で追えます。[チャンクとプロファイル](chunk-profiling.md) を参照してください。

Vite option または mount に `loading` を指定します。既定値は `auto` です。compiler/build pass が入力・送信イベントの依存閉包と最終 gzip サイズから、予算内の modulepreload を選びます。auto は module の評価・snapshot 復元・resource setup を前倒ししません。[計画と診断](resolution-optimizer.md)を参照してください。

```js
isle({
  entry: '/absolute/path/app.isle',
  mounts: [
    { component: 'Counter', props: { initial: 37 }, label: 'Counter', loading: 'eager' },
    { component: 'Editor', props: { id: 'demo', initial: 'Draft' }, label: 'Editor', loading: 'lazy' },
  ],
});
```

| loading | 操作前の処理 | snapshot 復元・handler 実行 |
|---|---|---|
| `auto` | 入力・送信イベントの依存を追加 gzip 予算内で modulepreload | 操作時 |
| `lazy` | 初期 loader のみ | 操作時 |
| `preload` | `link rel="modulepreload"` で対象 module を先読み | 操作時 |
| `eager` | 対象 module の評価と export 参照の準備 | 操作時 |

`eager` は module の top-level を評価しますが、参照した export 関数自体を呼びません。生成 handler は top-level に component の初期化を持ちません。eager/preload のどちらでも island の状態は未展開です。eager にした Counter のために必要な共通 runtime を含め、Editor のような未指定の動的 child は遅延のままにします。

production の eager entry は、生成 registry が callable export を静的に参照し、bootstrap が runtime の import Promise を起動時に保持します。イベント中に同じ code を改めて import する経路を省きます。Document に runtime を接続するのは操作時で、起動時に `resume()` や handler は呼びません。同期 event handler の契約ではなく、実行は従来の queue を通ります。準備中の import 失敗は未処理の rejection にせず、実際の操作で `onError` に渡します。

`ClientRegistry` の末尾には production eager entry の callable map を省略可能な第6要素として置きます。これは生成 JS 内の参照で、CodeRef の3要素や snapshot v2 の保存形式は変えません。5要素の registry、lazy / preload、開発時は通常の resolver 経路を使用できます。不正な prepared export は snapshot 復元前に拒否します。

global の `loading` を mount が上書きできます。同じ component の code は共有するため、複数の有効 mount で policy が違う場合は `eager > preload > lazy` の順で統合します。状態の共有は行いません。`mode: 'ssr'` は loading より優先し、SSR 専用 mount しかなければ manifest も JS も出力しません。

開発時は同じ policy を公開 module URL に適用します。production では下記 manifest から最終 URL を決定します。Vite の `base` による配信 prefix と `html.cspNonce` を先読みタグにも反映します。

## 操作時の並列取得

`lazy` のままでも、最初のイベントで runtime と対象 handler の必要 module を並列取得します。ビルド時に manifest の `requires` と静的 `imports` をたどり、URL を重複排除して次の HTML を生成します。`dynamicImports` はたどらず、無関係な handler は取得しません。

```html
<template data-isle-load="1">
  <link rel="modulepreload" href="/assets/runtime-HASH.js"
        crossorigin="anonymous" data-isle-code="Counter.increment Editor.save">
  <link rel="modulepreload" href="/assets/counter-HASH.js"
        crossorigin="anonymous" data-isle-code="Counter.increment">
  <link rel="modulepreload" href="/assets/editor-HASH.js"
        crossorigin="anonymous" data-isle-code="Editor.save">
</template>
```

`data-isle-load="1"` は HTML metadata の形式バージョンです。link の `data-isle-code` は、それを必要とする handler ID の空白区切り列です。URL は生成時に escape し、配信 base と nonce も反映します。

template の内容は初期表示では通信を始めません。loader は対象 scope が生存しイベントが受け付けられたとき、該当する link だけを head へ移します。同じ link を再利用するため、runtime や共通依存を複数 scope の操作で重ねて登録しません。`eager` / `preload` で起動時に取得する module は、操作時の metadata から除きます。manifest JSON の追加 request や parse はありません。

`modulepreload` は document の module map を準備し、handler の top-level を評価しません。通常の import と dispatch が評価・復元・実行を担当します。runtime の取得待ちに dispose / close された scope は、code を取得済みでも実行しません。metadata がない adapter や `modulepreload` を扱わない browser でも、既存の動的 import 経路を使います。先読みの成否を待って dispatch を止める処理はありません。([HTML modulepreload](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload)、[template の inert な内容](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element))

ブラウザーによる静的依存の再帰取得は任意なので、production では manifest の静的 closure を全てリンクとして明示します。開発時は公開 runtime / handler URL を並列取得し、Vite が変換する import 先の取得は browser に任せます。未操作の scope の状態をまとめて復元する機能ではありません。

## 生成 manifest

production build は `isle.manifest.json` を出力します。Vite の `.vite/manifest.json` と併用し、Vite/Rolldown の `emitFile` が確定した hash 付きファイル名を使います。

```json
{
  "version": 1,
  "references": {
    "isle:resume": {
      "ref": ["/assets/isle-resume-HASH.js", "resume", []],
      "chunk": "assets/isle-resume-HASH.js",
      "requires": [],
      "kind": "runtime"
    },
    "Counter.h0": {
      "ref": ["/assets/Counter.h0-HASH.js", "run", [0]],
      "chunk": "assets/Counter.h0-HASH.js",
      "requires": ["isle:resume"],
      "kind": "handler",
      "schemaId": "COMPONENT_HASH"
    }
  },
  "chunks": {
    "assets/isle-resume-HASH.js": { "url": "/assets/isle-resume-HASH.js", "imports": [], "dynamicImports": ["assets/Counter.h0-HASH.js"] },
    "assets/Counter.h0-HASH.js": { "url": "/assets/Counter.h0-HASH.js", "imports": [], "dynamicImports": [] }
  },
  "loading": { "eager": ["Counter.h0"], "preload": [] },
  "buildId": "MANIFEST_HASH"
}
```

`requires` は参照を使うために必要な参照、`imports` は chunk の静的依存です。先読み plan はこの2つをたどって URL を重複排除します。`dynamicImports` を無条件にはたどりません。ESM の循環した静的 import も一度ずつ処理します。

生成 HTML の eager/preload タグも、この manifest と同じ確定済み plan から作ります。初期 loader に manifest JSON の fetch や parser を載せません。固定名の manifest は更新を確認できる cache policy にし、hash 付き chunk は immutable にできます。比較 server は manifest を `no-store` で配信します。

## 別の adapter から使う

```js
import { planCodeLoad, eagerLoad } from '../runtime/manifest.mjs';

const manifestURL = new URL('./isle.manifest.json', pageURL);
const manifest = await (await fetch(manifestURL)).json();
const plan = planCodeLoad(manifest, ['Counter.h0']); // references と module URL の列
await eagerLoad(manifest, { baseURL: manifestURL }); // manifest.loading.eager を使用
// export を解決するまで。handler の呼び出し・snapshot の復元は行わない。
```

`eagerLoad` は `ids` で対象を上書きでき、`importModule` で import adapter を渡せます。通常は標準の動的 import を使い、静的 module 依存の取得は ESM に任せます。file 配信の manifest を Node から読む場合は、build の `base: './'` と file URL を利用できます。

契約は [code-contracts.d.ts](../lib/code-contracts.d.ts)、browser/Node 共通の実装は [code-ref.mjs](../runtime/code-ref.mjs) と [manifest.mjs](../runtime/manifest.mjs)、Vite との接続は [code-manifest.mjs](../lib/code-manifest.mjs) です。

## 検証とサイズ

codec の往復、基準 URL、複数 export の import 共有、native file ESM、捕捉 slot の project/commit、manifest の依存選択、循環、欠落依存、生成 export の解決を Node で検査します。操作時の closure が inert であること、静的依存だけを含むこと、起動時に取得する module と重複しないことも検査します。Playwright では runtime の応答を止めても handler の取得が完了すること、その間は評価・復元がゼロであること、dispose 後は実行しないこと、別 scope の操作で同じ handler を再取得しないことを production / development で確認します。既存の preload/eager 検査と SSR 専用の JS ゼロ検査も維持します。

並列取得を導入する前の Counter fixture は、profile 無効で初期 JS が 698 bytes gzip、全操作後の asset 合計が 3,693 bytes gzip でした。Counter の[サイズ比較の記録](../benchmarks/results/latest.md)と[CodeRef 導入前](../benchmarks/results/history/before-code-ref.json)を保存しています。初回操作の時間は、64項目とフォームを持つ[ダッシュボードの測定](../benchmarks/dashboard/README.md)で比較します。INP の測定ではありません。
