# CSS ベースライン(chromium 153.0.8010.12、firefox 157.0、webkit 27.2)

違うものは 18 / 42 項目。「エンジンの前提」は css-verifier が今置いている値です。

| 分類 | 項目 | エンジンの前提 | chromium | firefox | webkit | 違い |
|---|---|---|---|---|---|---|
| page | body margin | 8px / 8px | 8px / 8px | 8px / 8px | 8px / 8px |  |
| page | default font family and size | ua-default / 16px | "Times New Roman" / 16px | serif / 16px | -webkit-standard / 16px | **違う** |
| page | line-height normal of Roboto 16px (px) | (font metrics) | 19 | 19 | 19 |  |
| page | classic scrollbar width (overflow: scroll) | (scrollbar profile) | 0 | 0 | 0 |  |
| page | canvas color (light) | canvastext black | rgb(0, 0, 0) | rgb(0, 0, 0) | rgb(0, 0, 0) |  |
| text | h1 size and weight | 2em / bold / 0.67em | 32px / 700 / 21.44px | 32px / 700 / 21.44px | 32px / 700 / 21.4375px | **違う** |
| text | h3 size and weight | 1.17em / bold / 1em | 18.72px / 700 / 18.72px | 18.7188px / 700 / 18.7188px | 18.719999px / 700 / 18.71875px | **違う** |
| text | p margin | 1em / 1em | 16px / 16px | 16px / 16px | 16px / 16px |  |
| text | small and strong | smaller / bolder | 13.3333px / 700 | 13.3281px / 700 | 13.333333px / 700 | **違う** |
| text | ul padding-left and margin | 40px / 1em / disc | 40px / 16px / disc | 40px / 16px / disc | 40px / 16px / disc |  |
| text | dd margin-left | 40px | 40px | 40px | 40px |  |
| text | th weight and alignment | bold / center (-internal) / 1px | 700 / center / 1px | 700 / center / 1px | 700 / center / 1px |  |
| text | table border-spacing | 2px / separate | 2px / separate | 2px / separate | 2px / separate |  |
| controls | button font | Arial / 13.33px / 400 / normal | Arial / 13.3333px / 400 / normal | sans-serif / 13.3281px / 400 / normal | -webkit-standard / 16px / 400 / normal | **違う** |
| controls | button box | inline-block / border-box / 1px / 6px / 2px | inline-block / border-box / 1px / 6px / 2px | inline-block / border-box / 1px / 4px / 2px | inline-block / border-box / 2px / 6px / 2px | **違う** |
| controls | button min-width as a flex item | auto | auto | auto | auto |  |
| controls | button as a flex item with a 120px basis and a long label | grows to its min-content | 202.72 | 210.8 | 254.56 | **違う** |
| controls | button inherits the page font-family? | no (UA control font) | Arial | sans-serif | -webkit-standard | **違う** |
| controls | text input box | inline-block / content-box / 1px / 2px / 2px | inline-block / content-box / 1px / 2px / 2px | inline-block / content-box / 1px / 2px / 2px | inline-block / content-box / 1px / 1px / 2px | **違う** |
| controls | text input default size | (intrinsic: not modeled) | 185 × 21 | 202 × 22 | 213 × 26 | **違う** |
| controls | text input font | Arial / 13.33px | Arial / 13.3333px | sans-serif / 13.3281px | -webkit-standard / 16px | **違う** |
| controls | search input box-sizing | border-box | border-box | border-box | border-box |  |
| controls | checkbox size and margin | 13 × 13 / 3px 3px 3px 4px | 13 × 13 / 3px 3px 3px 4px | 14 × 14 / 3px 3px 3px 4px | 12 × 12 / 3px 2px | **違う** |
| controls | radio margin | 3px 3px 0px 5px | 3px 3px 0px 5px | 3px 3px 0px 5px | 3px 2px | **違う** |
| controls | range input box | (size) / 2px / 0 / 0 | 129 × 16 / 2px / 0px / 0px | 160 × 20 / 2px / 0px / 0px | 129 × 20 / 2px / 0px / 0px | **違う** |
| controls | select font and box | Arial / 13.33px / (ua) / (ua) | Arial / 13.3333px / 0px / 1px | sans-serif / 13.3281px / 4px / 2px | -webkit-standard / 16px / 0px / 1px | **違う** |
| controls | textarea font | monospace / 13.33px | monospace / 13.3333px | monospace / 12px | -webkit-standard / 16px | **違う** |
| controls | placeholder color | (ua: darkgray) | rgb(117, 117, 117) | color(srgb 0 0 0 / 0.54) | rgb(169, 169, 169) | **違う** |
| controls | fieldset padding, border and min-inline-size | (ua) | 5.6px / 12px / 2px / min-content / 2px | 5.6px / 12px / 2px / min-content / 2px | 5.6px / 12px / 2px / min-content / 2px |  |
| elements | details and summary display | block / list-item | block / list-item | block / list-item | block / list-item |  |
| elements | closed dialog display | none | none | none | none |  |
| elements | svg without a size | 300 × 150 | 300 × 150 | 300 × 150 | 300 × 150 |  |
| elements | img display | inline | inline | inline | inline |  |
| elements | focus outline of a button (focus-visible) | (ua focus ring) | auto / 1px / 0px | auto / 1px / 0px | auto / 3px / 0px | **違う** |
| behaviour | minmax(0,1fr) grid as a shrinking 50% flex item (150px content, 254px wide) | 123 | 123 | 123 | 123 |  |
| behaviour | sticky (no inset) is a stacking context | main | main | main | main |  |
| behaviour | backdrop-filter is a stacking context | main | main | main | main |  |
| behaviour | will-change: opacity is a stacking context | main | main | main | main |  |
| behaviour | will-change: scroll-position is not | menu | menu | menu | menu |  |
| behaviour | backdrop-filter traps a fixed descendant (its top, viewport 600) | 108 | 108 | 108 | 108 |  |
| behaviour | will-change: transform traps a fixed descendant | 108 | 108 | 108 | 108 |  |
| behaviour | will-change: opacity does not | 560 | 560 | 560 | 560 |  |
