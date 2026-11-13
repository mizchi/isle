# Playground display review

The `source noshift` browser test exercised the actual preset, Z3 Worker and
compiled preview. Verification decisions use the static model; these screenshots
and the integrity gate are supplementary UI checks.

- At 1440px, source and preview remain in two columns. The reserved pale slot,
  green content strip and plus control are visible. The proof status reports two
  checked noshift comparisons.
- At 390px, controls and panels stack. Source retains its horizontal editor
  scrolling. The preview shows the same reserved slot and plus control after the
  iframe is brought into view; proof text wraps within its panel.
- Removing reservation displays `E_NOSHIFT_BLOCK_START` in the violation banner.
  The compiled preview remains usable for inspecting the failing implementation.
- Changing the target to `.missing` displays Unknown and the unique-target
  diagnostic. SMT output remains available.

`vlmkit/0.24.0` integrity: pass, zero suspects, three warnings about the clipped
decorative `pre` overlays of native scrolling editors. No rule was disabled.
Machine output is in `playground-integrity.json`. Screenshots are generated under
`test-results/playground` by the E2E test and are not used as proof artifacts.

The DOM requirement preset was also reviewed at 1440px and 390px. The expanded
green content fills its reserved slot while the plus control stays below it.
The desktop source view shows `@noshift` in attribute colouring; the mobile source
retains native scrolling. The proof panel shows two completed comparisons after
the control resumes and its class changes. The DOM test additionally exercises
movement, CSS-hidden targets and rejection of a computed requirement.
`playground-dom-integrity.json`: vlmkit/0.24.0 pass, zero suspects and three
decorative editor-overlay clipping warnings, with no rules disabled.

The keyed-row preset was reviewed after a real resume/reorder at 1440px and
390px. Two green 40px rows keep their screen positions while DOM order changes;
the same DOM node for key `a` survives. The proof panel reports two noshift
comparisons. At phone width the controls, source and preview stack, with native
editor scrolling retained. Removing explicit Grid placement shows
`E_NOSHIFT_BLOCK_START`; the same keyed DOM node then moves 40px in Chromium,
matching the static counterexample. The complete playground suite passes
29 tests. The shell integrity gate in `playground-keys-shell-integrity.json`
passed with vlmkit/0.24.0: zero suspects and the same three decorative editor
overlay clipping warnings, without disabling rules. That gate loads the default
shell; the selected keyed preset is covered by the browser test and screenshots.
