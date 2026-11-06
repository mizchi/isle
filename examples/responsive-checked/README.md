# Checked responsive layout

## English

This example checks the delivered document during a Vite production build. It uses four Grid columns at 640px and above, and two below it. The declared domain is **320–1280px wide × 240–900px high**, including fractional sizes between breakpoints.

In an app using the npm package, import `isle` from `@isle/prototype/vite` and copy the `layout` options from [vite.config.mjs](vite.config.mjs). Paths in `css` and `reset` are relative to the `.isle` entry. These styles are delivered automatically; do not add another stylesheet link.

```js
isle({
  entry, mounts: [{ component: 'ResponsiveBoard', props: {} }],
  wrapMounts: false,
  layout: {
    css: './app.css', reset: ['./reset.css'],
    viewport: { min: 320, max: 1280, height: { min: 240, max: 900 } },
    boxes: {
      '.title': { minInlineSize: 200, minBlockSize: 26 },
      '.tile': { minInlineSize: 24, minBlockSize: 24 },
      '.note': { minInlineSize: 200, minBlockSize: 18 },
    },
  },
})
```

Run your app's usual Vite build. A violation or unknown analysis fails the build; success emits `isle.layout.json`, bound to the output HTML by SHA-256. The report is a build artifact and is never fetched by the UI. This example emits **zero browser JS**.

In this checkout: `just example responsive-checked` starts the demo; `just layout-build` checks the production build; `just layout-check` also compares symbolic sizes with Chromium. Try changing `.tile` to `min-width: 160px`: the two-column layout at 320px cannot satisfy it, and the build reports a counterexample.

Content bounds are trusted declarations for every allowed input and font. Pixel rounding, ink overflow and analyzer soundness are outside this result. The profile requires a single owned document and the generated loader. Bounded dynamic structures and native scrollbar profiles are demonstrated in [the dynamic example](../responsive-dynamic/). Arbitrary setup scripts, widgets and unknown native controls still need adapters; unsupported features fail closed. See [scope and limits](../../docs/layout-checking.md).

## 日本語

配信する HTML/CSS を Vite の production build で検査する例。640px 以上で4列、未満で2列になり、**幅320–1280px × 高さ240–900px** の連続領域を検査する。ブレークポイント間の小数の寸法も対象とする。

npm パッケージから使う場合は `@isle/prototype/vite` の `isle` に上の設定を渡す。`css`・`reset` は `.isle` entry からの相対パスで、指定した CSS を自動配信する。別の stylesheet link は追加しない。

通常の Vite build を実行すると、違反または解析不能で失敗する。成功時は HTML の SHA-256 を持つ `isle.layout.json` を出力する。このレポートを UI が取得することはない。この例のブラウザー JS は0。

この checkout では `just example responsive-checked` で表示し、`just layout-build` でビルドする。`just layout-check` は解析値と Chromium の寸法も照合する。`.tile` を `min-width:160px` に変更すると、幅320pxの2列配置を満たせず、ビルドが反例を返す。

内容・font のサイズ上界は利用者の信頼する宣言であり、ピクセル丸め・描画上のはみ出し・判定器の健全性の証明は含まない。単一の所有する document と標準 loader を要求する。上限のある動的構造と scrollbar profile は[動的な例](../responsive-dynamic/)を参照。任意 setup・widget・未知の native control 等には adapter が必要で、解析不能を成功扱いしない。[保証範囲](../../docs/layout-checking.md)を参照。
