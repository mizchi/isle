# Overlay editor validation

The textarea remains the input and scroll owner. The decoration is inert and
`aria-hidden`; its clip matches the textarea client area, excluding scrollbars.

- `node --test tests/playground-editor.test.mjs`: lossless Isle/CSS/JSON tokenization,
  incomplete edits, raw HTML payloads, tabs and trailing newlines.
- `just playground-check`: editor tests at 390px and 1440px, all four fields,
  native scrollbars, wheel input, both scroll axes, resize, selection and undo;
  resetting a preset returns every field's caret and scroll to the start.
  A native textarea screenshot is the visual oracle; vlmkit exempts measured
  edge/compositing noise only. A deliberate 1px offset must be detected.
- Composition events exercise the native-text fallback; this does not replace
  manual testing with a real IME. Forced colors also use native text.
- `just playground-quality`: all 11 gates passed. Clipping warnings refer to
  the intentionally clipped decoration, while the textarea owns the complete
  scrollable value. Handler-inventory warnings are covered by the browser tests;
  Compile/Reset/download probes report no layout delta for unchanged output.

No animation or editor dependency was added. The compiler, generated app runtime
and source values are unchanged by highlighting.
