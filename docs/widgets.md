# widget を使う

Isle の widget は、Custom Element の Shadow DOM に SSR HTML と分割コードを読み込みます。別サイトへ複数配置でき、widget ごとの状態・フォーム・CSS を分離します。iframe は使いません。

## 公開デモを埋め込む

次の HTML を埋め込み先のページに追加します。ビルド環境なしで試せます。デモの保存操作は画面へ反映するだけで、DB には永続化しません。

```html
<isle-widget
  src="https://isle-widget.mizchi.workers.dev/"
  role="region" aria-label="Work planner"
  width="640" height="640" loading="lazy"
  style="display:block;width:640px;height:640px;max-width:100%;overflow:auto;contain:layout paint style;border:0;box-sizing:border-box"
>
  <a href="https://isle-widget.mizchi.workers.dev/">Open Work planner</a>
</isle-widget>
<script type="module"
  src="https://isle-widget.mizchi.workers.dev/widget.js"
  crossorigin="anonymous"></script>
```

**寸法 CSS は最初の HTML に含めてください。** Custom Element の `width` / `height` 属性だけでは領域を予約できません。上の例はコード到着前から640×640pxを確保し、狭い親では幅だけ縮めます。内容は内部でスクロールし、高さを自動変更しません。

`loading="lazy"` は viewport の200px手前で descriptor の取得を始めます。すぐ使う配置は `loading="eager"` にします。この属性は widget の取得開始の指定で、内部コードの `loading: 'eager'` とは別です。

同じページに複数置く場合は、タグを必要な数だけ追加します。同じ SDK の module script は一つで構いません。状態や close の影響は widget ごとに分離されます。JavaScript が無効な場合は固定領域内にリンクが残ります。

## shared と standalone を選ぶ

| 配布モード | 動作 | 選ぶ場面 |
|---|---|---|
| shared（既定） | ページ内で同じ版・ABI の runtime を一つにします | 複数 widget の共通コードを共有するとき |
| standalone | 配布物自身の runtime を使います | ページ側の共有 runtime と独立して動かすとき |

shared は runtime の版を文字列の完全一致で照合します。patch の違いも拒否し、同じ family の ABI や diagnostics / profile 設定の違いも拒否します。不一致の SDK は vendor の取得・タグ定義を始めず、すでに動いている widget は維持します。standalone へ自動的に切り替わることはありません。

standalone は共有 pool に参加しないため、別の版の shared と併用できます。分割チャンクと必要な API を含む配布ディレクトリを配信する方式です。異なる standalone 版を同じページに置くときは、版ごとに異なるタグ名でビルドします。同じ Window で定義済みのタグを別の版へ差し替えることはできません。

公開デモの standalone は以下から使えます。

```js
import { renderWidgetEmbed } from './lib/widget.mjs';

const html = renderWidgetEmbed({
  src: 'https://isle-widget.mizchi.workers.dev/standalone/',
  runtime: 'standalone',
  title: 'Work planner', width: 640, height: 640,
});
```

この helper はリポジトリの Node 側で使います。`<isle-widget-standalone>` と `/standalone/widget.js` を参照するタグを生成します。`runtime` は既定のタグ名を選ぶ指定で、配信 URL も caller が standalone のものに変えます。

```sh
just widget-embed https://isle-widget.mizchi.workers.dev/ 640 640
just widget-embed https://isle-widget.mizchi.workers.dev/standalone/ 640 640 standalone
```

CLI は HTML を標準出力します。width / height は1〜8192の整数 CSS pixel を指定します。`auto` や百分率は受け付けません。

## 自分のアプリを widget にする

[最初の Counter](getting-started.md)の `isle()` に `widget` を追加します。以下は plugin オプションの抜粋です。

```js
widget: {
  runtime: 'shared',
  tagName: 'my-counter',
  descriptorFile: 'widget.json',
  loaderFile: 'widget.js',
  template: '<section><!--isle:ssr--></section>',
  css: ':host{color:#182b3b}section{font:18px/1.6 system-ui;padding:16px}button{font:inherit;min-height:44px;padding:8px 16px}',
},
```

`template` は `<!--isle:ssr-->` を一つ含む HTML fragment です。`widget.css` は Shadow DOM 内へ出力します。ページの stylesheet は Shadow DOM 内に届かないため、widget 用 CSS を明示します。通常の CSS による描画で、`inline(css)` や専用 CSS 最適化構文はまだ使えません。

```sh
pnpm exec vite build --config examples/hello/vite.config.mjs
```

`dist-hello/` に、通常ページに加えて `widget.js`、`widget.json`、必要な assets を生成します。Counter だけなら server API は不要です。配布先が `https://cdn.example/counter/` なら、次のようにタグ名・配信 URL を指定します。URL は自分の配信先へ置き換えてください。

