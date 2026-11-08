# Lexical parent events

This scenario closes [EVAL-04](../../../docs/issues-drafts/04-owner-event-projection.md).
The [minimal fixture](fixture.isle) exercises a conditional universal card with a
parent-owned button projected through `children: RenderFragment` inside `For`.
The [public example](../../../examples/lexical-events/) also preserves both
SafeGrid declarations and the original review-queue interactions.

Required facts:

- Only the native button receives its parent event binding; headings and card
  padding are inert.
- A click updates only the selected record once. Keyboard activation uses the
  same native button. The card root survives a completion update under All.
- Projection preserves caller locals through receiver loops, collection lambdas
  and error fallbacks, including identical source variable names.
- Events and mutable values cannot cross an independent client owner. Fragments
  are not props/state/snapshot wire values.
- The client gets the same executable handler/region plan as a directly written
  native template. SSR-only builds emit zero JavaScript chunks.

```sh
just lexical-events-check
just lexical-events-quality
# After installing a local package archive in an external consumer:
node tools/grade-layout-usability.mjs author /absolute/consumer --event-scope
```

The stronger grader rejects the old bubbling workaround. Historical author
results used the original grader and remain valid only for their original facts.
The new probe is opt-in so those measurements are not silently redefined.

No new temporal transition or browser resource protocol is added. Regression
tests check lexical substitution, owner boundaries and production output;
existing region E2E checks cover reorder, delayed import, DOM replacement and
owner disposal using projected buttons. This is not a proof of the whole compiler.
