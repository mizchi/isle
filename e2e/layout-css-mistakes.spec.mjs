// Checklist F: CSS the browser accepts but that does nothing. Each warning holds exactly where the browser shows no
// effect of the declaration.
import {test, expect} from '@playwright/test';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';
import {analyzeStates} from '../packages/adapter-core/src/index.mjs';

const base = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px;color:rgb(0, 0, 0)}';
const warns = (css, code) => (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === code);
const load = async (page, css) => page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="a"></div></body></html>`);

test('F1, F2: an animation that never runs', async ({page}) => {
  for (const [css, code] of [['.a{animation:spin 1s infinite}', 'W_CSS_KEYFRAMES_MISSING'], ['.a{animation:spn 1s infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_KEYFRAMES_MISSING'], ['.a{animation:spin 1s infinite}@keyframes spin{to{opacity:.5}}', null],
    ['.a{animation:spin infinite}@keyframes spin{to{opacity:.5}}', 'W_CSS_ANIMATION_NO_DURATION'], ['.a{animation:spin 0s forwards}@keyframes spin{to{opacity:.5}}', null]]) {
    await load(page, css);
    // Running for some time: a missing @keyframes gives no animation; a 0s one never shows a frame between its ends.
    const running = await page.evaluate(() => document.getAnimations().some(a => a.effect.getComputedTiming().duration > 0));
    for (const c of ['W_CSS_KEYFRAMES_MISSING', 'W_CSS_ANIMATION_NO_DURATION']) expect(warns(css, c), `${css} ${c}`).toBe(c === code);
    if (code) expect(running, css).toBe(false);
    else if (!css.includes('0s')) expect(running, css).toBe(true);
  }
});

test('F3: a var() with no value and no fallback leaves the property unset', async ({page}) => {
  for (const [css, invalid] of [['.a{color:var(--brand)}', true], ['.a{color:var(--brand, rgb(255, 0, 0))}', false], [':root{--brand:rgb(255, 0, 0)}.a{color:var(--brand)}', false]]) {
    await load(page, `body{color:rgb(0, 0, 255)}${css}`);
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color);
    expect(warns(`body{color:rgb(0, 0, 255)}${css}`, 'W_CSS_VAR_INVALID'), css).toBe(invalid);
    // Unset: color inherits from body.
    expect(color === 'rgb(0, 0, 255)', `${css}: ${color}`).toBe(invalid);
  }
});

test('F4: a max size below the min size fixes the box at the min', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [css, fixed] of [['.a{min-width:50px;max-width:10px;justify-self:start}', true], ['.a{min-width:10px;max-width:50px;justify-self:start}', false]]) {
    expect(warns(css + '.a{width:30px}', 'W_LAYOUT_MIN_ABOVE_MAX'), css).toBe(fixed);
    // Whatever the width, the box is the min wide where min is above max.
    const widths = [];
    for (const width of [5, 30, 80]) { await load(page, `${css}.a{width:${width}px}`); widths.push(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().width)); }
    expect(widths.every(w => w === 50), `${css}: ${widths}`).toBe(fixed);
  }
});

test('F5: a media query that no viewport matches', async ({page}) => {
  for (const [query, never] of [['(min-width:900px) and (max-width:600px)', true], ['(width > 600px) and (width < 600px)', true], ['(min-width:600px) and (max-width:900px)', false], ['(min-height:800px) and (max-height:400px)', true]]) {
    const css = `@media ${query}{.a{color:rgb(255, 0, 0)}}`;
    expect(warns(css, 'W_CSS_MEDIA_NEVER'), query).toBe(never);
    let matched = false;
    for (const [w, h] of [[320, 300], [600, 400], [750, 600], [900, 800], [1200, 900]]) { await page.setViewportSize({width: w, height: h}); matched ||= await page.evaluate(q => matchMedia(q).matches, query); }
    expect(matched, query).toBe(!never);
  }
});

test('F6: a property declared twice in one rule: the browser uses the one the warning keeps', async ({page}) => {
  for (const [css, kept] of [['.a{color:rgb(255, 0, 0);color:rgb(0, 0, 255)}', 'rgb(0, 0, 255)'], ['.a{color:rgb(255, 0, 0) !important;color:rgb(0, 0, 255)}', 'rgb(255, 0, 0)'], ['.a{color:rgb(0, 128, 0);color:rgb(0, 128, 0)}', 'rgb(0, 128, 0)']]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color), css).toBe(kept);
    const w = (analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).find(x => x.code === 'W_CSS_DUPLICATE_DECLARATION');
    expect(w, css).toBeTruthy();
    // The message names the declaration that wins as the browser's value.
    expect(w.message.includes(`(${kept}`) || w.message.includes(`${kept} twice`), `${css}: ${w.message}`).toBe(true);
  }
});

test('F7: z-index stacks a box only where it is positioned or a flex or grid item', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  // .a has z-index 5 and comes first; .b overlaps it (moved up 20px) and comes after. Painting order puts .b on top
  // unless .a's z-index applies.
  const html = '<div class="p"><div class="a"></div><div class="b"></div></div>';
  for (const [css, inert] of [['.p{display:block}', true], ['.p{display:block}.a{position:relative}', false], ['.p{display:flex;flex-direction:column}.a,.b{flex:none}', false], ['.p{display:grid;grid-template-columns:minmax(0,1fr)}', false]]) {
    const full = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a,.b{height:40px;background:#888}.a{z-index:5;background:#f00}.b{position:relative;top:-20px}${css}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>${full}</style></head><body>${html}</body></html>`);
    const top = await page.evaluate(() => document.elementFromPoint(10, 30)?.className);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: full, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('z-index'));
    expect(warned, css).toBe(inert);
    expect(top, css).toBe(inert ? 'b' : 'a');
  }
});

