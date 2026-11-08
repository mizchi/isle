# Resume semantics: language constraints must remove actual work

This is an executable baseline for the [proposed semantics](../../../docs/resume-semantics.md). It measures Isle, not Qwik, and does not establish relative framework performance.

```sh
just resume-semantics-audit
node tools/audit-resume-semantics.mjs --require-targets
```

The first command reports current observations. The second fails until all captured targets are met. A green audit test means the reporter is working; it does not mean the optimizer has implemented the targets.

- `flat.isle`: an entirely unused 64KiB prop must not grow the snapshot or the increment entry's capture.
- `regions.isle`: adding Show must preserve that guarantee; increment should capture `n`, not every field in the owner. Current implementation misses both targets.
- `reactive-props.isle`: the current immutable-prop syntax is rejected with `E_COMPONENT_CAPTURE`. This is a witness of the missing use case, not a decision to reinterpret existing prop syntax. When `live` inputs are implemented, migrate this fixture to the accepted syntax and add browser checks for propagation and independent resume. Acceptance alone does not prove either behavior.

The two Demo files are not equivalent full applications: the second has an extra state, event and Show. The dead-input check compares the same file with an empty vs 65,536-byte unused string, so those extra features cannot explain that payload growth.

Snapshot sizes are `JSON.stringify(snapshot)` UTF-8 bytes. Code sizes are generated module source bytes before bundling; they are not network traffic, minified sizes, timings or measured memory. Region code currently remains a shared static import for all entries of that owner. No target marks that shared module as independently lazy.

Next browser scenarios: increment while a large panel is closed; reveal it; edit one keyed row; update a parent's live value while a child sleeps; resolve an old async request after key change/unmount. Record fetched/evaluated modules, materialized slots, initializer executions and DOM mutations separately. Use Qwik 1.20.3, Qwik 2.0.0-rc.4 and Preact with equal behavior and their pinned toolchains for subsequent comparisons.
