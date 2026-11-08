# 親所有イベントと SafeGrid の完結例

親が配列・filter・eventを所有し、universalな子へボタンをchildrenとして投影します。見出し・余白にはhandlerを付けません。

[導入手順](getting-started.md)に従い、配布されたpreview tgzとVite 8.3.5以上をアプリへ追加します。Node.js 24+ とpnpmを使い、MoonBitの導入は不要です。以下の4ファイルを同じディレクトリへ置きます。

record配列のstateは、schemaと `state reviews: Review[]` の注釈が必要です。投影するbuttonのCSSとresetは呼び出し元の親へ記述します。内容寸法は信頼する十分な境界としてViteのboxesへ渡します。

## app.isle

```text
schema Review { id: string; title: string; done: boolean; }

component ReviewCard(id: string, title: string, done: boolean, children: RenderFragment) {
  layout SafeGrid {
    requires { inline-size: 160px..960px; block-size: 96px..960px; }
    ensures { overflow-inline: fit; overflow-block: fit; }
  }
  <article class="card" data-review={id}>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .card { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 24px 16px 32px; gap: 3px; block-size: 96px; padding: 8px; border: 1px solid #9ca3af; background: #ffffff; }
      .title { font: 16px/24px system-ui; overflow-wrap: anywhere; }
      .status { font: 14px/16px system-ui; }
    </style>
    <h2 class="title">{title}</h2>
    <p class="status">{done ? "Done" : "Open"}</p>
    {children}
  </article>
}

client component ReviewQueue() {
  state reviews: Review[] = [
    { id: "a", title: "Read proposal", done: false },
    { id: "b", title: "Check constraints", done: true },
    { id: "c", title: "Ship demo", done: false }
  ];
  state filter = "all";
  derive visible = reviews.filter(review => filter === "all" || (filter === "done" ? review.done : !review.done));
  derive openCount = reviews.filter(review => !review.done).length;
  event showAll(e: EventSnapshot<MouseEvent>) { filter = "all"; }
  event showOpen(e: EventSnapshot<MouseEvent>) { filter = "open"; }
  event showDone(e: EventSnapshot<MouseEvent>) { filter = "done"; }
  event addReview(e: EventSnapshot<MouseEvent>) {
    reviews = reviews.length < 4 ? reviews.concat([{ id: "d", title: "New review", done: false }]) : reviews;
  }
  event toggleReview(e: EventSnapshot<MouseEvent>, id: string) {
    reviews = reviews.map(review => review.id === id ? { id: review.id, title: review.title, done: !review.done } : review);
  }
  layout SafeGrid {
    requires { inline-size: 320px..960px; block-size: 640px..960px; }
    ensures { overflow-inline: fit; overflow-block: fit; }
  }
  <main class="queue">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .queue { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 32px 40px 24px 40px minmax(0, 1fr); gap: 8px; inline-size: 100%; block-size: 100%; padding: 16px; background: #f8fafc; color: #111827; }
      .heading { font: 22px/32px system-ui; }
      .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: 40px; gap: 8px; }
      .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: 24px; gap: 8px; }
      .stat { display: grid; grid-template-columns: minmax(0, 1fr) 24px; grid-template-rows: 24px; gap: 4px; }
      .stat-label { font: 14px/24px system-ui; }
      .count { font: 14px/24px system-ui; }
      .action { appearance: none; display: block; box-sizing: border-box; min-width: 0; min-height: 0; padding: 0; border: 1px solid #9ca3af; block-size: 40px; font: 14px/38px system-ui; background: #ffffff; }
      .cards { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 96px; gap: 8px; align-content: start; }
      .toggle { appearance: none; display: block; box-sizing: border-box; min-width: 0; min-height: 0; padding: 0; border: 1px solid #9ca3af; block-size: 32px; font: 14px/30px system-ui; background: #f1f5f9; }
      @media (min-width: 600px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
    <h1 class="heading">Review queue</h1>
    <div class="filters">
      <button class="action" type="button" on:click={showAll}>All</button>
      <button class="action" type="button" on:click={showOpen}>Open</button>
      <button class="action" type="button" on:click={showDone}>Done</button>
    </div>
    <div class="stats">
      <div class="stat"><span class="stat-label">Total reviews</span><output class="count" aria-label="Total reviews">{reviews.length}</output></div>
      <div class="stat"><span class="stat-label">Open reviews</span><output class="count" aria-label="Open reviews">{openCount}</output></div>
    </div>
    <button class="action" type="button" on:click={addReview}>Add review</button>
    <div class="cards">
      <For each={visible}>{(review) =>
        <ReviewCard key={review.id} id={review.id} title={review.title} done={review.done}>
          <button class="toggle" type="button" on:click={(e) => toggleReview(e, review.id)}>Toggle</button>
        </ReviewCard>
      }</For>
    </div>
  </main>
}
```

## vite.config.mjs

```js
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { isle } from '@isle/prototype/vite';

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('.',import.meta.url)),
  plugins: [isle({
    entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
    mounts: [{ component: 'ReviewQueue', props: {} }],
    wrapMounts: false,
    loading: 'lazy', diagnostics: false, profile: false,
    mode: mode === 'ssr' ? 'ssr' : 'resume',
    layout: {
      reset: ['./reset.css'],
      viewport: { min: 320, max: 960, height: { min: 640, max: 960 } },
      boxes: {
        '.heading': { minInlineSize: 160, minBlockSize: 32 },
        '.action': { minInlineSize: 64, minBlockSize: 38 },
        '.count': { minInlineSize: 16, minBlockSize: 24 },
        '.stat-label': { minInlineSize: 96, minBlockSize: 24 },
        '.title': { minInlineSize: 128, minBlockSize: 24, wrap: 'anywhere' },
        '.status': { minInlineSize: 48, minBlockSize: 16 },
        '.toggle': { minInlineSize: 64, minBlockSize: 30 }
      }
    }
  })],
  server: {host:'127.0.0.1',port:4341,strictPort:true},
  preview: {host:'127.0.0.1',port:4341,strictPort:true},
  build: { target: 'es2023', outDir: mode === 'ssr' ? 'dist-ssr' : 'dist', emptyOutDir:true }
}));
```

## index.html

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lexical review actions</title></head><body><!--isle:ssr--></body></html>
```

## reset.css

```css
html, body { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); inline-size: 100%; block-size: 100%; box-sizing: border-box; margin: 0; padding: 0; }
html { overflow: hidden; }
```

## 実行と検査

```sh
pnpm exec vite
pnpm exec vite build
pnpm exec vite build --mode ssr
```

開発サーバーは <http://127.0.0.1:4341/>。通常buildはlayoutを検査してresume用chunkを生成し、SSR buildはHTML/CSSだけを生成します。全7操作と見出し・余白の不活性、4幅での列数、root保持、SSR JS 0は[回帰シナリオ](../evals/scenarios/lexical-events/README.md)で検査しています。

`requires`は親から受ける割当、`ensures`は対応するCSS部分集合と信頼する内容寸法の下で検査する義務です。親子の契約の区別と保証範囲は[レイアウト契約](layout-contract-language.md)を参照してください。別のclient ownerへ可変なfragmentや親イベントを渡すことはできません。