test('F8: a transition between auto (or none) and a length jumps', async ({page}) => {
  for (const [css, jumps] of [['.a{width:100px;height:auto;transition:height 1s linear}.a:hover{height:100px}', true], ['.a{width:100px;height:20px;transition:height 1s linear}.a:hover{height:100px}', false], ['.a{width:100px;max-height:none;transition:max-height 1s linear}.a:hover{max-height:10px}', true]]) {
    expect(warns(css, 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    // The hovered state, applied after a first frame: a transition runs, or the box is at its end value at once.
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css.replace(':hover', '.on')}</style></head><body><div class="a">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const running = await page.evaluate(() => { document.querySelector('.a').classList.add('on'); return document.getAnimations().length > 0; });
    expect(running, css).toBe(!jumps);
  }
});

test('F9, F10: a pseudo-element without content, and content on an element', async ({page}) => {
  for (const [css, generated] of [['.a::before{display:block;width:10px;height:10px}', false], ['.a::before{content:"";display:block;height:10px}', true]]) {
    await load(page, css);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a'), '::before').content !== 'none'), css).toBe(generated);
    expect(warns(css, 'W_CSS_PSEUDO_NO_CONTENT'), css).toBe(!generated);
  }
  await load(page, '.a{content:"hi"}');
  expect(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect().height)).toBe(20);
  expect((analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + '.a{content:"hi"}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('content'))).toBe(true);
});

test('F8 between component states: a class toggle that changes a size between auto and a length jumps', async ({page}) => {
  const viewport = {min: 400, max: 400, height: {min: 600, max: 600}};
  for (const [css, jumps] of [['*{margin:0}.panel{width:100px;transition:height 1s linear}.panel.open{height:120px}', true], ['*{margin:0}.panel{width:100px;height:0;transition:height 1s linear}.panel.open{height:120px}', false]]) {
    const states = [{html: '<div class="panel"></div>', choices: {open: false}}, {html: '<div class="panel open"></div>', choices: {open: true}}];
    expect(analyzeStates({states, css}, {viewport}).findings.some(f => f.code === 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="panel">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.panel').classList.add('open'); return document.getAnimations().length > 0; }), css).toBe(!jumps);
  }
});

test('F12: a transition with no duration changes at once', async ({page}) => {
  for (const [css, instant] of [['.a{transition:opacity}.a.on{opacity:.2}', true], ['.a{transition:opacity 1s}.a.on{opacity:.2}', false]]) {
    expect(warns(css.replace('.a.on', '.a:hover'), 'W_CSS_TRANSITION_NO_DURATION'), css).toBe(instant);
    await load(page, css);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.a').classList.add('on'); return document.getAnimations().length > 0; }), css).toBe(!instant);
  }
});

test('F13: an over-constrained absolute box ignores its end inset', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const html = '<div class="p"><div class="a"></div></div>';
  const rect = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.p{position:relative;height:100px}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => JSON.stringify(document.querySelector('.a').getBoundingClientRect())); };
  for (const [css, ignored] of [['.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'right'], ['.p{direction:rtl}.a{position:absolute;top:0;left:10px;right:10px;width:50px;height:10px}', 'left'], ['.a{position:absolute;top:5px;bottom:5px;left:0;width:10px;height:30px}', 'bottom'], ['.a{position:absolute;top:0;left:10px;right:10px;height:10px}', null]]) {
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{position:relative;height:100px}${css}`, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    const warned = (r.layoutWarnings ?? []).filter(w => w.code === 'W_LAYOUT_DECLARATION_INERT').flatMap(w => w.properties).find(p => ['left', 'right', 'bottom', 'top'].includes(p)) ?? null;
    expect(warned, css).toBe(ignored);
    if (ignored) expect(await rect(css.replace(/\.a\{/, `.a{${ignored}:auto!important;`)), css).toBe(await rect(css));
  }
});

test('F14: a border width with no border style draws no border', async ({page}) => {
  for (const [css, none] of [['.a{border-width:4px}', true], ['.a{border-width:0 4px}', true], ['.a{border-width:4px;border-style:solid}', false]]) {
    await load(page, `.a{box-sizing:content-box;width:50px}${css}`);
    const b = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.a')); return {top: s.borderTopWidth, right: s.borderRightWidth, width: document.querySelector('.a').getBoundingClientRect().width}; });
    expect(warns(`.a{box-sizing:content-box;width:50px}${css}`, 'W_CSS_BORDER_NO_STYLE'), css).toBe(none);
    expect(b.width === 50 && b.right === '0px', `${css}: ${JSON.stringify(b)}`).toBe(none);
  }
});

test('F15, F16: background-size with no image and text-decoration-color with no line paint nothing different', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>${base}.a{background-color:rgb(200, 220, 240)}${css}</style></head><body><div class="a">text</div></body></html>`); return (await page.screenshot()).toString('base64'); };
  for (const [css, prop, inert] of [['.a{background-size:10px 10px;background-position:5px 5px}', 'background-size', true], ['.a{text-decoration-color:red;text-decoration-thickness:4px}', 'text-decoration-color', true], ['.a{text-decoration:underline;text-decoration-color:red;text-decoration-thickness:4px}', 'text-decoration-color', false]]) {
    expect((analyzeHTML('<html lang="en"><body><div class="a"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(prop)), css).toBe(inert);
    // The same pixels as without the declarations where they do nothing.
    const without = css.replace(/background-size:[^;}]*;?|background-position:[^;}]*;?|text-decoration-color:[^;}]*;?|text-decoration-thickness:[^;}]*;?/g, '');
    expect((await shot(css)) === (await shot(without)), css).toBe(inert);
  }
});

test('F17, F18: state rules that never apply: focus on an element that cannot take it, hover with pointer-events: none', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [html, css, never] of [['<div class="a">x</div>', '.a:focus{color:rgb(255, 0, 0)}', true], ['<div class="a" tabindex="0">x</div>', '.a:focus{color:rgb(255, 0, 0)}', false], ['<a class="a">x</a>', '.a:focus{color:rgb(255, 0, 0)}', true], ['<a class="a" href="#x">x</a>', '.a:focus{color:rgb(255, 0, 0)}', false]]) {
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE'), html).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body>${html}</body></html>`);
    // Every way to focus it: a click, Tab, and focus().
    await page.click('.a').catch(() => {}); await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => { const a = document.querySelector('.a'); a.focus(); return document.activeElement === a && getComputedStyle(a).color === 'rgb(255, 0, 0)'; });
    expect(focused, html).toBe(!never);
  }
  for (const [css, never] of [['.a{pointer-events:none}.a:hover{color:rgb(255, 0, 0)}', true], ['.a:hover{color:rgb(255, 0, 0)}', false]]) {
    expect(warns(css, 'W_CSS_STATE_UNREACHABLE'), css).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body><div class="a"></div></body></html>`);
    await page.mouse.move(10, 10);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.a')).color === 'rgb(255, 0, 0)'), css).toBe(!never);
  }
});

test('F19: :checked only on checkable elements, ::placeholder only where a placeholder shows', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  for (const [html, never] of [['<div class="a" role="checkbox" tabindex="0">x</div>', true], ['<input class="a" type="checkbox" aria-label="x">', false]]) {
    const css = '.a:checked{outline:3px solid rgb(255, 0, 0)}';
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE'), html).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${base}${css}</style></head><body>${html}</body></html>`);
    await page.click('.a');
    expect(await page.evaluate(() => document.querySelector('.a').matches(':checked')), html).toBe(!never);
  }
  for (const [html, never] of [['<input class="a" type="text" aria-label="x">', true], ['<input class="a" type="text" placeholder="Name" aria-label="x">', false]]) {
    const css = '.a::placeholder{color:rgb(255, 0, 0)}';
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE'), html).toBe(never);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const shot = (await page.locator('.a').screenshot()).toString('base64');
    await page.setContent(`<!doctype html><html lang="en"><head><style></style></head><body>${html}</body></html>`);
    expect(shot === (await page.locator('.a').screenshot()).toString('base64'), html).toBe(never);
  }
});

