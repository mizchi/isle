import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHTML} from '../src/html.mjs';
import {resolveUAProfile, suggestReset} from '../src/index.mjs';

const css = '*{margin:0}html,body{margin:0;display:grid;grid-template-columns:minmax(0,1fr)}.g{display:grid;grid-template-columns:minmax(0,1fr);justify-items:start;align-content:start}.f{display:block;box-sizing:content-box;inline-size:120px;block-size:24px}';
const width = ua => { const r = analyzeHTML('<html lang="en"><body><main class="g"><button class="f" type="button" aria-label="Go"></button></main></body></html>', {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, ...(ua ? {ua} : {})}); return Number(r.sizes.find(x => x.box === '.f').rect.inlineSize.constant); };

test('ua profiles: the button box follows the browser (Chromium 1px 6px, Firefox 1px 4px), and overrides replace values', () => {
  assert.equal(width(), 136); // the historical Chromium default
  assert.equal(width('chromium'), 136);
  assert.equal(width('firefox'), 132);
  assert.equal(width({base: 'webkit', button: {padding: ['0px', '10px', '0px', '10px']}}), 144);
  assert.deepEqual(resolveUAProfile({base: 'firefox', checkbox: {size: 16}}).checkbox, {margin: ['3px', '3px', '3px', '4px'], size: 16});
  assert.throws(() => resolveUAProfile('ie'), /ua must be one of chromium, firefox, webkit/);
});

test('suggestReset: one rule per value the browsers disagree on, none for the values they share', () => {
  const all = suggestReset();
  assert.match(all.css, /font: inherit/);
  assert.match(all.css, /input\[type="checkbox"\], input\[type="radio"\]\) \{\n  margin: 0;/); // WebKit's margins
  assert.doesNotMatch(all.css, /range/); // the range margin is 2px everywhere
  // Chromium and Firefox share the checkbox margins and the text field padding: no rule for them.
  const two = suggestReset({browsers: ['chromium', 'firefox']}).css;
  assert.doesNotMatch(two, /margin: 0/);
  assert.doesNotMatch(two, /input:not\(\[type\]\)/);
  // One browser: nothing differs, nothing to reset.
  assert.equal(suggestReset({browsers: ['webkit']}).rules.length, 0);
  assert.ok(all.notes.some(n => /button colors differ/.test(n)));
});
