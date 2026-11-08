#!/usr/bin/env node
// Independent consumer acceptance: goals are facts, never a reference implementation.
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, dirname, join, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';

const run = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [scenario, directory, ...flags] = process.argv.slice(2);
const eventScope = flags.includes('--event-scope');
if (!['author', 'diagnosis'].includes(scenario) || !directory || flags.some(flag=>flag!=='--event-scope') || eventScope && scenario!=='author') {
  console.error('Usage: node tools/grade-layout-usability.mjs author|diagnosis <consumer-directory> [--event-scope]');
  process.exit(2);
}
const root = resolve(directory);
const goal = JSON.parse(await readFile(join(repo, 'evals/scenarios/layout-usability/goals', `${scenario}.json`), 'utf8'));
const result = {scenario, pass: false, stages: [], metrics: {}};
let stage = 'source', browser, server;
const check = (condition, message) => assert.ok(condition, message);
const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message);
async function files(directory) {
  return (await Promise.all((await readdir(directory, {withFileTypes:true})).map(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
async function build(mode, output) {
  try {
    await run('pnpm', ['exec', 'vite', 'build', '--mode', mode, '--outDir', output], {
      cwd: root, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Vite ${mode} build failed:\n${error.stdout ?? ''}${error.stderr ?? error.message}`);
  }
  return join(root, output);
}
async function certificate(dist) {
  const value = JSON.parse(await readFile(join(dist, 'isle.layout.json'), 'utf8'));
  equal(value.component, goal.component, 'Certificate must target the deployed component');
  equal(value.status, 'verified', 'Production layout must be verified');
  equal(value.contracts.viewport, goal.viewport, 'Deployment domain must not be narrowed');
  check(value.declarations?.length > 0, 'Authored contracts must be checked');
  check(value.declarations.every(item => item.status === 'verified'), 'Every reachable declared instance must verify');
  check(value.declarations.some(item => item.contract.component === (scenario === 'author' ? 'ReviewCard' : 'Tile')), 'Child contracts must be checked in deployment');
  return {status:value.status, declarations:value.declarations.length};
}
async function payload(dist, ssr = false) {
  const paths = await files(dist);
  const js = paths.filter(path => /\.[cm]?js$/.test(path));
  check(!paths.some(path => path.endsWith('.wasm')), 'Delivered app must not include solver Wasm');
  let raw = 0, gzip = 0;
  for (const path of js) {
    const data = await readFile(path);
    check(!/z3-solver|z3-built|z3wasm/i.test(data.toString()), 'Delivered JS must not contain the build-time solver');
    raw += data.length; gzip += gzipSync(data).length;
  }
  if (ssr) equal(js.length, goal.ssrJavaScriptChunks, 'SSR-only builds must emit no JavaScript chunks');
  return {javascriptChunks:js.length, javascriptBytes:raw, javascriptGzipBytes:gzip,
    htmlBytes:(await stat(join(dist, 'index.html'))).size};
}
async function serve(dist) {
  const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json'};
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!path.startsWith(`${dist}${sep}`)) throw new Error('Outside dist');
      res.writeHead(200, {'content-type':mime[extname(path)] ?? 'application/octet-stream'});
      res.end(await readFile(path));
    } catch {res.writeHead(404); res.end('Not found');}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function eventually(page, expected) {
  await page.waitForFunction(({ids, total, open}) => {
    const actual = [...document.querySelectorAll('[data-review]')].map(node => node.getAttribute('data-review'));
    return JSON.stringify(actual) === JSON.stringify(ids)
      && document.querySelector('[aria-label="Total reviews"]')?.textContent.trim() === String(total)
      && document.querySelector('[aria-label="Open reviews"]')?.textContent.trim() === String(open);
  }, expected, {timeout:8000});
}
try {
  const packageRoot = join(root, 'node_modules/@isle/prototype');
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const {compile, requireIR} = await import(pathToFileURL(resolve(packageRoot, metadata.exports['./compiler'].import)));
  const ir = requireIR(compile(await readFile(join(root, 'app.isle'), 'utf8')));
  const component = ir.components.find(item => item.name === goal.component);
  const child = ir.components.find(item => item.name === (scenario === 'author' ? 'ReviewCard' : 'Tile'));
  check(component?.layout && child?.layout, 'Both parent and child need authored layout declarations');
  equal(component.side, scenario === 'author' ? 'client' : 'universal', 'Component execution side');
  equal(child.side, 'universal', 'Reusable child must be universal');
  const bounds = component.layout.contract.requires;
  equal([bounds.inlineSize.min,bounds.inlineSize.max,bounds.blockSize.min,bounds.blockSize.max],
    [goal.viewport.min,goal.viewport.max,goal.viewport.height.min,goal.viewport.height.max], 'Root requires must retain deployment bounds');
  const childBounds = child.layout.contract.requires;
  if (scenario === 'author') {
    check(childBounds.inlineSize.min >= 160 && childBounds.blockSize.min >= 96, 'Child minimum allocation must remain meaningful');
  } else {
    equal([childBounds.inlineSize.min,childBounds.inlineSize.max,childBounds.blockSize.min,childBounds.blockSize.max], [180,960,100,960], 'Tile contract must remain unchanged');
  }
  result.stages.push(stage);
  stage = 'production-build';
  const dist = await build('production', 'dist-eval');
  result.metrics.layout = await certificate(dist);
  result.metrics.resume = await payload(dist, scenario === 'diagnosis');
  result.stages.push(stage);
  stage = 'browser-layout';
  const url = await serve(dist);
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:320,height:640}});
  const selector = scenario === 'author' ? '[data-review]' : '.tile';
  result.metrics.columns = [];
  for (const sample of goal.columns) {
    await page.setViewportSize({width:sample.width,height:640});
    await page.goto(url);
    await page.locator(selector).first().waitFor();
    const geometry = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,minInline:css.minInlineSize};
    }));
    equal(geometry.length, scenario === 'author' ? goal.initial.ids.length : goal.tileCount, 'Initial card count');
    const columns = geometry.filter(box => Math.abs(box.y - geometry[0].y) < 1).length;
    equal(columns, sample.count, `Columns at ${sample.width}px`);
    check(geometry.every(box => box.width + 0.1 >= (scenario === 'author' ? 160 : 180) && box.height + 0.1 >= (scenario === 'author' ? 96 : 100)), `Child allocation at ${sample.width}px`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `No viewport overflow at ${sample.width}px`);
    if (scenario === 'diagnosis') {
      check(geometry.every(box => box.minInline === '180px' && Math.abs(box.height - 100) < 0.1), 'Native tile minimum and block size must remain unchanged');
      const css = await page.locator('.board').evaluate(node => {
        const c = getComputedStyle(node); return [c.paddingTop,c.paddingRight,c.paddingBottom,c.paddingLeft,c.rowGap,c.columnGap];
      });
      equal(css, Array(6).fill('16px'), 'Board padding and gaps must remain unchanged');
    }
    result.metrics.columns.push({width:sample.width,count:columns});
  }
  result.stages.push(stage);
  if (scenario === 'author') {
    stage = 'resume-interactions';
    await page.goto(url);
    await eventually(page, goal.initial);
    if (eventScope) {
      const card = page.locator('[data-review="a"]'), heading = card.getByRole('heading');
      check(await heading.evaluate(node => node.closest('[data-isle-on-click]') === null), 'A card heading must not dispatch an ancestor click handler');
      check(await card.evaluate(node => node.closest('[data-isle-on-click]') === null), 'Card padding must not dispatch a click handler');
      await heading.click();
      await card.click({position:{x:2,y:2}});
      await eventually(page, goal.initial);
      result.metrics.eventScope = {inertHeadingAndPadding:true};
    }
    for (const [id,title,status] of [['a','Read proposal','Open'],['b','Check constraints','Done'],['c','Ship demo','Open']]) {
      const text = await page.locator(`[data-review="${id}"]`).textContent();
      check(text.includes(title) && text.includes(status), `Initial content of ${id}`);
    }
    check(await page.getByRole('button').evaluateAll(nodes => nodes.every(node => node.hasAttribute('type'))), 'Buttons must have explicit native types');
    for (const step of goal.steps) {
      if (step.preserveRoot) await page.evaluate(id => {globalThis.__isleEvalRoot = document.querySelector(`[data-review="${id}"]`);}, step.toggle);
      if (step.click) await page.getByRole('button', {name:step.click,exact:true}).click();
      else await page.locator(`[data-review="${step.toggle}"]`).getByRole('button', {name:'Toggle',exact:true}).click();
      await eventually(page, step);
      if (step.preserveRoot) check(await page.evaluate(id => globalThis.__isleEvalRoot === document.querySelector(`[data-review="${id}"]`), step.toggle), 'Keyed card root identity must survive a completion update');
    }
    result.metrics.interactions = goal.steps.length;
    result.stages.push(stage);
  }
  await browser.close(); browser = undefined;
  await new Promise(resolve => server.close(resolve)); server = undefined;
  stage = 'ssr-build';
  const ssr = await build('ssr', 'dist-eval-ssr');
  await certificate(ssr);
  result.metrics.ssr = await payload(ssr, true);
  const html = await readFile(join(ssr, 'index.html'), 'utf8');
  check(!/<script\b[^>]*\bsrc=/i.test(html), 'SSR-only HTML must not load JavaScript');
  check((html.match(scenario === 'author' ? /data-review=/g : /class="tile\b/g) ?? []).length === (scenario === 'author' ? 3 : 4), 'SSR-only HTML must render the initial cards');
  result.stages.push(stage);
  result.pass = true;
} catch (error) {
  result.failure = {stage,message:error.message};
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