test('F20: a visited link takes only the colors of a :visited rule', async ({page}) => {
  await page.setViewportSize({width: 400, height: 300});
  const css = 'a{font:16px/20px sans-serif;color:rgb(0, 0, 255)}a:visited{color:rgb(255, 0, 0);font-weight:900;letter-spacing:10px}';
  expect((analyzeHTML('<html lang="en"><body><a class="a" href="#visited-target">Docs</a></body></html>', {name: 'P', css: base + css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}, boxes: {'.a': {minInlineSize: 0, intrinsicBlockSize: 20}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_VISITED_IGNORED').map(w => w.property).sort()).toEqual(['font-weight', 'letter-spacing']);
  // A real history entry: serve two pages, visit the target, then load the page whose link points there.
  const page2 = (body, style = '') => `<!doctype html><html lang="en"><head><style>${style}</style></head><body>${body}</body></html>`;
  await page.route('http://visited.test/**', route => route.fulfill({contentType: 'text/html', body: route.request().url().endsWith('/target') ? page2('target') : page2('<a class="a" href="http://visited.test/target">Docs</a> <a class="b" href="http://visited.test/never">Docs</a>', css)}));
  await page.goto('http://visited.test/target');
  await page.goto('http://visited.test/page'); await page.waitForTimeout(300);
  const box = sel => page.evaluate(s => document.querySelector(s).getBoundingClientRect().width, sel);
  const shot = async sel => (await page.locator(sel).screenshot()).toString('base64');
  // .a is visited, .b is not: the same width (weight and spacing ignored), different pixels (the color applies).
  expect(await box('.a')).toBe(await box('.b'));
  expect((await shot('.a')) !== (await shot('.b'))).toBe(true);
});

test(':disabled and :enabled match as in the browser (own attribute, disabled fieldset, its first legend)', async ({page}) => {
  const {htmlBoxTree} = await import('../packages/css-verifier/src/html.mjs');
  const {normalizeTree} = await import('../packages/css-verifier/src/tree.mjs');
  const {compileSelector, matches} = await import('../packages/css-verifier/src/layout/selectors.mjs');
  const html = '<form><input class="c1" disabled aria-label="a"><fieldset disabled><legend><input class="c2" aria-label="b"><button class="c3" type="button">x</button></legend><input class="c4" aria-label="c"><select class="c5" aria-label="s"><option class="c6">o</option></select></fieldset><button class="c7" type="button">y</button><fieldset><input class="c8" aria-label="d" disabled></fieldset><select class="c9" aria-label="t"><optgroup class="c10" disabled label="g"><option class="c11">p</option></optgroup></select></form>';
  const {root} = normalizeTree(htmlBoxTree(`<html lang="en"><body>${html}</body></html>`).tree, 'P');
  const all = []; (function walk(b) { all.push(b); for (const c of [...(b.children ?? []), ...(b.inline ?? [])]) walk(c); })(root);
  await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
  for (let i = 1; i <= 11; i++) {
    const box = all.find(b => b.classes?.includes(`c${i}`));
    for (const pseudo of [':disabled', ':enabled']) {
      const browser = await page.evaluate(([cls, p]) => document.querySelector(`.${cls}`).matches(p), [`c${i}`, pseudo]);
      // Where browsers differ (an option in a disabled select) the box tree says dynamic: the analysis stays Unknown.
      if (box.disabled === 'dynamic') continue;
      expect(matches(compileSelector(`.c${i}${pseudo}`), box), `c${i}${pseudo}`).toBe(browser);
    }
  }
});

test('F22: ::marker ignores all but its own properties, and has no effect off list items', async ({page}) => {
  await page.setViewportSize({width: 300, height: 120});
  const html = '<ul class="l"><li class="i">item</li></ul><div class="d">div</div>';
  const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}body{font:16px/20px sans-serif}.l{padding-left:40px}${css}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
  const plain = await shot('');
  const analysis = css => analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.l{display:block;padding-left:40px}.i,.d{height:20px}${css}`, viewport: {min: 300, max: 300, height: {min: 120, max: 120}}, boxes: {'.i': {minInlineSize: 0, intrinsicBlockSize: 20}, '.d': {minInlineSize: 0, intrinsicBlockSize: 20}}}).layoutWarnings ?? [];
  const ignored = '.i::marker{margin-left:60px;padding:10px;background:rgb(255, 0, 0);width:80px}';
  expect(analysis(ignored).filter(w => w.code === 'W_CSS_MARKER_IGNORED').length).toBe(4);
  expect(await shot(ignored)).toBe(plain);
  const offList = '.d::marker{color:rgb(255, 0, 0);font-size:40px}';
  expect(analysis('.d::marker{color:rgb(255, 0, 0)}').some(w => w.code === 'W_CSS_STATE_UNREACHABLE')).toBe(true);
  expect(await shot(offList)).toBe(plain);
  // And color does apply on the list item (the check is not vacuous).
  expect(await shot('.i::marker{color:rgb(255, 0, 0)}')).not.toBe(plain);
});

test('F8 in plain HTML: a class toggle named by the stylesheet jumps between auto and a length', async ({page}) => {
  for (const [css, jumps] of [['.panel{width:100px;transition:height 1s linear}.panel.open{height:120px}', true], ['.panel{width:100px;height:0;transition:height 1s linear}.panel.open{height:120px}', false]]) {
    expect((analyzeHTML('<html lang="en"><body><div class="panel"></div></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_TRANSITION_AUTO'), css).toBe(jumps);
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body><div class="panel">x</div></body></html>`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => { document.querySelector('.panel').classList.add('open'); return document.getAnimations().length > 0; }), css).toBe(!jumps);
  }
});

test('F23, G1: user-select: none on a text field; a summary without its disclosure triangle', async ({page}) => {
  await page.setContent('<!doctype html><html lang="en"><head><style>input{user-select:none;-webkit-user-select:none}</style></head><body><input aria-label="x" value="hello world"></body></html>');
  await page.click('input', {clickCount: 3});
  expect(await page.evaluate(() => { const i = document.querySelector('input'); return i.selectionEnd - i.selectionStart; })).toBe(11);
  await page.setViewportSize({width: 200, height: 60});
  const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}body{font:16px/20px sans-serif}${css}</style></head><body><details><summary class="s">More</summary>x</details></body></html>`); return (await page.screenshot()).toString('base64'); };
  const triangle = await shot(''), none = await shot('.s{list-style:none}');
  // display: block draws what list-style: none draws (no triangle); with a ::before the indicator is back.
  expect(triangle).not.toBe(none);
  expect(await shot('.s{display:block}')).toBe(none);
  for (const [css, warned] of [['.s{display:block}', true], ['.s{display:block}.s::before{content:"+ "}', false]]) expect((analyzeHTML('<html lang="en"><body><details><summary class="s">More</summary><p>x</p></details></body></html>', {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_A11Y_SUMMARY_INDICATOR'), css).toBe(warned);
});

test('F24, F25: table-layout: fixed without a width, border-spacing with collapsed borders', async ({page}) => {
  const html = '<table class="t"><tbody><tr><td class="c1">aaaaaaaaaaaaaaaaaaaa</td><td class="c2">b</td></tr></tbody></table>';
  const cells = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}body{font:16px/20px monospace}td{border:1px solid}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => JSON.stringify(['.t', '.c1', '.c2'].map(s => document.querySelector(s).getBoundingClientRect()))); };
  for (const [css, prop, inert, without] of [['.t{table-layout:fixed}', 'table-layout', true, ''], ['.t{table-layout:fixed;width:300px}', 'table-layout', false, '.t{width:300px}'], ['.t{border-collapse:collapse;border-spacing:20px}', 'border-spacing', true, '.t{border-collapse:collapse}'], ['.t{border-spacing:20px}', 'border-spacing', false, '']]) {
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: base + css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(prop)), css).toBe(inert);
    expect((await cells(css)) === (await cells(without)), css).toBe(inert);
  }
});

test('F26: a child combinator through the tbody the parser inserts never matches', async ({page}) => {
  for (const [html, sel, never] of [['<table class="t"><tr class="r"><td>x</td></tr></table>', '.t > .r', true], ['<table class="t"><tr class="r"><td>x</td></tr></table>', '.t .r', false], ['<table class="t"><tbody><tr class="r"><td>x</td></tr></tbody></table>', '.t > tbody > .r', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    expect(await page.evaluate(s => document.querySelector(s) !== null, sel), sel).toBe(!never);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `${sel}{color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_SELECTOR_IMPLIED_PARENT'), sel).toBe(never);
  }
});

