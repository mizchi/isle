// Static checks that combine the DOM (roles, names, aria-hidden, tree and
// paint order) with the cascade and the symbolic geometry. Opt-in through
// `options.accessibility`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLayout} from '../src/index.mjs';

const reset = '* { box-sizing: border-box; margin: 0; }\n';
const domain = {min: 320, max: 1280, height: {min: 400, max: 900}};
const run = (tree, css, options = {}) => analyzeLayout(tree, {name: 'Page', css: reset + css, viewport: domain, accessibility: true, ...options});
const find = (report, code) => report.diagnostics.filter(d => d.code === code);
const text = {minInlineSize: 1, intrinsicBlockSize: 20};

test('accessibility rules are opt-in and listed in the report', () => {
  const tree = {tag: 'main', classes: ['row'], children: [{tag: 'div', classes: ['a']}]};
  const css = '.row { display: grid; grid-template-columns: minmax(0, 1fr); }\n';
  assert.equal(analyzeLayout(tree, {name: 'Page', css: reset + css, viewport: domain}).accessibility, undefined);
  const report = run(tree, css);
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.accessibility.rules, ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable', 'empty-heading', 'heading-order', 'nested-interactive', 'duplicate-id', 'aria-reference', 'positive-tabindex', 'multiple-main', 'scrollable-region-focusable', 'reflow', 'focus-obscured', 'focus-area', 'pointer-disabled', 'small-text', 'target-size', 'image-alt', 'form-label', 'label-for', 'list-structure', 'radio-group', 'landmark-name', 'role-valid', 'interactive-role-focusable', 'link-in-text-block', 'table-headers', 'td-headers', 'fieldset-name', 'label-in-name', 'link-purpose', 'link-text', 'role-parent', 'role-children', 'role-attr', 'aria-attr', 'aria-value', 'presentation-conflict', 'empty-th', 'redundant-alt', 'title-only', 'input-button-name', 'autocomplete', 'scope', 'html-lang', 'lang-valid', 'page-h1', 'region', 'bypass', 'landmark-top-level', 'duplicate-landmark', 'p-as-heading', 'orientation', 'focus-visible', 'text-spacing', 'state-contrast', 'frame-title', 'video-caption', 'autoplay-audio', 'hover-only', 'clickable-look', 'list-style-semantics', 'motion', 'blink', 'definition-list', 'accesskeys', 'server-side-image-map', 'aria-hidden-body', 'input-image-alt', 'fragment-target', 'page-main', 'icon-font-name', 'generated-name', 'focus-clipped', 'hidden-overridden', 'state-mismatch', 'focus-transparent', 'error-message', 'modal-background', 'new-window', 'form-submit', 'native-aria-conflict', 'focus-semantics', 'focus-offscreen', 'focus-scrolled-under', 'fixed-hides-content', 'visual-presentation', 'focus-contrast', 'field-boundary', 'placeholder-contrast', 'checked-indicator', 'focus-clipped-away', 'fragment-under-bar', 'flash']);
});

// accessible-name: a link (or button) needs text that renders, or a name attribute.
const toolbar = (link, label = {}) => ({tag: 'main', classes: ['bar'], children: [{tag: 'a', classes: ['b'], focusable: true, ...link, children: [{tag: 'span', classes: ['label'], text: true, ...label}]}]});
const barCSS = extra => `.bar { display: grid; grid-template-columns: 120px; grid-template-rows: 40px; background: #fff; color: #000; }\n.b { display: grid; grid-template-columns: minmax(0, 1fr); color: inherit; }\n${extra}`;
const boxes = {'.label': text};

test('accessible-name: a link whose only text is display: none has no name where that holds', () => {
  assert.equal(run(toolbar({}), barCSS(''), {boxes}).status, 'verified');
  const hidden = run(toolbar({}), barCSS('@media (width < 600px) { .label { display: none; } }'), {boxes});
  assert.equal(hidden.status, 'violated');
  const [finding] = find(hidden, 'E_A11Y_NAME');
  assert.equal(finding.box, '.b');
  assert.equal(finding.rule, 'accessible-name');
  assert.equal(finding.range.maxExact, '600');
  assert.equal(finding.range.maxInclusive, false);
  // A name attribute (aria-label, aria-labelledby, title) names it everywhere.
  assert.equal(run(toolbar({named: true}), barCSS('.label { display: none; }'), {boxes}).status, 'verified');
});

test('accessible-name: visibility: hidden text does not name the link', () => {
  const report = run(toolbar({}), barCSS('.label { visibility: hidden; }'), {boxes});
  assert.equal(find(report, 'E_A11Y_NAME').length, 1);
  // visibility: visible on the text wins over a hidden ancestor.
  assert.equal(run(toolbar({}), barCSS('.b { visibility: hidden; }\n.label { visibility: visible; }'), {boxes}).diagnostics.filter(d => d.code === 'E_A11Y_NAME').length, 0);
});

// text-contrast (WCAG 2.2 SC 1.4.3): inherited color over the composited ancestor backgrounds.
const card = {tag: 'main', classes: ['card'], children: [{tag: 'p', classes: ['t'], text: true}]};
const cardCSS = extra => `.card { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 40px; }\n.t { font-size: 16px; }\n${extra}`;
const cardBoxes = {'.t': text};

test('text-contrast: inherited color against the nearest opaque background', () => {
  assert.equal(run(card, cardCSS('.card { background: #fff; color: #767676; }'), {boxes: cardBoxes}).status, 'verified'); // 4.54:1
  const low = run(card, cardCSS('.card { background: #fff; color: #777; }'), {boxes: cardBoxes}); // 4.48:1
  const [finding] = find(low, 'E_A11Y_CONTRAST');
  assert.equal(finding.box, '.t');
  assert.ok(finding.ratio > 4.47 && finding.ratio < 4.49, String(finding.ratio));
  assert.equal(finding.required, 4.5);
  // Large text (24px, or 18.66px bold) needs 3:1.
  assert.equal(run(card, cardCSS('.card { background: #fff; color: #777; }\n.t { font-size: 24px; }'), {boxes: cardBoxes}).status, 'verified');
  // AAA: 7:1.
  assert.equal(find(run(card, cardCSS('.card { background: #fff; color: #767676; }'), {boxes: cardBoxes, accessibility: {contrast: 'AAA'}}), 'E_A11Y_CONTRAST').length, 1);
});

test('text-contrast: translucent layers composite over an opaque ancestor, media queries split the domain', () => {
  // rgba(0, 0, 0, .5) over an opaque white ancestor is #808080; white text on it is 3.95:1.
  const panelTree = {tag: 'main', classes: ['page'], children: [{tag: 'section', classes: ['card'], children: [{tag: 'p', classes: ['t'], text: true}]}]};
  const half = run(panelTree, cardCSS('.page { display: grid; grid-template-columns: minmax(0, 1fr); background: #fff; }\n.card { background: rgba(0, 0, 0, 0.5); color: white; }'), {boxes: cardBoxes});
  const [low] = find(half, 'E_A11Y_CONTRAST');
  assert.ok(low.ratio > 3.9 && low.ratio < 4, String(low.ratio));
  const dark = run(card, cardCSS('.card { background: #fff; color: #000; }\n@media (width >= 800px) { .card { color: #ccc; } }'), {boxes: cardBoxes});
  const [finding] = find(dark, 'E_A11Y_CONTRAST');
  assert.equal(finding.range.minExact, '800');
});

test('text-contrast: images, opacity, unknown colors and no declared colors are unknown, not verified (ADR-0007)', () => {
  for (const extra of ['.card { background-image: linear-gradient(#000, #fff); color: #000; }', '.card { background: #fff; color: #000; opacity: 0.5; }', '.card { background: #fff; color: color-mix(in srgb, red, blue); }',
    '.card { color: #000; }', '.card { background: #fff; }', '.card { background: rgba(255, 255, 255, 0.9); color: #000; }']) {
    const report = run(card, cardCSS(extra), {boxes: cardBoxes});
    assert.equal(report.status, 'unknown', extra);
    assert.ok(report.diagnostics.some(d => d.code === 'U_A11Y_CONTRAST'), JSON.stringify(report.diagnostics));
  }
});

// occluded-target: a positioned box painted later covers part of a button.
const panel = overlay => ({tag: 'main', classes: ['panel'], children: [{tag: 'button', classes: ['go']}, {tag: 'div', classes: ['cover']}]});
const panelCSS = extra => `.panel { display: grid; grid-template-columns: 100px minmax(0, 1fr); grid-template-rows: 40px; position: relative; }\n.go { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.cover { position: absolute; top: 0; left: 80px; inline-size: 60px; block-size: 40px; }\n${extra}`;

