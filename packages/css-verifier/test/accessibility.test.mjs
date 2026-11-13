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
  assert.deepEqual(report.accessibility.rules, ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable', 'empty-heading', 'heading-order', 'nested-interactive', 'duplicate-id', 'aria-reference', 'positive-tabindex', 'multiple-main', 'scrollable-region-focusable', 'reflow', 'focus-obscured', 'focus-area', 'pointer-disabled', 'small-text', 'target-size', 'image-alt', 'form-label', 'label-for', 'list-structure', 'radio-group', 'landmark-name', 'role-valid', 'interactive-role-focusable', 'link-in-text-block', 'table-headers', 'td-headers', 'fieldset-name']);
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
  const tree = {tag: 'div', classes: ['root'], children: [{tag: 'main', classes: ['m1']}, {tag: 'main', classes: ['m2']}, {tag: 'div', classes: ['t'], tabIndex: 3}]};
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
