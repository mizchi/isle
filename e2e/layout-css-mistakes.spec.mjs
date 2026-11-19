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
