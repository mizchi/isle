import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {init, killThreads} from 'z3-solver';

// An independent proposal model, not CSS extraction or compiler support.
const cases = [
  {name: 'start-edges', css: 'inset: auto; left: 16px; top: 24px;', x: '16', y: '24', status: 'unsat', expected: [16, 24]},
  {name: 'end-edges', css: '', x: '(- W 4 16 40)', y: '(- H 4 16 40)', status: 'unsat', expected: [260, 180]},
  {name: 'percentage-axes', css: 'inset: auto; left: 25%; top: 25%;', x: '(* (/ 1 4) (- W 4))', y: '(* (/ 1 4) (- H 4))', status: 'unsat', expected: [79, 59]},
  {name: 'end-overflow', css: 'inset: auto; left: calc(100% - 20px); top: 16px;', x: '(- W 4 20)', y: '16', status: 'sat', expected: [296, 16]},
  {name: 'negative-start', css: 'inset: auto; left: -8px; top: 16px;', x: '(- 8)', y: '16', status: 'sat', expected: [-8, 16]},
];

const fixture = await readFile(new URL('positioned.html', import.meta.url), 'utf8');
const directory = new URL('../../results/component-structure/', import.meta.url);
await mkdir(directory, {recursive: true});
const results = [];
const solverApi = await init();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  for (const scenario of cases) {
    const proof = await checkContainment(solverApi, scenario);
    assert.equal(proof.status, scenario.status, scenario.name);
    const samples = [];
    // A SAT witness is replayed, rather than counting only unrelated samples.
    const sizes = [[320, 240], [641, 481], [960, 720]];
    if (proof.witness) sizes.push([proof.witness.W, proof.witness.H]);
    for (const [width, height] of sizes) {
      await page.setContent(fixture);
      await page.locator('.map').evaluate((element, size) => {
        element.style.inlineSize = `${size[0]}px`;
        element.style.blockSize = `${size[1]}px`;
      }, [width, height]);
      await page.locator('.controls').evaluate((element, css) => { element.style.cssText = css; }, scenario.css);
      const actual = await measure(page);
      const expected = evaluateRectangle(scenario, width, height);
      assert.equal(actual.containingBlock, 'map', scenario.name);
      for (const axis of ['x', 'y']) assert.ok(Math.abs(actual[axis] - expected[axis]) < 0.03, `${scenario.name} ${axis}: ${JSON.stringify({actual, expected})}`);
      assert.equal(actual.fits, scenario.status === 'unsat', scenario.name);
      samples.push({width, height, ...actual});
    }
    assert.deepEqual([samples[0].x, samples[0].y], scenario.expected);
    results.push({name: scenario.name, ...proof, samples});
  }

  await page.setContent(fixture);
  await page.evaluate(() => {
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.style.cssText = 'position:relative;width:180px;height:120px;border:4px solid;padding:8px;';
    document.querySelector('.map').append(frame);
    const control = document.querySelector('.controls');
    frame.append(control);
    control.style.cssText = 'inset-inline-end:8px;inset-block-end:8px;inline-size:24px;block-size:24px;';
  });
  const rebound = await measure(page);
  assert.equal(rebound.containingBlock, 'frame');
  assert.equal(rebound.fits, true);
  // Containment alone does not catch an unintended coordinate-space change.
  results.push({name: 'intervening-containing-block', status: 'binding-mismatch', expectedSpace: 'map', actual: rebound});

  for (const [minimum, expected] of [[80, 'sat'], [115.5, 'sat'], [116, 'unsat']]) {
    const proof = await checkPeerOverlap(solverApi, minimum);
    assert.equal(proof.status, expected);
    const width = proof.witness?.W ?? minimum;
    await page.setContent(fixture);
    const observed = await page.evaluate(width => {
      const map = document.querySelector('.map');
      map.style.inlineSize = `${width}px`;
      const first = document.querySelector('.controls');
      first.style.cssText = 'inset:auto;left:16px;top:16px;';
      const second = first.cloneNode(true);
      second.style.cssText = 'inset:auto;right:16px;top:16px;';
      map.append(second);
      const a = first.getBoundingClientRect(), b = second.getBoundingClientRect(), p = map.getBoundingClientRect();
      const start = p.left + map.clientLeft, end = p.right - map.clientLeft;
      return {overlaps: a.left < b.right && b.left < a.right, bothFit: a.left >= start && a.right <= end && b.left >= start && b.right <= end};
    }, width);
    assert.equal(observed.overlaps, expected === 'sat');
    assert.equal(observed.bothFit, true);
    results.push({name: `peer-overlay-min-${minimum}`, ...proof, replay: {width, ...observed}});
  }

  // Keep two readable positive-fixture screenshots for human inspection.
  for (const width of [1280, 375]) {
    await page.setViewportSize({width, height: 800});
    await page.setContent(fixture);
    await page.screenshot({path: new URL(`positioned-${width}.png`, directory).pathname, fullPage: true});
  }
  const report = {
    version: 1,
    scope: 'Hand-authored QF_LRA rectangle model and matching Chromium CSS fixtures; NOT compiler/profile support, CSS extraction, or a general browser proof',
    assumptions: ['horizontal-tb/ltr', 'border-box', '2px borders', '16px padding', 'zero child margins', 'no transforms/scrolling', 'grid placement auto'],
    browser: browser.version(),
    pixelTolerance: 0.03,
    passed: true,
    cases: results,
  };
  await writeFile(new URL('positioned.json', directory), JSON.stringify(report, null, 2) + '\n');
  console.log(`Positioned proposal: ${results.length} cases passed (model + Chromium).`);
} finally {
  try { await browser?.close(); }
  finally { await killThreads(solverApi.em); }
}

