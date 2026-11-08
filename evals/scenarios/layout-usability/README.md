# Docs-only npm consumer evaluation

Two tasks exercise the same public package a consumer receives:

- [author brief](author-brief.md): resumable review queue, universal child components, SafeGrid declarations, bounded keyed updates.
- [diagnosis brief](diagnosis-brief.md): repair a failing responsive boundary without weakening contracts.

The [goals](goals/) are observable facts, not reference source. The independent grader builds the consumer, verifies deployment certificates, checks native browser geometry and interactions, then rebuilds in SSR-only mode and rejects JS/Wasm payloads.

```sh
just package-build
# Install the resulting archive and Vite 8.3.5 in a consumer outside this workspace.
just layout-usability-grade author /absolute/path/to/consumer
just layout-usability-grade diagnosis /absolute/path/to/consumer
```

Consumers need Node.js 24+ and pnpm; they do not run MoonBit. The grader needs this repository's installed Playwright/Chromium. It uses the consumer's own Vite config, `app.isle`, and `index.html`, and overrides output directories with `--outDir`. Author builds must honor `vite build --mode ssr`.

For fresh agents, physically stage only README.md, README.ja.md, public docs (exclude `docs/reports/` and `docs/issues-drafts/`), the task brief/goal, and the package archive. Allow only this staged tree and the agent's own consumer directory. Permit running the grader but forbid reading its source, installed framework internals, examples, tests, other attempts, and goal implementations. Keep the four acceptance-round budget and record ordinary CLI/build invocations separately. Never pass previous fixes or reports to the next agent. Archive logs, exact diagnostics, code and an honest report under [attempts](attempts/).

The historical attempts preserve their original package/lock paths; to replay on another machine, replace the local tgz dependency with a fresh archive and reinstall. Large full reports may be stored as `.gz`. No `node_modules` or generated distribution is committed.

The grader covers the stated facts. It does **not** currently reject state updates caused by clicking a card heading; two agents independently found that overly broad bubbling workaround. See [EVAL-04](../../../docs/issues-drafts/04-owner-event-projection.md). A grader pass does not establish complete UX correctness or universal CSS validity.

Five valid fresh-agent runs passed; one contaminated run was stopped and excluded. [Reports and next priorities](../../../docs/reports/README.md).
