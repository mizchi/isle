# CSS variable analysis

Source of truth: CSS Variables 1 Editor's Draft (2026-10-09), current WPT, and
native Chromium computed geometry. The 2022 CR snapshot differs on unused
fallback cycles. The portable profile returns Unknown for fallback-dependent
cycles instead of choosing either behavior; an 80px primary / 40px fallback
case guards against a false Verified result.

Machine checks:

- `tests/layout-variables.test.mjs`: case-sensitive names, computed inheritance,
  cascade/layers, pending shorthands, ancestor boundaries, conditional regions,
  cycles, token separation and bounded expansion.
- `e2e/layout-variables.spec.mjs`: 16 native geometry cases and 12 media/container
  boundary samples. The original eager cycle model disagreed with Chromium;
  the conservative Unknown profile reproduces and preserves that distinction.
- `tests/layout-z3.test.mjs`: XOR of the variable-based responsive obligations
  and the independent `models/css_layout/contract.smt2` is UNSAT. Changing the
  40px binding to 41px yields SAT, detecting the broken variant.
- `tests/inline-css-build.test.mjs`: the checked variable example is UNSAT and
  delivers native `var()` CSS with zero application JavaScript/Wasm chunks.
- `playground/tests/playground.spec.mjs`: actual Z3 Wasm verifies the preset,
  detects the 41px counterexample, reports a cycle and recovers with a fallback.

No general proof of the CSS parser, variable resolver or browser is claimed.
The emitted application has no variable-resolution runtime. See
[the user guide](../../docs/css-variables.md) for the closed-world assumptions,
limits and intentionally unsupported syntax.