function evaluateRectangle(scenario, width, height) {
  const W = width - 4, H = height - 4;
  switch (scenario.name) {
    case 'start-edges': return {x: 16, y: 24};
    case 'end-edges': return {x: W - 16 - 40, y: H - 16 - 40};
    case 'percentage-axes': return {x: W / 4, y: H / 4};
    case 'end-overflow': return {x: W - 20, y: 16};
    case 'negative-start': return {x: -8, y: 16};
    default: throw new Error(`Missing coordinate oracle for ${scenario.name}`);
  }
}

async function checkContainment(api, scenario) {
  return solve(api, `
    (declare-const W Real) (declare-const H Real)
    (assert (and (<= 320 W) (<= W 960) (<= 240 H) (<= H 720)))
    (define-fun x () Real ${scenario.x})
    (define-fun y () Real ${scenario.y})
  `, '(or (< x 0) (> (+ x 40) (- W 4)) (< y 0) (> (+ y 40) (- H 4)))', ['W', 'H']);
}

async function checkPeerOverlap(api, minimum) {
  return solve(api, `
    (declare-const W Real)
    (assert (and (<= ${minimum} W) (<= W 960)))
    (define-fun a-left () Real 16)
    (define-fun a-right () Real 56)
    (define-fun b-left () Real (- W 4 16 40))
    (define-fun b-right () Real (- W 4 16))
  `, '(and (< a-left b-right) (< b-left a-right))', ['W']);
}

async function solve(api, domain, violation, variables) {
  const ctx = new api.Context('positioned-proposal');
  const solver = new ctx.Solver();
  try {
    solver.set('timeout', 5000);
    solver.fromString(`(set-logic QF_LRA) ${domain}`);
    // A proof must not succeed merely because its domain is empty.
    assert.equal(await solver.check(), 'sat', 'Empty coordinate-model domain');
    solver.fromString(`(assert ${violation})`);
    const status = await solver.check();
    if (status !== 'sat') return {status};
    const model = solver.model();
    try {
      return {status, witness: Object.fromEntries(variables.map(name => [name, model.eval(ctx.Real.const(name)).asNumber()]))};
    } finally { model.release(); }
  } finally { solver.release(); }
}

async function measure(page) {
  return page.evaluate(() => {
    const map = document.querySelector('.map'), control = document.querySelector('.controls');
    const p = map.getBoundingClientRect(), c = control.getBoundingClientRect();
    const x = c.left - p.left - map.clientLeft, y = c.top - p.top - map.clientTop;
    const W = p.width - 2 * map.clientLeft, H = p.height - 2 * map.clientTop;
    // offsetParent is an oracle only for these deliberately constrained fixtures.
    return {x, y, width: c.width, height: c.height, containingBlock: control.offsetParent.className, fits: x >= 0 && y >= 0 && x + c.width <= W && y + c.height <= H};
  });
}
