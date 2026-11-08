# Source layout declarations

Source of truth: the accepted [contract language](../../docs/layout-contract-language.md)
and independent CSS extraction. Declarations are component statements; they do
not execute TypeScript or change rendered HTML, CSS scope hashes, snapshots or
handler code.

Machine checks:

- `tests/layout-syntax.test.mjs`: Node/browser parity, closed grammar, profile
  and bounds rejection, source offsets with Unicode, state/derive/event
  coexistence, actual input checking and automatic pure/alias/client bindings.
  Conditional calls sharing a native path retain their own structural cases.
- `tests/layout-declaration-build.test.mjs`: Vite enables owned CSS and emits
  declaration proofs without a sidecar. CSS violations, out-of-range deployment
  inputs and wrapped mounts cannot bypass the gate. Static output has zero
  JavaScript or Wasm chunks.
- `tests/layout-syntax-cli.test.mjs`: sidecar-free checking and explicit
  deployment inputs share the same declaration checker.
- `playground/tests/playground.spec.mjs`: actual Z3 Wasm checks the source
  declaration, mandates verification, rejects invalid allocation even when CSS
  fits, exposes separate SMT queries, and recovers after an invalid profile.
- [report.json](../results/layout-declarations/report.json): executable CLI
  outcomes for a valid grid, 41px minimum, fitting CSS with an invalid allocation,
  unresolved geometry and an invalid profile. Solver versions and witnesses
  are retained.

The distinction between conditional conformance and an instantiated component
is load-bearing. `createObligationIR` checks guarantees over Requires;
`createInstanceObligationIR` keeps the deployment domain and checks Requires
against independently extracted allocated dimensions. Reusing Requires as
the instance domain would incorrectly accept the fitting-CSS/120px case.

Whole-compiler/browser soundness and modular proofs that omit child bodies are
not claimed. Source declarations use the first SafeGrid/Fit subset; production
uses the existing closed-document restrictions. Inferred viewport intervals
are defaults, not assumptions about the actual root allocation.