test('F27: the browser restructures exactly where the parser warning says', async ({page}) => {
  for (const [html, probe, restructured] of [['<p class="p">text<div class="d">x</div></p>', '.p .d', true], ['<a class="a" href="#x">a<a class="b" href="#y">b</a></a>', '.a .b', true], ['<p class="p">text<span class="d">x</span></p>', '.p .d', false], ['<ul class="p"><li class="d">a<li>b</ul>', '.p .d', false], ['<table class="p"><div class="d">x</div><tr><td>a</td></tr></table>', '.p .d', true], ['<form class="p" action="/a"><form class="d" action="/b"><input aria-label="x"></form></form>', '.p .d, .d', true], ['<table class="p"><tr><td><div class="d">x</div></td></tr></table>', '.p .d', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    expect(await page.evaluate(s => document.querySelector(s) === null, probe), html).toBe(restructured);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '*{margin:0}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_HTML_RESTRUCTURED'), html).toBe(restructured);
  }
});

test('F28: presentational attributes on elements they do not map to change nothing', async ({page}) => {
  await page.setViewportSize({width: 400, height: 200});
  const shot = async html => { await page.setContent(`<!doctype html><html lang="en"><head><style>*{margin:0}.a{height:20px}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64') + JSON.stringify(await page.evaluate(() => document.querySelector('.a').getBoundingClientRect())); };
  const plain = await shot('<div class="a">x</div>');
  expect(await shot('<div class="a" width="100" height="50" bgcolor="red" border="2">x</div>')).toBe(plain);
  expect(await shot('<span class="a" width="100" bgcolor="red">x</span>')).toBe(await shot('<span class="a">x</span>'));
  // Where they map, they do something (the check is not vacuous).
  expect(await shot('<table class="a" width="300" bgcolor="red"><tr><td>x</td></tr></table>')).not.toBe(await shot('<table class="a"><tr><td>x</td></tr></table>'));
});

test('F29: :empty does not match an element holding whitespace', async ({page}) => {
  for (const [html, missed] of [['<div class="x"> </div>', true], ['<div class="x">\n  </div>', true], ['<div class="x"></div>', false], ['<div class="x"><!-- c --></div>', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.x{height:20px}.x:empty{display:none}</style></head><body>${html}</body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.x')).display === 'none'), html).toBe(!missed);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '.x{height:20px}.x:empty{display:none}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_EMPTY_WHITESPACE'), html).toBe(missed);
  }
});

test('F30: display: contents on a replaced element or form control removes it', async ({page}) => {
  const cases = [['<input class="x" aria-label="q">', true], ['<img class="x" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="20" height="20">', true], ['<textarea class="x" aria-label="q">t</textarea>', true], ['<select class="x" aria-label="q"><option>abc</option></select>', true], ['<button class="x" type="button">abc</button>', false]];
  for (const [html, removed] of cases) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>.x{display:contents}</style></head><body><div id="w" style="display:inline-block">${html}</div></body></html>`);
    const r = await page.evaluate(() => document.getElementById('w').getBoundingClientRect());
    expect(r.width === 0 && r.height === 0, html).toBe(removed);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '.x{display:contents}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_CONTENTS_REMOVED'), html).toBe(removed);
  }
});

test('F31: overflow: auto or scroll on a table does not scroll it', async ({page}) => {
  const table = '<table class="t" style="width:100px"><tbody><tr><td style="padding:0"><div style="width:300px;height:10px"></div></td></tr></tbody></table>';
  for (const [css, html, inert] of [['.t{overflow:auto}', table, true], ['.t{overflow-x:scroll}', table, true], ['.w{overflow-x:auto;width:100px}', `<div class="w">${table}</div>`, false], ['.t{display:block;overflow-x:auto}', table, false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}</style></head><body>${html}</body></html>`);
    const scrolls = await page.evaluate(() => { const e = document.querySelector('.w') ?? document.querySelector('.t'); e.scrollLeft = 50; return e.scrollLeft > 0; });
    expect(scrolls, css).toBe(!inert);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => p.startsWith('overflow'))), css).toBe(inert);
  }
});

test('F32: ::before on an img, a text field and other replaced elements is not rendered', async ({page}) => {
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const pseudo = '.x::before{content:"";display:inline-block;width:30px;height:30px;background:rgb(255,0,0)}';
  const cases = [[`<img class="x" alt="" src="${gif}" width="40" height="40">`, true], ...['text', 'email', 'password', 'search', 'tel', 'url', 'number'].map(t => [`<input class="x" type="${t}" aria-label="q">`, true]),
    ['<select class="x" aria-label="q"><option>a</option></select>', true], ['<textarea class="x" aria-label="q"></textarea>', true], ['<iframe class="x" title="f" width="60" height="40"></iframe>', true],
    ['<video class="x" width="60" height="40"></video>', true], ['a<br class="x">b', true], ['<canvas class="x" width="40" height="40"></canvas>', true],
    ['<div class="x">d</div>', false], ['<button class="x" type="button">b</button>', false], ['<input class="x" type="checkbox" aria-label="q" style="appearance:none;width:20px;height:20px;border:1px solid">', false]];
  for (const [html, hidden] of cases) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:20px}${css}</style></head><body>${html}</body></html>`); await page.waitForTimeout(30); return (await page.screenshot()).toString('base64'); };
    expect(await shot('') === await shot(pseudo), html).toBe(hidden);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: pseudo, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_PSEUDO_NOT_RENDERED'), html).toBe(hidden);
  }
});

test('F33: :last-child and :nth-child miss because of a template or script sibling', async ({page}) => {
  const cases = [['.a:last-child', '<template><b></b></template>', 'last'], ['.a:last-child', '<script>1</script>', 'last'], ['.a:first-child', '<template></template>', 'first'],
    ['.a:nth-child(2)', '<template></template>', 'first'], ['.a:last-of-type', '<template></template>', 'last'], ['.a:last-child', '', 'last']];
  for (const [sel, hidden, where] of cases) {
    const html = where === 'last' ? `<div class="w"><div class="a" id="p"></div><div class="a" id="t"></div>${hidden}</div>` : `<div class="w">${hidden}<div class="a" id="t"></div><div class="a" id="p"></div></div>`;
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const browser = await page.evaluate(s => { const items = [...document.querySelectorAll('.a')], before = items.map(e => e.matches(s)); document.querySelectorAll('.w > template, .w > script').forEach(e => e.remove()); return items.filter((e, i) => !before[i] && e.matches(s)).length; }, sel);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${sel}{height:50px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_CHILD_INDEX_HIDDEN_SIBLING').length, `${sel} ${hidden}`).toBe(browser);
  }
  expect(await page.evaluate(() => { document.body.innerHTML = '<template id="x"><b>t</b></template>'; return document.getElementById('x').getBoundingClientRect().height; })).toBe(0);
});

test('F34: columns on a flex or grid container do nothing', async ({page}) => {
  const items = '<div class="x"><div class="a">a</div><div class="a">b</div><div class="a">c</div></div>';
  const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0;width:400px}.a{height:20px}${css}</style></head><body>${items}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.a')].map(e => JSON.stringify(e.getBoundingClientRect()))); };
  for (const [base, extra, inert] of [['.x{display:flex}', '.x{columns:2}', true], ['.x{display:grid}', '.x{column-count:3}', true], ['.x{display:flex;flex-direction:column}', '.x{column-width:100px}', true], ['.x{display:block}', '.x{columns:2}', false]]) {
    expect(JSON.stringify(await rects(base)) === JSON.stringify(await rects(base + extra)), base + extra).toBe(inert);
    const r = analyzeHTML(`<html lang="en"><body>${items}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${base}${extra}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => p.startsWith('column-'))), base + extra).toBe(inert);
    if (!inert) expect(r.status).toBe('unknown');
  }
});

test('F35: :focus-within with nothing focusable inside; F17: tabindex="-1" takes focus', async ({page}) => {
  const css = '.x:focus-within{outline:2px solid}.x:focus{color:red}';
  for (const html of ['<div class="x"><p class="a">t</p></div>', '<div class="x"><button class="a" type="button">b</button></div>', '<div class="x"><p class="a">t <a href="/y">y</a></p></div>',
    '<div class="x" tabindex="-1"><p class="a">t</p></div>', '<div class="x"><div class="a" tabindex="0"></div></div>', '<div class="x"><a class="a">no href</a></div>']) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const [within, self] = await page.evaluate(() => { const x = document.querySelector('.x'); const all = [x, ...x.querySelectorAll('*')]; const within = all.some(e => { e.focus(); const m = x.matches(':focus-within'); document.activeElement?.blur(); return m; }); x.focus(); return [within, x.matches(':focus')]; });
    const warnings = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).filter(w => w.code === 'W_CSS_STATE_UNREACHABLE');
    expect(warnings.some(w => w.state === 'focus-within'), html).toBe(!within);
    expect(warnings.some(w => w.state === 'focus'), html).toBe(!self);
  }
});

test('F36: a :hover transform on an inline link does not move it', async ({page}) => {
  for (const [css, html, inert] of [['.x:hover{transform:translateY(-8px)}', '<p class="a">text <a class="x" href="/y">link</a></p>', true], ['.x:hover{scale:2}', '<p class="a">text <span class="x" tabindex="0">s</span></p>', true],
    ['.x{display:inline-block}.x:hover{transform:translateY(-8px)}', '<p class="a">text <a class="x" href="/y">link</a></p>', false], ['.x:hover{transform:translateY(-8px)}', '<div class="x a">block</div>', false]]) {
    await page.mouse.move(0, 0);
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:40px}${css}</style></head><body>${html}</body></html>`);
    const before = await page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect()));
    await page.hover('.x'); await page.waitForTimeout(30);
    const after = await page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect()));
    expect(before === after, css).toBe(inert);
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.state === 'hover'), css).toBe(inert);
  }
});

