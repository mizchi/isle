# @mizchi/css-verifier-react

A React (JSX/TSX) adapter for `@mizchi/css-verifier`, with the style systems that leave a static stylesheet.

```js
import {analyzeReact} from '@mizchi/css-verifier-react';
analyzeReact(source, {pageCSS, viewport, accessibility: true});            // StyleX or Linaria in the module
analyzeReact(source, {pageCSS, viewport, css: readFileSync('app.css', 'utf8')}); // plain classNames
```

| JSX | Choices |
|---|---|
| `{cond && <X/>}`, `{cond ? <A/> : <B/>}` | `cond` true / false |
| `{xs.map(x => <Li/>)}` | item counts `eachCounts` (default 0, 1, 2) |
| `className={cond ? 'a' : 'b'}`, `cx(a, cond && b, {c: d})` | each condition true / false |
| `{...stylex.props(s.a, cond && s.b, c ? s.d : s.e)}` | each condition true / false |
| `attr={cond ? 'a' : 'b'}` | `cond` true / false |

**StyleX**: `stylex.create` objects are read statically; `stylex.props(...)` merges per property with the later
argument winning (StyleX's rule, independent of definition order), including condition objects (`default`,
`':hover'`, `'@media …'`). Each element state gets one class with its merged declarations.
**Linaria**: `css```, `styled.tag``` become a class per template in definition order; `&` nesting and `@media`
blocks are flattened.

Unknown: other components, `dangerouslySetInnerHTML`, dynamic `className`/`style` of other shapes, spreads other
than `stylex.props`, StyleX values that are not static literals, Linaria interpolations, early returns, more states
than `maxStates`.

Checks: `test/adapter.test.mjs` compares the expanded states with react-dom/server's markup (for StyleX, rendered
from StyleX's own compiler output); `e2e/layout-react.spec.mjs` lays the rendered states out in Chromium with
StyleX's compiled CSS and Linaria's nested templates and compares every box's position and size with the analysis.