test('occluded-target: a later absolute box over a button, unless it ignores pointer events', () => {
  const report = run(panel(), panelCSS(''));
  const [finding] = find(report, 'E_A11Y_OCCLUDED');
  assert.equal(finding.box, '.go');
  assert.equal(finding.cover, 'Page/1');
  assert.equal(run(panel(), panelCSS('.cover { pointer-events: none; }')).diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(run(panel(), panelCSS('.cover { visibility: hidden; }')).diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').length, 0);
  // Touching is not covering.
  assert.equal(run(panel(), panelCSS('.cover { left: 100px; }')).diagnostics.filter(d => d.code === 'E_A11Y_OCCLUDED').length, 0);
});

test('target-overlap: two interactive targets that intersect', () => {
  const tree = {tag: 'main', classes: ['panel'], children: [{tag: 'button', classes: ['go']}, {tag: 'a', classes: ['cover']}]};
  const [finding] = find(run(tree, panelCSS('.cover { display: block; }')), 'E_A11Y_TARGET_OVERLAP');
  assert.equal(finding.box, '.go');
  assert.equal(finding.other, 'Page/1');
});

// visual-order (WCAG 2.2 SC 1.3.2 / 2.4.3): grid placement against the DOM order.
test('visual-order: a later sibling placed before an earlier one', () => {
  const tree = {tag: 'main', classes: ['grid'], children: [{tag: 'div', classes: ['a']}, {tag: 'div', classes: ['b']}]};
  const css = '.grid { display: grid; grid-template-columns: 100px 100px; grid-template-rows: 40px; }\n';
  assert.equal(run(tree, css).status, 'verified');
  const swapped = run(tree, css + '.a { grid-column: 2; grid-row: 1; }\n.b { grid-column: 1; grid-row: 1; }\n');
  const [warning] = swapped.accessibility.warnings.filter(w => w.code === 'W_A11Y_ORDER');
  assert.equal(warning.box, '.b');
  assert.equal(warning.before, 'Page/0');
  assert.equal(swapped.status, 'verified'); // a warning, not a failure
});

test('hidden-focusable: a rendered focusable inside aria-hidden', () => {
  const tree = {tag: 'main', classes: ['bar'], ariaHidden: true, children: [{tag: 'button', classes: ['b']}]};
  const css = '.bar { display: grid; grid-template-columns: 100px; grid-template-rows: 40px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const [finding] = find(run(tree, css), 'E_A11Y_HIDDEN_FOCUSABLE');
  assert.equal(finding.box, '.b');
  // display: none removes it from the focus order.
  assert.equal(run(tree, css + '.b { display: none; }').diagnostics.filter(d => d.code === 'E_A11Y_HIDDEN_FOCUSABLE').length, 0);
});

test('accessible-name: a text button names itself; an empty one does not', () => {
  const css = '.bar { display: grid; grid-template-columns: 100px; grid-template-rows: 40px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const button = text => ({tag: 'main', classes: ['bar'], children: [{tag: 'button', classes: ['b'], text}]});
  assert.equal(find(run(button(true), css, {boxes: {'.b': {minInlineSize: 1, intrinsicBlockSize: 20}}}), 'E_A11Y_NAME').length, 0);
  assert.equal(find(run(button(false), css), 'E_A11Y_NAME').length, 1);
});

test('HTML adapter: names, aria-hidden, href, disabled and tabindex become DOM facts', async () => {
  const {analyzeHTML} = await import('../src/html.mjs');
  const css = reset + '.bar { display: grid; grid-template-columns: 100px 100px; grid-template-rows: 40px; }\n.b, .c { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const html = attrs => `<main class="bar"><button class="b" ${attrs}></button><a class="c" href="#x" aria-label="Next"></a></main>`;
  const check = attrs => analyzeHTML(html(attrs), {name: 'Page', css, viewport: domain, accessibility: true});
  assert.deepEqual(find(check(''), 'E_A11Y_NAME').map(d => d.box), ['.b']);
  assert.equal(find(check('aria-label="Close"'), 'E_A11Y_NAME').length, 0);
  assert.equal(find(check('title=" "'), 'E_A11Y_NAME').length, 1); // whitespace does not name it
  const hidden = analyzeHTML(`<main class="bar" aria-hidden="true"><button class="b" aria-label="x"></button><a class="c" tabindex="-1" aria-label="y"></a></main>`, {name: 'Page', css, viewport: domain, accessibility: true});
  assert.deepEqual(find(hidden, 'E_A11Y_HIDDEN_FOCUSABLE').map(d => d.box), ['.b']); // tabindex=-1 and no href: not focusable
  const disabled = analyzeHTML(`<main class="bar" aria-hidden="true"><button class="b" disabled aria-label="x"></button><a class="c" aria-label="y"></a></main>`, {name: 'Page', css, viewport: domain, accessibility: true});
  assert.equal(find(disabled, 'E_A11Y_HIDDEN_FOCUSABLE').length, 0);
});

// Second batch: document structure that the cascade can change.
const page = children => ({tag: 'main', classes: ['page'], children});
const pageCSS = extra => `.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; }\n${extra}`;
const heading = (tag, cls, extra = {}) => ({tag, classes: [cls], text: true, ...extra});
const hb = (...names) => Object.fromEntries(names.map(k => [k, {minInlineSize: 1, intrinsicBlockSize: 20}]));
const hCSS = '.h1, .h2, .h3, .h4 { font-size: 16px; font-weight: 400; line-height: 20px; }\n';

test('empty-heading: a heading with no visible text, or none where its text is hidden', () => {
  const report = run(page([heading('h1', 'h1'), {tag: 'h2', classes: ['h2']}]), pageCSS(hCSS), {boxes: hb('.h1')});
  assert.deepEqual(find(report, 'E_A11Y_EMPTY_HEADING').map(d => d.box), ['.h2']);
  const hidden = run(page([heading('h1', 'h1'), heading('h2', 'h2')]), pageCSS(hCSS + '.h2 { visibility: hidden; }'), {boxes: hb('.h1', '.h2')});
  assert.equal(find(hidden, 'E_A11Y_EMPTY_HEADING').length, 0); // a hidden heading is not exposed at all
});

test('heading-order: a skipped level among the headings that render, per media region', () => {
  const tree = page([heading('h1', 'h1'), heading('h2', 'h2'), heading('h3', 'h3')]);
  assert.equal(run(tree, pageCSS(hCSS), {boxes: hb('.h1', '.h2', '.h3')}).accessibility.warnings.length, 0);
  const narrow = run(tree, pageCSS(hCSS + '@media (width < 600px) { .h2 { display: none; } }'), {boxes: hb('.h1', '.h2', '.h3')});
  const [warning] = narrow.accessibility.warnings.filter(w => w.code === 'W_A11Y_HEADING_ORDER');
  assert.equal(warning.box, '.h3');
  assert.equal(warning.range.maxExact, '600');
  assert.equal(warning.previous, 'Page/0');
});

test('nested-interactive: a rendered link inside a button-like link', () => {
  const tree = page([{tag: 'a', classes: ['outer'], focusable: true, named: true, children: [{tag: 'a', classes: ['inner'], focusable: true, named: true}]}]);
  const css = pageCSS('.outer { display: grid; grid-template-columns: minmax(0, 1fr); }\n.inner { display: block; }\n');
  assert.deepEqual(find(run(tree, css), 'E_A11Y_NESTED_INTERACTIVE').map(d => d.box), ['.inner']);
  assert.equal(find(run(tree, css + '.inner { display: none; }'), 'E_A11Y_NESTED_INTERACTIVE').length, 0);
});

test('duplicate-id and aria-reference: DOM facts over the whole domain', () => {
  const tree = page([{tag: 'div', classes: ['a'], id: 'x'}, {tag: 'div', classes: ['b'], id: 'x'}, {tag: 'button', classes: ['c'], named: true, references: ['missing', 'x']}]);
  const css = pageCSS('.c { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n');
  const report = run(tree, css);
  assert.deepEqual(find(report, 'E_A11Y_DUPLICATE_ID').map(d => d.id), ['x']);
  assert.deepEqual(find(report, 'E_A11Y_REFERENCE').map(d => d.reference), ['missing']);
  // A display: none target still names (aria-labelledby reads hidden content).
  const hiddenTarget = run(page([{tag: 'div', classes: ['a'], id: 'x'}, {tag: 'button', classes: ['c'], named: true, references: ['x']}]), css + '.a { display: none; }');
  assert.equal(find(hiddenTarget, 'E_A11Y_REFERENCE').length, 0);
});

test('positive-tabindex and multiple-main are warnings', () => {
  const tree = {tag: 'div', classes: ['root'], children: [{tag: 'main', classes: ['m1']}, {tag: 'main', classes: ['m2']}, {tag: 'div', classes: ['t'], tabIndex: 3, role: 'region', named: true}]};
  const css = '.root { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; }\n';
  const report = run(tree, css);
  assert.deepEqual(report.accessibility.warnings.map(w => w.code).sort(), ['W_A11Y_MULTIPLE_MAIN', 'W_A11Y_POSITIVE_TABINDEX']);
  assert.equal(run(tree, css + '@media (width < 9999px) { .m2 { display: none; } }').accessibility.warnings.filter(w => w.code === 'W_A11Y_MULTIPLE_MAIN').length, 0);
});

test('aria-labelledby names through the referenced text, even when that text is display: none', () => {
  const tree = refs => page([{tag: 'p', classes: ['t'], id: 'label', text: true}, {tag: 'div', classes: ['e'], id: 'empty'}, {tag: 'button', classes: ['b'], labelledBy: refs}]);
  const css = pageCSS('.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.t { display: none; }\n');
  assert.equal(find(run(tree(['label']), css), 'E_A11Y_NAME').length, 0);
  assert.equal(find(run(tree(['empty']), css), 'E_A11Y_NAME').length, 1);
  assert.equal(find(run(tree(['nowhere']), css), 'E_A11Y_NAME').length, 1);
  assert.equal(run(tree('dynamic'), css).status, 'unknown');
});

// Third batch: geometry and focus together.
test('scrollable-region-focusable: overflowing scroll content with nothing focusable to reach it', () => {
  const tree = inner => ({tag: 'main', classes: ['page'], children: [{tag: 'section', classes: ['s'], ...inner}]});
  // The scroller's own tracks (500px) exceed its 300px box below 900px.
  const css = '.page { display: grid; grid-template-columns: 300px; grid-auto-rows: 30px; }\n.s { display: grid; grid-template-columns: 500px; overflow: auto; scrollbar-width: none; }\n@media (width >= 900px) { .s { grid-template-columns: 200px; } }\n';
  const options = {boxes: {'.s': {overflow: 'scroll'}}};
  const [finding] = find(run(tree({}), css, options), 'E_A11Y_SCROLL_FOCUS');
  assert.equal(finding.box, '.s');
  assert.equal(finding.range.maxExact, '900');
  assert.equal(find(run(tree({tabIndex: 0, focusable: true}), css, options), 'E_A11Y_SCROLL_FOCUS').length, 0);
  // An item wider than its track may still fit the scroller: Unknown, not an error.
  const item = run({tag: 'main', classes: ['page'], children: [{tag: 'section', classes: ['s'], children: [{tag: 'div', classes: ['w']}]}]},
    '.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; }\n.s { display: grid; grid-template-columns: 300px; overflow: auto; scrollbar-width: none; }\n.w { inline-size: 500px; }\n', options);
  assert.equal(item.status, 'unknown');
  assert.ok(find(item, 'U_A11Y_SCROLL_FOCUS').length > 0);
});

test('reflow: horizontal page scrolling at 320 CSS px', () => {
  const tree = page([{tag: 'div', classes: ['w']}]);
  const css = pageCSS('.w { inline-size: 360px; }\n');
  const [finding] = find(run(tree, css, {boxes: {'.page': {overflow: 'visible'}}}), 'E_A11Y_REFLOW');
  assert.equal(finding.range.maxExact, '320');
  // A domain that starts above 320px cannot show reflow: the rule says so instead of passing silently.
  const wide = run(tree, css, {boxes: {'.page': {overflow: 'visible'}}, viewport: {...domain, min: 400}});
  assert.ok(wide.accessibility.notes.some(n => /320/.test(n)));
});

test('focus-obscured and focus-area', () => {
  const covered = run(panel(), panelCSS('.cover { left: 0; inline-size: 120px; background: #fff; }'));
  assert.deepEqual(find(covered, 'E_A11Y_FOCUS_OBSCURED').map(d => d.box), ['.go']);
  assert.equal(find(run(panel(), panelCSS('.cover { background: #fff; }')), 'E_A11Y_FOCUS_OBSCURED').length, 0); // only partly covered
  assert.equal(find(run(panel(), panelCSS('.cover { left: 0; inline-size: 120px; }')), 'E_A11Y_FOCUS_OBSCURED').length, 0); // nothing painted
  const zero = run(panel(), panelCSS('.panel { grid-template-columns: 0px minmax(0, 1fr); }\n.cover { display: none; }'));
  assert.deepEqual(find(zero, 'E_A11Y_FOCUS_AREA').map(d => d.box), ['.go']);
});

test('a zero-size target overlaps nothing (it fails focus-area instead)', () => {
  const report = run(panel(), panelCSS('.panel { grid-template-columns: 0px minmax(0, 1fr); }\n.cover { left: 0; }'));
  assert.equal(find(report, 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(find(report, 'E_A11Y_FOCUS_AREA').length, 1);
});

test('pointer-disabled: a visible target under inherited pointer-events: none', () => {
  const [finding] = find(run(panel(), panelCSS('.panel { pointer-events: none; }\n.cover { display: none; }')), 'E_A11Y_POINTER_DISABLED');
  assert.equal(finding.box, '.go');
  assert.equal(find(run(panel(), panelCSS('.panel { pointer-events: none; }\n.go { pointer-events: auto; }\n.cover { display: none; }')), 'E_A11Y_POINTER_DISABLED').length, 0);
});

test('small-text: rendered text below 12px is a warning', () => {
  const report = run(card, cardCSS('.card { background: #fff; color: #000; }\n@media (width < 500px) { .t { font-size: 11px; } }'), {boxes: cardBoxes});
  const [warning] = report.accessibility.warnings.filter(w => w.code === 'W_A11Y_SMALL_TEXT');
  assert.equal(warning.range.maxExact, '500');
});

// target-size (WCAG 2.2 SC 2.5.8): 24px, or the spacing exception — a 24px circle centred on each
// undersized target meets no other target and no other undersized target's circle.
const row = (gap, extra = '') => run({tag: 'main', classes: ['row'], children: [{tag: 'button', classes: ['a'], named: true}, {tag: 'button', classes: ['b'], named: true}]},
  `.row { display: flex; column-gap: ${gap}px; block-size: 20px; }\n.a, .b { appearance: none; display: block; flex: none; width: 20px; height: 20px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${extra}`);

test('target-size: undersized targets pass when their 24px circles are apart', () => {
  // Centres 20 + gap apart: circles meet below a 4px gap.
  assert.deepEqual(find(row(2), 'E_A11Y_TARGET_SIZE').map(d => d.box).sort(), ['.a', '.b']);
  assert.equal(find(row(4), 'E_A11Y_TARGET_SIZE').length, 0); // touching circles do not intersect
  assert.equal(find(row(3.99), 'E_A11Y_TARGET_SIZE').length, 2);
  // 24px targets need no spacing.
  assert.equal(find(row(0, '.a, .b { width: 24px; height: 24px; }\n.row { block-size: 24px; }'), 'E_A11Y_TARGET_SIZE').length, 0);
});

test('target-size: one undersized target next to a full-size one', () => {
  // .a is 20px, .b 24px: .a's circle (r 12) reaches .b's box when the gap is below 2px.
  const report = row(1, '.b { width: 24px; height: 24px; }\n.row { block-size: 24px; align-items: flex-start; }');
  assert.deepEqual(find(report, 'E_A11Y_TARGET_SIZE').map(d => d.box), ['.a']);
  assert.equal(find(row(2, '.b { width: 24px; height: 24px; }\n.row { block-size: 24px; align-items: flex-start; }'), 'E_A11Y_TARGET_SIZE').length, 0);
});

test('target-size: spacing that depends on the viewport is decided exactly along one axis', () => {
  // space-between: the second button sits at V - 20, so the centres are V - 20 apart; circles meet while V < 44.
  const report = run({tag: 'main', classes: ['row'], children: [{tag: 'button', classes: ['a'], named: true}, {tag: 'button', classes: ['b'], named: true}]},
    '.row { display: flex; justify-content: space-between; block-size: 20px; }\n.a, .b { appearance: none; display: block; flex: none; width: 20px; height: 20px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n',
    {viewport: {min: 40, max: 400, height: {min: 100, max: 400}}});
  const findings = find(report, 'E_A11Y_TARGET_SIZE');
  // One piece per target up to 44 (open), plus the flex case V = 40 where the free space is zero.
  assert.deepEqual(findings.filter(d => d.range.maxExact === '44' && d.range.maxInclusive === false).map(d => d.box).sort(), ['.a', '.b']);
  for (const finding of findings) assert.ok(finding.range.max <= 44);
  assert.notEqual(report.status, 'unknown');
});

test('circle approximation: proven hits lie inside the circle, proven misses outside', async () => {
  const {circleReach} = await import('../src/layout/accessibility.mjs');
  const {rectangle, scalar, width, height, diff, evaluate} = await import('../src/layout/region.mjs');
  const {q, number} = await import('../src/layout/linear.mjs');
  // A point moving with the viewport on both axes: (x - 100, y - 100) against radius 12.
  const region = rectangle({min: q(80), max: q(120)}, {min: q(80), max: q(120)});
  const {yes, maybe} = circleReach(region, diff(width, scalar(100)), diff(height, scalar(100)), q(12));
  const distance = (r, p) => Math.hypot(number(evaluate(diff(width, scalar(100)), p)), number(evaluate(diff(height, scalar(100)), p)));
  for (const piece of yes) for (const p of piece.vertices) assert.ok(distance(piece, p) <= 12 + 1e-9);
  // The undecided band is thin: every maybe vertex is within 0.05px of the circle.
  for (const piece of maybe) for (const p of piece.vertices) assert.ok(Math.abs(distance(piece, p) - 12) < 0.05, String(distance(piece, p)));
});

// SC 2.5.8 exceptions and SC 2.5.5 (AAA).
const pair = (aCSS, bCSS, {level, ...a} = {}, b = {}) => run({tag: 'main', classes: ['row'], children: [{tag: 'button', classes: ['a'], named: true, id: 'a', ...a}, {tag: 'button', classes: ['b'], named: true, id: 'b', ...b}]},
  `.row { display: flex; column-gap: 0px; align-items: flex-start; block-size: 60px; }\n.a, .b { appearance: none; display: block; flex: none; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.a { ${aCSS} }\n.b { ${bCSS} }\n`, {accessibility: {targetLevel: level ?? 'AA'}});

test('target-size AAA (SC 2.5.5): 44px and no spacing exception', () => {
  const css = ['width: 40px; height: 40px;', 'width: 40px; height: 40px; margin-left: 200px;'];
  assert.equal(find(pair(...css), 'E_A11Y_TARGET_SIZE').length, 0); // AA: 40px passes
  const aaa = run({tag: 'main', classes: ['row'], children: [{tag: 'button', classes: ['a'], named: true}]},
    '.row { display: flex; block-size: 60px; align-items: flex-start; }\n.a { appearance: none; display: block; flex: none; width: 40px; height: 40px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n', {accessibility: {targetLevel: 'AAA'}});
  const [finding] = find(aaa, 'E_A11Y_TARGET_SIZE');
  assert.equal(finding.required, 44);
  assert.equal(aaa.accessibility.targetSize, 44);
});

test('target-size equivalent exception: exempt where the declared equivalent renders and passes', () => {
  // .a is 20px next to .b; it declares .b (24px) as the equivalent control.
  const report = pair('width: 20px; height: 20px;', 'width: 24px; height: 24px;', {equivalent: 'b'});
  assert.equal(find(report, 'E_A11Y_TARGET_SIZE').length, 0);
  const [exempt] = report.accessibility.exempted.filter(e => e.code === 'E_A11Y_TARGET_SIZE');
  assert.equal(exempt.box, '#a');
  assert.match(exempt.reason, /equivalent: #b meets the target size/);
  // The equivalent must itself pass: two small adjacent buttons cannot excuse each other.
  const both = pair('width: 20px; height: 20px;', 'width: 20px; height: 20px;', {equivalent: 'b'}, {equivalent: 'a'});
  assert.equal(find(both, 'E_A11Y_TARGET_SIZE').length, 2);
  // A missing or hidden equivalent does not excuse it either.
  // (AAA has no spacing exception, so a lone 20px target fails unless its equivalent renders.)
  assert.equal(find(pair('width: 20px; height: 20px;', 'width: 44px; height: 44px;', {equivalent: 'b', level: 'AAA'}), 'E_A11Y_TARGET_SIZE').length, 0);
  assert.equal(find(pair('width: 20px; height: 20px;', 'width: 44px; height: 44px; display: none;', {equivalent: 'b', level: 'AAA'}), 'E_A11Y_TARGET_SIZE').length, 1);
  assert.equal(find(pair('width: 20px; height: 20px;', 'width: 44px; height: 44px;', {equivalent: 'missing', level: 'AAA'}), 'E_A11Y_TARGET_SIZE').length, 1);
  assert.equal(pair('width: 20px; height: 20px;', 'width: 24px; height: 24px;', {equivalent: 'dynamic'}).status, 'unknown');
});

test('target-size essential exception: recorded as exempted with the stated reason', () => {
  const report = pair('width: 20px; height: 20px;', 'width: 24px; height: 24px;', {essential: 'map pin positions are data'});
  assert.equal(find(report, 'E_A11Y_TARGET_SIZE').length, 0);
  assert.equal(report.accessibility.exempted.find(e => e.box === '#a').reason, 'essential: map pin positions are data');
});

test('HTML adapter: data-a11y-equivalent and data-a11y-essential', async () => {
  const {analyzeHTML} = await import('../src/html.mjs');
  const css = reset + '.row { display: flex; align-items: flex-start; block-size: 60px; }\n.a, .b { appearance: none; display: block; flex: none; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.a { width: 20px; height: 20px; }\n.b { width: 24px; height: 24px; }\n';
  const report = analyzeHTML('<main class="row"><button class="a" aria-label="x" data-a11y-equivalent="big"></button><button class="b" id="big" aria-label="y"></button></main>', {name: 'Page', css, viewport: domain, accessibility: true});
  assert.equal(find(report, 'E_A11Y_TARGET_SIZE').length, 0);
  assert.equal(report.accessibility.exempted.length, 1);
});

// Images and form controls (UA sizes are reset; explicit sizes are required).
const fieldCSS = '.page { display: grid; grid-template-columns: 200px; grid-auto-rows: 32px; row-gap: 8px; background: #fff; color: #000; }\n.f, .pic { appearance: none; display: block; inline-size: 200px; block-size: 32px; padding: 0; border: 1px solid #000; min-width: 0; min-height: 0; }\n.l { display: block; font-size: 16px; line-height: 20px; }\n';
const lb = {'.l': {minInlineSize: 1, intrinsicBlockSize: 20}};

test('form controls and images without explicit sizes stay Unknown', () => {
  const report = run(page([{tag: 'input', classes: ['f'], inputType: 'text', focusable: true, named: true}]), pageCSS('.f { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n'));
  assert.equal(report.status, 'unknown');
  assert.ok(report.diagnostics.some(d => /intrinsic sizes are not modeled/.test(d.message)));
});

test('image-alt: a rendered image needs alt; alt="" marks it decorative; alt names a link', () => {
  const img = extra => ({tag: 'img', classes: ['pic'], ...extra});
  assert.deepEqual(find(run(page([img({})]), fieldCSS), 'E_A11Y_IMAGE_ALT').map(d => d.box), ['.pic']);
  assert.equal(find(run(page([img({alt: ''})]), fieldCSS), 'E_A11Y_IMAGE_ALT').length, 0);
  assert.equal(find(run(page([img({})]), fieldCSS + '.pic { display: none; }'), 'E_A11Y_IMAGE_ALT').length, 0);
  assert.equal(run(page([img({alt: 'dynamic'})]), fieldCSS).status, 'unknown');
  const link = alt => page([{tag: 'a', classes: ['go'], focusable: true, children: [img({alt})]}]);
  const linkCSS = fieldCSS + '.go { display: grid; grid-template-columns: minmax(0, 1fr); }\n';
  assert.equal(find(run(link('Home'), linkCSS), 'E_A11Y_NAME').length, 0);
  assert.equal(find(run(link(''), linkCSS), 'E_A11Y_NAME').length, 1); // a decorative image does not name the link
});

test('form-label: a field needs a label, aria name or title; placeholder alone is a warning', () => {
  const field = (extra = {}) => ({tag: 'input', classes: ['f'], id: 'email', inputType: 'text', focusable: true, ...extra});
  const label = (extra = {}) => ({tag: 'label', classes: ['l'], text: true, ...extra});
  assert.deepEqual(find(run(page([field()]), fieldCSS), 'E_A11Y_LABEL').map(d => d.box), ['#email']);
  assert.equal(find(run(page([label({labelFor: 'email'}), field()]), fieldCSS, {boxes: lb}), 'E_A11Y_LABEL').length, 0);
  assert.equal(find(run(page([field({named: true})]), fieldCSS), 'E_A11Y_LABEL').length, 0);
  const placeholder = run(page([field({placeholder: true})]), fieldCSS);
  assert.equal(find(placeholder, 'E_A11Y_LABEL').length, 0);
  assert.deepEqual(placeholder.accessibility.warnings.filter(w => w.code === 'W_A11Y_PLACEHOLDER_LABEL').map(w => w.box), ['#email']);
  // Buttons-as-inputs and hidden inputs need no label.
  assert.equal(find(run(page([field({inputType: 'submit'})]), fieldCSS), 'E_A11Y_LABEL').length, 0);
  assert.equal(find(run(page([field({inputType: 'hidden', focusable: false})]), fieldCSS), 'E_A11Y_LABEL').length, 0);
});

test('form-label: a wrapping label names its field; label-for must name a labelable element', () => {
  const wrapped = page([{tag: 'label', classes: ['w'], children: [{tag: 'span', classes: ['l'], text: true}, {tag: 'input', classes: ['f'], inputType: 'text', focusable: true}]}]);
  const css = fieldCSS + '.w { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 32px; }\n';
  assert.equal(find(run(wrapped, css, {boxes: lb}), 'E_A11Y_LABEL').length, 0);
  const dangling = run(page([{tag: 'label', classes: ['l'], text: true, labelFor: 'nowhere'}, {tag: 'div', classes: ['x'], id: 'box'}, {tag: 'label', classes: ['l2'], text: true, labelFor: 'box'}]),
    fieldCSS + '.l2 { display: block; font-size: 16px; line-height: 20px; }\n', {boxes: {...lb, '.l2': lb['.l']}});
  assert.deepEqual(find(dangling, 'E_A11Y_LABEL_FOR').map(d => d.reference).sort(), ['box', 'nowhere']);
});

test('form controls are targets: undersized fields fail target-size, covered ones are occluded', () => {
  const tiny = run(page([{tag: 'input', classes: ['f'], inputType: 'checkbox', focusable: true, named: true}, {tag: 'input', classes: ['g'], inputType: 'checkbox', focusable: true, named: true}]),
    '.page { display: flex; column-gap: 1px; block-size: 16px; background: #fff; }\n.f, .g { appearance: none; display: block; flex: none; inline-size: 16px; block-size: 16px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n');
  assert.deepEqual(find(tiny, 'E_A11Y_TARGET_SIZE').map(d => d.box).sort(), ['.f', '.g']);
});

test('occluded-target: a later in-flow box covers a target that overflows into it', () => {
  // .a overflows its 20px row by 20px into .b's row; .b is later in tree order and on top.
  const tree = page([{tag: 'button', classes: ['a'], named: true}, {tag: 'div', classes: ['b']}]);
  const css = '.page { display: grid; grid-template-columns: 100px; grid-template-rows: 20px 20px; }\n.a { appearance: none; display: block; block-size: 40px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const report = run(tree, css, {boxes: {'.page': {overflowBlock: 'visible'}}});
  assert.deepEqual(find(report, 'E_A11Y_OCCLUDED').map(d => d.cover), ['Page/1']);
});

test('form-label: a display: none label does not name its field there (aria-labelledby would)', () => {
  const tree = page([{tag: 'label', classes: ['l'], text: true, labelFor: 'email'}, {tag: 'input', classes: ['f'], id: 'email', inputType: 'text', focusable: true}]);
  const [finding] = find(run(tree, fieldCSS + '@media (width < 600px) { .l { display: none; } }', {boxes: lb}), 'E_A11Y_LABEL');
  assert.equal(finding.range.maxExact, '600');
});

// Structure: lists, radio groups, landmark names.
const listCSS = '.page { display: grid; grid-template-columns: 200px; grid-auto-rows: 30px; background: #fff; color: #000; }\n.list { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; margin: 0; padding: 0; }\n.item { display: block; }\n';
test('list-structure: li outside a list, or a list child that is not li', () => {
  assert.equal(run(page([{tag: 'ul', classes: ['list'], children: [{tag: 'li', classes: ['item']}]}]), listCSS).status, 'verified');
  assert.deepEqual(find(run(page([{tag: 'div', classes: ['list'], children: [{tag: 'li', classes: ['item']}]}]), listCSS), 'E_A11Y_LIST').map(d => d.box), ['.item']);
  assert.deepEqual(find(run(page([{tag: 'ul', classes: ['list'], children: [{tag: 'div', classes: ['item']}]}]), listCSS), 'E_A11Y_LIST').map(d => d.box), ['.list']);
  // UA list margins/padding and display: list-item stay Unknown until reset.
  assert.equal(run(page([{tag: 'ul', classes: ['list'], children: [{tag: 'li', classes: ['item']}]}]), listCSS.replace('margin: 0; padding: 0; ', '')).status, 'unknown');
  assert.equal(run(page([{tag: 'ul', classes: ['list'], children: [{tag: 'li', classes: ['x']}]}]), listCSS).status, 'unknown');
});

test('radio-group: same-name radios need a fieldset or radiogroup', () => {
  const radio = (cls, extra = {}) => ({tag: 'input', classes: [cls], inputType: 'radio', inputName: 'size', focusable: true, named: true, ...extra});
  const css = '.page, .g { display: grid; grid-template-columns: 30px 30px; grid-template-rows: 30px; background: #fff; }\n.r1, .r2 { appearance: none; display: block; inline-size: 30px; block-size: 30px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const loose = run(page([radio('r1'), radio('r2')]), css);
  assert.deepEqual(loose.accessibility.warnings.filter(w => w.code === 'W_A11Y_RADIO_GROUP').map(w => w.name), ['size']);
  const grouped = run(page([{tag: 'div', classes: ['g'], role: 'radiogroup', named: true, children: [radio('r1'), radio('r2')]}]), css);
  assert.equal(grouped.accessibility.warnings.filter(w => w.code === 'W_A11Y_RADIO_GROUP').length, 0);
});

test('landmark-name: two navigation landmarks at once need distinct names', () => {
  const nav = (cls, extra = {}) => ({tag: 'nav', classes: [cls], ...extra});
  const css = '.page { display: grid; grid-template-columns: 100px; grid-auto-rows: 30px; }\n@media (width < 600px) { .n2 { display: none; } }\n';
  const report = run(page([nav('n1'), nav('n2')]), css);
  const [warning] = report.accessibility.warnings.filter(w => w.code === 'W_A11Y_LANDMARK_NAME');
  assert.equal(warning.range.minExact, '600');
  assert.equal(run(page([nav('n1', {named: true}), nav('n2', {named: true})]), css).accessibility.warnings.filter(w => w.code === 'W_A11Y_LANDMARK_NAME').length, 0);
});

test('roles: unknown tokens, and interactive roles that cannot take focus or have no name', () => {
  const css = '.page { display: grid; grid-template-columns: 100px; grid-auto-rows: 30px; background: #fff; color: #000; }\n.r { display: block; }\n';
  const div = extra => page([{tag: 'div', classes: ['r'], ...extra}]);
  assert.deepEqual(find(run(div({role: 'buton'}), css), 'E_A11Y_ROLE').map(d => d.role), ['buton']);
  assert.deepEqual(find(run(div({role: 'button', named: true}), css), 'E_A11Y_ROLE_FOCUS').map(d => d.box), ['.r']);
  assert.equal(find(run(div({role: 'button', named: true, tabIndex: 0, focusable: true}), css), 'E_A11Y_ROLE_FOCUS').length, 0);
  assert.equal(find(run(div({role: 'button', tabIndex: 0, focusable: true}), css), 'E_A11Y_NAME').length, 1);
  assert.equal(run(div({role: 'dynamic'}), css).status, 'unknown');
});

// Inline content: phrasing elements inside a text leaf keep their own styles and DOM facts.
const para = (inline, extra = {}) => page([{tag: 'p', classes: ['p'], text: true, children: inline, ...extra}]);
const paraCSS = extra => `.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 40px; background: #fff; color: #222; }\n.p { font-size: 16px; line-height: 20px; }\n${extra}`;
const pb = {'.p': {minInlineSize: 1, intrinsicBlockSize: 20}};
const link = (extra = {}) => ({tag: 'a', classes: ['k'], text: true, focusable: true, ...extra});

test('link-in-text-block (SC 1.4.1): a link in text needs an underline or 3:1 against the text', () => {
  // The UA underline distinguishes it; the UA link color itself is not resolved, so set one.
  assert.equal(find(run(para([link()]), paraCSS('.k { color: #0645ad; }'), {boxes: pb}), 'E_A11Y_LINK_IN_TEXT').length, 0);
  const plain = run(para([link()]), paraCSS('.k { color: #333; text-decoration: none; }'), {boxes: pb});
  assert.deepEqual(find(plain, 'E_A11Y_LINK_IN_TEXT').map(d => d.box), ['.k']);
  assert.equal(find(run(para([link()]), paraCSS('.p { color: #000; }\n.k { color: #e0e0e0; text-decoration: none; }\n.page { background: #333; }'), {boxes: pb}), 'E_A11Y_LINK_IN_TEXT').length, 0);
  // Without an author color the UA link color (and so contrast) is unknown.
  assert.equal(run(para([link()]), paraCSS(''), {boxes: pb}).status, 'unknown');
});

test('inline content: contrast and names per inline element, the inline target-size exception', () => {
  const grey = run(para([{tag: 'span', classes: ['s'], text: true}]), paraCSS('.s { color: #aaa; }'), {boxes: pb});
  assert.deepEqual(find(grey, 'E_A11Y_CONTRAST').map(d => d.box), ['.s']);
  // An inline link is exempt from SC 2.5.8 (in a sentence), however small.
  assert.equal(find(run(para([link()]), paraCSS('.k { color: #0645ad; }'), {boxes: pb}), 'E_A11Y_TARGET_SIZE').length, 0);
  const empty = run(para([{tag: 'a', classes: ['k'], focusable: true}]), paraCSS('.k { color: #0645ad; }'), {boxes: pb});
  assert.deepEqual(find(empty, 'E_A11Y_NAME').map(d => d.box), ['.k']);
});

test('inline content that would change the measured text is Unknown', () => {
  for (const extra of ['.k { color: #0645ad; display: inline-block; }', '.k { color: #0645ad; padding: 0 4px; }', '.k { color: #0645ad; position: relative; }'])
    assert.equal(run(para([link()]), paraCSS(extra), {boxes: pb}).status, 'unknown', extra);
});

// Tables restyled with grid/contents, and fieldsets.
const table = (cells, extra = {}) => ({tag: 'table', classes: ['t'], ...extra, children: [
  {tag: 'thead', classes: ['h'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'th', classes: ['c'], text: true, id: 'h1'}]}]},
  {tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r2'], children: cells}]}]});
const tableCSS = extra => `.t { display: grid; grid-template-columns: 100px; grid-auto-rows: 24px; background: #fff; color: #000; }\n.h, .b, .r, .r2 { display: contents; }\n.c, .d { display: block; font-size: 16px; font-weight: 700; text-align: left; line-height: 20px; }\n${extra}`;
const tb = {'.c': {minInlineSize: 1, intrinsicBlockSize: 20}, '.d': {minInlineSize: 1, intrinsicBlockSize: 20}};
const cell = (extra = {}) => ({tag: 'td', classes: ['d'], text: true, ...extra});

test('table-headers: headers hidden by CSS leave the data cells without headers there', () => {
  assert.equal(run(table([cell()]), tableCSS(''), {boxes: tb}).status, 'verified');
  const narrow = run(table([cell()]), tableCSS('@media (width < 600px) { .c { display: none; } }'), {boxes: tb});
  const [finding] = find(narrow, 'E_A11Y_TABLE_HEADERS');
  assert.equal(finding.box, '.t');
  assert.equal(finding.range.maxExact, '600');
  // UA table display stays Unknown until restyled.
  assert.equal(run(table([cell()]), '.c, .d { font-weight: 700; text-align: left; }\n', {boxes: tb}).status, 'unknown');
});

test('td headers must reference th cells of the same table; a table without th is a warning', () => {
  assert.deepEqual(find(run(table([cell({headers: ['h1', 'nope']})]), tableCSS(''), {boxes: tb}), 'E_A11Y_TABLE_HEADERS_REF').map(d => d.reference), ['nope']);
  const bare = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r2'], children: [cell()]}]}]};
  const db = {'.d': tb['.d']};
  assert.ok(run(bare, tableCSS(''), {boxes: db}).accessibility.warnings.some(w => w.code === 'W_A11Y_TABLE_HEADERS'));
  assert.equal(run({...bare, role: 'presentation'}, tableCSS(''), {boxes: db}).accessibility.warnings.filter(w => w.code === 'W_A11Y_TABLE_HEADERS').length, 0);
});

test('fieldset: UA edges and a rendered legend are Unknown; a group without a legend is a warning', () => {
  const radio = cls => ({tag: 'input', classes: [cls], inputType: 'radio', inputName: 'x', focusable: true, named: true});
  const css = '.fs { display: grid; grid-template-columns: 30px 30px; grid-template-rows: 30px; margin: 0; padding: 0; border: 0; min-inline-size: 0; background: #fff; color: #000; }\n.lg { display: block; padding: 0; font-size: 16px; line-height: 20px; }\n.a, .b { appearance: none; display: block; inline-size: 30px; block-size: 30px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const set = (children, extra = {}) => ({tag: 'fieldset', classes: ['fs'], children, ...extra});
  assert.ok(run(set([radio('a'), radio('b')]), css).accessibility.warnings.some(w => w.code === 'W_A11Y_FIELDSET_NAME'));
  assert.equal(run(set([radio('a'), radio('b')]), css.replace('margin: 0; padding: 0; border: 0; ', '')).status, 'unknown');
  const legend = {tag: 'legend', classes: ['lg'], text: true};
  assert.equal(run(set([legend, radio('a'), radio('b')]), css, {boxes: {'.lg': {minInlineSize: 1, intrinsicBlockSize: 20}}}).status, 'unknown'); // rendered legend
  const contents = run({tag: 'main', classes: ['page'], children: [set([legend, radio('a'), radio('b')])]}, css + '.page { display: grid; grid-template-columns: 30px 30px; grid-auto-rows: 30px; background: #fff; color: #000; }\n.fs { display: contents; }\n', {boxes: {'.lg': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  assert.notEqual(contents.status, 'unknown', JSON.stringify(contents.diagnostics));
  assert.equal(contents.accessibility.warnings.filter(w => w.code === 'W_A11Y_FIELDSET_NAME').length, 0);
});

// Text comparisons: textContent (direct static text), aria-label and href values.
test('label-in-name (SC 2.5.3): an aria-label must contain the visible text', () => {
  const btn = (label, text) => page([{tag: 'a', classes: ['go'], focusable: true, named: true, ariaLabel: label, href: '/x', children: [{tag: 'span', classes: ['t'], text: true, textContent: text}]}]);
  const css = pageCSS('.page { background: #fff; color: #000; }\n.go { display: grid; grid-template-columns: minmax(0, 1fr); color: inherit; }\n.t { display: block; }\n');
  const b = {'.t': {minInlineSize: 1, intrinsicBlockSize: 20}};
  assert.equal(find(run(btn('Search the catalogue', 'Search'), css, {boxes: b}), 'E_A11Y_LABEL_IN_NAME').length, 0);
  assert.deepEqual(find(run(btn('Find', 'Search'), css, {boxes: b}), 'E_A11Y_LABEL_IN_NAME').map(d => d.box), ['.go']);
  // Hidden text is not visible text.
  assert.equal(find(run(btn('Find', 'Search'), css + '.t { display: none; }', {boxes: b}), 'E_A11Y_LABEL_IN_NAME').length, 0);
  assert.equal(run(btn('Find', 'dynamic'), css, {boxes: b}).status, 'unknown');
});

test('link-purpose and link-text: same text to different places, and generic link text', () => {
  const link = (cls, text, href) => ({tag: 'a', classes: [cls], focusable: true, href, text: true, textContent: text});
  const css = pageCSS('.page { background: #fff; color: #000; }\n.a, .b { display: block; color: inherit; }\n');
  const b = {'.a': {minInlineSize: 1, intrinsicBlockSize: 20}, '.b': {minInlineSize: 1, intrinsicBlockSize: 20}};
  const same = run(page([link('a', 'Pricing', '/p'), link('b', 'Pricing', '/q')]), css, {boxes: b});
  assert.deepEqual(same.accessibility.warnings.filter(w => w.code === 'W_A11Y_LINK_PURPOSE').map(w => w.box), ['.b']);
  assert.equal(run(page([link('a', 'Pricing', '/p'), link('b', 'Pricing', '/p')]), css, {boxes: b}).accessibility.warnings.filter(w => w.code === 'W_A11Y_LINK_PURPOSE').length, 0);
  const generic = run(page([link('a', 'Click here', '/p'), link('b', '詳細', '/q')]), css, {boxes: b});
  assert.deepEqual(generic.accessibility.warnings.filter(w => w.code === 'W_A11Y_LINK_TEXT').map(w => w.box).sort(), ['.a', '.b']);
});

test('landmark-name: two navs with the same name are not told apart', () => {
  const nav = (cls, label) => ({tag: 'nav', classes: [cls], named: true, ariaLabel: label});
  const css = '.page { display: grid; grid-template-columns: 100px; grid-auto-rows: 30px; }\n';
  assert.ok(run(page([nav('n1', 'Main'), nav('n2', 'main ')]), css).accessibility.warnings.some(w => w.code === 'W_A11Y_LANDMARK_NAME'));
  assert.equal(run(page([nav('n1', 'Main'), nav('n2', 'Footer')]), css).accessibility.warnings.filter(w => w.code === 'W_A11Y_LANDMARK_NAME').length, 0);
});

test('HTML adapter: direct text, aria-label and href become text facts', async () => {
  const {analyzeHTML} = await import('../src/html.mjs');
  const css = reset + '.page { display: grid; grid-template-columns: 200px; grid-auto-rows: 30px; background: #fff; color: #000; }\n.go { display: block; color: inherit; }\n';
  const report = analyzeHTML('<main class="page"><a class="go" href="/s" aria-label="Find">Search</a></main>', {name: 'Page', css, viewport: domain, accessibility: true, boxes: {'.go': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  assert.deepEqual(find(report, 'E_A11Y_LABEL_IN_NAME').map(d => d.box), ['.go']);
});

// ARIA structure and values, content and page rules.
const divs = (...kids) => page(kids);
const plainCSS = pageCSS('.page { background: #fff; color: #000; }\n.x, .y, .z { display: block; }\n');
const x = (extra = {}, kids) => ({tag: 'div', classes: ['x'], ...extra, ...(kids ? {children: kids} : {})});

test('role-parent and role-children: required ARIA context', () => {
  assert.deepEqual(find(run(divs(x({role: 'tab', tabIndex: 0, focusable: true, named: true})), plainCSS), 'E_A11Y_ROLE_PARENT').map(d => d.role), ['tab']);
  const list = run(divs({tag: 'div', classes: ['y'], role: 'tablist', children: [x({role: 'tab', tabIndex: 0, focusable: true, named: true})]}), pageCSS('.page, .y { display: grid; grid-template-columns: 100px; grid-auto-rows: 30px; background: #fff; color: #000; }\n.x { display: block; }\n'));
  assert.equal(find(list, 'E_A11Y_ROLE_PARENT').length, 0);
  const wrong = run(divs({tag: 'div', classes: ['y'], role: 'list', children: [x({role: 'button', tabIndex: 0, focusable: true, named: true})]}), pageCSS('.page, .y { display: grid; grid-template-columns: 100px; grid-auto-rows: 30px; background: #fff; color: #000; }\n.x { display: block; }\n'));
  assert.deepEqual(find(wrong, 'E_A11Y_ROLE_CHILDREN').map(d => d.box), ['.y']);
});

test('ARIA attributes: required for the role, known names, valid boolean values, presentation conflicts', () => {
  assert.deepEqual(find(run(divs(x({role: 'checkbox', tabIndex: 0, focusable: true, named: true})), plainCSS), 'E_A11Y_ROLE_ATTR').map(d => d.attribute), ['aria-checked']);
  assert.equal(find(run(divs(x({role: 'checkbox', tabIndex: 0, focusable: true, named: true, aria: {'aria-checked': 'false'}})), plainCSS), 'E_A11Y_ROLE_ATTR').length, 0);
  assert.deepEqual(find(run(divs(x({aria: {'aria-lable': 'x'}})), plainCSS), 'E_A11Y_ARIA_ATTR').map(d => d.attribute), ['aria-lable']);
  assert.deepEqual(find(run(divs(x({aria: {'aria-expanded': 'yes'}})), plainCSS), 'E_A11Y_ARIA_VALUE').map(d => d.attribute), ['aria-expanded']);
  assert.equal(find(run(divs({tag: 'button', classes: ['x'], role: 'presentation', named: true}), pageCSS('.x { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n')), 'E_A11Y_PRESENTATION_CONFLICT').length, 1);
  assert.equal(find(run(divs(x({role: 'img'})), plainCSS), 'E_A11Y_NAME').length, 1);
});

test('content: empty th, redundant alt, title-only labels, input buttons, autocomplete and scope', () => {
  const t = run(table([cell()]).children ? {...table([cell()]), children: [{tag: 'thead', classes: ['h'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'th', classes: ['c']}]}]}, table([cell()]).children[1]]} : null, tableCSS(''), {boxes: {'.d': tb['.d']}});
  assert.deepEqual(find(t, 'E_A11Y_EMPTY_TH').map(d => d.box), ['.c']);
  const img = run(divs({tag: 'a', classes: ['y'], focusable: true, href: '/h', text: true, textContent: 'Home', children: [{tag: 'img', classes: ['pic'], alt: 'Home'}]}), fieldCSS + '.y { display: grid; grid-template-columns: minmax(0, 1fr); color: inherit; }\n');
  // (a text leaf with an inline image)
  assert.ok(img.accessibility.warnings.some(w => w.code === 'W_A11Y_REDUNDANT_ALT') || img.status === 'unknown');
  const field = extra => run(divs({tag: 'input', classes: ['f'], inputType: 'text', focusable: true, ...extra}), fieldCSS);
  assert.ok(field({named: true, nameSource: 'title'}).accessibility.warnings.some(w => w.code === 'W_A11Y_TITLE_ONLY'));
  assert.deepEqual(find(field({named: true, autocomplete: 'emial'}), 'E_A11Y_AUTOCOMPLETE').map(d => d.value), ['emial']);
  assert.equal(find(field({named: true, autocomplete: 'section-a shipping email'}), 'E_A11Y_AUTOCOMPLETE').length, 0);
  assert.equal(find(field({inputType: 'button'}), 'E_A11Y_INPUT_BUTTON_NAME').length, 1);
  assert.equal(find(field({inputType: 'button', value: 'Go'}), 'E_A11Y_INPUT_BUTTON_NAME').length, 0);
  assert.deepEqual(find(run(table([cell({scope: 'col'})]), tableCSS(''), {boxes: tb}), 'E_A11Y_SCOPE').map(d => d.box), ['.d']);
});

const doc = (kids, extra = {}) => ({tag: 'html', classes: ['doc'], ...extra, children: [{tag: 'body', classes: ['bd'], children: kids}]});
const docCSS = extra => `.doc, .bd { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; inline-size: 100%; block-size: auto; margin: 0; padding: 0; background: #fff; color: #000; }\n.m, .n { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; }\n.h1, .p, .k { display: block; font-size: 16px; font-weight: 400; line-height: 20px; color: inherit; }\n${extra}`;
const db2 = {'.h1': {minInlineSize: 1, intrinsicBlockSize: 20}, '.p': {minInlineSize: 1, intrinsicBlockSize: 20}, '.k': {minInlineSize: 1, intrinsicBlockSize: 20}};
// Contracts only for the classes a tree has.
const prun = (tree, css) => run(tree, css, {boxes: only(tree, db2)});
const only = (tree, contracts) => { const names = new Set(); (function walk(b) { for (const c of b.classes ?? []) names.add(`.${c}`); for (const k of b.children ?? []) walk(k); })(tree); return Object.fromEntries(Object.entries(contracts).filter(([k]) => names.has(k))); };

test('page rules: html lang, a rendered h1, landmarks around content, a skip link before navigation', () => {
  const main = (...kids) => ({tag: 'main', classes: ['m'], id: 'main', children: kids});
  const good = doc([{tag: 'a', classes: ['k'], focusable: true, href: '#main', text: true, textContent: 'Skip to content'}, {tag: 'nav', classes: ['n'], named: true}, main({tag: 'h1', classes: ['h1'], text: true, textContent: 'Title'})], {lang: 'en'});
  const report = prun(good, docCSS(''));
  assert.deepEqual(report.diagnostics.filter(d => d.code.startsWith('E_A11Y')), []);
  assert.deepEqual(report.accessibility.warnings.map(w => w.code), []);
  assert.deepEqual(find(prun({...good, lang: undefined}, docCSS('')), 'E_A11Y_HTML_LANG').map(d => d.box), ['.doc']);
  assert.deepEqual(find(prun({...good, lang: 'english!'}, docCSS('')), 'E_A11Y_LANG_VALID').map(d => d.box), ['.doc']);
  const noH1 = prun(good, docCSS('@media (width < 600px) { .h1 { display: none; } }'));
  assert.equal(noH1.accessibility.warnings.find(w => w.code === 'W_A11Y_PAGE_H1').range.maxExact, '600');
  const outside = prun(doc([{tag: 'p', classes: ['p'], text: true, textContent: 'Loose'}, main({tag: 'h1', classes: ['h1'], text: true})], {lang: 'en'}), docCSS(''));
  assert.deepEqual(outside.accessibility.warnings.filter(w => w.code === 'W_A11Y_REGION').map(w => w.box), ['.p']);
  const noSkip = prun(doc([{tag: 'nav', classes: ['n'], named: true, children: [{tag: 'a', classes: ['k'], focusable: true, href: '/a', text: true}]}, main({tag: 'h1', classes: ['h1'], text: true})], {lang: 'en'}), docCSS(''));
  assert.ok(noSkip.accessibility.warnings.some(w => w.code === 'W_A11Y_BYPASS'));
});

test('landmark nesting and duplicate banners', () => {
  const css = docCSS('.hd, .ft, .as { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 30px; }\n');
  const nested = prun(doc([{tag: 'main', classes: ['m'], children: [{tag: 'aside', classes: ['as']}, {tag: 'h1', classes: ['h1'], text: true}]}], {lang: 'en'}), css);
  assert.deepEqual(nested.accessibility.warnings.filter(w => w.code === 'W_A11Y_LANDMARK_TOP_LEVEL').map(w => w.box), ['.as']);
  const twice = prun(doc([{tag: 'header', classes: ['hd']}, {tag: 'header', classes: ['hd']}, {tag: 'main', classes: ['m'], children: [{tag: 'h1', classes: ['h1'], text: true}]}], {lang: 'en'}), css);
  assert.ok(twice.accessibility.warnings.some(w => w.code === 'W_A11Y_DUPLICATE_LANDMARK'));
});

test('p-as-heading and orientation lock: CSS that changes what the DOM says', () => {
  const ps = page([{tag: 'p', classes: ['p'], text: true}, {tag: 'p', classes: ['q'], text: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; }\n.p, .q { display: block; font-size: 16px; font-weight: 400; line-height: 20px; }\n${extra}`);
  const pb2 = {'.p': {minInlineSize: 1, intrinsicBlockSize: 20}, '.q': {minInlineSize: 1, intrinsicBlockSize: 20}};
  assert.deepEqual(run(ps, css('.p { font-weight: 700; }'), {boxes: pb2}).accessibility.warnings.filter(w => w.code === 'W_A11Y_P_AS_HEADING').map(w => w.box), ['.p']);
  assert.equal(run(ps, css(''), {boxes: pb2}).accessibility.warnings.filter(w => w.code === 'W_A11Y_P_AS_HEADING').length, 0);
  // Content shown only in portrait (height > width): SC 1.3.4.
  const locked = run({tag: 'div', classes: ['page'], children: [{tag: 'main', classes: ['m']}]}, pageCSS('.m { display: block; }\n@media (orientation: landscape) { .m { display: none; } }\n'), {viewport: {min: 320, max: 1280, height: {min: 400, max: 900}}});
  const [lock] = find(locked, 'E_A11Y_ORIENTATION');
  assert.equal(lock.missing, 'landscape');
});

// Focus indicator (SC 2.4.7) from paint-only :focus rules, and text spacing (SC 1.4.12).
const fbtn = css => run(page([{tag: 'button', classes: ['b'], named: true}]), pageCSS(`.page { background: #fff; color: #000; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${css}`));
test('focus-visible: removing the outline without another focus style hides focus', () => {
  assert.equal(find(fbtn(''), 'E_A11Y_FOCUS_VISIBLE').length, 0); // the UA focus ring
  assert.deepEqual(find(fbtn('.b { outline: none; }'), 'E_A11Y_FOCUS_VISIBLE').map(d => d.box), ['.b']);
  assert.deepEqual(find(fbtn('.b:focus { outline: 0; }'), 'E_A11Y_FOCUS_VISIBLE').map(d => d.box), ['.b']);
  assert.equal(find(fbtn('.b { outline: none; }\n.b:focus-visible { box-shadow: 0 0 0 3px #1a73e8; }'), 'E_A11Y_FOCUS_VISIBLE').length, 0);
  assert.equal(find(fbtn('.b { outline: none; }\n.b:focus { outline: 2px solid #1a73e8; }'), 'E_A11Y_FOCUS_VISIBLE').length, 0);
  assert.equal(find(fbtn('.b { outline: none; background: #fff; }\n.b:focus { background: #ffd; }'), 'E_A11Y_FOCUS_VISIBLE').length, 0);
  // A state rule that changes layout stays Unknown: the proof covers the base state only.
  assert.equal(fbtn('.b:hover { padding: 4px; }').status, 'unknown');
});

test('text-spacing: clipped text that no longer fits at line-height 1.5', () => {
  const font = {family: 'Noto Sans JP', size: 16, lineHeight: 20, weight: 400};
  const contract = {minInlineSize: 50, intrinsicBlockSize: 20, wrap: 'nowrap', font, textMetrics: {kind: 'content', text: 'x', width: 49}, overflow: 'clip', overflowBlock: 'clip'};
  const tree = page([{tag: 'p', classes: ['t'], text: true}]);
  const css = h => pageCSS(`.page { background: #fff; color: #000; grid-template-rows: ${h}px; grid-auto-rows: auto; }\n.t { font-family: "Noto Sans JP"; font-size: 16px; line-height: 20px; font-weight: 400; white-space: nowrap; overflow: hidden; }\n`);
  // One line at 1.5 × 16 = 24px needs a 24px box.
  assert.deepEqual(find(run(tree, css(20), {boxes: {'.t': contract}}), 'E_A11Y_TEXT_SPACING').map(d => d.box), ['.t']);
  assert.equal(find(run(tree, css(24), {boxes: {'.t': contract}}), 'E_A11Y_TEXT_SPACING').length, 0);
});

test('state-contrast: hover and focus colors keep the contrast minimum', () => {
  const tree = page([{tag: 'button', classes: ['b'], named: true, text: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; font-size: 16px; background: #fff; color: #000; }\n${extra}`);
  const b = {'.b': {minInlineSize: 1, intrinsicBlockSize: 20}};
  assert.equal(find(run(tree, css('.b:hover { color: #333; }'), {boxes: b}), 'E_A11Y_STATE_CONTRAST').length, 0);
  assert.deepEqual(find(run(tree, css('.b:hover { color: #bbb; }'), {boxes: b}), 'E_A11Y_STATE_CONTRAST').map(d => d.state), ['hover']);
  assert.deepEqual(find(run(tree, css('.b:focus { background: #000; }'), {boxes: b}), 'E_A11Y_STATE_CONTRAST').map(d => d.state), ['focus']);
});

// Frames and media; text-spacing widths.
const mediaCSS = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 100px; }\n.v { display: block; inline-size: 160px; block-size: 90px; }\n${extra}`);
test('frame-title, video-caption and autoplay-audio', () => {
  assert.deepEqual(find(run(page([{tag: 'iframe', classes: ['v']}]), mediaCSS('')), 'E_A11Y_FRAME_TITLE').map(d => d.box), ['.v']);
  assert.equal(find(run(page([{tag: 'iframe', classes: ['v'], named: true}]), mediaCSS('')), 'E_A11Y_FRAME_TITLE').length, 0);
  const video = (extra = {}, tracks = []) => page([{tag: 'video', classes: ['v'], controls: true, ...extra, children: tracks}]);
  assert.deepEqual(find(run(video(), mediaCSS('')), 'E_A11Y_VIDEO_CAPTION').map(d => d.box), ['.v']);
  assert.equal(find(run(video({}, [{tag: 'track', classes: ['k'], trackKind: 'captions'}]), mediaCSS('')), 'E_A11Y_VIDEO_CAPTION').length, 0);
  assert.ok(run(video({autoplay: true}, [{tag: 'track', classes: ['k'], trackKind: 'captions'}]), mediaCSS('')).accessibility.warnings.some(w => w.code === 'W_A11Y_AUTOPLAY_AUDIO'));
  assert.equal(run(video({autoplay: true, muted: true}, [{tag: 'track', classes: ['k'], trackKind: 'captions'}]), mediaCSS('')).accessibility.warnings.filter(w => w.code === 'W_A11Y_AUTOPLAY_AUDIO').length, 0);
  // Sizes stay explicit: a video without them is Unknown.
  assert.equal(run(video(), pageCSS('.v { display: block; }')).status, 'unknown');
});

test('text-spacing: letter 0.12em and word 0.16em spacing widen clipped single-line text', () => {
  const font = {family: 'Noto Sans JP', size: 10, lineHeight: 20, weight: 400};
  // "ab cd": 5 characters, 1 space: + 5 × 1.2 + 1 × 1.6 = 7.6px over the measured 40px.
  const contract = {minInlineSize: 40, intrinsicBlockSize: 20, wrap: 'nowrap', font, textMetrics: {kind: 'content', text: 'ab cd', width: 39.9}, overflow: 'clip', overflowBlock: 'clip'};
  const css = w => pageCSS(`.page { grid-template-columns: ${w}px; grid-template-rows: 40px; background: #fff; color: #000; }\n.t { font-family: "Noto Sans JP"; font-size: 10px; line-height: 20px; font-weight: 400; white-space: nowrap; overflow: hidden; }\n`);
  const tree = page([{tag: 'p', classes: ['t'], text: true}]);
  assert.deepEqual(find(run(tree, css(45), {boxes: {'.t': contract}}), 'E_A11Y_TEXT_SPACING').map(d => d.axis), ['inline']);
  assert.equal(find(run(tree, css(48), {boxes: {'.t': contract}}), 'E_A11Y_TEXT_SPACING').length, 0);
});

test('hover-only: a control that hover reveals must also show on focus', () => {
  assert.deepEqual(find(fbtn('.b { opacity: 0; }\n.b:hover { opacity: 1; }'), 'E_A11Y_HOVER_ONLY').map(d => d.box), ['.b']);
  assert.equal(find(fbtn('.b { opacity: 0; }\n.b:hover { opacity: 1; }\n.b:focus { opacity: 1; }'), 'E_A11Y_HOVER_ONLY').length, 0);
  assert.equal(find(fbtn('.b { opacity: 0; }\n.b:hover, .b:focus-visible { opacity: 1; }'), 'E_A11Y_HOVER_ONLY').length, 0);
});

test('a rendered legend with explicit sizes is laid out in the fieldset border and names the group', () => {
  const radio = cls => ({tag: 'input', classes: [cls], inputType: 'radio', inputName: 'x', focusable: true, named: true});
  const css = '.fs { display: grid; grid-template-columns: 30px 30px; grid-template-rows: 30px; margin: 0; padding: 0; border: 2px solid #000; min-inline-size: 0; background: #fff; color: #000; }\n.lg { display: block; inline-size: 60px; block-size: 20px; padding: 0; font-size: 16px; line-height: 20px; }\n.a, .b { appearance: none; display: block; inline-size: 30px; block-size: 30px; padding: 0; border: 0; min-width: 0; min-height: 0; }\n';
  const report = run({tag: 'fieldset', classes: ['fs'], children: [{tag: 'legend', classes: ['lg'], text: true}, radio('a'), radio('b')]}, css + '\n.a, .b { background: #000; }\n.a:checked, .b:checked { box-shadow: inset 0 0 0 4px #fff; }', {boxes: {'.lg': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  const legend = report.sizes.find(row => row.box === '.lg' && row.rect), first = report.sizes.find(row => row.box === '.a' && row.rect);
  assert.equal(legend.rect.blockStart.constant, '0');
  assert.equal(first.rect.blockStart.constant, '20'); // content starts at max(border 2px, legend 20px)
  assert.equal(report.accessibility.warnings.filter(w => w.code === 'W_A11Y_FIELDSET_NAME').length, 0);
});

test('fixed tables are laid out like their equivalent grid', () => {
  const row = n => ({tag: 'tr', classes: ['r'], children: Array.from({length: n}, (_, i) => ({tag: 'td', classes: [`c${i}`]}))});
  const table = (rows, extra = {}) => ({tag: 'table', classes: ['t'], ...extra, children: [{tag: 'tbody', classes: ['b'], children: rows}]});
  const css = extra => `.t { table-layout: fixed; inline-size: 400px; }\n.c0, .c1 { block-size: 20px; }\n${extra}`;
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const value = text => { const [n, d = '1'] = text.split('/'); return Number(n) / Number(d); };
  const rect = (report, cls, row = 0) => report.sizes.filter(r => r.box === `.${cls}` && r.rect)[row].rect;
  const wide = run(table([row(2), row(2)]), css('.c0 { inline-size: 80px; }\n.c1 { inline-size: 120px; }'), {viewport: tableView});
  assert.equal(wide.status, 'verified', JSON.stringify(wide.diagnostics));
  // 394 shared 80 : 120 after 3 × 2px spacing.
  assert.ok(Math.abs(value(rect(wide, 'c0').inlineSize.constant) - 157.6) < 1e-9);
  assert.equal(rect(wide, 'c1', 1).blockStart.constant, '24');
  assert.ok(find(run(table([row(2)]), css('.t { inline-size: 150px; }\n.c0 { inline-size: 80px; }\n.c1 { inline-size: 120px; }'), {viewport: tableView}), 'E_LAYOUT_TABLE_WIDTH').length === 1);
  const auto = run(table([row(2)]), css('.c1 { inline-size: 100px; }'), {viewport: tableView});
  assert.equal(rect(auto, 'c0').inlineSize.constant, '294');
  for (const extra of ['.t { table-layout: auto; }', '.t { border-collapse: collapse; }', '.t { inline-size: auto; }'])
    assert.equal(run(table([row(2)]), css(extra), {viewport: tableView}).status, 'unknown', extra);
  assert.equal(run(table([row(2), row(1)]), css(''), {viewport: tableView}).status, 'unknown');
});

test('a content-box fixed table keeps its edge spacing inside its width', () => {
  const t = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['a']}, {tag: 'td', classes: ['c']}]}]}]};
  const report = run(t, '.t { table-layout: fixed; inline-size: 400px; box-sizing: content-box; border: 5px solid #000; }\n.a, .c { block-size: 20px; }\n.a { inline-size: 100px; }\n', {viewport: {min: 420, max: 1280, height: {min: 400, max: 900}}});
  const sizes = Object.fromEntries(report.sizes.filter(r => r.rect).map(r => [r.box, r.rect]));
  assert.equal(sizes['.t'].inlineSize.constant, '410'); // as measured in Chromium
  assert.equal(sizes['.c'].inlineSize.constant, '294');
});

// User preferences are paint-only states; the layout is proved under the defaults.
test('prefers-color-scheme: dark rules are checked for contrast as well', () => {
  const tree = page([{tag: 'p', classes: ['t'], text: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; }\n.t { font-size: 16px; }\n${extra}`);
  const b = {'.t': text};
  assert.equal(find(run(tree, css('@media (prefers-color-scheme: dark) { .page { background: #000; color: #eee; } }'), {boxes: b}), 'E_A11Y_CONTRAST').length, 0);
  const dark = find(run(tree, css('@media (prefers-color-scheme: dark) { .page { background: #111; color: #444; } }'), {boxes: b}), 'E_A11Y_CONTRAST');
  assert.deepEqual(dark.map(d => [d.box, d.preference]), [['.t', 'prefers-color-scheme: dark']]);
  // Preference rules may not change layout.
  assert.equal(run(tree, css('@media (prefers-reduced-motion: reduce) { .t { display: none; } }'), {boxes: b}).status, 'unknown');
});

test('motion: long animations must stop under prefers-reduced-motion: reduce', () => {
  const tree = page([{tag: 'div', classes: ['spin']}]);
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 20px; }\n.spin { animation: spin 1s linear infinite; }\n@keyframes spin { to { opacity: 0.5; } }\n${extra}`);
  assert.deepEqual(warn(run(tree, css('')), 'W_A11Y_MOTION').map(d => d.box), ['.spin']);
  assert.equal(warn(run(tree, css('@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }')), 'W_A11Y_MOTION').length, 0);
  // No @keyframes, no animation; under five seconds in total is fine.
  assert.equal(warn(run(tree, pageCSS('.page { grid-auto-rows: 20px; }\n.spin { animation: spin 1s infinite; }\n')), 'W_A11Y_MOTION').length, 0);
  assert.equal(warn(run(tree, pageCSS('.page { grid-auto-rows: 20px; }\n.spin { animation: pop 2s 2; transition: color 0.2s; }\n@keyframes pop { to { opacity: 0.5; } }\n')), 'W_A11Y_MOTION').length, 0);
});

test('clickable-look, list-style semantics, blink, dl, accesskeys, ismap and aria-hidden body', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 20px; }\n${extra}`);
  assert.deepEqual(warn(run(page([{tag: 'div', classes: ['card']}]), css('.card { cursor: pointer; }')), 'W_A11Y_CLICK_LOOK').map(d => d.box), ['.card']);
  // A button, or a child that inherits the pointer, is fine.
  assert.equal(warn(run(page([{tag: 'button', classes: ['card'], named: true, children: [{tag: 'span', classes: ['x']}]}]), css('.card { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; cursor: pointer; }')), 'W_A11Y_CLICK_LOOK').length, 0);
  const list = role => page([{tag: 'ul', classes: ['l'], ...(role ? {role} : {}), children: [{tag: 'li', classes: ['i']}]}]);
  const listCSS = css('.l { display: grid; grid-template-columns: minmax(0, 1fr); padding: 0; list-style: none; grid-auto-rows: 20px; }\n.i { display: block; }');
  assert.deepEqual(warn(run(list(), listCSS), 'W_A11Y_LIST_STYLE').map(d => d.box), ['.l']);
  assert.equal(warn(run(list('list'), listCSS), 'W_A11Y_LIST_STYLE').length, 0);
  assert.deepEqual(find(run(page([{tag: 'marquee', classes: ['m']}]), css('.m { display: block; inline-size: 100px; block-size: 20px; }')), 'E_A11Y_BLINK').map(d => d.box), ['.m']);
  const dl = page([{tag: 'dl', classes: ['d'], children: [{tag: 'dt', classes: ['t']}, {tag: 'p', classes: ['p']}]}]);
  assert.deepEqual(find(run(dl, css('.d { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 20px; }')), 'E_A11Y_DL').map(d => d.box), ['.d']);
  assert.deepEqual(find(run(page([{tag: 'dd', classes: ['x']}]), css('')), 'E_A11Y_DL').map(d => d.box), ['.x']);
  const keys = page([{tag: 'a', classes: ['a'], focusable: true, href: '/a', accessKey: 's', named: true}, {tag: 'a', classes: ['b'], focusable: true, href: '/b', accessKey: 's', named: true}]);
  assert.deepEqual(warn(run(keys, css('.a, .b { display: block; }')), 'W_A11Y_ACCESSKEY').map(d => d.box), ['.b']);
  assert.deepEqual(warn(run(page([{tag: 'img', classes: ['m'], alt: 'map', ismap: true}]), css('.m { display: block; inline-size: 20px; block-size: 20px; }')), 'W_A11Y_ISMAP').map(d => d.box), ['.m']);
  const hiddenBody = {tag: 'body', classes: ['page'], ariaHidden: true, children: [{tag: 'div', classes: ['x']}]};
  assert.deepEqual(warn(run(hiddenBody, '.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 20px; }'), 'W_A11Y_ARIA_HIDDEN_BODY').map(d => d.box), ['.page']);
});

test('color-scheme resolves author Canvas/CanvasText in the used scheme', () => {
  const tree = page([{tag: 'p', classes: ['t'], text: true}]);
  const css = extra => pageCSS(`.page { background: Canvas; color: CanvasText; }\n.t { font-size: 16px; }\n${extra}`);
  const b = {'.t': text};
  // Light: black on white. Dark (color-scheme: dark): white on #121212; a #444 text there is too dark.
  assert.equal(find(run(tree, css(''), {boxes: b}), 'E_A11Y_CONTRAST').length, 0);
  assert.equal(find(run(tree, css('.page { color-scheme: dark; }\n.t { color: #444; }'), {boxes: b}), 'E_A11Y_CONTRAST').length, 1);
  assert.equal(find(run(tree, css('.t { color: #444; }'), {boxes: b}), 'E_A11Y_CONTRAST').length, 0);
  // light dark: only the dark preference picks the dark canvas.
  const both = find(run(tree, css('.page { color-scheme: light dark; }\n.t { color: #444; }'), {boxes: b}), 'E_A11Y_CONTRAST');
  assert.deepEqual(both.map(d => d.preference), ['prefers-color-scheme: dark']);
});

test('fixed tables with colspan and a caption', () => {
  const cell = (cls, extra = {}) => ({tag: 'td', classes: [cls], ...extra});
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const value = text => { const [n, d = '1'] = text.split('/'); return Number(n) / Number(d); };
  const rect = (report, cls) => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect;
  const css = '.t { table-layout: fixed; inline-size: 400px; border-spacing: 0; }\ntd { block-size: 30px; padding: 0; }\n.cap { block-size: 20px; }\n';
  // First row: a 200px cell over two columns and a 100px one → three equal columns of 400/3.
  const tree = (caption, side) => ({tag: 'table', classes: ['t'], children: [...(caption ? [{tag: 'caption', classes: ['cap']}] : []), {tag: 'tbody', classes: ['b'], children: [
    {tag: 'tr', classes: ['r'], children: [cell('a', {colSpan: 2}), cell('b')]}, {tag: 'tr', classes: ['r'], children: [cell('x'), cell('y'), cell('z')]}]}]});
  const spans = run(tree(false), css + '.a { inline-size: 200px; }\n.b { inline-size: 100px; }', {viewport: tableView});
  assert.equal(spans.status, 'verified', JSON.stringify(spans.diagnostics));
  assert.ok(Math.abs(value(rect(spans, 'a').inlineSize.constant) - 800 / 3) < 1e-9);
  assert.ok(Math.abs(value(rect(spans, 'y').inlineStart.constant) - 400 / 3) < 1e-9);
  // A caption is a full-width row above (or below) the cells.
  const top = run(tree(true), css + '.a { inline-size: 200px; }\n.b { inline-size: 100px; }', {viewport: tableView});
  assert.equal(top.status, 'verified', JSON.stringify(top.diagnostics));
  assert.equal(rect(top, 'cap').inlineSize.constant, '400');
  assert.equal(rect(top, 'x').blockStart.constant, '50');
  const bottom = run(tree(true), css + '.t { caption-side: bottom; }', {viewport: tableView});
  assert.equal(rect(bottom, 'cap').blockStart.constant, '60');
  // With spacing the caption still spans the full width; the rows are inset by the spacing.
  const spaced = run(tree(true), css + '.t { border-spacing: 4px 6px; }\n.a { inline-size: 200px; }\n.b { inline-size: 100px; }', {viewport: tableView});
  assert.equal(spaced.status, 'verified', JSON.stringify(spaced.diagnostics));
  assert.equal(rect(spaced, 'cap').inlineSize.constant, '400');
  assert.equal(rect(spaced, 'x').inlineStart.constant, '4');
  assert.equal(rect(spaced, 'a').blockStart.constant, '26');
  assert.equal(rect(spaced, 'x').blockStart.constant, '62');
  // Border and padding surround the rows, not the caption.
  const framed = run(tree(true), css + '.t { border-spacing: 4px 6px; padding: 5px; border: 3px solid #000; }', {viewport: tableView});
  assert.equal(framed.status, 'verified', JSON.stringify(framed.diagnostics));
  assert.equal(rect(framed, 'cap').inlineSize.constant, '400');
  assert.equal(rect(framed, 'a').inlineStart.constant, '12');
  assert.equal(rect(framed, 'a').blockStart.constant, '34');
  // rowspan: an empty auto-height cell over two rows; a rowspan past its row group stays Unknown.
  assert.equal(run({tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [cell('a', {rowSpan: 2})]}]}]}, css, {viewport: tableView}).status, 'unknown');
  const tall = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [
    {tag: 'tr', classes: ['r'], children: [cell('s', {rowSpan: 2}), cell('p')]}, {tag: 'tr', classes: ['r'], children: [cell('q')]}]}]};
  const spanned = run(tall, css + '.s { block-size: auto; inline-size: 100px; }', {viewport: tableView});
  assert.equal(spanned.status, 'verified', JSON.stringify(spanned.diagnostics));
  assert.equal(rect(spanned, 's').blockSize.constant, '60');
  assert.equal(rect(spanned, 'q').inlineStart.constant, '100');
  // A px rowspan cell (30px, under its two 30px rows) is modeled too.
  assert.equal(run(tall, css + '.s { inline-size: 100px; }', {viewport: tableView}).status, 'verified');
});

test('inline links in one measured line: occlusion and obscured focus from their bounds', () => {
  const font = {family: 'Roboto', size: 16, lineHeight: 24, weight: 400};
  const contract = {minInlineSize: 140, intrinsicBlockSize: 24, wrap: 'nowrap', font,
    textMetrics: {kind: 'content', text: 'Read the guide first.', width: 139, inline: {'.u': {start: [66.5, 66.6], end: [105.7, 105.8], top: [1.6, 3.7], bottom: [20.3, 22.4]}}}};
  const tree = {tag: 'main', classes: ['page'], children: [{tag: 'p', classes: ['p'], text: true, children: [{tag: 'a', classes: ['u'], focusable: true, href: '/x', text: true}]}, {tag: 'div', classes: ['cover']}]};
  const css = cover => `.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 24px; position: relative; background: #fff; color: #000; }\n.p { font-family: Roboto; font-size: 16px; line-height: 24px; font-weight: 400; white-space: nowrap; }\n.u { color: #000; }\n.cover { position: absolute; top: 0; ${cover} block-size: 24px; background: #eee; }`;
  const codes = cover => run(tree, css(cover), {boxes: {'.p': contract}}).diagnostics.filter(d => d.path === 'Page/0/0').map(d => d.code).sort();
  assert.deepEqual(codes('left: 0; inline-size: 300px;'), ['E_A11Y_FOCUS_OBSCURED', 'E_A11Y_OCCLUDED']);
  assert.deepEqual(codes('left: 80px; inline-size: 10px;'), ['E_A11Y_OCCLUDED']);
  assert.deepEqual(codes('left: 200px; inline-size: 40px;'), []);
  // Touching only the measurement allowance is not decided.
  assert.deepEqual(codes('left: 106px; inline-size: 40px;').filter(c => c.startsWith('U_')), []);
  assert.deepEqual(codes('left: 105.75px; inline-size: 40px;'), ['U_A11Y_OCCLUDED']);
});

test('automatic tables whose content fits their px columns are laid out like fixed ones', () => {
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const value = text => { const [n, d = '1'] = text.split('/'); return Number(n) / Number(d); };
  const rect = (report, cls) => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect;
  const row = cells => ({tag: 'tr', classes: ['r'], children: cells.map(cls => ({tag: 'td', classes: [cls]}))});
  const tree = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [row(['a', 'b']), row(['x', 'y'])]}]};
  const css = extra => `td { block-size: 20px; }\n.a { inline-size: 80px; }\n.b { inline-size: 120px; }\n${extra}`;
  // auto width: the columns plus 3 × 2px spacing.
  const shrink = run(tree, css(''), {viewport: tableView});
  assert.equal(shrink.status, 'verified', JSON.stringify(shrink.diagnostics));
  assert.equal(rect(shrink, 't').inlineSize.constant, '206');
  assert.equal(rect(shrink, 'y').inlineStart.constant, '84');
  // An explicit width shares the extra in proportion, like a fixed table.
  const wide = run(tree, css('.t { inline-size: 400px; }'), {viewport: tableView});
  assert.ok(Math.abs(value(rect(wide, 'a').inlineSize.constant) - 157.6) < 1e-9);
  // Narrower than the columns: shared by content (Unknown).
  assert.equal(run(tree, css('.t { inline-size: 100px; }'), {viewport: tableView}).status, 'unknown');
  // A container narrower than the auto width: the table shrinks (Unknown there only).
  const narrow = run(tree, css('.a { inline-size: 300px; }\n.b { inline-size: 200px; }'), {viewport: tableView});
  assert.deepEqual(narrow.diagnostics.filter(d => d.code === 'U_LAYOUT_TABLE').map(d => d.range.maxExact), ['506']);
  // Content without a fitting min-content bound decides the column.
  const text = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['a'], text: true}, {tag: 'td', classes: ['b']}]}]}]};
  const colored = css('.t { background: #fff; color: #000; }');
  assert.equal(run(text, colored, {viewport: tableView, boxes: {'.a': {minInlineSize: 60, intrinsicBlockSize: 18}}}).status, 'verified');
  assert.equal(run(text, colored, {viewport: tableView, boxes: {'.a': {minInlineSize: 90, intrinsicBlockSize: 18}}}).status, 'unknown');
});