test('F37: ::first-letter / ::first-line on an inline, flex or grid box never applies', async ({page}) => {
  for (const [css, html, inert] of [['.x{display:flex}', '<div class="x">Hello there</div>', true], ['.x{display:grid}', '<div class="x">Hello there</div>', true], ['', '<p>t <span class="x">Hello</span></p>', true], ['', '<p class="x">Hello there</p>', false], ['.x{display:inline-block}', '<p>t <span class="x">Hello</span></p>', false]]) {
    for (const pe of ['first-letter', 'first-line']) {
      const rule = `.x::${pe}{color:rgb(255,0,0)}`;
      const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${css}${extra}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
      expect(await shot('') === await shot(rule), css + rule).toBe(inert);
      const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: css + rule, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
      expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === `::${pe}`), css + rule).toBe(inert);
    }
  }
});

test('F38: margin: auto does not centre an absolutely positioned box with an auto inset', async ({page}) => {
  for (const c of ['margin:auto', 'left:0;margin:0 auto', 'right:0;margin:auto', 'inset:0;margin:auto', 'left:0;right:0;margin:0 auto', 'top:0;bottom:0;margin:auto 0', 'inset:0 auto 0 0;margin:auto']) {
    const css = `.w{position:relative;height:300px;width:400px}.m{position:absolute;width:200px;height:50px;${c}}`;
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}</style></head><body><div class="w"><div class="m"></div></div></body></html>`);
    const [cx, cy] = await page.evaluate(() => { const r = document.querySelector('.m').getBoundingClientRect(); return [r.x === 100, r.y === 125]; });
    const m = c.match(/margin:([^;]+)/)[1].trim().split(/\s+/), wantsY = m[0] === 'auto', wantsX = (m[1] ?? m[0]) === 'auto';
    const missed = ['horizontal', 'vertical'].filter((axis, i) => (i === 0 ? wantsX : wantsY) && !(i === 0 ? cx : cy));
    const w = (analyzeHTML('<html lang="en"><body><div class="w"><div class="m"></div></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).find(x => x.code === 'W_LAYOUT_AUTO_MARGIN_ABSOLUTE');
    expect(w?.axes ?? [], c).toEqual(missed);
  }
});

test('F39: object-position does nothing under object-fit: fill', async ({page}) => {
  const src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="20" height="20" fill="red"/><rect x="20" width="20" height="20" fill="blue"/></svg>');
  for (const fit of ['fill', 'contain', 'cover', 'none', 'scale-down']) {
    const html = `<img class="x" alt="" src="${src}" width="40" height="20">`;
    const css = `.x{display:block;width:100px;height:100px;object-fit:${fit}}`;
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}${extra}</style></head><body>${html}</body></html>`); await page.waitForTimeout(50); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot('.x{object-position:left top}');
    expect(inert, fit).toBe(fit === 'fill');
    expect((analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${css}.x{object-position:left top}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('object-position')), fit).toBe(inert);
  }
});

