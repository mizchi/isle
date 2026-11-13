# CSS verifier

An experimental, framework-independent CSS verification library. It analyzes a
finite box tree and a complete author stylesheet without rendering a page or
executing application code. Isle is one input adapter; the core has no dependency
on the Isle compiler, its syntax, or a browser renderer.

The provisional package name is `@mizchi/css-verifier`. It is private and has not
been published. From this checkout, create and install a local archive:

```sh
pnpm --dir packages/css-verifier pack --pack-destination /tmp
pnpm add /tmp/mizchi-css-verifier-0.0.1.tgz
```

## Verify static HTML

```js
import {analyzeHTML} from '@mizchi/css-verifier/html';
import {verifyLayoutReport} from '@mizchi/css-verifier/z3/node';

const report = analyzeHTML(
  '<main class="row">' + '<div class="cell"></div>'.repeat(4) + '</main>',
  {
    name: 'Four',
    css: `
      * { box-sizing: border-box; }
      .row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .cell { min-width: 40px; }
    `,
    viewport: {min: 160, max: 1200},
  },
);

console.log(report.status); // verified
const proof = await verifyLayoutReport(report);
if (proof.status !== 'verified') throw new Error(JSON.stringify(proof));
```

The HTML adapter accepts one fragment root. Unsupported rendering attributes,
foreign/replaced elements, and parse recovery produce `unknown`. Inline `style`
attributes currently need a different adapter; pass CSS as a complete stylesheet.

## Supply a box tree from another tool

```js
import {analyzeLayout} from '@mizchi/css-verifier';

const report = analyzeLayout(
  {tag: 'div', classes: ['message'], text: true},
  {
    name: 'Message',
    css: '* { box-sizing: border-box; }',
    viewport: {min: 320, max: 1200},
    boxes: {'.message': {minInlineSize: 240}},
  },
);
```

Trees are cloned before analysis. Cycles, shared nodes, invalid fields and
ambiguous paths are rejected. Adapters must faithfully describe the concrete
structure, text presence, class/id values, ancestors, and stylesheet cascade.
`name`, `owner`, and the historical report field `component` are opaque identifiers;
they do not require framework components. Framework props and state machines
belong to adapters. An adapter may enumerate finite structural cases and must
establish their coverage separately.

## What a result means

- `verified`: every modeled obligation holds throughout the supplied responsive
  domain, conditional on the report's assumptions.
- `violated`: a supported rule is forbidden by the profile, or a failing input
  region was found. Geometric failures include rational endpoints and a witness.
- `unknown`: the model is incomplete or unsupported. A strict build must reject
  both `violated` and `unknown`, and must also reject thrown input/limit errors.

Current scope includes Grid box geometry, a row/column flex subset (row wrapping, grow/shrink with minimum freezing, justify-content, main-axis auto margins and cross-axis alignment), Grid justify-content, `display: contents`, reset/cascade/custom properties,
supported media/container conditions, both axes, limited subgrid, exact declared
scrollbar profiles, and explicitly sized local absolute positioning. It checks
continuous regions, including boundaries and fractional widths. It does not
prove arbitrary CSS, font metrics, browser pixel rounding, ink overflow, CLS, or
contrast. `minInlineSize` / `minBlockSize` are **trusted sufficient content bounds**;
`intrinsicBlockSize` is a **trusted exact** height or width-dependent height
profile. They are assumptions supplied by a caller, not facts verified from text.

ContractIR, LayoutIR, and ObligationIR remain separate. Use `/contracts` for
`SafeGrid` / `PositionedGrid` contracts and `/contracts/node` for Node Z3 helpers.
The `component` field in a ContractIR is a named verification unit, using the
existing uppercase identifier convention. Geometry is extracted independently of
these contracts, then checked for coverage and conformance.

## Explain a counterexample

Geometric findings carry `explanation: {version: 1, available, required}`.
Each side lists the cascade winners that produced it (file, line, selector,
layer, specified value and enclosing `@media`/`@container` conditions), the
declarations they overrode, and matching declarations whose conditions are
false in the failing region (`dormant`). `available` follows the parent's
tracks, gaps and the item's placement up to a definite length or the viewport;
`required` cites the box's own sizing. Trusted caller bounds appear as
`{kind: 'contract', trusted: true}`. Explanations are attached after the
geometry is decided and never change the status, regions or proof.