test('a caption does not sit on its table background', () => {
  const tree = {tag: 'main', classes: ['page'], children: [{tag: 'table', classes: ['t'], children: [{tag: 'caption', classes: ['cap'], text: true}, {tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['d'], text: true}]}]}]}]};
  const css = `.page { display: grid; grid-template-columns: minmax(0, 1fr); background: #fff; }\n.t { table-layout: fixed; inline-size: 300px; border-spacing: 0; background: #000; color: #fff; }\n.cap, .d { block-size: 20px; padding: 0; }`;
  const report = run(tree, css, {boxes: {'.cap': {minInlineSize: 1, intrinsicBlockSize: 20}, '.d': {minInlineSize: 1, intrinsicBlockSize: 20}}});
  // White caption text over the white page (the table's black is behind the cells only).
  assert.deepEqual(find(report, 'E_A11Y_CONTRAST').map(d => d.box), ['.cap']);
});

test('a taller px rowspan cell grows its rows like Chromium', () => {
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const rect = (report, cls) => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect;
  const tree = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [
    {tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['s'], rowSpan: 2}, {tag: 'td', classes: ['p']}]}, {tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['q']}]}]}]};
  const css = spacing => `.t { table-layout: fixed; inline-size: 400px; border-spacing: ${spacing}; }\ntd { padding: 0; }\n.s { block-size: 120px; inline-size: 100px; }\n.p { block-size: 20px; }\n.q { block-size: 40px; }`;
  const plain = run(tree, css('0'), {viewport: tableView});
  assert.equal(plain.status, 'verified', JSON.stringify(plain.diagnostics));
  assert.equal(rect(plain, 'p').blockSize.constant, '40');
  assert.equal(rect(plain, 'q').blockStart.constant, '40');
  // 116px over 20 : 40, the first share floored to 1/64px.
  const spaced = run(tree, css('4px'), {viewport: tableView});
  assert.equal(rect(spaced, 'p').blockSize.constant, '1237/32');
  assert.equal(rect(spaced, 'q').blockSize.constant, '2475/32');
});