test('F40: place-items / place-content lay out as their longhands', async ({page}) => {
  const items = '<div class="x"><div class="a">a</div><div class="a">b</div></div>';
  const base = '.x{display:grid;grid-template-columns:100px 100px;width:300px;height:100px}.a{height:20px;width:40px}';
  const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${items}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.a')].map(e => JSON.stringify(e.getBoundingClientRect()))); };
  const analyse = css => analyzeHTML(`<html lang="en"><body>${items}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
  for (const [short, long] of [['.x{place-items:center}', '.x{align-items:center;justify-items:center}'], ['.x{place-items:end start}', '.x{align-items:end;justify-items:start}'], ['.x{place-content:center}', '.x{align-content:center;justify-content:center}'], ['.x{place-content:end space-between}', '.x{align-content:end;justify-content:space-between}']]) {
    expect(await rects(short), short).toEqual(await rects(long));
    const a = analyse(short), b = analyse(long);
    expect(a.status, short).toBe(b.status);
    expect(JSON.stringify(a.layoutWarnings ?? []), short).toBe(JSON.stringify(b.layoutWarnings ?? []).replaceAll(long.slice(3, -1), short.slice(3, -1)));
  }
});

test('F41: fill / stroke on an svg whose shapes set their own attributes', async ({page}) => {
  const svg = inner => `<svg class="i" width="40" height="40" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
  for (const [css, inner, key] of [['.i{fill:rgb(255,0,0)}', '<path fill="#000" d="M0 0h20v20H0z"/>', 'fill'], ['.i{fill:rgb(255,0,0)}', '<path d="M0 0h20v20H0z"/>', 'fill'], ['.i{fill:rgb(255,0,0)}', '<path fill="inherit" d="M0 0h20v20H0z"/>', 'fill'],
    ['.i{fill:rgb(255,0,0)}', '<g fill="#000"><path d="M0 0h20v20H0z"/></g>', 'fill'], ['.i{fill:rgb(255,0,0)}', '<path fill="#000" d="M0 0h10v20H0z"/><path d="M10 0h10v20H10z"/>', 'fill'],
    ['.i{stroke:rgb(255,0,0)}', '<path fill="none" stroke="#000" stroke-width="4" d="M2 2h16v16H2z"/>', 'stroke'], ['.i{fill:rgb(255,0,0)}.i path{fill:rgb(0,0,255)}', '<path fill="#000" d="M0 0h20v20H0z"/>', 'fill']]) {
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.i{display:block}${extra}</style></head><body>${svg(inner)}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(css);
    const own = css.replace(/\.i path\{[^}]*\}/, '');
    const ownInert = css === own ? inert : await shot('') === await shot(own) && await shot(css.replace(own, '')) === await shot(css);
    expect((analyzeHTML(`<html lang="en"><body>${svg(inner)}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.i{display:block}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes(key)), `${css} ${inner}`).toBe(css === own ? inert : false);
    if (css !== own) expect(ownInert, 'the svg rule alone is inert there').toBe(true);
  }
});

test('F42: background, color, border and padding on a checkbox or radio of appearance auto change nothing', async ({page}) => {
  for (const type of ['checkbox', 'radio']) for (const [d, inert] of [['background-color:rgb(255,0,0)', true], ['color:rgb(255,0,0)', true], ['border:3px solid red', true], ['padding:5px', true], ['accent-color:rgb(255,0,0)', false], ['appearance:none;width:20px;height:20px;background-color:rgb(255,0,0)', false]]) {
    const html = `<input class="x" type="${type}" checked aria-label="q"><span>after</span>`;
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:20px}${css}</style></head><body>${html}</body></html>`); return [(await page.screenshot()).toString('base64'), await page.evaluate(() => JSON.stringify([document.querySelector('.x').getBoundingClientRect(), document.querySelector('span').getBoundingClientRect().x]))]; };
    const [a, b] = [await shot(''), await shot(`.x{${d}}`)];
    expect(a[0] === b[0] && a[1] === b[1], `${type} ${d}`).toBe(inert);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `.x{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path && /appearance: auto/.test(w.message));
    expect(warned, `${type} ${d}`).toBe(inert);
  }
});

test('F43: min-height / max-height on a table cell, and min-width / max-width in a fixed table, do nothing', async ({page}) => {
  for (const layout of ['auto', 'fixed']) for (const d of ['min-height:80px', 'max-height:5px', 'max-width:30px', 'min-width:250px']) {
    const table = '<table class="t"><tbody><tr><td class="c">word word</td><td>x</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>';
    const css = `.t{table-layout:${layout};width:300px;border-spacing:0}td{padding:0}`;
    const m = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${css}${extra}</style></head><body>${table}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('td')].map(t => JSON.stringify(t.getBoundingClientRect())).join()); };
    const inert = await m('') === await m(`.c{${d}}`);
    const warned = (analyzeHTML(`<html lang="en"><body>${table}</body></html>`, {name: 'P', css: `${css}.c{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && /table cell/.test(w.message));
    expect(warned, `${layout} ${d}`).toBe(inert);
  }
});

test('F44: an element with pointer-events: none is never under the pointer, so its cursor never shows', async ({page}) => {
  for (const [css, html] of [['.x{pointer-events:none;cursor:pointer}', '<div class="x a"></div>'], ['.p{pointer-events:none}.x{cursor:not-allowed}', '<div class="p"><div class="x a"></div></div>'], ['.x{cursor:pointer}', '<div class="x a"></div>']]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.a{height:20px}${css}</style></head><body>${html}</body></html>`);
    const hit = await page.evaluate(() => { const r = document.querySelector('.x').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.classList.contains('x') ?? false; });
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('cursor'));
    expect(warned, css).toBe(!hit);
  }
});

test('F45: text-align / text-indent / text-align-last on an inline element do nothing', async ({page}) => {
  const html = '<p class="a">before <span class="x">span text here</span> after more words to wrap the line around</p>';
  for (const [d, disp] of [['text-align:center', 'inline'], ['text-indent:40px', 'inline'], ['text-align-last:center', 'inline'], ['text-align:center', 'block'], ['text-indent:40px', 'block']]) {
    const css = `.a{width:300px}.x{display:${disp};${d}}`;
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}.a{width:300px}.x{display:${disp}}${extra}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(`.x{${d}}`);
    expect(inert, `${disp} ${d}`).toBe(disp === 'inline');
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^text-(?:align|indent|align-last)$/.test(p)));
    expect(warned, `${disp} ${d}`).toBe(inert);
  }
});

test('F46: ::selection ignores box properties (font-size, padding, border, margin, outline) and the analysis reads it', async ({page}) => {
  for (const [d, ignored] of [['font-size:30px', true], ['font-weight:bold', true], ['letter-spacing:5px', true], ['opacity:0.2', true], ['padding:10px', true], ['border:2px solid red', true], ['margin:10px', true], ['outline:2px solid red', true], ['color:rgb(255,0,0)', false], ['background-color:rgb(255,255,0)', false]]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${css}</style></head><body><p class="x">Select this text</p></body></html>`);
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.x')); getSelection().removeAllRanges(); getSelection().addRange(r); }); await page.waitForTimeout(150); return (await page.screenshot()).toString('base64'); };
    // Against a ::selection rule without the property (WebKit paints the selection differently once any rule exists).
    expect(await shot('.x::selection{--z:1}') === await shot(`.x::selection{--z:1;${d}}`), d).toBe(ignored);
    const r = analyzeHTML('<html lang="en"><body><div class="x"></div></body></html>', {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.x{height:20px}.x::selection{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.status, d).toBe('verified');
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_SELECTION_IGNORED'), d).toBe(ignored);
  }
});

test('F47: margin, height, display and position in ::placeholder are ignored', async ({page}) => {
  const field = '<input class="x" placeholder="Search here" aria-label="q">';
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const [d, ignored] of [['margin:10px', true], ['height:40px', true], ['display:block', true], ['position:absolute', true], ['color:rgb(255,0,0)', false], ['font-size:30px', false]]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${base}${css}</style></head><body>${field}</body></html>`); await page.waitForTimeout(50); return (await page.screenshot()).toString('base64') + await page.evaluate(() => JSON.stringify(document.querySelector('.x').getBoundingClientRect())); };
    expect(await shot('.x::placeholder{--z:1}') === await shot(`.x::placeholder{--z:1;${d}}`), d).toBe(ignored);
    const warned = (analyzeHTML(`<html lang="en"><body>${field}</body></html>`, {name: 'P', css: `${base}.x::placeholder{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_PLACEHOLDER_IGNORED');
    expect(warned, d).toBe(ignored);
  }
});

test('F48: :link / :any-link match only a link with href', async ({page}) => {
  for (const [sel, html] of [['.x:any-link', '<a class="x a">no href</a>'], ['.x:link', '<a class="x a">no href</a>'], ['.x:link', '<button class="x a" type="button">b</button>'], ['.x:any-link', '<a class="x a" href="/y">y</a>'], ['.x:link', '<a class="x a" href="">e</a>']]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const matched = await page.evaluate(s => document.querySelector('.x').matches(s), sel);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{display:block;height:20px}${sel}{color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && /link/.test(w.state ?? '')), `${sel} ${html}`).toBe(!matched);
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), `${sel} ${html}`).toBe(false);
  }
});

test('F49: :placeholder-shown needs a placeholder attribute', async ({page}) => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const html of ['<input class="x" aria-label="q" placeholder="Search">', '<input class="x" aria-label="q">', '<input class="x" aria-label="q" placeholder="">', '<input class="x" aria-label="q" placeholder="x" value="v">', '<textarea class="x" aria-label="q" placeholder="x"></textarea>', '<textarea class="x" aria-label="q"></textarea>', '<input class="x" type="number" aria-label="q" placeholder="0">']) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const matched = await page.evaluate(() => document.querySelector('.x').matches(':placeholder-shown'));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}.x:placeholder-shown{border-color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    const warned = (r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === ':placeholder-shown');
    // Warned exactly where the field has no placeholder attribute (it never matches, whatever is typed).
    expect(warned, html).toBe(!/placeholder=/.test(html));
    if (warned) expect(matched, html).toBe(false);
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), html).toBe(false);
  }
});

