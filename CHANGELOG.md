# Changelog

## 2026-11-08 — CSS shorthand audit

- Reject invalid margin arity before it can produce a zero-margin layout proof, including values resolved through CSS variables. Preserve an actual Chromium overflow witness and its corrected counterpart.
- Audit supported shorthand cascade against Chromium; document that overwrite-intent lint and font/background reset detection remain outside the layout checker. [Scope and results](docs/css-shorthands.md).

## 2026-11-08 — lexical parent events in universal children

- Resolve EVAL-04 with existing `children: RenderFragment`: project parent-owned buttons through universal region templates, preserving scope and client ownership boundaries.
- Avoid capture by receiver loops, collection lambdas and error binders. No browser runtime files or snapshot format change.
- Add a checked review example and opt-in `--event-scope` grader; the old bubbling workaround fails the stronger probe.
- Validate one new docs-only consumer against the stronger task; preserve its code and logs. Add EVAL-07 schema-annotation guidance and a generated complete npm guide.
- Add compiler/build, native interaction, async-action, browser-compiler and Pages regression coverage. [Evaluation report](docs/reports/2026-11-08-layout-usability-v5.md).

## 2026-11-08 — docs-only consumer feedback loop

- EVAL-01: accept labels for supported native `output` and `button` elements; retain hidden-input and multiple-control rejection.
- EVAL-02: make `isle --help` / `-h` successful and use the npm command name.
- EVAL-03 (partial): add `isle layout ... --summary` with source locations, failure intervals and grouped instances; preserve default JSON / `--json` and fail-closed status.
- EVAL-05: distinguish the failing box from the contracts being checked in summaries.
- EVAL-06: remove compiler-development toolchain requirements from npm consumer instructions.
- Add two consumer scenarios, an independent build/browser/SSR grader, and five valid fresh-agent runs. One contaminated run is retained but excluded.
- Update derived-trait syntax for the current MoonBit deny-warn gate. Browser runtime files remain unchanged.

Remaining: EVAL-03 parent grid/media provenance, threshold derivation and Vite diagnostic grouping. [Evaluation reports](docs/reports/README.md) explain the evidence and limitations.