test('content taller than a table cell is Unknown, not overflow (the row grows)', () => {
  const tree = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['d'], text: true}]}]}]};
  const report = run(tree, '.t { table-layout: fixed; inline-size: 400px; background: #fff; color: #000; }\n.d { block-size: 20px; }', {viewport: {min: 420, max: 1280, height: {min: 400, max: 900}}, boxes: {'.d': {minInlineSize: 10, intrinsicBlockSize: 40}}});
  assert.deepEqual(report.diagnostics.map(d => d.code), ['U_LAYOUT_TABLE']);
});

test('nested px rowspans grow shorter spans first; rows that start a rowspan take the excess first', () => {
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const rect = (report, cls) => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect;
  const td = (cls, rowSpan) => ({tag: 'td', classes: [cls], ...(rowSpan ? {rowSpan} : {})});
  const table = rows => ({tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: rows.map(children => ({tag: 'tr', classes: ['r'], children}))}]});
  const css = '.t { table-layout: fixed; inline-size: 300px; border-spacing: 0; }\ntd { padding: 0; block-size: 10px; }\n.a { block-size: 120px; inline-size: 50px; }\n.b { block-size: 60px; inline-size: 50px; }';
  // b (two rows) first: 10, 10 → 30, 30; then a over 30, 30, 10 → 120.
  const nested = run(table([[td('a', 3), td('b', 2), td('c')], [td('c')], [td('x'), td('c')]]), css, {viewport: tableView});
  assert.equal(nested.status, 'verified', JSON.stringify(nested.diagnostics));
  assert.equal(rect(nested, 'x').blockSize.constant, '549/32');
  // A span starting inside a (both two rows): the excess goes to that row (Chromium: rows that start a rowspan first).
  const inside = run(table([[td('a', 2), td('c'), td('c')], [td('m'), td('b', 2)], [td('n'), td('c')]]), css.replace('.a { block-size: 120px;', '.a { block-size: 100px;').replace('.b { block-size: 60px;', '.b { block-size: 30px;'), {viewport: tableView});
  assert.equal(inside.status, 'verified', JSON.stringify(inside.diagnostics));
  assert.equal(rect(inside, 'm').blockSize.constant, '90');
  assert.equal(rect(inside, 'n').blockStart.constant, '100');
});