test('F50: :required / :optional match form fields only', async ({page}) => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const [sel, html, warn] of [['label:required', '<label class="x">Name</label>', true], ['.x:required', '<input class="x" type="range" aria-label="q" required>', true], ['.x:required', '<input class="x" type="color" aria-label="q" required>', true],
    ['.x:required', '<input class="x" aria-label="q" required>', false], ['.x:optional', '<input class="x" aria-label="q">', false], ['.x:required', '<select class="x" aria-label="q" required><option>a</option></select>', false], ['.x:optional', '<div class="x"></div>', true]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const matched = await page.evaluate(s => document.querySelector('.x').matches(s), sel);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}${sel}{border-color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    const warned = (r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && /^:(?:required|optional)$/.test(w.state ?? ''));
    expect(warned, `${sel} ${html}`).toBe(warn);
    if (warn) expect(matched, `${sel} ${html}`).toBe(false); else expect(matched, `${sel} ${html}`).toBe(true);
  }
});

test('F51: overflow on both html and body stops a sticky header from sticking', async ({page}) => {
  const html = '<header class="h"></header><main class="m"></main>';
  for (const css of ['', 'body{overflow-x:hidden}', 'html{overflow-x:hidden}', 'html,body{overflow-x:hidden}', 'html{overflow:auto}body{overflow:hidden}', 'html,body{overflow-x:clip}']) {
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}.h{position:sticky;top:0;height:40px;background:red}.m{height:2000px}${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(50);
    const sticks = await page.evaluate(() => Math.round(document.querySelector('.h').getBoundingClientRect().top) === 0);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.h{position:sticky;top:0;height:40px}.m{height:2000px}${css}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}, accessibility: true});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_STICKY_SCROLLER'), css || 'none').toBe(!sticks);
  }
});

test('F52: an invalid grid-template-areas is dropped (the layout is as without it)', async ({page}) => {
  const items = '<div class="x"><div class="a">a</div><div class="b">b</div></div>';
  const base = '.x{display:grid;grid-template-columns:100px 100px}.a,.b{height:20px}.a{grid-area:a}.b{grid-area:b}';
  const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${items}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.a,.b')].map(e => JSON.stringify(e.getBoundingClientRect())).join()); };
  for (const [v, invalid] of [['"a b" "b b"', true], ['"a b" "a"', true], ['"a b" "c a"', true], ['"b a"', false], ['"a ." ". b"', false]]) {
    expect(await rects(`.x{grid-template-areas:${v}}`) === await rects(''), v).toBe(invalid);
    const warned = (analyzeHTML(`<html lang="en"><body>${items}</body></html>`, {name: 'P', css: `${base}.x{grid-template-areas:${v}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_CSS_GRID_AREAS_INVALID');
    expect(warned, v).toBe(invalid);
  }
});

test('F53: auto margin-top / margin-bottom are 0 in block flow; the analysed positions match', async ({page}) => {
  const html = '<div class="p"><div class="s"></div><div class="c"></div><div class="n"></div></div>';
  for (const [parent, child] of [['display:block', 'margin:auto 0'], ['display:block', 'margin-top:auto'], ['display:block', 'margin-bottom:auto']]) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{${parent};height:200px}.s{height:30px}.c{${child};height:20px}.n{height:10px}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => ['.c', '.n'].map(s => document.querySelector(s).getBoundingClientRect().y));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, child).toBe('verified');
    const at = sel => Number(r.sizes.find(s => s.box === sel).rect.blockStart.constant);
    expect([at('.c'), at('.n')], `${parent} ${child}`).toEqual(browser);
    expect(r.layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^margin-(?:top|bottom)$/.test(p))), child).toBe(true);
  }
});

test('F54: clear on a flex or grid item does nothing', async ({page}) => {
  const html = '<div class="p"><div class="a"></div><div class="x"></div><div class="a"></div></div>';
  for (const parent of ['display:flex', 'display:grid;grid-template-columns:50px 50px', 'display:flex;flex-direction:column']) {
    const base = `.p{${parent};width:200px}.a{width:30px;height:30px}.x{width:40px;height:20px}`;
    const rects = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${html}</body></html>`); return page.evaluate(() => [...document.querySelectorAll('.p > div')].map(e => JSON.stringify(e.getBoundingClientRect())).join()); };
    expect(await rects('.x{clear:both}'), parent).toBe(await rects(''));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}.x{clear:both}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('clear')), parent).toBe(true);
    expect(r.diagnostics.some(d => /clear/.test(d.message)), parent).toBe(false);
  }
});

test('F55: a percentage top / bottom of a relative box in an auto-height block does not move it', async ({page}) => {
  const html = '<div class="g"><div class="p"><div class="s"></div><div class="c"></div><div class="n"></div></div></div>';
  for (const c of ['top:50%', 'bottom:20%', 'top:-30%']) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g,.p{display:block}.s{height:30px}.c{position:relative;height:20px;${c}}.n{height:10px}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => ['.c', '.n'].map(s => document.querySelector(s).getBoundingClientRect().y));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, c).toBe('verified');
    expect(['.c', '.n'].map(sel => Number(r.sizes.find(s => s.box === sel).rect.blockStart.constant)), c).toEqual(browser);
    expect(r.layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => p === 'top' || p === 'bottom')), c).toBe(true);
  }
  // .p a stretched grid item (body is a grid): Chromium and Firefox resolve the percentage there; not reported.
  const gridHtml = '<div class="p"><div class="s"></div><div class="c"></div></div>';
  const gridCss = '*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.p{display:block}.s{height:30px}.c{position:relative;height:20px;top:50%}';
  const r = analyzeHTML(`<html lang="en"><body>${gridHtml}</body></html>`, {name: 'P', css: gridCss, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
  expect((r.layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('top'))).toBe(false);
  expect(r.status).toBe('unknown');
});

test('F56: a percentage height in an auto-height block (itself in block flow) is auto; the analysed sizes match', async ({page}) => {
  const html = '<div class="g"><div class="p"><div class="s"></div><div class="c"><div class="i"></div></div><div class="n"></div></div></div>';
  for (const [pcss, c] of [['', 'height:100%'], ['', 'height:50%'], ['', 'min-height:50%'], ['', 'max-height:10%'], ['min-height:300px', 'height:50%']]) {
    const css = `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.g,.p{display:block}.p{${pcss}}.s{height:30px}.i{height:20px}.n{height:10px}.c{${c}}`;
    await page.setViewportSize({width: 400, height: 300});
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const browser = await page.evaluate(() => [document.querySelector('.c').getBoundingClientRect().height, document.querySelector('.n').getBoundingClientRect().y]);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 400, max: 400, height: {min: 300, max: 300}}});
    expect(r.status, `${pcss} ${c}`).toBe('verified');
    const size = sel => r.sizes.find(s => s.box === sel).rect;
    expect([Number(size('.c').blockSize.constant), Number(size('.n').blockStart.constant)], `${pcss} ${c}`).toEqual(browser);
  }
});

