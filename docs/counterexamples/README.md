# 反例ギャラリー

各パターンで、わざと違反する小さなページを静的に検査し、報告された反例の viewport で Chromium に描画した画像。赤い実線の枠が報告された箱、点線の枠が状態が変わる前の位置(動いた分が layout shift)。`node tools/counterexample-gallery.mjs` で再生成する。

## A fixed-width box wider than its column

`E_LAYOUT_ITEM_SIZE` — viewport 416 × 690px

> .card requires 480px but receives 384px on inline axis at viewport 416px × 690px

![item-size](item-size-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="card"></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.card{width:480px;height:80px;background:#9cf}
```

</details>

## A label that does not fit its button

`E_LAYOUT_CONTENT` — viewport 672 × 690px

> .label requires 12569/64px but receives 144px on inline axis at viewport 672px × 690px

![content](content-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="bar"><span class="label">Download the annual report</span></div></main>
```

```css
.page{display:grid;grid-template-columns:160px}.bar{display:grid;grid-template-columns:minmax(0,1fr);background:#246;color:#fff;padding:8px}.label{font-size:16px;line-height:24px;white-space:nowrap}
```

</details>

## A grid row too short for its item

`E_LAYOUT_ITEM_SIZE` — viewport 672 × 690px

> .a requires 70px but receives 40px on block axis at viewport 672px × 690px

![rows](rows-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="a"></div><div class="b"></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px 40px;background:#eee}.a{height:70px;background:#fc9}.b{height:30px;background:#9cf}
```

</details>

## A box that makes the page scroll sideways (100vw with a scrollbar)

`E_LAYOUT_ITEM_SIZE` — viewport 672 × 690px

> .hero requires 672px but receives 657px on inline axis at viewport 672px × 690px

![page-overflow](page-overflow-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="hero"></div></main>
```

```css
html{overflow-y:scroll}body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{width:100vw;height:120px;background:#c9f}
```

</details>

## An image whose reserved ratio differs from its file

`E_LAYOUT_IMAGE_RATIO` — viewport 320 × 480px

> .hero reserves the ratio 400/400 but /wide.png is 32×16: its height changes when it loads

![image-ratio](image-ratio-before.png) ![image-ratio](image-ratio-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><img class="hero" src="/wide.png" width="400" height="400" alt=""><p class="after">The text below the image</p></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto;background:#ddd}.after{height:40px;background:#eee}
```

</details>

## A :hover rule that grows a card and pushes the content below

`E_LAYOUT_HOVER_SHIFT` — viewport 320 × 480px

> Hovering .card moves .below (blockStart by 50px at viewport 320px × 480px): a layout shift without an excusing input. Change paint or transform on :hover, or reserve the space

![hover-shift](hover-shift-before.png) ![hover-shift](hover-shift-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="card"></div><div class="below"></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px}.card{height:100px;background:#9cf}.card:hover{height:150px}.below{height:60px;background:#fc9}
```

</details>

## A margin animation that moves the page every frame

`E_LAYOUT_ANIMATION_SHIFT` — viewport 320 × 480px

> Animation drop at 100% on .banner sets a 60px start margin, which moves it (blockStart): a layout shift while it runs. Animate transform (translate) instead of margin

![animation-shift](animation-shift-before.png) ![animation-shift](animation-shift-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="banner"></div><div class="below"></div></main>
```

```css
@keyframes drop{from{margin-top:0}to{margin-top:60px}}.page{display:grid;grid-template-columns:minmax(0,1fr)}.banner{height:60px;background:#f99;animation:drop 1s infinite}.below{height:60px;background:#9cf}
```

</details>

## Carousel slides of different heights

`E_LAYOUT_CAROUSEL_SHIFT` — viewport 320 × 480px

> Switching .c from .s1 to .s2 moves .below (blockStart by 80px at viewport 320px × 480px): slides of different sizes shift the page. Give the slide area a fixed height or aspect-ratio, or stack the slides in one grid cell

![carousel-shift](carousel-shift-before.png) ![carousel-shift](carousel-shift-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><section class="c" aria-roledescription="carousel" aria-label="News"><div class="s1" aria-roledescription="slide"></div><div class="s2" aria-roledescription="slide" hidden></div></section><div class="below"></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.c{display:grid;grid-template-columns:minmax(0,1fr)}.s1{height:100px;background:#9cf}.s2{height:180px;background:#69c}.below{height:60px;background:#fc9}
```

</details>

## Web-font text whose height follows the font

`W_LAYOUT_FONT_SWAP` — viewport 332 × 480px

> .t is set in the web font Roboto (font-display: swap) and takes its height from its text: when the font file arrives the text is laid out again. Use font-display: optional, preload the font, match the fallback metrics (size-adjust, ascent-override, descent-override), or reserve the box's height

![font-swap](font-swap-before.png) ![font-swap](font-swap-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><h1 class="t">A heading set in a web font that wraps onto three lines</h1><div class="below"></div></main>
```

```css
@font-face{font-family:Roboto;src:url(/roboto.ttf);font-display:swap}.page{display:grid;grid-template-columns:300px}.t{font-family:Roboto,serif;font-size:32px;line-height:40px;font-weight:400}.below{height:40px;background:#fc9}
```

</details>

## loading="lazy" on an image above the fold

`W_LAYOUT_LAZY_IN_VIEWPORT` — viewport 320 × 480px

> .hero has loading="lazy" but is in the initial viewport (top 16px at viewport 672px × 690px): it loads later than an eager image; drop loading="lazy" for images above the fold (and consider fetchpriority="high" for the largest one)

![lazy-in-viewport](lazy-in-viewport-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><img class="hero" src="/wide.png" width="800" height="400" loading="lazy" alt=""></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto}
```

</details>

## A square photo stretched by width: 100% and a fixed height

`W_LAYOUT_IMAGE_DISTORTED` — viewport 320 × 480px

> .hero is drawn 640×160px at viewport 672px, but its picture is 120×120 (the file): object-fit: fill stretches it wider. Use object-fit: cover (or contain), or let one size be auto

![image-distorted](image-distorted-before.png) ![image-distorted](image-distorted-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><img class="hero" src="/disc.png" width="120" height="120" alt="A logo"></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:160px}
```

</details>

## A sizes attribute smaller than the rendered width

`W_LAYOUT_SIZES_SMALL` — viewport 320 × 480px

> .hero is laid out 640px wide at viewport 672px but its sizes attribute says 168px: the browser picks a srcset file for the smaller width, so the image is upscaled (blurry). Make sizes match the layout width

![sizes-small](sizes-small-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><img class="hero" src="/w400.png" srcset="/w40.png 40w, /w80.png 80w, /w120.png 120w, /w160.png 160w, /w200.png 200w, /w240.png 240w, /w280.png 280w, /w320.png 320w, /w360.png 360w, /w400.png 400w, /w440.png 440w, /w480.png 480w, /w520.png 520w, /w560.png 560w, /w600.png 600w, /w640.png 640w, /w680.png 680w, /w720.png 720w, /w760.png 760w, /w800.png 800w, /w840.png 840w, /w880.png 880w, /w920.png 920w, /w960.png 960w, /w1000.png 1000w, /w1040.png 1040w, /w1080.png 1080w, /w1120.png 1120w, /w1160.png 1160w, /w1200.png 1200w" sizes="25vw" width="800" height="400" alt=""></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{display:block;width:100%;height:auto}
```

</details>

## A product name cut with an ellipsis

`W_LAYOUT_TRUNCATED` — viewport 320 × 480px

> .t is cut with an ellipsis: its text needs 375.46875px but the box offers 240px at viewport 672px (keep the full text available, e.g. in its accessible name or the page it links to)

![truncated](truncated-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">Wireless noise-cancelling headphones, midnight blue</p></main>
```

```css
.page{display:grid;grid-template-columns:240px}.t{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#eef}
```

</details>

## A two-line clamp that cuts the title

`W_LAYOUT_LINE_CLAMPED` — viewport 320 × 480px

> .t is clamped to 2 lines and its text needs 3 at viewport 672px: the rest of the text is cut off (keep the full text available elsewhere, such as the page the card links to)

![line-clamp](line-clamp-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">A card title that is much longer than the two lines the design allows</p></main>
```

```css
.page{display:grid;grid-template-columns:220px}.t{font-size:16px;line-height:24px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;background:#eef}
```

</details>

## A sticky header wrapped in a box of its own height

`W_LAYOUT_STICKY_INERT` — viewport 320 × 480px

> .h is position: sticky, but its parent .wrap ends at its bottom: it scrolls away like a static box. Make it a child of the scrolling content (or give the parent the height it should stick across)

![sticky-inert](sticky-inert-before.png) ![sticky-inert](sticky-inert-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="wrap"><header class="h"></header></div><div class="content"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.wrap{display:grid;grid-template-columns:minmax(0,1fr)}.h{position:sticky;top:0;height:56px;background:#246}.content{height:1600px;background:repeating-linear-gradient(#fff 0 40px,#eee 40px 80px)}
```

</details>

## A sticky header inside overflow: hidden

`W_LAYOUT_STICKY_SCROLLER` — viewport 320 × 480px

> .h is position: sticky inside .page, which has overflow: hidden: it sticks to that box, which does not scroll vertically, so it never sticks to the page. Use overflow-x: clip on the ancestor (not a scroll container), or move the sticky box out of it

![sticky-scroller](sticky-scroller-before.png) ![sticky-scroller](sticky-scroller-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><header class="h"></header><div class="content"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}.h{position:sticky;top:0;height:56px;background:#246}.content{height:1600px;background:repeating-linear-gradient(#fff 0 40px,#eee 40px 80px)}
```

</details>

## Grey text below 4.5:1

`E_A11Y_CONTRAST` — viewport 672 × 690px

> .t has contrast 2.85:1, below 4.5:1

![contrast](contrast-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">Low contrast text</p></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{color:#999;font-size:16px;line-height:24px;white-space:nowrap}
```

</details>

## A 16 × 16 icon button

`E_A11Y_TARGET_SIZE` — viewport 672 × 690px

> .x is under 24px and its 24px circle meets .y

![target-size](target-size-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="bar"><button class="x" aria-label="Close"></button><button class="y" aria-label="Menu"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.bar{display:grid;grid-template-columns:16px 16px;column-gap:2px}.x,.y{appearance:none;display:block;width:16px;height:16px;padding:0;border:0;min-width:0;min-height:0;background:#c33}
```

</details>

## A button covered by a later box

`E_A11Y_OCCLUDED` — viewport 672 × 690px

> .a is covered by .b, which is painted later and receives the pointer

![occluded](occluded-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="a" aria-label="Buy"></button><div class="b"></div></main>
```

```css
.page{display:grid;grid-template-columns:200px;grid-template-rows:30px 30px}.a{appearance:none;display:block;height:60px;padding:0;border:0;min-width:0;min-height:0;background:#c33}.b{background:rgba(40,80,160,.9)}
```

</details>

## outline: none without another focus style

`E_A11Y_FOCUS_VISIBLE` — viewport 672 × 690px

> .b shows no focus indicator: the outline is removed and nothing else changes on focus

![focus-visible](focus-visible-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Save"></button></main>
```

```css
.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;height:44px;padding:0;border:0;min-width:0;min-height:0;background:#246}.b:focus{outline:none}
```

</details>

## Grid placement that reverses the reading order

`W_A11Y_ORDER` — viewport 672 × 690px

> .b comes after .a in the DOM but is placed before it

![visual-order](visual-order-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="row"><a class="a" href="/1" aria-label="First"></a><a class="b" href="/2" aria-label="Second"></a></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:grid;grid-template-columns:100px 100px;column-gap:8px}.a{grid-column:2;grid-row:1;display:block;height:44px;background:#9cf}.b{grid-column:1;grid-row:1;display:block;height:44px;background:#fc9}
```

</details>

## An icon link with no accessible name

`E_A11Y_NAME` — viewport 672 × 690px

> .icon has no accessible name here: no rendered text and no aria-label, aria-labelledby or title

![accessible-name](accessible-name-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="icon" href="/cart"></a></main>
```

```css
.page{display:grid;grid-template-columns:44px}.icon{display:block;height:44px;background:#246}
```

</details>

## Content that needs horizontal scrolling at 320px

`E_A11Y_REFLOW` — viewport 320 × 690px

> .table makes the page scroll horizontally at 320 CSS px

![reflow](reflow-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="table"></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.table{width:600px;height:80px;background:#c9f}
```

</details>

## Two targets that overlap

`E_A11Y_TARGET_OVERLAP` — viewport 672 × 690px

> .go and .more overlap

![target-overlap](target-overlap-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="go" aria-label="Go"></button><a class="more" href="/more" aria-label="More"></a></main>
```

```css
.page{display:grid;grid-template-columns:200px;grid-template-rows:44px;position:relative}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.more{position:absolute;left:150px;top:10px;width:80px;height:44px;display:block;background:rgba(220,120,40,.85)}
```

</details>

## A focused button entirely under another box

`E_A11Y_FOCUS_OBSCURED` — viewport 672 × 690px

> .go is entirely hidden behind .cover when focused

![focus-obscured](focus-obscured-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="go" aria-label="Pay"></button><div class="cover"></div></main>
```

```css
.page{display:grid;grid-template-columns:200px;grid-template-rows:44px;position:relative;background:#fff}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.go:focus{outline:3px solid #1a73e8}.cover{position:absolute;left:0;top:0;width:200px;height:44px;background:#f4f4f4}
```

</details>

## A hover color with too little contrast

`E_A11Y_STATE_CONTRAST` — viewport 672 × 690px

> .b has contrast 1.92:1 when hovered, below 4.5:1

![state-contrast](state-contrast-before.png) ![state-contrast](state-contrast-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b">Subscribe</button></main>
```

```css
.page{display:grid;grid-template-columns:160px;background:#fff;color:#000}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;font-family:Roboto;font-size:16px;line-height:24px;background:#fff;color:#000;white-space:nowrap}.b:hover{color:#bbb}
```

</details>

## A pale focus outline

`E_A11Y_FOCUS_CONTRAST` — viewport 672 × 690px

> .b's focus outline has contrast 1.36:1 against its backdrop, below 3:1

![focus-contrast](focus-contrast-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Save"></button></main>
```

```css
.page{display:grid;grid-template-columns:120px;padding:8px;background:#fff}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.b:focus{outline:3px solid #ddd;outline-offset:2px}
```

</details>

## A button inside overflow: clip, below the clip edge

`E_A11Y_FOCUS_CLIPPED` — viewport 672 × 690px

> .b lies outside .c, whose overflow: clip never scrolls it into view when focused

![focus-clipped](focus-clipped-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="c"><div class="s"></div><button class="b" aria-label="Next"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:200px;background:#fff}.c{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:60px 30px;height:60px;overflow:clip;outline:1px dashed #999}.s{background:#eee}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;background:#c33}
```

</details>

## A focus ring cut off by a flush overflow: clip container

`W_A11Y_FOCUS_RING_CLIPPED` — viewport 672 × 690px

> .b's focus ring (4px outside it) is cut off by .c's overflow at its edge. Give the container padding, or draw the ring inside (a negative outline-offset)

![focus-ring-clipped](focus-ring-clipped-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="c"><button class="b" aria-label="Save"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:200px;padding:16px;background:#fff}.c{display:grid;grid-template-columns:minmax(0,1fr);overflow:clip;padding:8px 8px 8px 0;background:#eef}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.b:focus{outline:4px solid #e8710a}
```

</details>

## A custom checkbox whose real input is display: none

`E_A11Y_CONTROL_HIDDEN` — viewport 672 × 690px

> #opt is display: none but its label .l is shown: a pointer toggles it through the label, the keyboard and screen readers cannot reach it. Hide it visually instead (opacity: 0 or a clip, keeping it focusable) and draw the focus on the label

![hidden-control](hidden-control-before.png) ![hidden-control](hidden-control-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="f" type="checkbox" id="opt"><label class="l" for="opt"><span class="box"></span><span class="t">Remember me</span></label><button class="b" aria-label="Sign in"></button></main>
```

```css
.page{display:grid;grid-template-columns:220px;row-gap:12px;background:#fff;color:#111}.f{display:none}.l{display:grid;grid-template-columns:24px minmax(0,1fr);column-gap:8px}.box{display:block;height:24px;border:2px solid #246;border-radius:4px}.t{display:block;font-family:Roboto;font-size:16px;line-height:24px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#246}.b:focus{outline:3px solid #e8710a;outline-offset:2px}
```

</details>

## An appearance: none select with no arrow

`W_A11Y_SELECT_INDICATOR` — viewport 672 × 690px

> .s is appearance: none and nothing draws its arrow: it does not look like a dropdown. Draw an arrow (a background-image, or a ::after on its wrapper)

![select-indicator](select-indicator-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><select class="s" aria-label="Size"></select><input class="f" type="text" aria-label="Name"></main>
```

```css
.page{display:grid;grid-template-columns:240px;row-gap:12px;background:#fff;color:#111}.s,.f{appearance:none;display:block;width:240px;height:40px;padding:0;border:1px solid #767676;border-radius:4px;min-width:0;min-height:0;background-color:#fff}
```

</details>

## A visible button taken out of the tab order

`W_A11Y_TABINDEX_REMOVED` — viewport 672 × 690px

> .b.r is a visible control with tabindex -1: a pointer can use it, but Tab skips it. Drop the tabindex (or make it part of a composite widget with arrow-key navigation)

![tabindex-removed](tabindex-removed-before.png) ![tabindex-removed](tabindex-removed-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Back"></button><button class="b r" aria-label="Save" tabindex="-1"></button><button class="b" aria-label="Next"></button></main>
```

```css
.page{display:grid;grid-template-columns:repeat(3,80px);column-gap:16px;grid-auto-rows:40px;background:#fff}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;background:#246}.r{background:#c33}.b:focus{outline:3px solid #e8710a;outline-offset:2px}
```

</details>

## A visually hidden skip link that :focus does not reveal

`E_A11Y_FOCUS_CLIPPED_AWAY` — viewport 672 × 690px

> .s takes focus but is clipped away (visually hidden) even when focused; reveal it on :focus

![focus-clipped-away](focus-clipped-away-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="s" href="#main" aria-label="Skip to content"></a><div class="d"></div></main>
```

```css
.page{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;background:#fff;color:#000}.s{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;display:block;clip:rect(0 0 0 0)}.d{background:#eee}
```

</details>

## A button that can sit entirely behind a fixed header

`E_A11Y_FOCUS_SCROLLED_UNDER` — viewport 672 × 690px

> .b can be focused while entirely behind the fixed .h (the page does not scroll it out); add scroll-padding to the viewport or scroll-margin to the element

![focus-scrolled-under](focus-scrolled-under-before.png) ![focus-scrolled-under](focus-scrolled-under-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="h"></div><div class="gap"></div><button class="b" aria-label="Buy"></button><div class="tall"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.h{position:fixed;top:0;left:0;width:100%;height:60px;background:rgba(36,68,102,.97)}.gap{height:1010px}.tall{height:2000px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#c33}.b:focus{outline:3px solid #1a73e8}
```

</details>

## A fixed bottom bar inside a transformed card

`U_LAYOUT_FIXED_CONTAINED` — viewport 320 × 480px

> .bar is position: fixed, but its ancestor .card has transform: affine(1 0 0 1 0 0 0 0 0 0 0 0 0 0), which makes it the containing block: .bar is placed against .card and scrolls with it, not with the viewport. Move it outside the transformed box (for example to the end of body), or drop the transform

![fixed-contained](fixed-contained-before.png) ![fixed-contained](fixed-contained-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="card"><p class="t"></p><div class="bar"></div></div><div class="gap"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.card{display:grid;grid-template-columns:minmax(0,1fr);height:240px;background:#eef;transform:translateX(0px)}.bar{position:fixed;left:0;bottom:0;width:100%;height:56px;background:rgba(36,68,102,.97)}.gap{height:2000px;background:repeating-linear-gradient(#fff 0 40px,#f3f3f3 40px 80px)}
```

</details>

## A sticky header with no background

`W_A11Y_BAR_TRANSPARENT` — viewport 672 × 690px

> .h is sticky with no background: the content scrolling under it shows through its text. Give it an opaque background

![bar-transparent](bar-transparent-before.png) ![bar-transparent](bar-transparent-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><header class="h"><span class="t">Menu</span></header><div class="card"></div><div class="tall"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#111}.h{position:sticky;top:0;display:grid;grid-template-columns:minmax(0,1fr);height:56px}.t{display:block;font-family:Roboto;font-size:16px;line-height:24px}.card{height:200px;background:repeating-linear-gradient(90deg,#246 0 20px,#f2c94c 20px 40px)}.tall{height:2000px}
```

</details>

## Cards that slide over a sticky header

`W_A11Y_BAR_COVERED` — viewport 672 × 690px

> .h is sticky with z-index auto, and .card later in the page is position: relative: it paints over the bar as it scrolls under it. Give .h a z-index

![bar-covered](bar-covered-before.png) ![bar-covered](bar-covered-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><header class="h"></header><div class="card"></div><div class="card"></div><div class="tall"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);row-gap:12px;background:#fff}.h{position:sticky;top:0;height:56px;background:#246}.card{position:relative;height:90px;background:#f2c94c}.tall{height:2000px}
```

</details>

## A sticky table header inside an overflow-x: auto wrapper

`W_LAYOUT_STICKY_SCROLLER` — viewport 320 × 480px

> .h is position: sticky inside .wrap, which has overflow-x: auto (so its overflow-y is auto) and no height of its own: it sticks to that box, which does not scroll vertically, so it never sticks to the page. Use overflow-x: clip on the ancestor (not a scroll container), or move the sticky box out of it

![sticky-table-wrapper](sticky-table-wrapper-before.png) ![sticky-table-wrapper](sticky-table-wrapper-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="wrap"><div class="h"></div><div class="rows"></div></div><div class="tall"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.wrap{display:grid;grid-template-columns:minmax(0,1fr);overflow-x:auto}.h{position:sticky;top:0;height:44px;background:#246}.rows{height:1200px;background:repeating-linear-gradient(#fff 0 40px,#eef 40px 80px)}.tall{height:1500px}
```

</details>

## A fixed footer that covers the end of the page

`E_A11Y_FIXED_HIDES` — viewport 672 × 690px

> .b stays entirely behind the fixed .f at every scroll position; pad the page by the bar's size

![fixed-hides](fixed-hides-before.png) ![fixed-hides](fixed-hides-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="gap"></div><button class="b" aria-label="Accept"></button><footer class="f"></footer></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff}.f{position:fixed;bottom:0;left:0;width:100%;height:60px;background:rgba(36,68,102,.97)}.gap{height:2000px;background:repeating-linear-gradient(#fff 0 40px,#f3f3f3 40px 80px)}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:40px;background:#c33}
```

</details>

## An #id jump that lands under a fixed header

`W_A11Y_FRAGMENT_UNDER_BAR` — viewport 672 × 690px

> .l jumps to #s, whose top lands behind the fixed .h; give it scroll-margin-top (or the viewport scroll-padding-top) of the bar's height

![fragment-under-bar](fragment-under-bar-before.png) ![fragment-under-bar](fragment-under-bar-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="h"></div><div class="top"></div><a class="l" href="#s" aria-label="Jump to pricing"></a><div class="gap"></div><h2 class="t" id="s">Pricing</h2><div class="tall"></div></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.h{position:fixed;top:0;left:0;width:100%;height:60px;background:#333}.top{height:60px}.l{display:block;height:30px;background:#06c}.gap{height:1000px}.t{display:block;font-family:Roboto;font-size:20px;line-height:30px;font-weight:400;white-space:nowrap}.tall{height:2000px}
```

</details>

## A text field whose border is too faint

`E_A11Y_FIELD_BOUNDARY` — viewport 672 × 690px

> .i has no visible boundary: its fill and borders reach only 1.36:1 against the background (3:1 needed)

![field-boundary](field-boundary-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="text" aria-label="Email"></main>
```

```css
.page{display:grid;grid-template-columns:240px;background:#fff;color:#000}.i{appearance:none;display:block;padding:0 8px;min-width:0;min-height:0;width:240px;height:36px;border:1px solid #ddd;background:transparent;font:16px Roboto}
```

</details>

## Placeholder text with too little contrast

`E_A11Y_PLACEHOLDER_CONTRAST` — viewport 672 × 690px

> .i's placeholder has contrast 1.61:1, below 4.5:1

![placeholder-contrast](placeholder-contrast-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="text" aria-label="Search" placeholder="Search products"></main>
```

```css
.page{display:grid;grid-template-columns:240px;background:#fff;color:#000}.i{appearance:none;display:block;padding:0 8px;min-width:0;min-height:0;width:240px;height:36px;border:1px solid #000;background:#fff;font-size:16px}.i::placeholder{color:#ccc}
```

</details>

## A custom checkbox that looks the same when checked

`E_A11Y_CHECKED_INDICATOR` — viewport 672 × 690px

> .c looks the same checked and unchecked

![checked-indicator](checked-indicator-before.png) ![checked-indicator](checked-indicator-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="c" type="checkbox" aria-label="Agree"></main>
```

```css
.page{display:grid;grid-template-columns:24px;background:#fff;color:#000}.c{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:24px;height:24px;border:2px solid #000;background:#fff;margin:0}
```

</details>

## Text entirely under a later opaque box

`E_A11Y_TEXT_OBSCURED` — viewport 672 × 690px

> .t's text is entirely hidden behind .over

![text-obscured](text-obscured-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">Price: 1,200 USD</p><div class="over"></div></main>
```

```css
.page{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:20px;background:#fff;color:#000}.t{display:block;font-family:Roboto;font-size:16px;line-height:20px;white-space:nowrap}.over{position:absolute;left:0;top:0;width:100%;height:20px;background:#333}
```

</details>

## Content cut off by overflow: hidden

`W_LAYOUT_CLIPPED` — viewport 672 × 690px

> .box is cut off by .box (overflow hidden)

![clipped](clipped-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="box"><div class="item a"></div><div class="item b"></div><div class="item c"></div></div></main>
```

```css
.page{display:grid;grid-template-columns:240px}.box{display:grid;grid-template-columns:minmax(0,1fr);row-gap:8px;height:90px;overflow:hidden;background:#eee;padding:8px}.item{height:40px;background:#69c}.b{background:#9c6}.c{background:#c96}
```

</details>

## A control that only hover reveals

`E_A11Y_HOVER_ONLY` — viewport 672 × 690px

> .b appears on :hover but stays hidden when focused, so keyboard users cannot see it

![hover-only](hover-only-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="row"><div class="item"></div><button class="b" aria-label="Delete"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:240px;background:#fff}.row{display:grid;grid-template-columns:minmax(0,1fr) 44px;height:44px;background:#eee}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;opacity:0;background:#c33}.b:hover{opacity:1}
```

</details>

## Text cut off at 1.5 line-height (user text spacing)

`E_A11Y_TEXT_SPACING` — viewport 672 × 690px

> .t clips its text with letter-spacing 0.12em and word-spacing 0.16em (needs 197.4375px)

![text-spacing](text-spacing-before.png) ![text-spacing](text-spacing-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">Order status: shipped</p></main>
```

```css
.page{display:grid;grid-template-columns:190px;grid-template-rows:20px;background:#fff;color:#000}.t{font-family:Roboto;font-size:16px;line-height:20px;white-space:nowrap;overflow:hidden;background:#eef}
```

</details>

## Text below 12px on narrow screens

`W_A11Y_SMALL_TEXT` — viewport 672 × 690px

> .t is set at 10px

![small-text](small-text-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">Terms and conditions apply</p></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.t{font-family:Roboto;font-size:10px;line-height:14px;white-space:nowrap}
```

</details>

## A visible button under pointer-events: none

`E_A11Y_POINTER_DISABLED` — viewport 672 × 690px

> .go cannot be clicked: pointer-events is none here

![pointer-disabled](pointer-disabled-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="panel"><button class="go" aria-label="Continue"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:160px;background:#fff}.panel{display:grid;grid-template-columns:minmax(0,1fr);pointer-events:none}.go{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## A focusable button inside aria-hidden

`E_A11Y_HIDDEN_FOCUSABLE` — viewport 672 × 690px

> .b can take focus inside aria-hidden content

![hidden-focusable](hidden-focusable-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="bar" aria-hidden="true"><button class="b" aria-label="Share"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:120px;padding:4px;background:#fff}.bar{display:grid;grid-template-columns:minmax(0,1fr)}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.b:focus{outline:3px solid #1a73e8}
```

</details>

## Focus can leave an open modal dialog

`W_A11Y_MODAL_BACKGROUND` — viewport 672 × 690px

> .o can take focus outside the modal .d; make the background inert (or aria-hidden and unfocusable)

![modal-background](modal-background-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="bg"><button class="o" aria-label="Background action"></button></div><div class="d" role="dialog" aria-modal="true" aria-label="Confirm"><button class="i" aria-label="OK"></button></div></main>
```

```css
.page{position:relative;display:grid;grid-template-columns:240px;grid-template-rows:44px;background:#fff}.bg{display:grid;grid-template-columns:minmax(0,1fr)}.o{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#999}.o:focus{outline:3px solid #1a73e8}.d{position:absolute;left:40px;top:60px;width:160px;height:80px;display:grid;grid-template-columns:minmax(0,1fr);padding:18px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3)}.i{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## Padding larger than the fixed size

`E_LAYOUT_BOX_EDGES` — viewport 672 × 690px

> .pill requires 32px but receives 24px on block axis at viewport 672px × 690px

![box-edges](box-edges-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="pill"></div></main>
```

```css
.page{display:grid;grid-template-columns:200px}.pill{height:24px;padding:16px 0;background:#9cf}
```

</details>

## A rigid row wider than the page

`E_LAYOUT_PAGE_OVERFLOW` — viewport 422 × 690px

> .b reaches past the viewport, so the page scrolls horizontally

![page-overflow-x](page-overflow-x-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="row"><div class="a"></div><div class="b"></div></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;column-gap:8px}.a{flex:none;width:300px;height:60px;background:#9cf}.b{flex:none;width:200px;height:60px;background:#fc9}
```

</details>

## Text that spills into its neighbour

`E_LAYOUT_TEXT_COLLISION` — viewport 429 × 690px

> .t.a and .t.b overlap

![text-collision](text-collision-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="row"><p class="t a">A long product name that overflows</p><p class="t b">19.99 USD</p></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.t{font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}.b{background:rgba(255,200,120,.5)}
```

</details>

## A scroll area inside a scroll area

`W_LAYOUT_NESTED_SCROLL` — viewport 484 × 690px

> .inner scrolls inside .outer

![nested-scroll](nested-scroll-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="outer"><div class="inner"><div class="content"></div></div></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.outer{display:grid;grid-template-columns:600px;overflow:auto;height:140px;background:#eee;padding:8px}.inner{display:grid;grid-template-columns:900px;overflow:auto;background:#cde}.content{min-width:0;height:100px;background:repeating-linear-gradient(90deg,#9cf 0 40px,#cde 40px 80px)}
```

</details>

## A button drawn only by its fill, in forced colors

`W_A11Y_FORCED_COLORS` — viewport 674 × 690px

> .b has no border: only its background shows its edge, which forced colors (Windows high contrast) replace, so the control loses its outline. Give it a border (transparent is enough: forced colors paint it) or style @media (forced-colors: active)

![forced-colors](forced-colors-before.png) ![forced-colors](forced-colors-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Save"></button><button class="c" aria-label="Cancel"></button></main>
```

```css
.page{display:grid;grid-template-columns:140px 140px;column-gap:12px;background:#fff}.b,.c{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.c{background:#ddd}
```

</details>

## A 14px field that iOS zooms into on focus

`W_LAYOUT_INPUT_ZOOM` — markup rule (nothing to see on screen)

> .i has 14px text: iOS Safari zooms the page in when a field under 16px takes focus. Use font-size: 16px (or more) for fields

![input-zoom](input-zoom-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="search" aria-label="Search"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0 8px;min-width:0;min-height:0;width:200px;height:36px;border:1px solid #000;background:#fff;font-size:14px}
```

</details>

## A 100vh hero under the mobile toolbar

`W_LAYOUT_VH_TOOLBAR` — markup rule (nothing to see on screen)

> .hero is 100vh tall: on mobile browsers vh is the viewport with the toolbars hidden, so its bottom is under the toolbar until the page scrolls. Use svh (or dvh) for a box that must fit the visible screen

![vh-toolbar](vh-toolbar-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><section class="hero"></section></main>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.hero{height:100vh;background:#246}
```

</details>

## A focus ring made of box-shadow, in forced colors

`W_A11Y_FORCED_COLORS_FOCUS` — viewport 672 × 690px

> .b shows focus only by a box-shadow with the outline removed: forced colors (Windows high contrast) drop both, so the focus disappears. Keep an outline (outline: 2px solid transparent shows in forced colors) or style @media (forced-colors: active)

![forced-colors-focus](forced-colors-focus-before.png) ![forced-colors-focus](forced-colors-focus-after.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Save"></button></main>
```

```css
.page{display:grid;grid-template-columns:160px;padding:8px;background:#fff}.b{appearance:none;display:block;padding:0;border:2px solid #246;min-width:0;min-height:0;height:44px;background:#fff}.b:focus{outline:none;box-shadow:0 0 0 4px #1a73e8}
```

</details>

## Smooth page scrolling with no reduced-motion rule

`W_A11Y_SMOOTH_SCROLL` — markup rule (nothing to see on screen)

> html@P has scroll-behavior: smooth with no prefers-reduced-motion: reduce rule: every jump to an #id animates the page, also for people who asked for less motion. Set it in @media (prefers-reduced-motion: no-preference), or back to auto under reduce

![smooth-scroll](smooth-scroll-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="x"></div></main>
```

```css
html{scroll-behavior:smooth}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## A document without lang

`E_A11Y_HTML_LANG` — markup rule (nothing to see on screen)

> html@P has no lang attribute

![html-lang](html-lang-markup.png)

<details><summary>HTML / CSS</summary>

```html
<html>
  <body>
    <main class="page">…</main>
  </body>
</html>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## A viewport meta tag that disables zoom

`E_A11Y_META_VIEWPORT` — markup rule (nothing to see on screen)

> The viewport meta tag disables zooming (user-scalable=no, maximum-scale=1): text cannot be enlarged to 200% on touch devices

![meta-viewport](meta-viewport-markup.png)

<details><summary>HTML / CSS</summary>

```html
<head>
  <meta name="viewport" content="width=device-width, maximum-scale=1, user-scalable=no">
</head>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## touch-action on body that blocks pinch-zoom

`E_A11Y_TOUCH_ZOOM` — markup rule (nothing to see on screen)

> body@P/0 has touch-action: pan-x pan-y, which disables pinch-zoom for the whole page

![touch-zoom](touch-zoom-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="x"></div></main>
```

```css
body{touch-action:pan-x pan-y}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## Two elements with the same id

`E_A11Y_DUPLICATE_ID` — markup rule (nothing to see on screen)

> id "email" is used by 2 elements

![duplicate-id](duplicate-id-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><label class="l" for="email" id="email">Email</label><input class="i" type="email" id="email"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.l{display:block;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## aria-labelledby that points at nothing

`E_A11Y_REFERENCE` — markup rule (nothing to see on screen)

> .d references the missing id "dialog-title"

![aria-reference](aria-reference-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="d" role="dialog" aria-labelledby="dialog-title"><button class="b" aria-label="Close"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:200px}.d{display:grid;grid-template-columns:44px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## A button inside a link

`E_A11Y_NESTED_INTERACTIVE` — markup rule (nothing to see on screen)

> .b is interactive inside .card

![nested-interactive](nested-interactive-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="card" href="/item"><button class="b" aria-label="Add to cart"></button></a></main>
```

```css
.page{display:grid;grid-template-columns:200px}.card{display:grid;grid-template-columns:44px;padding:8px;background:#eee}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## An image without alt

`E_A11Y_IMAGE_ALT` — markup rule (nothing to see on screen)

> .p has no alt; use alt="" if it is decorative

![image-alt](image-alt-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><img class="p" src="/wide.png" width="320" height="160"></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block;width:100%;height:auto}
```

</details>

## A text field with no label

`E_A11Y_LABEL` — markup rule (nothing to see on screen)

> .i has no label here: add a visible <label>, aria-label, aria-labelledby or title

![form-label](form-label-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="text"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## A misspelled role

`E_A11Y_ROLE` — markup rule (nothing to see on screen)

> .b has role "buton", which is not a WAI-ARIA role

![role-valid](role-valid-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="b" role="buton" tabindex="0" aria-label="Save"></div></main>
```

```css
.page{display:grid;grid-template-columns:120px}.b{height:44px;background:#246}
```

</details>

## A list with a non-item child

`E_A11Y_LIST` — markup rule (nothing to see on screen)

> .u has a child that is not li

![list-structure](list-structure-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><ul class="u"><li class="a"></li><div class="x"></div></ul></main>
```

```css
.page{display:grid;grid-template-columns:200px}.u{display:grid;grid-template-columns:minmax(0,1fr);list-style:none;padding:0}.a,.x{display:block;height:20px}
```

</details>

## A positive tabindex

`W_A11Y_POSITIVE_TABINDEX` — markup rule (nothing to see on screen)

> .b has tabindex 3, which moves it ahead of the DOM focus order

![positive-tabindex](positive-tabindex-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="a" aria-label="First"></button><button class="b" tabindex="3" aria-label="Jumps ahead"></button></main>
```

```css
.page{display:grid;grid-template-columns:120px;row-gap:4px}.a,.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## A heading level skipped

`W_A11Y_HEADING_ORDER` — markup rule (nothing to see on screen)

> .h.b (h3) follows h1 .h.a, skipping a level

![heading-order](heading-order-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><h1 class="h a">Checkout</h1><h3 class="h b">Shipping</h3></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.h{display:block;font-family:Roboto;font-size:20px;line-height:28px;font-weight:400;white-space:nowrap}
```

</details>

## A heading with no text

`E_A11Y_EMPTY_HEADING` — markup rule (nothing to see on screen)

> .e is an empty heading here

![empty-heading](empty-heading-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><h2 class="e"></h2></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.e{display:block;height:28px}
```

</details>

## Content outside every landmark

`W_A11Y_REGION` — markup rule (nothing to see on screen)

> .t is content outside any landmark

![region](region-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body><p class="t">Free shipping over 50 USD</p><main class="page"><div class="x"></div></main></body>
```

```css
.t{display:block;font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}.page{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## Two main landmarks

`W_A11Y_MULTIPLE_MAIN` — markup rule (nothing to see on screen)

> .m2 renders as a second main landmark

![multiple-main](multiple-main-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body><main class="m1"><div class="x"></div></main><main class="m2"><div class="x"></div></main></body>
```

```css
.m1,.m2{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## A link named “Read more”

`W_A11Y_LINK_TEXT` — markup rule (nothing to see on screen)

> .l is named "read more", which does not say where it goes

![link-text](link-text-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="l" href="/posts/42" aria-label="Read more"></a></main>
```

```css
.page{display:grid;grid-template-columns:120px}.l{display:block;height:44px;background:#246}
```

</details>

## A link that opens a new tab without saying so

`W_A11Y_NEW_WINDOW` — markup rule (nothing to see on screen)

> .l opens in a new window or tab (target="_blank") but its name does not say so

![new-window](new-window-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="l" href="https://example.com/terms" target="_blank" aria-label="Terms of service"></a></main>
```

```css
.page{display:grid;grid-template-columns:120px}.l{display:block;height:44px;background:#246}
```

</details>

## An autocomplete value that is not an autofill token

`E_A11Y_AUTOCOMPLETE` — markup rule (nothing to see on screen)

> .i has autocomplete="e-mail", outside the HTML autofill tokens

![autocomplete](autocomplete-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="email" aria-label="Email" autocomplete="e-mail"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## An iframe without a title

`E_A11Y_FRAME_TITLE` — markup rule (nothing to see on screen)

> .f is a frame without a title

![frame-title](frame-title-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><iframe class="f" src="/map.html"></iframe></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.f{display:block;width:300px;height:150px;border:0}
```

</details>

## A video without a captions track

`E_A11Y_VIDEO_CAPTION` — markup rule (nothing to see on screen)

> .v has no captions track

![video-caption](video-caption-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><video class="v" src="/intro.mp4" controls></video></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.v{display:block;width:320px;height:180px}
```

</details>

## A skip link parked left of the viewport

`E_A11Y_FOCUS_OFFSCREEN` — viewport 672 × 690px

> .skip takes focus but lies entirely off screen (before the viewport's start edge), so the focused element is never visible

![focus-offscreen](focus-offscreen-map.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="skip" href="#main" aria-label="Skip to content"></a><div class="d"></div></main>
```

```css
.page{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:30px;background:#fff}.skip{position:absolute;left:-200px;top:0;width:160px;height:30px;display:block;background:#c33}.d{background:#eee}
```

</details>

## Content shown only in portrait

`E_A11Y_ORIENTATION` — markup rule (nothing to see on screen)

> the main content does not render in landscape viewports

![orientation](orientation-portrait.png) ![orientation](orientation-landscape.png)

<details><summary>HTML / CSS</summary>

```html
<main class="m"><div class="x"></div></main>
```

```css
.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:120px;background:#9cf}@media (orientation: landscape){.m{display:none}}
```

</details>

## An unknown aria-* attribute

`E_A11Y_ARIA_ATTR` — markup rule (nothing to see on screen)

> .b has aria-lable, which is not an ARIA attribute

![aria-attr](aria-attr-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Close" aria-lable="Close"></button></main>
```

```css
.page{display:grid;grid-template-columns:44px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## aria-expanded with an invalid value

`E_A11Y_ARIA_VALUE` — markup rule (nothing to see on screen)

> .b has aria-expanded="yes", not a valid value

![aria-value](aria-value-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Menu" aria-expanded="yes"></button></main>
```

```css
.page{display:grid;grid-template-columns:44px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## A checkbox role without aria-checked

`E_A11Y_ROLE_ATTR` — markup rule (nothing to see on screen)

> .c has role checkbox without aria-checked

![role-attr](role-attr-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="c" role="checkbox" tabindex="0" aria-label="Agree"></div></main>
```

```css
.page{display:grid;grid-template-columns:24px}.c{height:24px;border:2px solid #000}
```

</details>

## A tab outside a tablist

`E_A11Y_ROLE_PARENT` — markup rule (nothing to see on screen)

> .t has role tab outside tablist

![role-parent](role-parent-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="g"><button class="t" role="tab" aria-label="Details"></button></div></main>
```

```css
.page{display:grid;grid-template-columns:120px}.g{display:grid;grid-template-columns:minmax(0,1fr)}.t{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## A role=button that cannot take focus

`E_A11Y_ROLE_FOCUS` — markup rule (nothing to see on screen)

> .b has role button but cannot take focus; add tabindex="0"

![interactive-role-focusable](interactive-role-focusable-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="b" role="button" aria-label="Save"></div></main>
```

```css
.page{display:grid;grid-template-columns:120px}.b{height:44px;background:#246}
```

</details>

## role=presentation on a focusable element

`E_A11Y_PRESENTATION_CONFLICT` — markup rule (nothing to see on screen)

> .l has role presentation but is focusable or labelled, so the role is ignored

![presentation-conflict](presentation-conflict-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="l" href="/home" role="presentation" aria-label="Home"></a></main>
```

```css
.page{display:grid;grid-template-columns:120px}.l{display:block;height:44px;background:#246}
```

</details>

## label for= that names no field

`E_A11Y_LABEL_FOR` — markup rule (nothing to see on screen)

> .l is for "mail", which is not a labelable element

![label-for](label-for-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><label class="l" for="mail" aria-label="Email"></label><input class="i" type="email" id="email" aria-label="Email"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.l{display:block;height:20px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## grid-column on an item of a flex container

`W_LAYOUT_DECLARATION_INERT` — viewport 320 × 480px

> .c.wide: grid-column: span 2 has no effect (its parent .row is display: flex, not grid)

![declaration-inert](declaration-inert-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="row"><div class="c wide"></div><div class="c"></div><div class="c"></div></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.row{display:flex;column-gap:8px}.c{width:80px;height:60px;background:#246}.wide{grid-column:span 2;background:#c33}
```

</details>

## width: 100vw on a page with a classic scrollbar

`W_LAYOUT_VW_SCROLLBAR` — markup rule (nothing to see on screen)

> .hero is width: 100vw, and vw includes the 15px classic scrollbar of the scrolling page: it is wider than the page beside the scrollbar, which scrolls sideways. Use 100% (or width: auto in a grid or flex parent)

![vw-scrollbar](vw-scrollbar-markup.png)

<details><summary>HTML / CSS</summary>

```html
<div class="hero"></div><div class="tall"></div>
```

```css
html{overflow-y:auto}.hero{height:100px;width:100vw}.tall{height:3000px}
```

</details>

## hyphens: auto on a page with no lang

`W_LAYOUT_HYPHENS_NO_LANG` — markup rule (nothing to see on screen)

> .t has hyphens: auto but no language (no lang attribute on it, an ancestor or html): browsers do not hyphenate it, and long words overflow or break as with hyphens: manual. Set lang on the html element

![hyphens-no-lang](hyphens-no-lang-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="t">Internationalization</p></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.t{line-height:20px;hyphens:auto}
```

</details>

## A px font-size on html

`W_LAYOUT_ROOT_FONT_FIXED` — markup rule (nothing to see on screen)

> html@P sets font-size: 16px, an absolute length: it replaces the user's default font size, so text no longer grows with the browser's font size setting. Use a percentage or rem (for example 100%)

![root-font-fixed](root-font-fixed-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="b"></div></main>
```

```css
html{font-size:16px}.page{display:grid;grid-template-columns:minmax(0,1fr)}.b{height:20px}
```

</details>

## padding-left in right-to-left content

`W_LAYOUT_PHYSICAL_IN_RTL` — markup rule (nothing to see on screen)

> .item is rtl, but padding-left: 32px is physical: it stays on that side instead of following the reading direction. Use the inline-start/inline-end sides

![physical-in-rtl](physical-in-rtl-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page" dir="rtl"><div class="item"><div class="icon"></div></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.item{display:grid;grid-template-columns:minmax(0,1fr);padding-left:32px}.icon{height:20px}
```

</details>

## An autofocus search field hidden on mobile

`W_A11Y_AUTOFOCUS_HIDDEN` — markup rule (nothing to see on screen)

> .search has autofocus but it is not rendered and visible here, so nothing takes focus on load

![autofocus-hidden](autofocus-hidden-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="search" type="search" aria-label="Search" autofocus></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.search{appearance:none;display:block;width:200px;height:32px;padding:0;border:1px solid #000;min-width:0;min-height:0;background:#fff}@media (max-width: 500px){.search{display:none}}
```

</details>

## A status message region kept display: none until it is used

`W_A11Y_LIVE_HIDDEN` — markup rule (nothing to see on screen)

> .toast is a live region (status) but is not rendered (display: none or visibility: hidden) here: what is written into it is not announced. Keep the region rendered and empty, and hide it visually if needed

![live-hidden](live-hidden-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="toast" role="status"></div></main>
```

```css
.page{display:grid;grid-template-columns:200px}.toast{display:none}
```

</details>

## A field named only by its title

`W_A11Y_TITLE_ONLY` — markup rule (nothing to see on screen)

> .i is named only by its title, which is not shown persistently

![title-only](title-only-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="tel" title="Phone number"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## input type=button with no value

`E_A11Y_INPUT_BUTTON_NAME` — markup rule (nothing to see on screen)

> .i is an input button without a value

![input-button-name](input-button-name-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="button"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## input type=image without alt

`E_A11Y_INPUT_IMAGE_ALT` — markup rule (nothing to see on screen)

> .i is an image button without alt text

![input-image-alt](input-image-alt-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="image" src="/wide.png"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## scope on a data cell

`E_A11Y_SCOPE` — markup rule (nothing to see on screen)

> .c has scope="col" on a non-header cell

![scope](scope-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><table class="t"><tbody><tr class="r"><td class="c" scope="col"></td></tr></tbody></table></main>
```

```css
.page{display:grid;grid-template-columns:200px}.t{table-layout:fixed;width:200px;border-spacing:0}.c{padding:0;height:20px}
```

</details>

## td headers= that names no th

`E_A11Y_TABLE_HEADERS_REF` — markup rule (nothing to see on screen)

> .c has headers="price", which is not a th of this table

![td-headers](td-headers-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><table class="t"><tbody><tr class="r"><th class="h" id="name" aria-label="Name"></th><td class="c" headers="price"></td></tr></tbody></table></main>
```

```css
.page{display:grid;grid-template-columns:200px}.t{table-layout:fixed;width:200px;border-spacing:0}.h,.c{padding:0;height:20px;width:100px}
```

</details>

## A header cell with no text

`E_A11Y_EMPTY_TH` — markup rule (nothing to see on screen)

> .h is an empty table header here

![empty-th](empty-th-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><table class="t"><tbody><tr class="r"><th class="h"></th><td class="c"></td></tr></tbody></table></main>
```

```css
.page{display:grid;grid-template-columns:200px}.t{table-layout:fixed;width:200px;border-spacing:0}.h,.c{padding:0;height:20px;width:100px}
```

</details>

## The same accesskey twice

`W_A11Y_ACCESSKEY` — markup rule (nothing to see on screen)

> .b repeats accesskey "s" of .a

![accesskeys](accesskeys-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="a" accesskey="s" aria-label="Save"></button><button class="b" accesskey="s" aria-label="Search"></button></main>
```

```css
.page{display:grid;grid-template-columns:120px;row-gap:4px}.a,.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}
```

</details>

## aria-checked that contradicts the native state

`W_A11Y_NATIVE_ARIA_CONFLICT` — markup rule (nothing to see on screen)

> .c has aria-checked="false" but is checked natively; the native state is announced

![native-aria-conflict](native-aria-conflict-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="c" type="checkbox" checked aria-checked="false" aria-label="Agree"></main>
```

```css
.page{display:grid;grid-template-columns:24px}.c{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:24px;height:24px;border:2px solid #000;background:#fff;margin:0}.c:checked{background:#000}
```

</details>

## A marquee

`E_A11Y_BLINK` — markup rule (nothing to see on screen)

> .m is a <marquee>, which moves or blinks without a way to pause it

![blink](blink-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><marquee class="m"></marquee></main>
```

```css
.page{display:grid;grid-template-columns:200px}.m{display:block;width:200px;height:24px}
```

</details>

## Same-name radios outside a group

`W_A11Y_RADIO_GROUP` — markup rule (nothing to see on screen)

> radios named "size" are not grouped in a fieldset or radiogroup

![radio-group](radio-group-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="a" type="radio" name="size" aria-label="Small"><input class="b" type="radio" name="size" aria-label="Large"></main>
```

```css
.page{display:grid;grid-template-columns:24px;row-gap:6px}.a,.b{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:24px;height:24px;border:2px solid #000;border-radius:50%;background:#fff;margin:0}
```

</details>

## A fieldset with no legend

`W_A11Y_FIELDSET_NAME` — markup rule (nothing to see on screen)

> .f groups controls without a legend

![fieldset-name](fieldset-name-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><fieldset class="f"><input class="i" type="text" aria-label="City"></fieldset></main>
```

```css
.page{display:grid;grid-template-columns:240px}.f{display:grid;grid-template-columns:200px;border:1px solid #999;padding:8px;min-width:0}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## A form with fields but no submit button

`W_A11Y_FORM_SUBMIT` — markup rule (nothing to see on screen)

> .f has fields but no submit button

![form-submit](form-submit-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><form class="f"><input class="i" type="search" aria-label="Search"></form></main>
```

```css
.page{display:grid;grid-template-columns:200px}.f{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #000;background:#fff}
```

</details>

## aria-invalid with no message

`W_A11Y_INVALID_NO_MESSAGE` — markup rule (nothing to see on screen)

> .i is aria-invalid="true" with no aria-errormessage or aria-describedby saying what is wrong

![error-message](error-message-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><input class="i" type="email" aria-label="Email" aria-invalid="true"></main>
```

```css
.page{display:grid;grid-template-columns:200px}.i{appearance:none;display:block;padding:0;min-width:0;min-height:0;width:200px;height:30px;border:1px solid #c00;background:#fff}
```

</details>

## Two unnamed navigation landmarks

`W_A11Y_LANDMARK_NAME` — markup rule (nothing to see on screen)

> .b and .a are navigation landmarks without names to tell them apart

![landmark-name](landmark-name-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><nav class="a"><a class="l" href="/" aria-label="Home"></a></nav><nav class="b"><a class="l" href="/help" aria-label="Help"></a></nav></main>
```

```css
.page{display:grid;grid-template-columns:120px;row-gap:6px}.a,.b{display:grid;grid-template-columns:minmax(0,1fr)}.l{display:block;height:44px;background:#246}
```

</details>

## A list styled without markers loses its role in Safari

`W_A11Y_LIST_STYLE` — markup rule (nothing to see on screen)

> .u has list-style-type: none; Safari/VoiceOver then drops its list semantics unless it has role="list"

![list-style](list-style-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><ul class="u"><li class="a"></li><li class="b"></li></ul></main>
```

```css
.page{display:grid;grid-template-columns:200px}.u{display:grid;grid-template-columns:minmax(0,1fr);list-style:none;padding:0}.a,.b{display:block;height:20px;background:#eee}
```

</details>

## cursor: pointer on something that is not a control

`W_A11Y_CLICK_LOOK` — markup rule (nothing to see on screen)

> .card has cursor: pointer but is neither focusable nor an interactive role; if it handles clicks, keyboard users cannot reach it

![clickable-look](clickable-look-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="card"></div></main>
```

```css
.page{display:grid;grid-template-columns:200px}.card{height:60px;background:#9cf;cursor:pointer}
```

</details>

## A hidden element that author CSS shows

`W_A11Y_HIDDEN_OVERRIDDEN` — markup rule (nothing to see on screen)

> .note has the hidden attribute but renders: an author display rule overrides [hidden] { display: none }

![hidden-overridden](hidden-overridden-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="note" hidden></div></main>
```

```css
.page{display:grid;grid-template-columns:200px}.note{display:block !important;height:40px;background:#fc9}
```

</details>

## aria-expanded=true while the panel is hidden

`W_A11Y_STATE_MISMATCH` — markup rule (nothing to see on screen)

> .b has aria-expanded="true" but #panel does not render here

![state-mismatch](state-mismatch-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Filters" aria-expanded="true" aria-controls="panel"></button><div class="p" id="panel"></div></main>
```

```css
.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246}.p{display:none}
```

</details>

## A focusable control that stays at opacity 0

`W_A11Y_FOCUS_TRANSPARENT` — markup rule (nothing to see on screen)

> .b stays at opacity 0 when focused, so its own focus indicator is invisible; another element must show where focus is

![focus-transparent](focus-transparent-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b" aria-label="Upload"></button></main>
```

```css
.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;height:44px;background:#246;opacity:0}
```

</details>

## Autoplaying media that is not muted

`W_A11Y_AUTOPLAY_AUDIO` — markup rule (nothing to see on screen)

> .v plays automatically with sound; mute it or offer a control within 3 seconds

![autoplay-audio](autoplay-audio-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><video class="v" src="/intro.mp4" autoplay><track kind="captions" src="/intro.vtt"></video></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.v{display:block;width:320px;height:180px}
```

</details>

## A long animation that reduced motion does not stop

`W_A11Y_MOTION` — markup rule (nothing to see on screen)

> .spinner runs animation spin (10s × infinite) and prefers-reduced-motion: reduce does not stop it; moving content over 5s needs a pause mechanism

![motion](motion-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="spinner"></div></main>
```

```css
@keyframes spin{to{transform:rotate(90deg)}}.page{display:grid;grid-template-columns:60px}.spinner{height:60px;background:#9cf;animation:spin 10s infinite}
```

</details>

## A bold paragraph used as a heading

`W_A11Y_P_AS_HEADING` — viewport 672 × 690px

> .p is styled as a heading (bold) but is a paragraph

![p-as-heading](p-as-heading-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><p class="p">Delivery options</p><p class="q">Choose a delivery time</p></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr);background:#fff;color:#000}.p,.q{display:block;font-family:Roboto;font-size:16px;line-height:24px;font-weight:400;white-space:nowrap}.p{font-weight:700}
```

</details>

## An image alt that repeats its caption

`W_A11Y_REDUNDANT_ALT` — viewport 688 × 690px

> .p has alt "Mount Fuji at dawn", which repeats the caption .c beside it: screen readers read it twice (use alt="" when the caption says it)

![redundant-alt](redundant-alt-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><img class="p" src="/wide.png" width="320" height="160" alt="Mount Fuji at dawn"><p class="c">Mount Fuji at dawn</p></main>
```

```css
.page{display:grid;grid-template-columns:320px;background:#fff;color:#000}.p{display:block;width:100%;height:auto}.c{display:block;font-family:Roboto;font-size:16px;line-height:24px;white-space:nowrap}
```

</details>

## A main landmark nested in an aside

`W_A11Y_LANDMARK_TOP_LEVEL` — markup rule (nothing to see on screen)

> .m (main) is inside .a; keep it at the top level

![landmark-top-level](landmark-top-level-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body><aside class="a"><main class="m"><div class="x"></div></main></aside></body>
```

```css
.a{display:grid;grid-template-columns:minmax(0,1fr)}.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## Two banner landmarks

`W_A11Y_DUPLICATE_LANDMARK` — markup rule (nothing to see on screen)

> .h2 is a second banner landmark

![duplicate-landmark](duplicate-landmark-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body><header class="h1"><div class="x"></div></header><header class="h2"><div class="x"></div></header><main class="m"><div class="x"></div></main></body>
```

```css
.h1,.h2,.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## A page with no h1

`W_A11Y_PAGE_H1` — markup rule (nothing to see on screen)

> no h1 renders here

![page-h1](page-h1-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body><main class="m"><div class="x"></div></main></body>
```

```css
.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## A page with no main landmark

`W_A11Y_NO_MAIN` — markup rule (nothing to see on screen)

> no main landmark renders here

![no-main](no-main-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body><div class="m"><div class="x"></div></div></body>
```

```css
.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## Two links with the same name to different pages

`W_A11Y_LINK_PURPOSE` — markup rule (nothing to see on screen)

> .b and .a are both named "details" but go to different places

![link-purpose](link-purpose-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="a" href="/plans/basic" aria-label="Details"></a><a class="b" href="/plans/pro" aria-label="Details"></a></main>
```

```css
.page{display:grid;grid-template-columns:120px;row-gap:6px}.a,.b{display:block;height:44px;background:#246}
```

</details>

## A button named only by CSS generated text

`W_A11Y_GENERATED_NAME` — markup rule (nothing to see on screen)

> .b is named only by CSS generated content ("Next")

![generated-name](generated-name-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><button class="b"></button></main>
```

```css
.page{display:grid;grid-template-columns:120px}.b{appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;width:120px;height:44px;background:#246;color:#fff;font-family:Roboto;font-size:16px;line-height:24px}.b::before{content:"Next"}
```

</details>

## A server-side image map

`W_A11Y_ISMAP` — markup rule (nothing to see on screen)

> .p is a server-side image map (ismap); its regions cannot be reached by keyboard

![ismap](ismap-markup.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><a class="l" href="/map"><img class="p" src="/wide.png" width="320" height="160" alt="Store map" ismap></a></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr)}.l{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block;width:100%;height:auto}
```

</details>

## aria-hidden on body

`W_A11Y_ARIA_HIDDEN_BODY` — markup rule (nothing to see on screen)

> body@P/0 has aria-hidden="true"; Chromium ignores it, but user agents that honor it hide the whole document

![aria-hidden-body](aria-hidden-body-markup.png)

<details><summary>HTML / CSS</summary>

```html
<body aria-hidden="true"><main class="m"><div class="x"></div></main></body>
```

```css
.m{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}
```

</details>

## A bottom bar under the home indicator (viewport-fit=cover)

`W_LAYOUT_SAFE_AREA` — viewport 390 × 844px

> .bar is fixed to the bottom edge of a viewport-fit=cover page, but its bottom padding (0) is less than the 34px safe area: its content sits under the home indicator. Use padding-bottom: max(…, env(safe-area-inset-bottom))

![safe-area](safe-area-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="c"></div></main><nav class="bar"><a class="l" href="/" aria-label="Home"></a><a class="l" href="/cart" aria-label="Cart"></a></nav>
```

```css
body{padding:0}.page{display:grid;grid-template-columns:minmax(0,1fr)}.c{height:200px;background:#eee}.bar{position:fixed;left:0;bottom:0;width:100%;height:56px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:8px;padding:4px 8px 0;background:#246}.l{display:block;height:48px;background:#9cf}
```

</details>

## A badge that sticks out of its card

`E_LAYOUT_PROTRUSION` — viewport 672 × 690px

> .badge sticks out of its parent .card on the inline axis

![protrusion](protrusion-violation.png)

<details><summary>HTML / CSS</summary>

```html
<main class="page"><div class="card"><div class="badge"></div></div></main>
```

```css
.page{display:grid;grid-template-columns:minmax(0,1fr);padding:24px}.card{display:grid;grid-template-columns:minmax(0,1fr);height:80px;background:#eee}.badge{height:24px;background:#c33;transform:translate(20px,-16px)}
```

</details>
