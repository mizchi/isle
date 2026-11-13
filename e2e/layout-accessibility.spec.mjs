// Differential eval: static accessibility rules (whole viewport domain)
// versus the browser at 1280/768/375. Oracles: Chromium's accessibility tree
// (names), hit testing (occlusion), focus (hidden-focusable), rendered rects
// (overlap, order), computed colors and `vlmkit check a11y contrast` at 1280
// (contrast). Browser runs only cross-check the model; they never accept source.
import {test, expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {analyzeHTML} from '../packages/css-verifier/src/html.mjs';

const results = new URL('../evals/results/layout-accessibility/', import.meta.url);
const widths = [1280, 768, 375], height = 800;
const reset = '*{box-sizing:border-box;margin:0;padding:0}html,body{margin:0}';
const button = 'appearance:none;display:block;padding:0;border:0;min-width:0;min-height:0;background:transparent;color:inherit;font:inherit;';
const type = 'font-family:sans-serif;font-size:16px;line-height:20px;';
const label = {minInlineSize: 1, intrinsicBlockSize: 20};
const cases = [
  {name: 'label-hidden-when-narrow', html: '<main class="bar"><a class="go" href="#x"><span class="label">Next page</span></a></main>',
    css: `.bar{display:grid;grid-template-columns:200px;grid-template-rows:40px;background:#fff;color:#000;${type}}.go{display:grid;grid-template-columns:minmax(0,1fr);color:inherit}.label{display:block}@media (width < 600px){.label{display:none}}`, boxes: {'.label': label}},
  {name: 'icon-buttons', html: '<main class="bar"><button class="b1" aria-label="Close"></button><button class="b2"></button><button class="b3" title="Menu"></button></main>',
    css: `.bar{display:grid;grid-template-columns:40px 40px 40px;grid-template-rows:40px;background:#fff}.b1,.b2,.b3{${button}}`},
  {name: 'label-visibility', html: '<main class="bar"><a class="go" href="#x"><span class="label">Hidden label</span></a><a class="ok" href="#y"><span class="shown">Shown</span></a></main>',
    css: `.bar{display:grid;grid-template-columns:150px 150px;grid-template-rows:40px;background:#fff;color:#000;${type}}.go,.ok{display:grid;grid-template-columns:minmax(0,1fr);color:inherit}.label,.shown{display:block}.go{visibility:hidden}.label{visibility:visible}.ok{visibility:hidden}`,
    boxes: {'.label': label, '.shown': label}},
  {name: 'grey-text-by-width', html: '<main class="card"><p class="t">Body text that needs contrast</p></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px;background:#fff;color:#000;${type}}.t{font-size:16px}@media (width >= 800px){.card{color:#777}}`, boxes: {'.t': label}},
  {name: 'translucent-panel', html: '<main class="page"><section class="panel"><p class="t">White on half black</p></section></main>',
    css: `.page{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:60px;background:#fff}.panel{display:grid;grid-template-columns:minmax(0,1fr);background:rgba(0,0,0,.5);color:#fff;${type}}`, boxes: {'.t': label}},
  {name: 'large-grey-heading', html: '<main class="card"><h1 class="t">Large heading</h1></main>',
    css: `.card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px;background:#fff;color:#767676;font-family:sans-serif;line-height:30px}.t{font-size:24px;font-weight:400}`, boxes: {'.t': {minInlineSize: 1, intrinsicBlockSize: 30}}},
  {name: 'badge-over-button', html: '<main class="panel"><button class="go" aria-label="Go"></button><div class="cover"></div><div class="ghost"></div></main>',
    css: `.panel{display:grid;grid-template-columns:100px minmax(0,1fr);grid-template-rows:40px;position:relative;background:#fff}.go{${button}}.cover{position:absolute;top:0;left:80px;inline-size:60px;block-size:40px;background:#fdd}.ghost{position:absolute;top:0;left:0;inline-size:30px;block-size:40px;pointer-events:none;background:#ddf}`},
  {name: 'overlapping-links', html: '<main class="panel"><button class="go" aria-label="Go"></button><a class="link" href="#x" aria-label="More"></a></main>',
    css: `.panel{display:grid;grid-template-columns:100px minmax(0,1fr);grid-template-rows:40px;position:relative;background:#fff}.go{${button}}.link{display:block;position:absolute;top:0;left:90px;inline-size:60px;block-size:40px}`},
  {name: 'reordered-grid', html: '<main class="grid"><div class="a"></div><div class="b"></div><div class="c"></div></main>',
    css: '.grid{display:grid;grid-template-columns:100px 100px;grid-template-rows:40px 40px}.a{grid-column:2;grid-row:1}.b{grid-column:1;grid-row:1}.c{grid-column:1;grid-row:2}@media (width < 600px){.a,.b,.c{grid-column:auto;grid-row:auto}}'},
  {name: 'hidden-dialog', html: '<main class="bar" aria-hidden="true"><button class="b1" aria-label="A"></button><button class="b2" disabled aria-label="B"></button><a class="b3" tabindex="-1" aria-label="C"></a><a class="b4" href="#d" aria-label="D"></a></main>',
    css: `.bar{display:grid;grid-template-columns:40px 40px 40px 40px;grid-template-rows:40px;background:#fff}.b1,.b2{${button}}.b3,.b4{display:block}@media (width < 600px){.b4{display:none}}`},
];
const rules = ['accessible-name', 'text-contrast', 'occluded-target', 'target-overlap', 'visual-order', 'hidden-focusable'];
const holds = (row, width) => row.range && (row.range.minInclusive === false ? width > row.range.min : width >= row.range.min) && (row.range.maxInclusive === false ? width < row.range.max : width <= row.range.max)
  && (!row.heightRange || (height >= row.heightRange.min && height <= row.heightRange.max));

// Paths of the static report ("Page/0/1") as element selectors under body.
async function runtime(page, sample) {
  const client = await page.context().newCDPSession(page);
  const found = new Map(rules.map(rule => [rule, new Set()]));
  const elements = await page.evaluate(() => {
    const out = [], walk = (node, path) => { out.push({path, tag: node.tagName.toLowerCase()}); [...node.children].forEach((child, i) => walk(child, `${path}/${i}`)); };
    walk(document.body.firstElementChild, 'Page'); return out;
  });
  const handle = path => page.evaluateHandle(indices => { let node = document.body.firstElementChild; for (const i of indices) node = node.children[i]; return node; }, path.split('/').slice(1).map(Number));
  const facts = await page.evaluate(() => {
    const out = {}, walk = (node, path) => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      out[path] = {rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height}, display: style.display, visibility: style.visibility, position: style.position};
      [...node.children].forEach((child, i) => walk(child, `${path}/${i}`));
    };
    walk(document.body.firstElementChild, 'Page'); return out;
  });
  for (const element of elements) {
    const fact = facts[element.path];
    if (fact.display === 'none' || fact.rect.w === 0) continue;
    const isLink = element.tag === 'a' && await (await handle(element.path)).evaluate(node => node.hasAttribute('href'));
    if (element.tag === 'button' || isLink) {
      // Names: Chromium's computed accessible name.
      const {result} = await client.send('Runtime.evaluate', {expression: `(() => { let n = document.body.firstElementChild; for (const i of ${JSON.stringify(element.path.split('/').slice(1).map(Number))}) n = n.children[i]; return n; })()`});
      const {node} = await client.send('DOM.describeNode', {objectId: result.objectId});
      const {nodes} = await client.send('Accessibility.getPartialAXTree', {backendNodeId: node.backendNodeId, fetchRelatives: false});
      const name = nodes[0]?.name?.value ?? '';
      const ariaHidden = await page.evaluate(indices => { let n = document.body.firstElementChild; for (const i of indices) n = n.children[i]; return n.closest('[aria-hidden="true"]') !== null; }, element.path.split('/').slice(1).map(Number));
      if (fact.visibility === 'visible' && !ariaHidden && !name.trim()) found.get('accessible-name').add(element.path);
    }
  }
  // Occlusion and overlap: rect intersections, then hit testing at the overlap centre.
  const links = new Set(await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(node => { const path = []; for (let n = node; n !== document.body.firstElementChild; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n)); return ['Page', ...path].join('/'); })));
  const targets = elements.filter(e => facts[e.path].display !== 'none' && facts[e.path].visibility === 'visible' && facts[e.path].rect.w > 0 && (e.tag === 'button' || links.has(e.path)));
  const inside = (a, b) => b.startsWith(a + '/') || a.startsWith(b + '/') || a === b;
  for (const target of targets) {
    const t = facts[target.path].rect;
    for (const other of elements) {
      if (inside(target.path, other.path)) continue;
      const o = facts[other.path].rect;
      const x0 = Math.max(t.x, o.x), x1 = Math.min(t.x + t.w, o.x + o.w), y0 = Math.max(t.y, o.y), y1 = Math.min(t.y + t.h, o.y + o.h);
      if (x1 <= x0 || y1 <= y0 || facts[other.path].display === 'none') continue;
      const hit = await page.evaluate(({x, y, indices}) => { let node = document.body.firstElementChild; for (const i of indices) node = node.children[i]; const top = document.elementFromPoint(x, y); return top !== null && !node.contains(top); }, {x: (x0 + x1) / 2, y: (y0 + y1) / 2, indices: target.path.split('/').slice(1).map(Number)});
      if (hit) found.get('occluded-target').add(target.path);
      if (targets.includes(other) && facts[other.path].visibility === 'visible') found.get('target-overlap').add([target.path, other.path].sort()[0]);
    }
  }
  // Visual order among siblings in flow.
  for (const a of elements) for (const b of elements) {
    if (a.path === b.path || a.path.slice(0, a.path.lastIndexOf('/')) !== b.path.slice(0, b.path.lastIndexOf('/')) || !a.path.includes('/')) continue;
    const [ia, ib] = [a, b].map(e => Number(e.path.slice(e.path.lastIndexOf('/') + 1)));
    if (ia >= ib || facts[a.path].position !== 'static' || facts[b.path].position !== 'static' || facts[a.path].display === 'none' || facts[b.path].display === 'none') continue;
    const A = facts[a.path].rect, B = facts[b.path].rect;
    if (B.y + B.h <= A.y || (B.y < A.y + A.h && A.y < B.y + B.h && B.x + B.w <= A.x)) found.get('visual-order').add(b.path);
  }
  // Focus inside aria-hidden.
  for (const element of elements) {
    const focused = await page.evaluate(indices => { let node = document.body.firstElementChild; for (const i of indices) node = node.children[i]; node.focus(); return document.activeElement === node && node.closest('[aria-hidden="true"]') !== null && node.tabIndex >= 0; }, element.path.split('/').slice(1).map(Number));
    if (focused) found.get('hidden-focusable').add(element.path);
  }
  // Contrast from computed colors, composited over the ancestors like the WCAG definition.
  const low = await page.evaluate(() => {
    const parse = value => { const m = value.match(/[\d.]+/g).map(Number); return {r: m[0], g: m[1], b: m[2], a: m[3] ?? 1}; };
    const over = (t, b) => { const a = t.a + b.a * (1 - t.a); const mix = k => (t[k] * t.a + b[k] * b.a * (1 - t.a)) / a; return {r: mix('r'), g: mix('g'), b: mix('b'), a}; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const out = [];
    const walk = (node, path) => {
      const style = getComputedStyle(node);
      if (style.display !== 'none' && style.visibility === 'visible' && [...node.childNodes].some(n => n.nodeType === 3 && n.data.trim())) {
        const layers = []; for (let n = node; n; n = n.parentElement) layers.push(parse(getComputedStyle(n).backgroundColor));
        let bg = {r: 255, g: 255, b: 255, a: 1}; for (const layer of layers.reverse()) bg = over(layer, bg);
        const fg = over(parse(style.color), bg), [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p), ratio = (x + 0.05) / (y + 0.05);
        const size = parseFloat(style.fontSize), large = size >= 24 || (size >= 56 / 3 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.push(path);
      }
      [...node.children].forEach((child, i) => walk(child, `${path}/${i}`));
    };
    walk(document.body.firstElementChild, 'Page'); return out;
  });
  for (const path of low) found.get('text-contrast').add(path);
  return found;
}

const table = [];
test.afterAll(() => {
  mkdirSync(results, {recursive: true});
  writeFileSync(new URL('report.json', results), JSON.stringify({version: 1, widths, height, rules, scope: 'Static accessibility rules vs the browser (AX tree names, hit testing, focus, rects, computed colors; vlmkit a11y contrast at 1280).', cases: table}, null, 2) + '\n');
});

for (const sample of cases) {
  test(`${sample.name}: static accessibility agrees with the browser`, async ({page}) => {
    const css = reset + sample.css;
    const report = analyzeHTML(sample.html, {name: 'Page', css, viewport: {min: 375, max: 1280, height: {min: 600, max: 1000}}, accessibility: true, ...(sample.boxes ? {boxes: sample.boxes} : {})});
    expect(report.status === 'unknown', JSON.stringify(report.diagnostics)).toBe(false);
    const rows = [...report.diagnostics, ...report.accessibility.warnings].filter(row => rules.includes(row.rule));
    const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${sample.html}</body></html>`;
    const row = {name: sample.name, static: {}, runtime: {}};
    for (const width of widths) {
      await page.setViewportSize({width, height});
      await page.setContent(document);
      const found = await runtime(page, sample);
      for (const rule of rules) {
        const expected = [...found.get(rule)].sort(), actual = [...new Set(rows.filter(r => r.rule === rule && holds(r, width)).map(r => r.path))].sort();
        (row.static[rule] ??= []).push(actual); (row.runtime[rule] ??= []).push(expected);
        expect(actual, `${rule} at ${width}`).toEqual(expected);
      }
    }
    // The independent contrast gate at its own viewport (1280×900).
    mkdirSync(results, {recursive: true});
    const file = new URL(`${sample.name}.html`, results);
    writeFileSync(file, document);
    const run = spawnSync('pnpm', ['exec', 'vlmkit', 'check', 'a11y', 'contrast', file.pathname, '--json', '--output-dir', new URL('../test-results/a11y-contrast-eval/', import.meta.url).pathname], {encoding: 'utf8', env: process.env});
    const gate = JSON.parse(run.stdout);
    const vlmkit = gate.findings.length > 0, staticLow = rows.some(r => r.rule === 'text-contrast' && holds({...r, heightRange: undefined}, 1280));
    expect(staticLow, `contrast at 1280: static ${staticLow} vs vlmkit ${vlmkit}`).toBe(vlmkit);
    table.push(row);
  });
}
