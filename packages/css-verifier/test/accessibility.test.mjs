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
  assert.deepEqual(report.accessibility.rules, ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable', 'empty-heading', 'heading-order', 'nested-interactive', 'duplicate-id', 'aria-reference', 'positive-tabindex', 'multiple-main', 'scrollable-region-focusable', 'reflow', 'focus-obscured', 'focus-area']);
});

// accessible-name: a link (or button) needs text that renders, or a name attribute.
const toolbar = (link, label = {}) => ({tag: 'main', classes: ['bar'], children: [{tag: 'a', classes: ['b'], focusable: true, ...link, children: [{tag: 'span', classes: ['label'], text: true, ...label}]}]});
const barCSS = extra => `.bar { display: grid; grid-template-columns: 120px; grid-template-rows: 40px; }\n.b { display: grid; grid-template-columns: minmax(0, 1fr); }\n${extra}`;
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

test('text-contrast: translucent layers composite over the canvas, media queries split the domain', () => {
  // rgba(0,0,0,.5) over white is #808080 (3.95:1 against white text? no: black text) — here white text over it.
  const half = run(card, cardCSS('.card { background: rgba(0, 0, 0, 0.5); color: white; }'), {boxes: cardBoxes});
  assert.equal(find(half, 'E_A11Y_CONTRAST').length, 1);
  const dark = run(card, cardCSS('.card { background: #fff; color: #000; }\n@media (width >= 800px) { .card { color: #ccc; } }'), {boxes: cardBoxes});
  const [finding] = find(dark, 'E_A11Y_CONTRAST');
  assert.equal(finding.range.minExact, '800');
});

test('text-contrast: images, opacity and unknown colors make the result unknown, not verified', () => {
  for (const extra of ['.card { background-image: linear-gradient(#000, #fff); color: #000; }', '.card { background: #fff; color: #000; opacity: 0.5; }', '.card { background: #fff; color: color-mix(in srgb, red, blue); }']) {
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
