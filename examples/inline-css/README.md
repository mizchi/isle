# Inline CSS and a checked Grid

Four equal tracks contain border-box cells with a minimum width of 40px and a height of 40px. The component's `<style>` is scoped and delivered as static CSS. A production build checks widths 160–1280px and heights 80–900px with Z3, then writes `isle.layout.json`. It emits no application JavaScript or solver assets.

```sh
just inline-css-check
pnpm exec vite --config examples/inline-css/vite.config.mjs
```

Change the contract minimum from 160 to 120: the production build fails. In the [playground](https://mizchi.github.io/isle/playground/), select Inline CSS to inspect the UNSAT proof, overflow witness and responsive version. See [the guide](../../docs/inline-css.md) for the profile and assumptions.

[variables.isle](variables.isle) uses inherited `--cell` and responsive `--columns` values. Select **CSS variables · responsive proof** in the playground. The checked build keeps native CSS variables and emits no resolver JavaScript. [Semantics and limits](../../docs/css-variables.md).

4つの等幅 track に、最小幅40px・高さ40pxの箱を配置します。`<style>` を component 単位にスコープし、静的 CSS として配信します。production build は宣言した幅・高さ範囲を Z3 で検査し、証明書を生成します。最小幅を120pxに変更するとビルドは失敗します。playground では反例と responsive 修正版を比較できます。

[shorthands.isle](shorthands.isle) puts an intentional font-weight override in a separate rule. [rejected/shorthand.isle](rejected/shorthand.isle) mixes `font-weight` and `font` in one rule and fails with `E_CSS_SHORTHAND_CONFLICT`. Paste either file into the playground. [Policy and supported families](../../docs/css-shorthands.md).

略記の暗黙リセットも検出します。受理する例は意図的なfont-weightの上書きを別ルールに分け、拒否する例は同一ルール内で `font` がweightをリセットします。両方ともPlaygroundへ貼り付けて試せます。