test('F57: overflow, text-overflow and resize on an inline element do nothing', async ({page}) => {
  const html = '<p class="a">before <span class="x">a long span of text here</span> after</p>';
  for (const [d, disp] of [['overflow:hidden;text-overflow:ellipsis', 'inline'], ['overflow:auto', 'inline'], ['resize:both;overflow:auto', 'inline'], ['overflow:hidden', 'inline-block']]) {
    const shot = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}.a{width:120px;white-space:nowrap}.x{display:${disp}}${css}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot(`.x{${d}}`);
    expect(inert, `${disp} ${d}`).toBe(disp === 'inline');
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `.a{width:120px;white-space:nowrap}.x{display:${disp};${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^(?:overflow-[xy]|text-overflow|resize)$/.test(p)));
    expect(warned, `${disp} ${d}`).toBe(inert);
  }
});

test('F58: text-decoration: none on a descendant does not remove an ancestor line', async ({page}) => {
  for (const [css, html, inert] of [['.c{text-decoration:none}', '<p class="a">t <a href="/y">link <span class="c">child</span></a></p>', true], ['.l{text-decoration:underline}.c{text-decoration:none}', '<p class="a l">text <span class="c">child</span></p>', true],
    ['.c{text-decoration:none}', '<p class="a">t <a class="c" href="/y">link</a></p>', false]]) {
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px;font:16px sans-serif}${extra}</style></head><body>${html}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const base = css.replace(/\.c\{text-decoration:none\}/, '');
    expect(await shot(base) === await shot(css), css).toBe(inert);
    const warned = (analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('text-decoration-line'));
    expect(warned, css).toBe(inert);
  }
});

test('F59: border-radius does not round the border of a collapsed table', async ({page}) => {
  const t = '<table class="t"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  for (const collapse of ['collapse', 'separate']) {
    const css = `.t{border-collapse:${collapse};border:3px solid red}td{padding:10px}`;
    const shot = async extra => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:10px}${css}${extra}</style></head><body>${t}</body></html>`); return (await page.screenshot()).toString('base64'); };
    const inert = await shot('') === await shot('.t{border-radius:12px}');
    expect(inert, collapse).toBe(collapse === 'collapse');
    const warned = (analyzeHTML(`<html lang="en"><body>${t}</body></html>`, {name: 'P', css: `${css}.t{border-radius:12px}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.includes('border-radius'));
    expect(warned, collapse).toBe(inert);
  }
});

test('F60: gap on a table and padding on a collapsed table do nothing', async ({page}) => {
  const t = '<table class="t"><tbody><tr><td class="c">a</td><td class="c">b</td></tr><tr><td class="c">c</td><td class="c">d</td></tr></tbody></table>';
  for (const [collapse, d, inert] of [['separate', 'gap:10px', true], ['collapse', 'gap:10px', true], ['collapse', 'padding:10px', true], ['separate', 'padding:10px', false]]) {
    const base = `.t{border-collapse:${collapse};border-spacing:0;border:2px solid red}.c{padding:0}`;
    const m = async css => { await page.setContent(`<!doctype html><html lang="en"><head><style>body{margin:0}${base}${css}</style></head><body>${t}</body></html>`); return page.evaluate(() => JSON.stringify([...document.querySelectorAll('td, table')].map(e => e.getBoundingClientRect()))); };
    expect(await m('') === await m(`.t{${d}}`), `${collapse} ${d}`).toBe(inert);
    const warned = (analyzeHTML(`<html lang="en"><body>${t}</body></html>`, {name: 'P', css: `${base}.t{${d}}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}}).layoutWarnings ?? []).some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.properties.some(p => /^(?:row-gap|column-gap|padding-)/.test(p)));
    expect(warned, `${collapse} ${d}`).toBe(inert);
  }
});

test('F61: :read-write never matches what cannot be edited', async ({page}) => {
  const base = '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}';
  for (const [html, warn] of [['<div class="x"></div>', true], ['<input class="x" type="checkbox" aria-label="q">', true], ['<input class="x" type="range" aria-label="q">', true], ['<button class="x" type="button">b</button>', true],
    ['<input class="x" aria-label="q">', false], ['<input class="x" aria-label="q" readonly>', false], ['<textarea class="x" aria-label="q"></textarea>', false], ['<input class="x" type="number" aria-label="q">', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const [rw, ro] = await page.evaluate(() => [':read-write', ':read-only'].map(s => document.querySelector('.x').matches(s)));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}${base}.x:read-write{border-color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === ':read-write'), html).toBe(warn);
    if (warn) expect([rw, ro], html).toEqual([false, true]);
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), html).toBe(false);
  }
});

test('F62: :lang() follows the inherited lang; :lang(jp) matches no Japanese page', async ({page}) => {
  for (const [lang, sel, html] of [['ja-JP', ':lang(ja)', '<div class="a x"></div>'], ['ja-JP', ':lang(jp)', '<div class="a x"></div>'], ['ja', ':lang(en)', '<div class="a x" lang="en-US"></div>'], ['en', ':lang(ja)', '<div class="a x"></div>']]) {
    await page.setContent(`<!doctype html><html lang="${lang}"><body>${html}</body></html>`);
    const matched = await page.evaluate(s => document.querySelector('.x').matches(s), sel);
    const r = analyzeHTML(`<html lang="${lang}"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}.x${sel}{color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), sel).toBe(false);
    expect(r.status, `${lang} ${sel}`).toBe('verified');
    if (sel === ':lang(jp)') { expect(matched).toBe(false); expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_LANG_CODE')).toBe(true); }
  }
});

test('F63: :dir() follows the dir attribute, not the CSS direction', async ({page}) => {
  for (const [css, html, warn] of [['.x{direction:rtl}', '<div class="x a"></div>', true], ['', '<div class="x a" dir="rtl"></div>', false], ['', '<div dir="rtl"><div class="x a"></div></div>', false], ['', '<div class="x a"></div>', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>${css}</style></head><body>${html}</body></html>`);
    const matched = await page.evaluate(() => document.querySelector('.x').matches(':dir(rtl)'));
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: `*{margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}.a{height:20px}${css}.x:dir(rtl){color:red}`, viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect(r.diagnostics.some(d => /Unsupported selector/.test(d.message)), html).toBe(false);
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_CSS_STATE_UNREACHABLE' && w.state === ':dir'), `${css} ${html}`).toBe(warn);
    if (warn) expect(matched).toBe(false);
  }
});

test('F64: DOM properties written as HTML attributes do nothing', async ({page}) => {
  for (const [html, prop, idle] of [['<input class="x" type="checkbox" aria-label="q" indeterminate>', 'indeterminate', false], ['<textarea class="x" aria-label="q" value="hi"></textarea>', 'value', ''],
    ['<select class="x" aria-label="q" value="b"><option value="a">a</option><option value="b">b</option></select>', 'value', 'a'], ['<input class="x" aria-label="q" defaultValue="x">', 'value', '']]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    expect(await page.evaluate(p => document.querySelector('.x')[p], prop), html).toBe(idle);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '.x{display:block;inline-size:200px;block-size:30px;box-sizing:border-box;appearance:none;padding:0;border:0;min-inline-size:0;min-block-size:0}', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML'), html).toBe(true);
  }
});

test('F65: disabled on a link or div, checked on a text field, selected on a div do nothing', async ({page}) => {
  for (const [html, warn] of [['<a class="x" href="#y" disabled>link</a>', true], ['<div class="x" tabindex="0" disabled>d</div>', true], ['<input class="x" aria-label="q" checked>', true], ['<div class="x" selected>s</div>', true], ['<button class="x" type="button" disabled>b</button>', false]]) {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`);
    const [disabled, focused, checked] = await page.evaluate(() => { const x = document.querySelector('.x'); x.focus(); return [x.matches(':disabled'), document.activeElement === x, x.matches(':checked')]; });
    if (warn) expect(disabled || checked, html).toBe(false);
    if (/disabled/.test(html) && warn) expect(focused, html).toBe(true);
    const r = analyzeHTML(`<html lang="en"><body>${html}</body></html>`, {name: 'P', css: '', viewport: {min: 320, max: 1200, height: {min: 300, max: 900}}});
    expect((r.layoutWarnings ?? []).some(w => w.code === 'W_HTML_ATTRIBUTE_NOT_HTML'), html).toBe(warn);
  }
});