```js
renderWidgetEmbed({
  src: 'https://cdn.example/counter/',
  tagName: 'my-counter',
  title: 'Counter', width: 320, height: 240,
});
```

独立配布にする場合は `widget.runtime: 'standalone'` に変えます。独自の `tagName` はそのまま利用でき、helper 側も同じ名前に合わせます。shared と standalone を両方提供する場合は、別の出力ディレクトリ・タグ名でビルドしてください。[Worker の例](../examples/worker-widget/build.mjs)は両方を生成しています。

版の既定値はルートの `package.json.version` です。配布版を明示する場合は `widget.runtimeVersion` を指定します。同じ版を名乗る配布物には同じ runtime 実装・ABI を使ってください。

descriptor は SDK と同じビルドのものを配信します。runtime の版・配布モードが一致しなければ HTML の展開前に拒否し、取得した mount module も mount 前に照合します。

## SDK と descriptor を別パスへ置く

ファイル名やサブディレクトリは変更できます。`src` の代わりに descriptor と loader の URL を明示します。

```js
renderWidgetEmbed({
  descriptorURL: 'https://cdn.example/pkg/components/counter.json',
  loaderURL: 'https://cdn.example/pkg/sdk/counter.js',
  tagName: 'my-counter',
  href: 'https://cdn.example/pkg/',
  title: 'Counter', width: 320, height: 240,
});
```

URL とタグ名はビルド設定に合わせます。descriptor 内の module / preload / action の相対 URL は、埋め込み先のページではなく descriptor 自身を基準に解決します。アプリ固有のファイルを同じ相対配置で配信できます。

## 自分で mount・解除する

既存の container に ShadowRoot を作り、SDK の `mountWidget()` を呼べます。次はブラウザー側の module です。

```html
<div id="counter" style="width:320px;height:240px;max-width:100%;overflow:auto"></div>
<script type="module">
  try {
    const sdk = await import('https://cdn.example/counter/widget.js');
    const root = document.querySelector('#counter').attachShadow({ mode: 'open' });
    const controller = await sdk.mountWidget(root, 'https://cdn.example/counter/widget.json', {
      onError: error => console.error(error),
    });
    // 画面から取り外すときに controller.close() を呼びます。
  } catch (error) {
    console.error('Widget を読み込めませんでした', error);
  }
</script>
```

この場合、寸法と解除のタイミングは caller が管理します。`close()` は listener と所有権を解放し、表示中の HTML は残します。同じ root へ同時に二重 mount はできません。待機中の読み込みも中止したい場合は `signal` に AbortController の signal を渡します。SDK を import すると、その配布物の Custom Element も定義されます。

## 配信と server action

別 origin から取得する JS・descriptor は CORS に対応させます。action や非同期検証を使う widget は、provider の API を `widget.actionBaseURL` に指定し、その API 側にも埋め込み先を許可する CORS と認可が必要です。widget の RPC は Cookie を送らない構成です。通常ページの同一 origin の認証をそのまま移す指定ではありません。

Web Component の JS は埋め込み先ページの権限で実行されます。Shadow DOM は DOM / CSS のスコープなので、信頼する provider のコードを埋め込んでください。CSP を設定している親ページでは、配信 origin を script-src / connect-src に許可し、現在使っている inline style にも対応させます。

Cloudflare Workers のサンプルは以下で確認できます。

```sh
just widget-dev
```

別のターミナルから親ページを起動します。

```sh
just widget-host
```

<http://localhost:8788/> が、<http://127.0.0.1:8787/> の widget を埋め込みます。配備・API・CSP の設定は [Workers の手順](worker-widget.md)を参照してください。Cloudflare を使わない構成は [Node の配信例](../examples/portable-widget/server.mjs)にあります。

## 読み込めないとき

| 症状 | 確認すること |
|---|---|
| タグが初期リンクのまま | SDK の404・CORS・CSP・import の version / ABI エラーを確認します |
| `data-widget-status="error"` | タグの `isle:error` の detail と descriptor / module の応答を確認します |
| 別の版の SDK が拒否された | ページ内の shared を同じ版に揃えるか、別タグの standalone を明示的に使います |
| standalone のタグが定義されない | SDK・タグ名・descriptor を同じ配布モードに揃えます |
| 予約領域がなく、読み込みでページが動く | 初期 HTML の寸法 CSS と、それを上書きする親の style を確認します |
| 保存だけ失敗する | `actionBaseURL`、API の CORS、入力制約、server policy を確認します |

共有 SDK からは `runtimeIdentity` と `sharedRuntimeInfo()` を取得できます。SDK 自体の import が拒否される場合は、上の命令的 mount のように import の例外を扱います。タグ定義前の失敗は `isle:error` の通知より前に起きます。

[ユーザーガイド](README.md) · [配布の詳細設計](widget-architecture.md) · [Workers の手順](worker-widget.md)
