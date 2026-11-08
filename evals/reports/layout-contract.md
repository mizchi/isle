# Layout contract conformance

Source: [the contract specification](../../docs/layout-contract-language.md),
the independent [SMT reference](../../models/layout_contract/contract.smt2),
and native Chromium geometry. The accepted design separates ContractIR,
LayoutIR and ObligationIR; `layout` source syntax is still a proposal.

Machine checks:

- `tests/layout-contract.test.mjs`: 13 tests cover independent extraction,
  closed/immutable contracts, exact inputs, direct Fit checks on geometry,
  allocation/border/content dimensions, coverage per box/state/platform,
  unknown cardinality, solver failure, child requirements and range refinement.
- XOR against the independent reference is UNSAT for four cells, 8px gaps,
  the responsive boundary and stronger child requirements. Changing the
  implementation minimum from 40px to 41px yields SAT.
- `e2e/layout-contract.spec.mjs`: the 8px-gap witness reproduces in Chromium;
  184px fits. A faulty 159px breakpoint overflows at 159px; 160px fixes it.
- `examples/layout-contracts/check-contract.mjs`: four executable scenarios
  record separate coverage and conformance outcomes in
  [report.json](../results/layout-contract/report.json), including Z3's version.
- Public API type checks distinguish contract, implementation and obligations,
  and reject unsupported profiles/guarantees and mutation of contracts.

The adapter initially rejected unknown cardinality because the legacy analyzer
provides a diagnostic placeholder tree with no real structural cases. LayoutIR
now excludes that placeholder geometry, preserves the Unknown diagnostics,
and never treats it as evidence for an implementation case.

This is not a proof of the parser, CSS extraction soundness or a general
component composition theorem. Reachability, existence guards and extracted
geometry remain trusted; inherited content/font/host/platform assumptions
are retained in the proof. Native child paths are explicit caller bindings;
child bodies are still checked in full. Refinement currently compares input
ranges with identical SafeGrid/Fit guarantees, not arbitrary predicates or
external assumptions. No runtime solver or contract interpreter is emitted.