test('an auto-height text rowspan cell counts its measured height at its column width', () => {
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const rect = (report, cls) => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect;
  const tree = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [
    {tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['s'], rowSpan: 2, text: true}, {tag: 'td', classes: ['p']}]}, {tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['q']}]}]}]};
  const css = width => `.t { table-layout: fixed; inline-size: ${width}; border-spacing: 0; background: #fff; color: #000; }\ntd { padding: 0; }\n.s { inline-size: 100px; }\n.p { block-size: 20px; }\n.q { block-size: 40px; }`;
  // 100px column → 3 lines of 30px = 90px over 20 + 40.
  const boxes = {'.s': {minInlineSize: 50, intrinsicBlockSize: [{atLeastInlineSize: 0, blockSize: 120}, {atLeastInlineSize: 90, blockSize: 90}, {atLeastInlineSize: 150, blockSize: 60}]}};
  const report = run(tree, css('400px'), {viewport: tableView, boxes});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.equal(rect(report, 'p').blockSize.constant, '30');
  assert.equal(rect(report, 'q').blockSize.constant, '60');
  // A table width that varies with the viewport: the region splits where the cell's line count changes.
  const varying = run({tag: 'main', classes: ['page'], children: [tree]}, `.page { display: grid; grid-template-columns: minmax(0, 1fr); }\n` + css('100%').replace('.s { inline-size: 100px; }', '.p { inline-size: 100px; }'), {viewport: {min: 150, max: 1280, height: {min: 400, max: 900}}, boxes});
  assert.equal(varying.status, 'verified', JSON.stringify(varying.diagnostics));
  // The auto column is W − 100: below 190 → 120px (rows 40 + 80), 190..250 → 90px (30 + 60), from 250 → 60px (20 + 40).
  const heights = varying.sizes.filter(r => r.box === '.q' && r.rect).map(r => [r.range.minExact, r.rect.blockSize.constant]).sort((a, b) => Number(a[0]) - Number(b[0]));
  assert.deepEqual(heights, [['150', '80'], ['190', '60'], ['250', '40']]);
});

