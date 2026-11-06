import { test, expect, chromium } from '@playwright/test';
import { build } from 'vite';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { isle } from '../lib/vite.mjs';
import { uninstrumentedChromium } from './helpers/uninstrumented-chromium.mjs';

let root, server, browser, origin;
const requests = [], reports = [];
let activation;
test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'isle-speculation-e2e-'));
  const entry = join(root, 'app.isle'), clientEntry = join(root, 'main.mjs');
  await writeFile(entry, `export client component Counter() {
    state count = 37; <button>on click { count += 1; }{count}</button>
  }`);
  await writeFile(clientEntry, `import { boot } from 'virtual:isle-loader';
    window.startedAsPrerender = document.prerendering;
    window.parsedScopes = []; const parse = JSON.parse;
    JSON.parse = function(...args) { const value = Reflect.apply(parse, JSON, args);
      if (Array.isArray(value) && value[0] === 2 && value.length === 4) window.parsedScopes.push(value[2]); return value; };
    window.initialButton = document.querySelector('button'); window.isleDemo = boot();
    if (location.pathname.endsWith('/prefetched.html')) fetch('/prefetched-executed');
    if (location.pathname === '/native/index.html') fetch('activate').then(() => { location.href = 'next.html'; });
    if (location.pathname === '/native/next.html') {
      const report = phase => fetch('report?data=' + encodeURIComponent(JSON.stringify({ phase,
        prerendering: document.prerendering, startedAsPrerender: window.startedAsPrerender,
        activationStart: performance.getEntriesByType('navigation')[0].activationStart,
        parsed: window.parsedScopes, restores: window.isleDemo.metrics.restores,
        text: document.querySelector('button').textContent,
        retainedDOM: window.initialButton === document.querySelector('button') })));
      addEventListener('load', () => { if (document.prerendering) report('ready'); }, { once: true });
      document.addEventListener('prerenderingchange', async () => {
        await report('activated'); document.querySelector('button').click();
        await window.isleDemo.settled(); await report('interacted');
      }, { once: true });
    }`);
  const template = '<!doctype html><html><head><title>Speculation</title></head><body><main><h1>Navigation</h1><a data-prerender href="next.html">Next</a><a data-prerender data-no-speculation href="excluded.html">Excluded</a><!--isle:ssr--></main></body></html>';
  for (const name of ['index.html', 'next.html', 'prefetched.html', 'excluded.html']) await writeFile(join(root, name), template);
  for (const native of [false, true]) await build({ configFile: false, root, base: './', logLevel: 'silent', html: { cspNonce: 'navigation-test' },
    plugins: [isle({ entry, clientEntry, diagnostics: true, mounts: [{ component: 'Counter', props: {}, scopeId: 'counter', label: 'Counter' }],
      speculation: {
        tag: 'isle-navigation-test', prefetch: [{ urls: ['prefetched.html'], eagerness: 'immediate' }],
        prerender: [{ where: { and: [{ href_matches: '/*' }, { selector_matches: 'a[data-prerender]' },
          { not: { selector_matches: '[data-no-speculation]' } }] }, eagerness: native ? 'immediate' : 'moderate' }],
      } })],
    build: { outDir: native ? 'dist-native' : 'dist', rolldownOptions: { input: ['index.html', 'next.html', 'prefetched.html', 'excluded.html'].map(name => join(root, name)) } } });
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'), path = url.pathname;
    requests.push({ path, purpose: request.headers['sec-purpose'], method: request.method });
    if (path === '/native/activate') {
      if (reports.some(report => report.phase === 'ready')) response.end('activate'); else activation = response;
      return;
    }
    if (path === '/native/report') {
      const report = JSON.parse(url.searchParams.get('data')); reports.push(report); response.end('recorded');
      if (report.phase === 'ready') { activation?.end('activate'); activation = undefined; }
      return;
    }
    try {
      const native = path.startsWith('/native/');
      const body = await readFile(join(root, native ? 'dist-native' : 'dist', native ? path.slice('/native/'.length) : path === '/' ? 'index.html' : path));
      response.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'text/html',
        'cache-control': 'public, max-age=60', 'content-security-policy': "script-src 'self' 'nonce-navigation-test'; object-src 'none'; base-uri 'self'" });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  // Prefetch uses Playwright; the prerender case below runs Chromium without a DevTools attachment.
  browser = await chromium.launch({ channel: 'chromium' });
});

