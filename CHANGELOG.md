# Changelog

## 2026-11-08 — docs-only consumer feedback loop

- EVAL-01: accept labels for supported native `output` and `button` elements; retain hidden-input and multiple-control rejection.
- EVAL-02: make `isle --help` / `-h` successful and use the npm command name.
- EVAL-03 (partial): add `isle layout ... --summary` with source locations, failure intervals and grouped instances; preserve default JSON / `--json` and fail-closed status.
- EVAL-05: distinguish the failing box from the contracts being checked in summaries.
- EVAL-06: remove compiler-development toolchain requirements from npm consumer instructions.
- Add two consumer scenarios, an independent build/browser/SSR grader, and five valid fresh-agent runs. One contaminated run is retained but excluded.
- Update derived-trait syntax for the current MoonBit deny-warn gate. Browser runtime files remain unchanged.

Deferred: EVAL-04 parent-owned event projection through universal children in `For`; EVAL-03 parent grid/media provenance, threshold derivation and Vite diagnostic grouping. [Evaluation reports](docs/reports/README.md) explain the evidence and limitations.