test('a td restyled away from table-cell is not a modeled table cell', () => {
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const tree = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['a']}, {tag: 'td', classes: ['b']}]}]}]};
  const css = extra => `.t { table-layout: fixed; inline-size: 400px; }\ntd { block-size: 20px; }\n${extra}`;
  assert.equal(run(tree, css(''), {viewport: tableView}).status, 'verified');
  for (const extra of ['.a { display: grid; grid-template-columns: minmax(0, 1fr); }', '.b { display: none; }', '.a { display: block; }'])
    assert.equal(run(tree, css(extra), {viewport: tableView}).status, 'unknown', extra);
});

test('table cells with block children lay them out in block flow', () => {
  const tableView = {min: 420, max: 1280, height: {min: 400, max: 900}};
  const rect = (report, cls) => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect;
  const tree = other => ({tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [{tag: 'td', classes: ['c'], children: [{tag: 'div', classes: ['k1']}, {tag: 'div', classes: ['k2']}]}, {tag: 'td', classes: ['o'], ...other}]}]}]});
  const css = extra => `.t { table-layout: fixed; inline-size: 400px; border-spacing: 0; }\ntd { padding: 0; }\n.k1 { block-size: 30px; }\n.k2 { block-size: 20px; inline-size: 50px; }\n${extra}`;
  // The cell decides its row (the other cell is empty): the children stack at the top.
  const alone = run(tree({}), css(''), {viewport: tableView});
  assert.equal(alone.status, 'verified', JSON.stringify(alone.diagnostics));
  assert.equal(rect(alone, 'k2').blockStart.constant, '30');
  assert.equal(rect(alone, 'k2').inlineSize.constant, '50');
  assert.equal(rect(alone, 'o').blockSize.constant, '50');
  // A taller row (both cells 90px): middle (the default) centres the 50px content, bottom puts it at the end.
  const middle = run(tree({}), css('td { block-size: 90px; }'), {viewport: tableView});
  assert.equal(middle.status, 'verified', JSON.stringify(middle.diagnostics));
  assert.equal(rect(middle, 'k1').blockStart.constant, '20');
  assert.equal(rect(run(tree({}), css('td { block-size: 90px; }\n.c { vertical-align: bottom; }'), {viewport: tableView}), 'k1').blockStart.constant, '40');
  // The only non-empty baseline cell of its row sits at the top (no line boxes: its content bottom is the baseline).
  assert.equal(rect(run(tree({}), css('td { block-size: 90px; }\n.c { vertical-align: baseline; }'), {viewport: tableView}), 'k1').blockStart.constant, '0');
  // Two baseline cells with px children: content bottoms aligned (50 and 30 → the second moves down 20).
  const both = run(tree({children: [{tag: 'div', classes: ['k1']}]}), css('td { vertical-align: baseline; }'), {viewport: tableView});
  assert.equal(both.status, 'verified', JSON.stringify(both.diagnostics));
  assert.equal(both.sizes.filter(r => r.box === '.k1' && r.rect).map(r => r.rect.blockStart.constant).sort().join(','), '0,20');
  // With a fixed cell height the move could need a taller row: Unknown.
  assert.equal(run(tree({children: [{tag: 'div', classes: ['k1']}]}), css('td { block-size: 90px; vertical-align: baseline; }'), {viewport: tableView}).status, 'unknown');
});

