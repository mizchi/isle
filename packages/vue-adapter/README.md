# @mizchi/css-verifier-vue

A Vue 3 SFC adapter for `@mizchi/css-verifier` (through `@mizchi/css-verifier-adapter-core`).

```js
import {analyzeVue} from '@mizchi/css-verifier-vue';
const report = analyzeVue(source, {pageCSS, viewport: {min: 320, max: 800, height: {min: 600, max: 900}}, selectors: true});
report.status; report.findings; report.selectors.warnings;
```

| Template | Choices |
|---|---|
| `v-if` / `v-else-if` / `v-else` | branch k when its condition holds and every earlier one does not |
| `v-show="x"` | `x` true / false (`style="display: none"` when false) |
| `:class` string, object, array, literal ternary | each condition true / false |
| `:attr="x ? 'a' : 'b'"` | `x` true / false |
| `v-for` | item counts `eachCounts` (default 0, 1, 2), every item taking the same choices |

The same expression source is the same condition; `!x` is its negation. Scoped styles are unscoped (`:deep()`,
`:slotted()`, `:global()` unwrapped). Unknown: child components, `<slot>`, `v-html`, `<component :is>`, a dynamic
`:class`/`:style` of another shape, `<style module>`, more states than `maxStates`.

Checks: `test/adapter.test.mjs` compares every expanded state with Vue's own `vue/server-renderer` output;
`e2e/layout-vue.spec.mjs` lays the server-rendered component out in Chromium against the analysis.
