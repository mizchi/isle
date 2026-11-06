import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isle } from '../lib/vite.mjs';

const fixtures = [];
test.beforeAll(async () => {
  const source = await readFile(new URL('../evals/scenarios/forms/fixture.isle', import.meta.url), 'utf8');
  const controls = `export client component Controls() {
    state text = "two";
    <form aria-label="Controls">
      <label>Notes<textarea value={text}>on input edit { text = event.value; }</textarea></label>
      <label>Choice<select value={text}>on change choose { text = event.value; }
        <option value="one">One</option><option value="two">Two</option>
      </select></label><output>{text}</output>
    </form>
  }`;
  for (const mode of ['resume', 'ssr']) {
    const root = await mkdtemp(join(tmpdir(), 'isle-form-e2e-'));
    fixtures.push({ root });
    const entry = join(root, 'app.isle');
    await writeFile(entry, source + controls);
    await writeFile(join(root, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Form validation</title>
      <style>body{font:18px/1.5 system-ui;color:#182029;background:#fff;margin:24px}main{max-width:640px;margin:auto}form{display:grid;gap:12px;margin-bottom:48px}input,select,textarea,button{font:inherit;min-height:44px;padding:8px;border:2px solid #576575;border-radius:4px;box-sizing:border-box;max-width:100%}label{display:block}label input[type=checkbox]{width:28px;min-height:28px;vertical-align:middle}p{margin:0}p[aria-live]{min-height:1.5em;color:#9b1c1c}button{background:#172b4d;color:#fff}input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #1261a0;outline-offset:3px}</style>
      </head><body><main><h1>Form validation</h1><!--isle:ssr--></main></body></html>`);
    await writeFile(join(root, 'main.mjs'), 'import { boot } from "virtual:isle-loader"; window.isleDemo = boot();');
    await build({ configFile: false, root, base: './', logLevel: 'silent', plugins: [isle({ entry, mode, diagnostics: true,
      mounts: [
        { component: 'Signup', props: { initial: '' }, scopeId: 'a', label: 'First signup' },
        { component: 'Signup', props: { initial: '' }, scopeId: 'b', label: 'Second signup' },
        { component: 'Controls', props: {}, scopeId: 'controls', label: 'Text and select' },
      ], clientEntry: join(root, 'main.mjs') })] });
    const server = await preview({ configFile: false, root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
    Object.assign(fixtures.at(-1), { server, url: server.resolvedUrls.local[0] });
  }
});
test.afterAll(async () => {
  for (const fixture of fixtures) {
    if (fixture.server) await new Promise(resolve => fixture.server.httpServer.close(resolve));
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('forms retain labels and descriptions across independent mounts before any restoration', async ({ page }) => {
  const scripts = [];
  await page.route(url=>/\/isle-resume-[^/]+\.js$/.test(url.pathname),async route=>{
    const response=await route.fetch();await route.fulfill({response,body:`window.resumeEvaluated=true;\n${await response.text()}`});
  });
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto(fixtures[0].url); await page.waitForLoadState('networkidle');
  const forms = page.getByRole('form', { name: 'Signup' });
  await expect(forms).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await expect(forms.nth(index).getByRole('textbox')).toHaveAccessibleName('Email address (required)');
    await expect(forms.nth(index).getByRole('textbox')).toHaveAccessibleDescription('Use your work email.');
    await expect(forms.nth(index).getByRole('checkbox')).toHaveAccessibleName('I agree (required)');
  }
  expect(await page.locator('[id]').evaluateAll(nodes => new Set(nodes.map(node => node.id)).size === nodes.length)).toBe(true);
  expect(scripts.some(url => url.includes('isle-resume-'))).toBe(true);
  expect(await page.evaluate(()=>window.resumeEvaluated??false)).toBe(false);
  expect(await page.evaluate(() => window.isleDemo.metrics.restores)).toBe(0);
});

test('native constraints block submission, expose associated errors, then allow a valid keyboard submit', async ({ page }) => {
  await page.goto(fixtures[0].url);
  const form = page.getByRole('form', { name: 'Signup' }).first(), email = form.getByRole('textbox');
  const original = page.url();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  const error = form.locator('p[aria-live]');
  await expect(error).not.toBeEmpty();
  await expect(email).toHaveAccessibleDescription(/Use your work email\./);
  await expect(form.locator('output')).toBeEmpty();
  expect(page.url()).toBe(original);
  await email.fill('bad');
  await expect(error).not.toBeEmpty();
  await email.fill('hello@example.com');
  await expect(error).toBeEmpty();
  await expect(email).toHaveAttribute('aria-invalid', 'false');
  await form.getByRole('checkbox').check();
  await email.press('Enter');
  await expect(form.locator('output')).toHaveText('hello@example.com');
  await expect(page.getByRole('form', { name: 'Signup' }).nth(1).locator('output')).toBeEmpty();
  expect(page.url()).toBe(original);
});

test('cold imports preserve event-time input values, submission order and a newer caret', async ({ page }) => {
  const loading = Promise.withResolvers(), release = Promise.withResolvers();
  await page.route('**/assets/isle-resume-*.js', async route => { loading.resolve(); await release.promise; await route.continue(); });
  await page.goto(fixtures[0].url);
  const form = page.getByRole('form', { name: 'Signup' }).first(), email = form.getByRole('textbox');
  await email.fill('first@example.com'); await loading.promise;
  await form.getByRole('checkbox').check();
  await email.press('Enter');
  await email.fill('second@example.com');
  const notes = page.getByRole('textbox', { name: 'Notes' });
  await notes.fill('First notes');
  await notes.fill('Newer notes');
  await notes.evaluate(node => node.setSelectionRange(2, 2));
  release.resolve();
  await expect(form.locator('output')).toHaveText('first@example.com');
  await page.evaluate(() => window.isleDemo.settled());
  await expect(email).toHaveValue('second@example.com');
  await expect(notes).toHaveValue('Newer notes');
  expect(await notes.evaluate(node => node.selectionStart)).toBe(2);
  await email.press('Enter');
  await expect(form.locator('output')).toHaveText('second@example.com');
});

test('synthetic submit is cancelled synchronously and still checks native validity', async ({ page }) => {
  await page.goto(fixtures[0].url);
  const form = page.getByRole('form', { name: 'Signup' }).first();
  expect(await form.evaluate(node => {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    node.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await page.evaluate(() => window.isleDemo.settled());
  await expect(form.locator('output')).toBeEmpty();
});

test('textarea and select preserve native initial values and update existing controls', async ({ page }) => {
  await page.goto(fixtures[0].url);
  const form = page.getByRole('form', { name: 'Controls' });
  await expect(form.getByRole('textbox', { name: 'Notes' })).toHaveValue('two');
  await expect(form.getByRole('combobox', { name: 'Choice' })).toHaveValue('two');
  await form.getByRole('combobox').selectOption('one');
  await expect(form.getByRole('textbox')).toHaveValue('one');
  await form.getByRole('textbox').fill('Typed notes');
  await expect(form.locator('output')).toHaveText('Typed notes');
});

test('SSR-only forms retain constraint validation and accessible names with zero framework scripts', async ({ page }) => {
  const scripts = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto(fixtures[1].url);
  const form = page.getByRole('form', { name: 'Signup' }).first();
  await form.getByRole('button').click();
  await expect(form.getByRole('textbox')).toBeFocused();
  expect(await form.evaluate(node => node.checkValidity())).toBe(false);
  await expect(page.locator('[data-isle-snapshot]')).toHaveCount(0);
  expect(scripts).toEqual([]);
});