## Derive text sizes from a font

`/text/node` measures text with [mizchi/font](https://github.com/mizchi/font)
0.8.0 (OpenType shaping, MoonBit compiled to JS, build-time only) and resolves
`{text}` box contracts into size contracts:

```js
import {loadTextMetrics} from '@mizchi/css-verifier/text/node';
const metrics = await loadTextMetrics({fonts: {'Noto Sans JP': {file: 'NotoSansJP.ttf'}}});
const font = {family: 'Noto Sans JP', size: 16, lineHeight: 24, weight: 400};
const report = analyzeLayout(tree, metrics.resolveOptions({
  ...options,
  boxes: {'.name': {text: {font, characters: '日本語ABC123', maxLength: 12}}},
}));
```

The bound is the shaped advance rounded up to 1/64 px plus 1/64 px (Chromium's
LayoutUnit). A character domain bounds every string of up to `maxLength`
characters by the widest character and the largest pair adjustment; findings
report `text.fitsUpTo`. The core checks that the computed CSS font equals the
measured one and otherwise reports Unknown. Only single-line (`nowrap`) text
is modeled. Build the FFI with `just css-text-build`.

## Differential cascade oracle (development only)

`oracle/` builds [mizchi/css](https://github.com/mizchi/css), an independent
MoonBit CSS engine, to JS and compares the shared computed-value subset on a
deterministic corpus using mizchi/css 0.8.2, including flex properties. Any
difference fails; the cases that differed in 0.8.0/0.8.1 (all mizchi/css bugs,
fixed in 0.8.1/0.8.2) are kept as agreement regressions. It is not part of the package files. Run
`just css-oracle-check` from the repository root (MoonBit required).

## Compare layout transitions

`/transitions` extracts endpoint relations independently of a `noshift/1`
contract. `/transitions/node` verifies exact presence and border-rectangle
equality for explicitly matched targets:

```js
import {createNoShiftContract} from '@mizchi/css-verifier/transitions';
import {verifyNoShift} from '@mizchi/css-verifier/transitions/node';

const contract = createNoShiftContract({
  name: 'Load',
  targets: [{name: 'action', before: 'Page/1', after: 'Page/1'}],
});
const result = await verifyNoShift(beforeReport, afterReport, contract);
```

Input adapters can also attach `targets: ['action']` to a box tree and use
`before: {id: 'action', within: 'Page'}` / `after: {id: 'action', within: 'Page'}`.
These are semantic IDs, independent of HTML classes, DOM `id` attributes and
box-tree paths. Missing IDs violate presence; ambiguous or
`targetIdentity: 'unknown'` mappings remain Unknown. Adapters establish identity
and lifetime correspondence. The core knows no template-annotation syntax.

Reports must cover identical width/height and host domains, with one concrete
structural/platform case each. Targets must remain present, with equal
root-relative inline/block starts and border sizes everywhere in that domain.
Missing coordinate coverage, scroll/clip or subgrid frames, unequal environments,
unsupported CSS and solver failures produce `unknown`. A fixed outer box only
certifies that selected box. This endpoint relation does not prove intermediate
frames, text/paint stability or a browser CLS value. See the
[complete guide and runnable examples](../../docs/layout-transitions.md).

The root and `/html` entry points do not initialize Z3. `/z3`, `/contracts` and `/transitions`
accept an externally initialized Z3 API, including Wasm in a browser Worker.
`/z3/node`, `/contracts/node` and `/transitions/node` own solver startup and teardown. All verification
is tooling; no verifier or solver belongs in the application's UI runtime.

Run `just css-verifier-check` from the repository root. The
[responsive example](examples/responsive.mjs) checks a correct breakpoint and
finds a one-pixel failure interval in an incorrect one without a browser.

The adopted architecture and verification boundaries are described in
[静的UI検証の方針](../../docs/static-ui-verification.md).
