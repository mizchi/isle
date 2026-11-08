# Author a component layout contract

Create a four-cell Grid component with scoped CSS. Each cell has a 40px
border-box minimum and fixed 40px height. Declare SafeGrid with allocated width
160–640px and height 40–640px directly in the component. The ordinary markup and
event syntax must remain usable alongside the declaration.

The consumer should read the declaration as requirements on the parent and
Fit guarantees on the implementation. It must not set a CSS size, assert its
own guarantee, or disappear from production checks.

Acceptance:

- `layout app.isle` needs no sidecar for this closed example.
- A 41px minimum or 8px gap fails the declared range.
- CSS changed to one column fits at 120px, but an explicit deployment interval
  starting at 120px still fails Requires.
- Unknown geometry and unsupported profiles fail closed.
- Nested pure/client declarations bind to their actual native roots; branches
  sharing a path do not apply each other's contracts.
- The source has no runtime solver, contract attributes or extra JS modules.

Working example: [declared.isle](../../../examples/layout-contracts/declared.isle).
Results: [layout-declarations.md](../../reports/layout-declarations.md).