test('input-image-alt, fragment-target and page-main', () => {
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 20px; }\n${extra}`);
  const img = alt => page([{tag: 'input', classes: ['i'], inputType: 'image', focusable: true, ...(alt !== undefined ? {alt} : {})}]);
  const imgCSS = css('.i { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; box-sizing: border-box; inline-size: 20px; block-size: 20px; }');
  assert.deepEqual(find(run(img(), imgCSS), 'E_A11Y_INPUT_IMAGE_ALT').map(d => d.box), ['.i']);
  assert.equal(find(run(img('Search'), imgCSS), 'E_A11Y_INPUT_IMAGE_ALT').length, 0);
  const links = (id, extra) => page([{tag: 'a', classes: ['a'], focusable: true, href: '#main', named: true}, {tag: 'section', classes: ['s'], ...(id ? {id} : {}), ...extra}]);
  const linkCSS = extra => css(`.a, .s { display: block; }\n${extra}`);
  assert.deepEqual(find(run(links(), linkCSS('')), 'E_A11Y_FRAGMENT').map(d => d.message.includes('no element')), [true]);
  assert.equal(find(run(links('main'), linkCSS('')), 'E_A11Y_FRAGMENT').length, 0);
  const hidden = find(run(links('main'), linkCSS('@media (width < 600px) { .s { display: none; } }')), 'E_A11Y_FRAGMENT');
  assert.deepEqual(hidden.map(d => d.range.maxExact), ['600']);
  const body = main => ({tag: 'body', classes: ['page'], lang: 'en', children: [{tag: main ? 'main' : 'div', classes: ['m']}]});
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  assert.equal(warn(run(body(true), '.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 20px; }'), 'W_A11Y_NO_MAIN').length, 0);
  assert.equal(warn(run(body(false), '.page { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 20px; }'), 'W_A11Y_NO_MAIN').length, 1);
});

test('generated boxes: an empty absolute ::after overlay covers what it paints over; generated text is Unknown', () => {
  const tree = {tag: 'main', classes: ['page'], children: [{tag: 'div', classes: ['card'], children: [{tag: 'div', classes: ['x']}]}, {tag: 'button', classes: ['b'], named: true}]};
  const css = extra => `.page { display: grid; grid-template-columns: 200px; grid-auto-rows: 40px; position: relative; background: #fff; }\n.card { display: grid; grid-template-columns: minmax(0, 1fr); }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${extra}`;
  assert.equal(find(run(tree, css('')), 'E_A11Y_OCCLUDED').length, 0);
  const over = run(tree, css('.card::after { content: ""; position: absolute; left: 0; top: 0; inline-size: 200px; block-size: 80px; }'));
  assert.deepEqual(find(over, 'E_A11Y_OCCLUDED').map(d => [d.box, d.cover]), [['.b', 'Page/0/1']]);
  // Out of the way (above the button), or not hit-testable: nothing.
  assert.equal(find(run(tree, css('.card::after { content: ""; position: absolute; left: 0; top: 0; inline-size: 200px; block-size: 40px; }')), 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(find(run(tree, css('.card::after { content: ""; position: absolute; left: 0; top: 0; inline-size: 200px; block-size: 80px; pointer-events: none; }')), 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(run(tree, css('.card::before { content: "→"; }')).status, 'unknown');
  // A pseudo-element of a list item is not a list item.
  const list = {tag: 'main', classes: ['page'], children: [{tag: 'ul', classes: ['l'], children: [{tag: 'li', classes: ['i'], children: [{tag: 'span', classes: ['t']}]}]}]};
  const listCSS = css('.l { display: grid; grid-template-columns: minmax(0, 1fr); padding: 0; } .i { display: grid; grid-template-columns: minmax(0, 1fr); position: relative; } .t { display: block; block-size: 20px; } .i::before { content: ""; position: absolute; left: 0; top: 0; inline-size: 6px; block-size: 6px; background: #000; }');
  assert.equal(find(run(list, listCSS), 'E_A11Y_LIST').length, 0);
});

test('generated text names a control; icon-font glyphs do not', () => {
  const tree = page([{tag: 'button', classes: ['b']}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; inline-size: 30px; block-size: 30px; }\n${extra}`);
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  assert.deepEqual(find(run(tree, css('')), 'E_A11Y_NAME').map(d => d.box), ['.b']);
  const saved = run(tree, css('.b::before { content: "Save"; }'));
  assert.equal(saved.status, 'verified', JSON.stringify(saved.diagnostics));
  assert.deepEqual(warn(saved, 'W_A11Y_GENERATED_NAME').map(d => d.box), ['.b']);
  assert.deepEqual(find(run(tree, css('.b::before { content: "\\e900"; }')), 'E_A11Y_ICON_NAME').map(d => d.box), ['.b']);
  // A leaf without px sizes: generated text may change its size.
  assert.equal(run(tree, css('.b { inline-size: auto; }\n.b::before { content: "Save"; }')).status, 'unknown');
});

test('z-index stacking contexts decide what covers a target', () => {
  const tree = {tag: 'main', classes: ['page'], children: [{tag: 'button', classes: ['b'], named: true}, {tag: 'div', classes: ['c']}]};
  const css = extra => `.page { display: grid; grid-template-columns: 200px; grid-auto-rows: 40px; position: relative; background: #fff; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.c { position: absolute; left: 0; top: 0; inline-size: 100px; block-size: 40px; background: #eee; }\n${extra}`;
  assert.equal(find(run(tree, css('')), 'E_A11Y_OCCLUDED').length, 1);
  assert.equal(find(run(tree, css('.b { position: relative; z-index: 1; }')), 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(find(run(tree, css('.c { z-index: -1; }')), 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(find(run(tree, css('.c { z-index: 1; }\n.b { position: relative; z-index: 1; }')), 'E_A11Y_OCCLUDED').length, 1);
  assert.equal(run(tree, css('.c { z-index: "x"; }')).status, 'unknown');
});

test('px translate and scale move a box and its descendants; other transforms are Unknown', () => {
  const tree = {tag: 'main', classes: ['page'], children: [{tag: 'div', classes: ['w'], children: [{tag: 'button', classes: ['b'], named: true}]}, {tag: 'div', classes: ['c']}]};
  const css = extra => `.page { display: grid; grid-template-columns: 200px; grid-auto-rows: 40px; position: relative; background: #fff; }\n.w { display: grid; grid-template-columns: minmax(0, 1fr); }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.c { position: absolute; left: 0; top: 0; inline-size: 100px; block-size: 40px; background: #eee; }\n${extra}`;
  assert.equal(find(run(tree, css('')), 'E_A11Y_OCCLUDED').length, 1);
  const moved = run(tree, css('.w { transform: translate(0, 50px); }'));
  assert.equal(find(moved, 'E_A11Y_OCCLUDED').length, 0);
  assert.equal(moved.sizes.find(r => r.box === '.b' && r.rect).rect.blockStart.constant, '50');
  // em: the element's px font-size; a UA (unknown) font-size stays Unknown.
  assert.equal(run(tree, css('.w { font-size: 10px; transform: translate(2em, 0); }')).sizes.find(r => r.box === '.b' && r.rect).rect.inlineStart.constant, '20');
  // rem: the html root's px font-size (a component root has none).
  const doc = {tag: 'html', classes: ['root'], lang: 'en', documentRoot: true, children: [{tag: 'body', classes: ['body'], children: [tree]}]};
  const docCSS = '.root { font-size: 8px; display: grid; grid-template-columns: minmax(0, 1fr); } .body { display: grid; grid-template-columns: minmax(0, 1fr); }\n' + css('.w { transform: translate(3rem, 0); }');
  assert.equal(run(doc, docCSS).sizes.find(r => r.box === '.b' && r.rect).rect.inlineStart.constant, '24');
  for (const t of ['rotate(3deg)', 'rotate(45deg)', 'skewX(5deg)', 'translate(1em, 0)', 'translate(1rem, 0)']) assert.equal(run(tree, css(`.w { transform: ${t}; }`)).status, 'unknown', t);
  // Percentages are of the box's own size: -50% of the 200 × 40 wrapper.
  const pct = run(tree, css('.w { transform: translate(-50%, 25%); }')).sizes.find(r => r.box === '.b' && r.rect).rect;
  assert.deepEqual([pct.inlineStart.constant, pct.blockStart.constant], ['-100', '10']);
  // A scaled box scales its descendants: the button doubles about the wrapper's centre.
  assert.equal(run(tree, css('.w { transform: scale(2); }')).sizes.find(r => r.box === '.b' && r.rect).rect.inlineSize.constant, '400');
  // A scale on a leaf shrinks its painted box about the centre: a half-size cover misses the button's ends.
  const half = run(tree, css('.b { transform: scale(.5); }'));
  assert.deepEqual(['inlineStart', 'inlineSize', 'blockStart', 'blockSize'].map(k => half.sizes.find(r => r.box === '.b' && r.rect).rect[k].constant), ['50', '100', '10', '20']);
});

test('focus-clipped: overflow clip hides a focusable box for good; hidden scrolls it into view', () => {
  const tree = page([{tag: 'div', classes: ['c'], children: [{tag: 'div', classes: ['s']}, {tag: 'button', classes: ['b'], named: true}]}]);
  const css = ov => pageCSS(`.page { background: #fff; grid-auto-rows: 40px; }\n.c { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 60px 20px; overflow: ${ov}; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }`);
  assert.deepEqual(find(run(tree, css('clip'), {boxes: {'.c': {overflowBlock: 'clip'}}}), 'E_A11Y_FOCUS_CLIPPED').map(d => d.box), ['.b']);
  assert.equal(find(run(tree, css('hidden'), {boxes: {'.c': {overflowBlock: 'clip'}}}), 'E_A11Y_FOCUS_CLIPPED').length, 0);
});

test('the hidden and inert attributes', () => {
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.b { appearance: none; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${extra}`);
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  // hidden: UA display none, so an unnamed button there needs no name; an author display brings it back (and warns).
  const hidden = run(page([{tag: 'button', classes: ['b'], hiddenAttr: true}]), css(''));
  assert.equal(find(hidden, 'E_A11Y_NAME').length, 0);
  assert.equal(warn(hidden, 'W_A11Y_HIDDEN_OVERRIDDEN').length, 0);
  const shown = run(page([{tag: 'button', classes: ['b'], hiddenAttr: true}]), css('.b { display: block; }'));
  assert.deepEqual(find(shown, 'E_A11Y_NAME').map(d => d.box), ['.b']);
  assert.deepEqual(warn(shown, 'W_A11Y_HIDDEN_OVERRIDDEN').map(d => d.box), ['.b']);
  assert.equal(run(page([{tag: 'button', classes: ['b'], hiddenAttr: 'until-found'}]), css('')).status, 'unknown');
  // inert: no focus, no exposure — an unnamed button inside is not a finding.
  const inert = page([{tag: 'div', classes: ['w'], inert: true, children: [{tag: 'button', classes: ['b']}]}]);
  assert.equal(find(run(inert, css('.w { display: grid; grid-template-columns: minmax(0, 1fr); }')), 'E_A11Y_NAME').length, 0);
});

test('a closed popover renders nothing unless author CSS overrides it', () => {
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n${extra}`);
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const tree = page([{tag: 'div', classes: ['p'], popover: true, children: [{tag: 'button', classes: ['b']}]}]);
  const closed = run(tree, css('.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }'));
  assert.equal(closed.status, 'verified', JSON.stringify(closed.diagnostics));
  const shown = run(tree, css('.p { display: grid; grid-template-columns: minmax(0, 1fr); }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }'));
  // Shown while closed it keeps the UA position: fixed (a centred box over the page): not modeled.
  assert.deepEqual(shown.diagnostics.map(d => d.code), ['U_LAYOUT_POPOVER']);
});

test('style attributes are element-attached declarations', () => {
  const tree = {tag: 'main', classes: ['page'], children: [{tag: 'div', classes: ['a'], inlineStyle: 'block-size: 30px'}, {tag: 'div', classes: ['b'], inlineStyle: 'block-size: 10px !important'}]};
  const css = '@layer base { .a { block-size: 80px !important; } }\n.page { display: grid; grid-template-columns: minmax(0, 1fr); }\n.a { block-size: 60px; }\n.b { block-size: 40px !important; }';
  const report = analyzeLayout(tree, {name: 'Page', css: reset + css, viewport: domain});
  const size = cls => report.sizes.find(r => r.box === `.${cls}`).blockSize.constant;
  // A layered !important beats the attribute's normal value; the attribute's !important beats an unlayered one.
  assert.deepEqual([size('a'), size('b')], ['80', '10']);
  assert.equal(analyzeLayout({...tree, children: [{tag: 'div', classes: ['a'], inlineStyle: 'dynamic'}]}, {name: 'Page', css: reset + css, viewport: domain}).status, 'unknown');
});

test('rtl mirrors placement; absolute boxes keep physical insets; dir=auto follows the first strong character', () => {
  const tree = extra => ({tag: 'main', classes: ['page'], dirAttr: 'rtl', children: [{tag: 'div', classes: ['a'], ...extra}, {tag: 'div', classes: ['b']}]});
  const css = '.page { display: grid; grid-template-columns: 100px 50px; grid-auto-rows: 20px; position: relative; }';
  const report = analyzeLayout(tree({}), {name: 'Page', css: reset + css, viewport: {min: 320, max: 1280, height: {min: 400, max: 900}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  const at = cls => report.sizes.find(r => r.box === `.${cls}` && r.rect).rect.inlineStart;
  // The first column sits at the right edge of the page.
  assert.deepEqual([at('a').coefficient, at('a').constant, at('b').coefficient, at('b').constant], ['1', '-100', '1', '-150']);
  const status = (t, c) => analyzeLayout(t, {name: 'Page', css: reset + css + c, viewport: {min: 320, max: 1280, height: {min: 400, max: 900}}}).status;
  // An rtl scroll container: its box and content width do not depend on the scrollbar side; inner positions are withheld.
  assert.notEqual(status(tree({}), '\n.page { overflow-y: scroll; scrollbar-width: none; }'), 'unknown');
  // An absolute child of the rtl container keeps its physical inset (left: 0).
  const abs = analyzeLayout(tree({}), {name: 'Page', css: reset + css + '\n.b { position: absolute; left: 0; top: 0; inline-size: 10px; block-size: 10px; }', viewport: {min: 320, max: 1280, height: {min: 400, max: 900}}});
  assert.equal(abs.status, 'verified', JSON.stringify(abs.diagnostics));
  assert.deepEqual([abs.sizes.find(r => r.box === '.b' && r.rect).rect.inlineStart.coefficient, abs.sizes.find(r => r.box === '.b' && r.rect).rect.inlineStart.constant], ['0', '0']);
  // dir=auto: the first strong character decides (Hebrew → rtl; digits are neutral; no strong character → ltr).
  const auto = text => analyzeLayout({tag: 'main', classes: ['page'], dirAttr: 'auto', children: [{tag: 'p', classes: ['a'], text: true, textContent: text}, {tag: 'div', classes: ['b']}]}, {name: 'Page', css: reset + css, viewport: {min: 320, max: 1280, height: {min: 400, max: 900}}, boxes: {'.a': {minInlineSize: 1, intrinsicBlockSize: 20}}}).sizes.find(r => r.box === '.a' && r.rect).rect.inlineStart.constant;
  assert.deepEqual([auto('שלום world'), auto('123 hello'), auto('123 !')], ['-100', '0', '0']);
  // Own strong text and strong text in children: their order is not kept, so Unknown.
  assert.equal(status({tag: 'main', classes: ['page'], dirAttr: 'auto', text: true, textContent: 'abc', children: [{tag: 'div', classes: ['a'], text: true, textContent: 'שלום'}, {tag: 'div', classes: ['b']}]}, ''), 'unknown');
});

test('a table cell with text runs between block children stacks anonymous blocks', () => {
  const cell = {tag: 'td', classes: ['c'], text: true, runs: ['Total', 0, 'due today'], children: [{tag: 'div', classes: ['k']}]};
  const tree = {tag: 'table', classes: ['t'], children: [{tag: 'tbody', classes: ['b'], children: [{tag: 'tr', classes: ['r'], children: [cell, {tag: 'td', classes: ['d']}]}]}]};
  const css = '.t { table-layout: fixed; inline-size: 300px; border-spacing: 0; background: #fff; color: #000; }\ntd { padding: 0; vertical-align: top; }\n.k { block-size: 30px; }';
  const view = {min: 320, max: 1280, height: {min: 400, max: 900}};
  const report = run(tree, css, {viewport: view, boxes: {'.c': {textRuns: [{minInlineSize: 40, intrinsicBlockSize: 20}, {minInlineSize: 70, intrinsicBlockSize: 20}]}}});
  assert.equal(report.status, 'verified', JSON.stringify(report.diagnostics));
  assert.deepEqual(report.sizes.filter(r => r.rect && r.path.startsWith('Page/0/0/0/')).map(r => [r.box, r.rect.blockStart.constant]), [['.c::text(0)', '0'], ['.k', '20'], ['.c::text(1)', '50']]);
  // One textRuns entry per run; selectors never match an anonymous block.
  assert.equal(run(tree, css, {viewport: view, boxes: {'.c': {textRuns: [{minInlineSize: 40, intrinsicBlockSize: 20}]}}}).status, 'unknown');
});

test('generated text in a grid is an item sized by a selector::before contract', () => {
  const tree = {tag: 'main', classes: ['g'], children: [{tag: 'div', classes: ['a']}]};
  const css = '.g { display: grid; grid-template-columns: minmax(0, 1fr) 50px; background: #fff; color: #000; }\n.g::before { content: "New"; }\n.a { block-size: 30px; }';
  const view = {min: 320, max: 1280, height: {min: 400, max: 900}};
  const sized = run(tree, css, {viewport: view, boxes: {'.g::before': {minInlineSize: 30, intrinsicBlockSize: 20}}});
  assert.equal(sized.status, 'verified', JSON.stringify(sized.diagnostics));
  assert.deepEqual([sized.sizes.find(r => r.box === '.a').rect.inlineStart.coefficient, sized.sizes.find(r => r.box === '.a').rect.inlineStart.constant], ['1', '-50']);
  // Without a contract the generated text has no size: Unknown.
  assert.equal(run(tree, css, {viewport: view}).status, 'unknown');
});

test('state-mismatch: aria-expanded and aria-selected agree with what renders', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const tree = expanded => page([{tag: 'button', classes: ['b'], named: true, aria: {'aria-expanded': expanded, 'aria-controls': 'menu'}}, {tag: 'div', classes: ['m'], id: 'menu'}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${extra}`);
  assert.equal(warn(run(tree('true'), css('')), 'W_A11Y_STATE_MISMATCH').length, 0);
  assert.equal(warn(run(tree('false'), css('.m { display: none; }')), 'W_A11Y_STATE_MISMATCH').length, 0);
  assert.deepEqual(warn(run(tree('false'), css('')), 'W_A11Y_STATE_MISMATCH').map(d => d.box), ['.b']);
  // Expanded, but the menu is hidden below 600px: only there.
  assert.deepEqual(warn(run(tree('true'), css('@media (width < 600px) { .m { display: none; } }')), 'W_A11Y_STATE_MISMATCH').map(d => d.range.maxExact), ['600']);
});

test('focus-transparent: a focused control at opacity 0 shows no indicator of its own', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const tree = page([{tag: 'input', classes: ['c'], inputType: 'checkbox', named: true, focusable: true}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.c { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; box-sizing: border-box; inline-size: 30px; block-size: 30px; }\n${extra}`);
  assert.equal(warn(run(tree, css('')), 'W_A11Y_FOCUS_TRANSPARENT').length, 0);
  assert.deepEqual(warn(run(tree, css('.c { opacity: 0; }')), 'W_A11Y_FOCUS_TRANSPARENT').map(d => d.box), ['.c']);
  assert.equal(warn(run(tree, css('.c { opacity: 0; }\n.c:focus { opacity: 1; }')), 'W_A11Y_FOCUS_TRANSPARENT').length, 0);
});

test('error-message: an invalid field points at a message that renders', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const tree = aria => page([{tag: 'input', classes: ['f'], inputType: 'text', named: true, focusable: true, aria}, {tag: 'p', classes: ['e'], id: 'err', text: true, textContent: 'Enter an email'}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.f { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; box-sizing: border-box; inline-size: 200px; block-size: 30px; }\n${extra}`);
  const b = {'.e': text};
  assert.equal(warn(run(tree({'aria-invalid': 'true', 'aria-errormessage': 'err'}), css(''), {boxes: b}), 'W_A11Y_ERROR_HIDDEN').length, 0);
  assert.deepEqual(warn(run(tree({'aria-invalid': 'true', 'aria-errormessage': 'err'}), css('.e { display: none; }'), {boxes: b}), 'W_A11Y_ERROR_HIDDEN').map(d => d.box), ['.f']);
  assert.deepEqual(warn(run(tree({'aria-invalid': 'true'}), css(''), {boxes: b}), 'W_A11Y_INVALID_NO_MESSAGE').map(d => d.box), ['.f']);
});

test('modal-background: focus escapes an aria-modal dialog unless the background is inert', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const btn = cls => ({tag: 'button', classes: [cls], named: true});
  const tree = inert => page([{tag: 'div', classes: ['bg'], ...(inert ? {inert: true} : {}), children: [btn('o')]}, {tag: 'div', classes: ['d'], role: 'dialog', named: true, aria: {'aria-modal': 'true'}, children: [btn('i')]}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.bg, .d { display: grid; grid-template-columns: minmax(0, 1fr); }\n.o, .i { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${extra}`);
  assert.deepEqual(warn(run(tree(false), css('')), 'W_A11Y_MODAL_BACKGROUND').map(d => d.box), ['.o']);
  assert.equal(warn(run(tree(true), css('')), 'W_A11Y_MODAL_BACKGROUND').length, 0);
  // A closed (not rendered) dialog leaves the page alone.
  assert.equal(warn(run(tree(false), css('.d { display: none; }')), 'W_A11Y_MODAL_BACKGROUND').length, 0);
});

test('new-window and form-submit', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.a, .f { display: grid; grid-template-columns: minmax(0, 1fr); }\n.i, .s { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; box-sizing: border-box; inline-size: 100px; block-size: 30px; }\n${extra}`);
  const link = label => page([{tag: 'a', classes: ['a'], focusable: true, href: '/x', target: '_blank', named: true, ariaLabel: label}]);
  assert.deepEqual(warn(run(link('Docs'), css('')), 'W_A11Y_NEW_WINDOW').map(d => d.box), ['.a']);
  assert.equal(warn(run(link('Docs (opens in a new tab)'), css('')), 'W_A11Y_NEW_WINDOW').length, 0);
  const form = button => page([{tag: 'form', classes: ['f'], children: [{tag: 'input', classes: ['i'], inputType: 'text', named: true, focusable: true}, ...(button ? [{tag: 'button', classes: ['s'], named: true, buttonType: button}] : [])]}]);
  assert.deepEqual(warn(run(form(null), css('')), 'W_A11Y_FORM_SUBMIT').map(d => d.box), ['.f']);
  assert.equal(warn(run(form('submit'), css('')), 'W_A11Y_FORM_SUBMIT').length, 0);
  assert.equal(warn(run(form('button'), css('')), 'W_A11Y_FORM_SUBMIT').length, 1);
});

test('native-aria-conflict: ARIA states that contradict the native ones', () => {
  const warn = (report, code) => report.accessibility.warnings.filter(d => d.code === code);
  const css = pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.i { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; box-sizing: border-box; inline-size: 30px; block-size: 30px; }`);
  const input = (extra) => page([{tag: 'input', classes: ['i'], inputType: 'checkbox', named: true, focusable: true, ...extra}]);
  assert.equal(warn(run(input({nativeStates: {checked: true}, aria: {'aria-checked': 'false'}}), css), 'W_A11Y_NATIVE_ARIA_CONFLICT').length, 1);
  assert.equal(warn(run(input({aria: {'aria-checked': 'true'}}), css), 'W_A11Y_NATIVE_ARIA_CONFLICT').length, 1);
  assert.equal(warn(run(input({nativeStates: {required: true}, aria: {'aria-required': 'false'}}), css), 'W_A11Y_NATIVE_ARIA_CONFLICT').length, 1);
  // aria-required="true" without the native attribute adds the state: allowed.
  assert.equal(warn(run(input({aria: {'aria-required': 'true'}}), css), 'W_A11Y_NATIVE_ARIA_CONFLICT').length, 0);
});

test('focus-semantics: a focusable element with no interactive role', () => {
  const warn = report => report.accessibility.warnings.filter(d => d.code === 'W_A11Y_FOCUS_SEMANTICS');
  const css = pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.d { inline-size: 30px; block-size: 30px; }`);
  const div = extra => page([{tag: 'div', classes: ['d'], tabIndex: 0, focusable: true, ...extra}]);
  assert.equal(warn(run(div({}), css)).length, 1);
  assert.equal(warn(run(div({role: 'button', named: true}), css)).length, 0);
  assert.equal(warn(run(div({tabIndex: -1, focusable: false}), css)).length, 0);
  assert.equal(warn(run(div({role: 'region', named: true}), css)).length, 0);
});

test('profile core drops heuristic and legacy rules; every row carries its tier', () => {
  const tree = page([{tag: 'div', classes: ['d'], tabIndex: 0, focusable: true}, {tag: 'marquee', classes: ['m']}, {tag: 'button', classes: ['b']}]);
  const css = pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.d { inline-size: 30px; block-size: 30px; }\n.m { display: block; inline-size: 30px; block-size: 30px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; inline-size: 30px; block-size: 30px; }`);
  const all = run(tree, css), core = run(tree, css, {accessibility: {profile: 'core'}});
  const rules = report => [...report.diagnostics, ...report.accessibility.warnings].map(d => d.rule).filter(Boolean);
  assert.ok(rules(all).includes('blink'));
  assert.ok(!rules(core).includes('blink'));
  assert.ok(rules(core).includes('accessible-name') && rules(core).includes('focus-semantics'));
  assert.equal(all.diagnostics.find(d => d.rule === 'accessible-name').tier, 'core');
  assert.equal(all.accessibility.warnings.find(d => d.rule === 'focus-semantics').tier, 'dom');
  assert.equal(core.accessibility.profile, 'core');
  assert.ok(!core.accessibility.rules.includes('visual-order'));
});

test('focus-offscreen: a focusable box parked before the viewport start edge', () => {
  const tree = page([{tag: 'a', classes: ['skip'], href: '#main', focusable: true, named: true}, {tag: 'div', classes: ['d']}]);
  const css = left => pageCSS(`.page { position: relative; background: #fff; grid-auto-rows: 30px; }\n.skip { position: absolute; left: ${left}; top: 0; inline-size: 100px; block-size: 30px; display: block; }`);
  assert.deepEqual(find(run(tree, css('-9999px')), 'E_A11Y_FOCUS_OFFSCREEN').map(d => d.box), ['.skip']);
  assert.equal(find(run(tree, css('-50px')), 'E_A11Y_FOCUS_OFFSCREEN').length, 0);
  assert.equal(find(run(tree, css('-100px')), 'E_A11Y_FOCUS_OFFSCREEN').length, 1);
  // A host inset moves the root: -100px is still on screen when the component starts 120px in.
  assert.equal(find(run(tree, css('-100px'), {hostInset: 120}), 'E_A11Y_FOCUS_OFFSCREEN').length, 0);
});

test('position: fixed is laid out against the viewport for the accessibility checks only', () => {
  const tree = page([{tag: 'div', classes: ['h']}, {tag: 'div', classes: ['d']}]);
  const css = pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.h { position: fixed; top: 0; left: 0; inline-size: 100%; block-size: 60px; background: #333; }`);
  assert.notEqual(run(tree, css).status, 'unknown');
  assert.equal(analyzeLayout(tree, {name: 'Page', css: reset + css, viewport: domain}).status, 'unknown');
});

test('focus-scrolled-under: a focusable box that can sit entirely behind a fixed bar without being scrolled out', () => {
  const tree = page([{tag: 'div', classes: ['h']}, {tag: 'div', classes: ['gap']}, {tag: 'button', classes: ['b'], named: true}, {tag: 'div', classes: ['tall']}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.h { position: fixed; top: 0; left: 0; inline-size: 100%; block-size: 60px; background: #333; }\n.gap { block-size: 1000px; }\n.tall { block-size: 2000px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; block-size: 40px; }\n${extra}`);
  const hits = extra => find(run(tree, css(extra)), 'E_A11Y_FOCUS_SCROLLED_UNDER').map(d => d.box);
  assert.deepEqual(hits(''), ['.b']);
  // scroll-margin-top grows the box Chromium keeps inside the scrollport: 60px reveals it, 30px leaves part showing.
  assert.deepEqual(hits('.b { scroll-margin-top: 60px; }'), []);
  assert.deepEqual(hits('.b { scroll-margin-top: 30px; }'), []);
  // Taller than the bar: never entirely behind it. A bar without a background hides nothing.
  assert.deepEqual(hits('.b { block-size: 80px; }'), []);
  assert.deepEqual(hits('.h { background: transparent; }'), []);
  // The viewport's scroll-padding lives on html, outside this root: Unknown.
  assert.equal(run(tree, css('html { scroll-padding-top: 60px; }')).diagnostics.filter(d => d.code === 'U_A11Y_SCROLL_PADDING').length, 1);
});

test('focus-offscreen: a :focus rule that moves the skip link back by its insets', () => {
  const tree = page([{tag: 'a', classes: ['skip'], href: '#main', focusable: true, named: true}, {tag: 'div', classes: ['d']}]);
  const css = focus => pageCSS(`.page { position: relative; background: #fff; grid-auto-rows: 30px; }\n.skip { position: absolute; left: -9999px; top: 0; inline-size: 100px; block-size: 30px; display: block; }\n${focus}`);
  assert.equal(find(run(tree, css('.skip:focus { left: 0; }')), 'E_A11Y_FOCUS_OFFSCREEN').length, 0);
  assert.equal(find(run(tree, css('.skip:focus { left: -5000px; }')), 'E_A11Y_FOCUS_OFFSCREEN').length, 1);
  // :hover moving it is not the focused place; a moving :focus rule keeps layout proofs Unknown.
  assert.equal(run(tree, css('.skip:hover { left: 0; }')).status, 'unknown');
  assert.equal(analyzeLayout(tree, {name: 'Page', css: reset + css('.skip:focus { left: 0; }'), viewport: domain}).status, 'unknown');
  // Moving a box that is not absolutely positioned is not modeled.
  assert.equal(run(page([{tag: 'button', classes: ['b'], named: true}]), pageCSS(`.page { background: #fff; grid-auto-rows: 30px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n.b:focus { left: 10px; }`)).status, 'unknown');
});

test('the focus rules judge a skip link where its :focus rule moves it', () => {
  const tree = page([{tag: 'a', classes: ['skip'], href: '#main', focusable: true, named: true}, {tag: 'div', classes: ['cover']}]);
  const css = focus => pageCSS(`.page { position: relative; background: #fff; grid-auto-rows: 30px; }\n.skip { position: absolute; left: -9999px; top: 0; inline-size: 100px; block-size: 30px; display: block; }\n.cover { position: absolute; left: 0; top: 0; inline-size: 200px; block-size: 30px; background: #333; }\n${focus}`);
  // Focused at left 0 it lands under the later painted cover: obscured there; parked off screen it is not obscured.
  assert.deepEqual(find(run(tree, css('.skip:focus { left: 0; }')), 'E_A11Y_FOCUS_OBSCURED').map(d => d.box), ['.skip']);
  assert.equal(find(run(tree, css('.skip:focus { left: 0; }')), 'E_A11Y_FOCUS_OFFSCREEN').length, 0);
  assert.equal(find(run(tree, css('')), 'E_A11Y_FOCUS_OBSCURED').length, 0);
  // A cover without paint hides nothing; restacked above the cover once focused, it is not obscured either.
  assert.equal(find(run(tree, css('.skip:focus { left: 0; }\n.cover { background: transparent; }')), 'E_A11Y_FOCUS_OBSCURED').length, 0);
  assert.equal(find(run(tree, css('.skip:focus { left: 0; z-index: 1; }')), 'E_A11Y_FOCUS_OBSCURED').length, 0);
  assert.equal(find(run(tree, css('.skip:focus { left: 0; z-index: -1; }')), 'E_A11Y_FOCUS_OBSCURED').length, 1);
});

test('fixed-hides-content: a fixed footer covering the end of the page at every scroll position', () => {
  const tree = page([{tag: 'div', classes: ['gap']}, {tag: 'button', classes: ['b'], named: true}, {tag: 'footer', classes: ['f']}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.f { position: fixed; bottom: 0; left: 0; inline-size: 100%; block-size: 60px; background: #333; }\n.gap { block-size: 2000px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; block-size: 40px; }\n${extra}`);
  const hits = extra => find(run(tree, css(extra)), 'E_A11Y_FIXED_HIDES').map(d => d.box);
  assert.deepEqual(hits(''), ['.b']);
  // Padding the page by the bar lets the last content scroll out; a short page keeps it above the bar.
  assert.deepEqual(hits('.page { padding-bottom: 60px; }'), []);
  assert.deepEqual(hits('.gap { block-size: 100px; }'), []);
  // A bar off the bottom edge does not hide what scrolls past it.
  assert.deepEqual(hits('.f { bottom: 100px; }'), []);
});

test('visual-presentation (AAA): wrapping text that is justified or spaced below 1.5', () => {
  const tree = page([{tag: 'p', classes: ['t'], text: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: auto; }\n.t { font-size: 16px; line-height: 20px; }\n${extra}`);
  const codes = (extra, height, options = {accessibility: {contrast: 'AAA'}}) => run(tree, css(extra), {...options, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: height}}}).accessibility.warnings.filter(d => d.rule === 'visual-presentation').map(d => d.code).sort();
  // Two lines at 20px / 16px (1.25): too tight; one line: no block of text to space.
  assert.deepEqual(codes('', 40), ['W_A11Y_LINE_SPACING']);
  assert.deepEqual(codes('', 20), []);
  assert.deepEqual(codes('.t { line-height: 1.5; }', 48), []);
  assert.deepEqual(codes('.t { line-height: 1.5; text-align: justify; }', 48), ['W_A11Y_JUSTIFIED']);
  // AA asks nothing of SC 1.4.8.
  assert.deepEqual(codes('', 40, {}), []);
});

test('focus-contrast: an author focus outline needs 3:1 against its backdrop', () => {
  const codes = css => fbtn(css).diagnostics.filter(d => d.rule === 'focus-contrast').map(d => d.code);
  assert.deepEqual(codes('.b:focus { outline: 2px solid #1a73e8; }'), []);
  assert.deepEqual(codes('.b:focus { outline: 2px solid #ddd; }'), ['E_A11Y_FOCUS_CONTRAST']);
  // currentcolor: the focused text color (#000 on #fff).
  assert.deepEqual(codes('.b:focus { outline: 2px solid; }'), []);
  // A second indicator (a background change) carries focus: the outline alone is not judged.
  assert.deepEqual(codes('.b:focus { outline: 2px solid #ddd; background: #ffd; }'), []);
  // A negative offset draws over the button's own background.
  assert.deepEqual(codes('.b { background: #ddd; }\n.b:focus { outline: 2px solid #ddd; outline-offset: -4px; }'), ['E_A11Y_FOCUS_CONTRAST']);
  assert.deepEqual(codes('.b { background: #333; }\n.b:focus { outline: 2px solid #ddd; outline-offset: -4px; }'), []);
});

test('field-boundary: a text field needs a 3:1 fill or border against its backdrop', () => {
  const tree = extra => page([{tag: 'input', classes: ['i'], inputType: 'text', named: true, focusable: true, ...extra}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.i { appearance: none; display: block; padding: 0; min-width: 0; min-height: 0; inline-size: 200px; block-size: 30px; border: 0; background: transparent; }\n${extra}`);
  const codes = (extra, box = {}) => run(tree(box), css(extra)).diagnostics.filter(d => d.rule === 'field-boundary').map(d => d.code);
  assert.deepEqual(codes(''), ['E_A11Y_FIELD_BOUNDARY']);
  assert.deepEqual(codes('.i { border: 1px solid #ddd; }'), ['E_A11Y_FIELD_BOUNDARY']);
  assert.deepEqual(codes('.i { border: 1px solid #767676; }'), []);
  // One strong side is enough (an underline field); a dark fill is a boundary of its own.
  assert.deepEqual(codes('.i { border: 1px solid #ddd; border-bottom-color: #000; }'), []);
  assert.deepEqual(codes('.i { background: #333; color: #fff; }'), []);
  // Disabled fields are exempt (SC 1.4.11 inactive components).
  assert.deepEqual(codes('', {nativeStates: {disabled: true}}), []);
});

test('field-boundary: a custom checkbox (appearance: none) needs a visible box', () => {
  const tree = page([{tag: 'input', classes: ['c'], inputType: 'checkbox', named: true, focusable: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.c { appearance: none; display: block; padding: 0; min-width: 0; min-height: 0; inline-size: 24px; block-size: 24px; border: 0; background: transparent; }\n${extra}`);
  const codes = extra => run(tree, css(extra)).diagnostics.filter(d => d.rule === 'field-boundary').map(d => d.code);
  assert.deepEqual(codes(''), ['E_A11Y_FIELD_BOUNDARY']);
  assert.deepEqual(codes('.c { border: 2px solid #000; }'), []);
});

test('placeholder-contrast: placeholder text needs the text contrast over the field', () => {
  const tree = page([{tag: 'input', classes: ['i'], inputType: 'text', named: true, focusable: true, placeholder: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.i { appearance: none; display: block; padding: 0; min-width: 0; min-height: 0; inline-size: 200px; block-size: 30px; border: 1px solid #000; background: #fff; font-size: 16px; }\n${extra}`);
  const codes = extra => run(tree, css(extra)).diagnostics.filter(d => d.rule === 'placeholder-contrast').map(d => d.code);
  assert.deepEqual(codes(''), []); // Chromium's UA #757575 on white: 4.6:1
  assert.deepEqual(codes('.i::placeholder { color: #ccc; }'), ['E_A11Y_PLACEHOLDER_CONTRAST']);
  assert.deepEqual(codes('.i::placeholder { color: #000; opacity: 0.3; }'), ['E_A11Y_PLACEHOLDER_CONTRAST']);
  assert.deepEqual(codes('.i { background: #eee; }'), ['E_A11Y_PLACEHOLDER_CONTRAST']); // #757575 on #eee: 4.0:1
});

test('checked-indicator: a custom checkbox must look different when checked', () => {
  const tree = page([{tag: 'input', classes: ['c'], inputType: 'checkbox', named: true, focusable: true}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.c { appearance: none; display: block; padding: 0; min-width: 0; min-height: 0; inline-size: 24px; block-size: 24px; border: 2px solid #000; background: #fff; }\n${extra}`);
  const codes = extra => run(tree, css(extra)).diagnostics.filter(d => d.rule === 'checked-indicator').map(d => d.code);
  assert.deepEqual(codes(''), ['E_A11Y_CHECKED_INDICATOR']);
  assert.deepEqual(codes('.c:checked { background: #000; }'), []);
  assert.deepEqual(codes('.c:checked { background: #eee; }'), ['E_A11Y_CHECKED_INDICATOR']);
  assert.deepEqual(codes('.c:checked { box-shadow: inset 0 0 0 4px #000; }'), []);
  // :checked rules only repaint; a :checked rule that moves layout stays Unknown.
  assert.equal(run(tree, css('.c:checked { padding: 2px; }')).status, 'unknown');
});

test('checked-indicator: a :checked::before check mark is an indicator', () => {
  const tree = page([{tag: 'div', classes: ['w'], children: [{tag: 'input', classes: ['c'], inputType: 'checkbox', named: true, focusable: true}]}]);
  const css = extra => pageCSS(`.page { background: #fff; color: #000; grid-auto-rows: 30px; }\n.w { display: grid; grid-template-columns: 24px; position: relative; }\n.c { appearance: none; display: block; padding: 0; min-width: 0; min-height: 0; inline-size: 24px; block-size: 24px; border: 2px solid #000; background: #fff; position: relative; }\n${extra}`);
  const codes = extra => run(tree, css(extra)).diagnostics.filter(d => d.rule === 'checked-indicator').map(d => d.code);
  assert.deepEqual(codes('.c:checked::before { content: ""; position: absolute; left: 4px; top: 4px; inline-size: 12px; block-size: 12px; background: #000; }'), []);
  assert.deepEqual(codes('.c:checked::before { content: ""; display: block; inline-size: 12px; block-size: 12px; background: #000; }'), ['U_A11Y_CHECKED_INDICATOR']);
  assert.deepEqual(codes(''), ['E_A11Y_CHECKED_INDICATOR']);
});

test('focus-clipped-away: a visually hidden focusable box that :focus does not reveal', () => {
  const tree = page([{tag: 'a', classes: ['s'], href: '#main', focusable: true, named: true}, {tag: 'div', classes: ['d']}]);
  const css = extra => pageCSS(`.page { position: relative; background: #fff; color: #000; grid-auto-rows: 30px; }\n.s { position: absolute; left: 0; top: 0; inline-size: 1px; block-size: 1px; overflow: hidden; display: block; clip: rect(0 0 0 0); }\n${extra}`);
  const codes = extra => run(tree, css(extra)).diagnostics.filter(d => d.rule === 'focus-clipped-away').map(d => d.code);
  assert.deepEqual(codes(''), ['E_A11Y_FOCUS_CLIPPED_AWAY']);
  assert.deepEqual(codes('.s:focus { clip: auto; }'), []);
  assert.deepEqual(codes('.s { clip: auto; clip-path: inset(50%); }'), ['E_A11Y_FOCUS_CLIPPED_AWAY']);
  // A partial clip is not modeled.
  assert.equal(run(tree, css('.s { clip: rect(0 10px 10px 0); }')).status, 'unknown');
});

test('orientation: a quarter-turn rotation of the main content in one orientation locks it', () => {
  const tree = {tag: 'div', classes: ['page'], children: [{tag: 'main', classes: ['m']}]};
  const css = extra => pageCSS(`.m { display: block; block-size: 100px; }\n${extra}`);
  const rotated = extra => find(run(tree, css(extra)), 'E_A11Y_ORIENTATION').map(d => d.rotated);
  assert.deepEqual(rotated('@media (orientation: portrait) { .m { transform: rotate(90deg); } }'), ['portrait']);
  assert.deepEqual(rotated('@media (orientation: portrait) { .page { transform: rotate(-90deg); } }'), ['portrait']);
  // Turned in both orientations (or a half turn) is a design, not a lock.
  assert.deepEqual(rotated('.m { transform: rotate(90deg); }'), []);
  assert.deepEqual(rotated('@media (orientation: portrait) { .m { transform: rotate(180deg); } }'), []);
});

test('target-size: a ::after that enlarges the hit area counts as the target', () => {
  const a = c => ({tag: 'a', classes: [c], href: '/x', focusable: true, named: true});
  const tree = page([{tag: 'div', classes: ['row'], children: [a('b1'), a('b2')]}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 40px; }\n.row { display: grid; grid-template-columns: 16px 16px; column-gap: 4px; grid-template-rows: 16px; padding: 12px; }\n.b1, .b2 { display: grid; position: relative; }\n${extra}`);
  const report = extra => run(tree, css(extra));
  assert.deepEqual(find(report(''), 'E_A11Y_TARGET_SIZE').map(d => d.box).sort(), ['.b1', '.b2']);
  // .b1 grows to 24×24 around itself (left/top -4px): no longer undersized; .b2's circle still meets the grown .b1.
  const grown = report('.b1::after { content: ""; position: absolute; left: -4px; top: -4px; inline-size: 24px; block-size: 24px; }');
  assert.notEqual(grown.status, 'unknown');
  assert.deepEqual(find(grown, 'E_A11Y_TARGET_SIZE').map(d => d.box), ['.b2']);
});

test('an absolute ::after of a button (a block leaf) is laid out and enlarges its hit area', () => {
  const tree = page([{tag: 'div', classes: ['row'], children: [{tag: 'button', classes: ['b1'], named: true}, {tag: 'button', classes: ['b2'], named: true}]}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: 40px; }\n.row { display: grid; grid-template-columns: 16px 16px; column-gap: 4px; grid-template-rows: 16px; padding: 12px; }\n.b1, .b2 { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; position: relative; }\n${extra}`);
  assert.deepEqual(find(run(tree, css('')), 'E_A11Y_TARGET_SIZE').map(d => d.box).sort(), ['.b1', '.b2']);
  const grown = run(tree, css('.b1::after { content: ""; position: absolute; left: -4px; top: -4px; inline-size: 24px; block-size: 24px; }'));
  assert.notEqual(grown.status, 'unknown');
  assert.deepEqual(find(grown, 'E_A11Y_TARGET_SIZE').map(d => d.box), ['.b2']);
  // Without a positioned ancestor inside the analyzed root the containing block is not owned: Unknown.
  assert.equal(run(tree, css('.b1, .b2 { position: static; }\n.b1::after { content: ""; position: absolute; left: 0; top: 0; inline-size: 24px; block-size: 24px; }')).status, 'unknown');
});

test('target-size: a later target over part of an enlarged hit area leaves its size undecided', () => {
  const tree = page([{tag: 'div', classes: ['row'], children: [{tag: 'button', classes: ['b1'], named: true}, {tag: 'button', classes: ['b2'], named: true}]}]);
  const css = gap => pageCSS(`.page { background: #fff; grid-auto-rows: 40px; }\n.row { display: grid; grid-template-columns: 16px 16px; column-gap: ${gap}; grid-template-rows: 16px; padding: 12px; }\n.b1, .b2 { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; position: relative; }\n.b1::after, .b2::after { content: ""; position: absolute; left: -4px; top: -4px; inline-size: 24px; block-size: 24px; }`);
  // 4px apart: .b2's area covers the right of .b1's (Chromium gives it to .b2).
  const close = run(tree, css('4px'));
  assert.deepEqual(close.diagnostics.filter(d => d.code === 'U_A11Y_TARGET_SIZE').map(d => d.box), ['.b1']);
  assert.equal(run(tree, css('8px')).status !== 'unknown', true);
});

test('focus-scrolled-under: a sticky top: 0 header covers focus while its parent is in view', () => {
  const tree = sectioned => page([{tag: 'section', classes: ['s'], children: [{tag: 'header', classes: ['h']}, {tag: 'div', classes: ['gap']}, ...(sectioned ? [] : [{tag: 'button', classes: ['b'], named: true}])]}, ...(sectioned ? [{tag: 'button', classes: ['b'], named: true}] : []), {tag: 'div', classes: ['tall']}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.s { display: grid; grid-template-columns: minmax(0, 1fr); }\n.h { position: sticky; top: 0; block-size: 60px; background: #333; }\n.gap { block-size: 1000px; }\n.tall { block-size: 2000px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; block-size: 40px; }\n${extra}`);
  const hits = (sectioned, extra = '') => find(run(tree(sectioned), css(extra)), 'E_A11Y_FOCUS_SCROLLED_UNDER').map(d => d.box);
  assert.deepEqual(hits(false), ['.b']);
  assert.deepEqual(hits(false, '.b { scroll-margin-top: 60px; }'), []);
  // After its section ends the header scrolls away with it: a button below the section is never under it.
  assert.deepEqual(hits(true), []);
  // Other sticky offsets, and sticky without the accessibility checks, stay Unknown.
  assert.equal(run(tree(false), css('.h { top: 10px; }')).status, 'unknown');
  assert.equal(analyzeLayout(tree(false), {name: 'Page', css: reset + css(''), viewport: domain}).status, 'unknown');
});

test('fixed-hides-content: a fixed header and footer that meet cover everything in short viewports', () => {
  const tree = page([{tag: 'div', classes: ['h']}, {tag: 'div', classes: ['gap']}, {tag: 'button', classes: ['b'], named: true}, {tag: 'div', classes: ['gap']}, {tag: 'div', classes: ['f']}]);
  const css = pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.h, .f { position: fixed; left: 0; inline-size: 100%; block-size: 200px; background: #333; }\n.h { top: 0; }\n.f { bottom: 0; }\n.gap { block-size: 800px; }\n.b { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; block-size: 40px; }`);
  const hits = find(run(tree, css), 'E_A11Y_FIXED_HIDES');
  assert.deepEqual(hits.map(d => d.box), ['.b']);
  // Only viewports up to 400px tall (200 + 200): the domain here is 400–900.
  assert.equal(hits[0].heightRange.max, 400);
});

test('fragment-under-bar: an #id jump that lands the target behind a fixed or sticky header', () => {
  const tree = page([{tag: 'div', classes: ['h']}, {tag: 'a', classes: ['l'], href: '#s', focusable: true, named: true}, {tag: 'div', classes: ['gap']}, {tag: 'h2', classes: ['t'], id: 's', named: true}, {tag: 'div', classes: ['tall']}]);
  const css = (position, extra = '') => pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.h { position: ${position}; top: 0; ${position === 'fixed' ? 'left: 0; ' : ''}inline-size: 100%; block-size: 60px; background: #333; }\n.l { display: block; block-size: 30px; }\n.gap { block-size: 1000px; }\n.t { display: block; block-size: 40px; }\n.tall { block-size: 2000px; }\n${extra}`);
  const hits = (position, extra) => run(tree, css(position, extra)).accessibility.warnings.filter(d => d.code === 'W_A11Y_FRAGMENT_UNDER_BAR').map(d => d.box);
  assert.deepEqual(hits('fixed'), ['.l']);
  assert.deepEqual(hits('sticky'), ['.l']);
  assert.deepEqual(hits('fixed', '.t { scroll-margin-top: 60px; }'), []);
  assert.deepEqual(hits('sticky', '.t { scroll-margin-top: 70px; }'), []);
});

test('fixed-hides-content: a full-height fixed sidebar at the left edge covers what lies under it', () => {
  // The row sits mid-page (1000px above, 2000px below): neither the scroll-0 nor the bottom-of-page check reaches it.
  const tree = page([{tag: 'nav', classes: ['side']}, {tag: 'div', classes: ['gap']}, {tag: 'div', classes: ['row'], children: [{tag: 'button', classes: ['b1'], named: true}, {tag: 'button', classes: ['b2'], named: true}]}, {tag: 'div', classes: ['tall']}]);
  const css = extra => pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.gap { block-size: 1000px; }\n.tall { block-size: 2000px; }\n.side { position: fixed; left: 0; top: 0; inline-size: 200px; block-size: 100%; background: #333; }\n.row { display: grid; grid-template-columns: 100px 100px; column-gap: 150px; grid-template-rows: 40px; }\n.b1, .b2 { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; }\n${extra}`);
  assert.deepEqual([...new Set(find(run(tree, css('')), 'E_A11Y_FIXED_HIDES').map(d => d.box))], ['.b1']);
  assert.deepEqual(find(run(tree, css('.row { padding-left: 200px; }')), 'E_A11Y_FIXED_HIDES'), []);
  // A sidebar that stops short of the viewport's height (scroll can move content past its end) is not judged so.
  assert.deepEqual(find(run(tree, css('.side { top: 100px; block-size: 200px; }')), 'E_A11Y_FIXED_HIDES'), []);
});

test('flash: a large box that flashes more than three times a second', () => {
  const tree = page([{tag: 'div', classes: ['f']}]);
  const css = (anim, size = '200px') => pageCSS(`.page { background: #fff; grid-auto-rows: auto; }\n.f { inline-size: ${size}; block-size: ${size}; background: #000; animation: ${anim}; }\n@keyframes blink { 0% { background-color: #000; } 50% { background-color: #fff; } 100% { background-color: #000; } }\n@keyframes soft { 0% { background-color: #777; } 100% { background-color: #888; } }`);
  const codes = (...args) => run(tree, css(...args)).diagnostics.filter(d => d.rule === 'flash').map(d => d.code);
  assert.deepEqual(codes('blink 0.2s infinite'), ['E_A11Y_FLASH']); // 5 a second
  assert.deepEqual(codes('blink 1s infinite'), []); // 1 a second
  assert.deepEqual(codes('blink 0.2s infinite', '100px'), []); // below the small-flash area
  assert.deepEqual(codes('soft 0.1s infinite alternate'), []); // too small a luminance change
  assert.deepEqual(codes('blink 0.2s 2'), []); // two flashes in all
});
