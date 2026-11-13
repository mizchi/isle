# Endpoint layout transitions

`just noshift-check` runs nine scenarios without a browser. The CSS verifier
independently extracts both endpoint geometries, then Z3 checks `noshift/1`.
The contract explicitly matches one target across the states. It does not assert
that every child or every animation frame is stable.

| Scenario | Expected |
|---|---|
| Content grows from 24px to 80px | The following box moves 56px |
| An 80px slot reserves space | The following box stays stable |
| A fixed 120px outer frame is the only target | The frame stays stable |
| The same frame's internal action is the target | The action moves 56px |
| A 0.25px change only within 600–600.5px | A fractional responsive witness |
| Target disappears | Presence violation |
| Absolute target moves within a bordered/padded parent | Inline movement of 1px |
| Transform | Unknown |
| Scroll/clip coordinate frame | Unknown |

`just noshift-oracle` additionally measures actual rectangles in Chromium at
320, 600 and 960px, replaying CSS changes on the same DOM. It compares these to
the static model with a 0.03px tolerance. This is a supplementary test of the
analyzer, not a way to establish the static guarantee or prove browser rounding.

Results go to `evals/results/layout-transitions/report.json` and `oracle.json`.

The same check also runs `declared.mjs`: five actual Isle-source scenarios use
`ensures { noshift ".action"; }`. They verify reservation, expose a 56px movement,
reject missing/ambiguous targets, and reject a hidden target. `declared.json`
records candidate/anchor comparison counts and verifies zero emitted HTML/JS/CSS
delta from the declaration. CLI, Vite delivery and browser Z3 have separate tests.

`dom.mjs` adds seven element-requirement scenarios. It checks class changes,
same-class neighbors, movement, CSS-hidden targets, replacement by a lookalike,
and known repeat-key correspondence. It records `dom.json` with zero
emitted HTML/JS/CSS delta for `@noshift`. The generic core consumes target IDs;
all Isle syntax and source-site provenance remain in the adapter.

`keys.mjs` adds eight finite-key scenarios: stable explicit Grid placement,
reorder movement, tail insertion/removal, head removal moving a survivor,
disappearance inside a live row, duplicate keys and unsafe numeric keys.
`keys.json` records the typed key chains and before/after paths for movement
witnesses, plus zero emitted HTML/JS/CSS delta. Birth/death of whole rows is
allowed; equal live keys are compared across all finite candidate states.
Nested repeats, separate repeat sites, pure child declarations, fallback
presence and unknown item identities have regression tests. The playground
test runs the same keyed preset in browser Z3 and checks resumed DOM identity
and actual rectangle movement as a supplementary oracle.
