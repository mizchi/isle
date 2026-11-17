// Tests whose oracle or outcome differs outside Chromium, measured by running the layout e2e in Firefox and WebKit.
//   kind 'oracle':   the test reads something only Chromium exposes (Layout Instability API, forced-colors emulation):
//                    skipped there.
//   kind 'baseline': the browser lays out or paints differently from the Chromium baseline the checks assume: the test
//                    is expected to fail there (test.fail), so it is reported when the browser starts to agree.
// The categories are the CSS baseline the static checks would need per browser (see docs/css-baseline.md).
export const browserBaseline = [
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "a rowspan cell of stacked px blocks grows its rows like Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "a rowspan cell stacks gapped one-column grids and column flexes like Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "an auto-width automatic table shrinks to its content like Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "automatic tables mixing px and content columns share width like Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "automatic tables share width between min- and max-content like Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "defaultColors: with no dark color-scheme Chromium paints canvastext black on a white canvas under th",
  "firefox": {
   "kind": "baseline",
   "category": "canvas colors",
   "note": "the canvas and canvastext under the dark preference differ from Chromium (#121212)"
  },
  "webkit": {
   "kind": "baseline",
   "category": "canvas colors",
   "note": "the canvas and canvastext under the dark preference differ from Chromium (#121212)"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "forced-colors focus: an indicator made only of box-shadow or colour disappears in Chromium forced co",
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "forced colors are emulated only in Chromium"
  }
 },
 {
  "file": "layout-accessibility.spec.mjs",
  "title": "forced-colors: controls drawn only by fill or shadow lose their edge in Chromium forced colors, as w",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "forced colors are emulated only in Chromium"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "forced colors are emulated only in Chromium"
  }
 },
 {
  "file": "layout-axes.spec.mjs",
  "title": "size containment, auto row stretching and intrinsic fr heights match native Grid",
  "webkit": {
   "kind": "baseline",
   "category": "grid",
   "note": "the height of a size-contained grid item and its auto rows differs"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "CSS animations: transform is never a layout shift, a margin animation shifts every frame",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "a :hover layout change is a layout shift (hover is not an input that excuses it)",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "a long word: the text overflows its 200px box in Chromium exactly where the static check warns, and ",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "where a long word overflows (overflow-wrap) differs"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "buttons paint ButtonText on ButtonFace unless the author sets colors: the static contrast verdict ag",
  "webkit": {
   "kind": "baseline",
   "category": "system colors",
   "note": "ButtonFace / ButtonText differ (WebKit paints #c0c0c0 behind buttons)"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "carousels: scrolling and transform tracks never shift; margin tracks and variable-height slides do",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "device pixel ratio branches: resolution media and density srcset agree with Chromium",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "font swap warnings: text whose box follows the web font shifts in Chromium; warned-free cases do not",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "image distortion: the static fill-stretch warning holds exactly where Chromium draws the picture off",
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "the test decodes its generated image with a Chromium-only format"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "image fallback: an inline img with alt text that fails shifts even when sized; a block one keeps its",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "images: width/height attributes reserve the box; an unsized picture source does not",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "noshift ignores transforms like Chromium layout shifts: a transformed state verifies, a resized one ",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "picture: static per-media source reservations agree with Chromium layout shifts",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "static :hover layout-shift findings agree with Chromium",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "static animation layout-shift findings agree with Chromium",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "static carousel slide-switch findings agree with Chromium layout shifts",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-cls-facts.spec.mjs",
  "title": "static image reservation checks agree with Chromium layout shifts",
  "firefox": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  },
  "webkit": {
   "kind": "oracle",
   "category": "oracle",
   "note": "layout shifts are read from the Layout Instability API (layout-shift entries), which only Chromium has"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "automatic tables: auto width, explicit width, one auto column and fitting text: model rectangles mat",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "column with centered fixed-width items: model rectangles match Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "layout units",
   "note": "WebKit snaps positions to 1/64 px (a third of a pixel lands off the exact fraction)"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "crossing rowspans follow Chromium order (lower start row first): model rectangles match Chromium",
  "firefox": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "fixed content-box table with thead, tbody and cell padding: model rectangles match Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "fixed table with a spanning first row and spacing: model rectangles match Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "justify-content: space-around: model rectangles match Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "layout units",
   "note": "WebKit snaps positions to 1/64 px (a third of a pixel lands off the exact fraction)"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "nested px rowspan cells sharing a first row: model rectangles match Chromium",
  "firefox": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  },
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "rowspan cells starting inside another span, and an empty last row: model rectangles match Chromium",
  "firefox": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  },
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-flex.spec.mjs",
  "title": "taller px rowspan cells with content grow their rows: model rectangles match Chromium",
  "firefox": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  },
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "a measured text rowspan cell grows its rows like Chromium",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "a measured text rowspan cell in a viewport-wide table follows its line count",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "a rowspan cell stacking a px block and wrapping measured text follows the line count",
  "webkit": {
   "kind": "baseline",
   "category": "tables",
   "note": "table layout differs: how rowspan cells grow rows and how automatic tables share column widths"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "break opportunities match Chromium on every class pair and random strings",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "inline bounds in wrapping text follow the line layout",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "inline element bounds contain the rendered inline box",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "lang-specific line profiles match Chromium in that language",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "letter-spacing (px, or em made px at its element) is measured like Chromium lays it out",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "modeled line counts match Chromium (lang=en)",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "modeled line counts match Chromium (lang=ja)",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "rendered single-line widths lie between the shaped advance and the derived bound",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "right-to-left Hebrew widths and line profiles match Chromium; Arabic stays outside",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "spaced line profiles (letter 0.12em, word 0.16em) match Chromium",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  },
  "webkit": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 },
 {
  "file": "layout-text-fonts.spec.mjs",
  "title": "the wrapping example: heights match Chromium and the body overflows where reported",
  "firefox": {
   "kind": "baseline",
   "category": "text",
   "note": "line breaking (UAX #14, CJK punctuation) and shaping (letter-spacing, Hebrew) differ from Chromium"
  }
 }
];

/** For test.beforeEach: skip or expect a failure where this browser differs from the Chromium baseline. */
export function applyBrowserBaseline(testInfo) {
  const browser = testInfo.project.name;
  if (browser === 'chromium' || process.env.BASELINE_OFF) return;
  const entry = browserBaseline.find(e => testInfo.title.startsWith(e.title) && testInfo.file.endsWith(e.file))?.[browser];
  if (!entry) return;
  if (entry.kind === 'oracle') testInfo.skip(true, `${browser}: ${entry.note}`);
  else testInfo.fail(true, `${browser} differs from the Chromium baseline (${entry.category}): ${entry.note}`);
}
