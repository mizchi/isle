# @mizchi/css-verifier-adapter-core

The part the component adapters (Svelte, Vue, React with StyleX or Linaria) share: template states as choices,
the analysis of every state with `@mizchi/css-verifier`, the findings per state, and the lint output. It depends
on the core; the core knows nothing of components.

```js
import {analyzeStates, lint, formatText, recommended} from '@mizchi/css-verifier-adapter-core';

// An adapter turns a component into its states ({html, choices}) and its CSS.
const result = analyzeStates({states, css, unknowns, assumptions}, {pageCSS, viewport, accessibility: true, assumeText: true});
result.status;    // verified only if every state is verified and the adapter met nothing Unknown
result.findings;  // [{code, box, path, severity, message, states, html}]

// Lint messages: the recommended rules (checked against Chromium), with source lines and states.
const messages = lint(result, {file: 'Card.vue', source});
console.log(formatText(messages));
```

## Choices and states

`merge`, `choose`, `product(lists, {maxStates})` and `conditionKey` build the states: a choice names the
condition a branch takes (`!` for its negation); combinations that take one condition both ways are dropped, and
more than `maxStates` states is Unknown.

## lint

- `profile: 'recommended'` (default) keeps the rules in `recommended` (code → severity and a fix): their verdicts
  are compared with Chromium in the e2e suites and the differential fuzz harnesses. `profile: 'all'` keeps every
  error and warning.
- Findings outside the rule set are kept as `info` ("outside the recommended rules"); a box the analysis does not
  go into is "not checked", as are the adapter's and each state's Unknowns. Nothing found disappears.
- Page-level rules (h1, main landmark, skip link, landmarks) are left out for a component; `page: true` keeps them.
- `assumeText` sizes text without a font contract as one 24px line with no minimum width, and says so as an
  assumption. Inline svg content and phrasing elements inside text are not separate text boxes.
- `defaultFontSize` (px) resolves `rem` against an assumed browser default font size when the page does not set a
  px root size; it is listed as an assumption. The CLI passes 16.
- `textMetrics` (from `loadTextMetrics`) with `fonts`: assumed texts whose computed font is one of those families
  are measured instead (a first pass reports each text's font, `reportTextFonts`; a second analyses with the derived
  contracts). The CLI's `--font Family=file.ttf` sets them.
- A state whose analysis throws is Unknown (`U_ADAPTER_ANALYSIS`), never a crash.

The CLI is `tools/css-lint.mjs` ([docs/component-lint.md](../../docs/component-lint.md)).