test('ordinary links and SSR content work with JavaScript disabled', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage(), scripts = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  try {
    await page.goto(origin);
    await page.getByRole('link', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/next.html`);
    await expect(page.getByRole('button')).toHaveText('37');
    expect(scripts).toEqual([]);
  } finally { await context.close(); }
});
test.afterAll(async () => {
  await browser?.close();
  activation?.end();
  if (server) await new Promise(resolve => server.close(resolve));
  if (root) await rm(root, { recursive: true, force: true });
});
test.beforeEach(() => { requests.length = 0; reports.length = 0; });

test('native prefetch does not execute the target page or resume islands', async () => {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [], prefetch = [], prerender = [], ruleSets = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  cdp.on('Preload.prefetchStatusUpdated', event => prefetch.push(event));
  cdp.on('Preload.prerenderStatusUpdated', event => prerender.push(event));
  cdp.on('Preload.ruleSetUpdated', event => ruleSets.push(event));
  await cdp.send('Preload.enable');
  try {
    await page.goto(origin);
    expect(await page.evaluate(() => HTMLScriptElement.supports('speculationrules'))).toBe(true);
    await expect.poll(() => prefetch.some(event => event.status === 'Ready'), { message: 'native prefetch becomes ready for navigation' }).toBe(true);
    expect(requests.find(request => request.path === '/prefetched.html')?.purpose).toBe('prefetch');
    expect(requests.some(request => request.path === '/prefetched-executed')).toBe(false);
    expect(requests.some(request => request.path === '/excluded.html')).toBe(false);
    expect(ruleSets.every(event => !event.ruleSet.errorType)).toBe(true);
    expect(await page.evaluate(() => window.parsedScopes)).toEqual([]);
    expect(requests.some(request => /isle-resume|Counter\.h0/.test(request.path))).toBe(false);
    expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(0);
    expect(errors).toEqual([]);
  } catch (error) {
    console.log(JSON.stringify({ prefetch, prerender, ruleSets, requests, errors }, null, 2));
    throw error;
  } finally { await context.close(); }
});

test('native prerender activation retains dormant islands until the first interaction', async () => {
  const client = await uninstrumentedChromium(`${origin}/native/index.html`);
  try {
    await expect.poll(() => reports.some(report => report.phase === 'interacted'), { timeout: 15000,
      message: 'uninstrumented Chromium prerenders, activates and resumes' }).toBe(true);
    const ready = reports.find(report => report.phase === 'ready'), activated = reports.find(report => report.phase === 'activated'), interacted = reports.find(report => report.phase === 'interacted');
    expect(ready).toMatchObject({ prerendering: true, startedAsPrerender: true, parsed: [], restores: 0, text: '37' });
    expect(activated).toMatchObject({ prerendering: false, startedAsPrerender: true, parsed: [], restores: 0, text: '37' });
    expect(activated.activationStart).toBeGreaterThan(0);
    expect(interacted).toMatchObject({ parsed: ['counter'], restores: 1, text: '38', retainedDOM: true });
    expect(requests.find(request => request.path === '/native/next.html')?.purpose).toContain('prerender');
    expect(requests.some(request => request.path === '/native/excluded.html')).toBe(false);
  } catch (error) { console.log(JSON.stringify({ reports, requests, stderr: client.diagnostics() }, null, 2)); throw error; }
  finally { await client.close(); }
});
