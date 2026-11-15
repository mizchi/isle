# @mizchi/css-verifier-svelte

A Svelte 5 component adapter for `@mizchi/css-verifier`, written to check that the verifier core is not tied to
Isle's template language. It depends on the core; the core does not depend on it.

```js
import {analyzeSvelte} from '@mizchi/css-verifier-svelte';
const report = analyzeSvelte(source, {pageCSS, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
report.status;            // verified only if every template state is verified and nothing was Unknown
report.states;            // [{choices, html, report}] — one css-verifier report per state
report.selectors.warnings // selectors unused in every state (agrees with Svelte's css_unused_selector)
```

## What a state is

| Template | Choices |
|---|---|
| `{#if x}…{:else}…{/if}` | `x` true / false (`{:else if}` nests) |
| `class:name={x}` | `x` true / false |
| `class={x ? 'a' : 'b'}` | `x` true / false |
| `{#each list as item}` | item counts `eachCounts` (default 0, 1, 2), `{:else}` at 0 |
| `{#await p}` | pending / then / catch |

The same expression source is the same choice (`{#if open}` and `class:active={open}`), and `!x` is its negation.
Other correlations are not known, so states the component can never reach may be checked too: a violation may lie in
an unreachable state, while a verified result covers every enumerated state. `{#each}` is a finite model (the listed
counts, every item taking the same choices); the report's `coverage.assumptions` says so.

## Unknown

Child components, `{@html}`, `{@render}`, `<slot>`, `<svelte:element>`, a dynamic `class={…}` that is not a literal
conditional, `style:` directives and dynamic `style`, attribute spreads, and more states than `maxStates` (default 64).
Other dynamic attributes are rendered with a placeholder value and listed in `coverage.assumptions`; `{expression}`
text is placeholder text, sized by the box contracts.

## Checks

- `test/adapter.test.mjs`: the expansion against Svelte's own SSR (`svelte/server`) for every state, unused selectors
  against the compiler's `css_unused_selector`, and the Unknown cases.
- `e2e/layout-svelte.spec.mjs`: the server-rendered component with Svelte's scoped CSS in Chromium; box heights and
  the violated state agree with the analysis.
