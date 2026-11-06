import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isle } from '../lib/vite.mjs';

const fixtures = [];
let commits = 0, prepare = async () => {}, validate = async () => [];
const host = {
  context: () => ({ subject: 'alice', tenant: 'demo' }), policies: { 'policy.signup': () => true, 'policy.note': () => true },
  validators: { 'accounts.available': { effects: ['db.read'], validate: args => validate(args) } },
  operations: { 'accounts.register': { policy: 'policy.signup', effects: ['db.write'], prepare: args => prepare(args),
    commit: ({ args }) => { commits++; return { email: args[1] }; } },
    'notes.write': { policy: 'policy.note', effects: ['db.write'], commit: ({ args }) => { commits++; return { note: args[1] }; } } },
};
test.beforeAll(async () => {
  const source = await readFile(new URL('../evals/scenarios/forms/shared.isle', import.meta.url), 'utf8') + `
    schema Note { note: string maxLength(3); } view Written { note: string; }
    export server action writeNote(input: Note): Written using request: RequestContext
    authorize grant = policy.note(request, input.note) effects { db.write }
    { return await notes.write(grant, input.note); }
    export client component Notes() {
      <form schema="Note" submit="writeNote" aria-label="Notes"><label>Note<textarea name="note"></textarea></label>
        <button type="submit">Save note</button></form>
    }`;
  for (const mode of ['resume', 'ssr']) {
    const root = await mkdtemp(join(tmpdir(), 'isle-schema-form-e2e-'));
    fixtures.push({ root });
    const entry = join(root, 'app.isle'); await writeFile(entry, source);
    await writeFile(join(root, 'index.html'), await readFile(new URL('../examples/form/index.html', import.meta.url), 'utf8'));
    await writeFile(join(root, 'main.mjs'), 'import { boot } from "virtual:isle-loader"; window.bootForms = boot; window.isleDemo = boot(); window.results = []; document.addEventListener("isle:submit", e => window.results.push(e.detail));');
    const options = { configFile: false, root, base: './', logLevel: 'silent', plugins: [isle({ entry, host, mode, diagnostics: true,
      mounts: [{ component: 'SchemaSignup', props: {}, scopeId: 'a', label: 'First signup' },
        { component: 'SchemaSignup', props: {}, scopeId: 'b', label: 'Second signup' },
        { component: 'Notes', props: {}, scopeId: 'notes', label: 'Multiline' }], clientEntry: join(root, 'main.mjs') })] };
    await build(options);
    const server = await preview({ ...options, preview: { host: '127.0.0.1', port: 0, strictPort: false } });
    Object.assign(fixtures.at(-1), { server, url: server.resolvedUrls.local[0] });
  }
});
test.afterAll(async () => {
  for (const fixture of fixtures) {
    if (fixture.server) await new Promise(resolve => fixture.server.httpServer.close(resolve));
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test.beforeEach(() => { commits = 0; prepare = async () => {}; validate = async () => []; });
const formOf = page => page.getByRole('form', { name: 'Create account' }).first();
async function fill(form, email = 'a@example.com') {
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=confirmation]').fill(email);
  await form.locator('[name=accepted]').check();
}

test('shared constraints stay native and dormant, with distinct IDs across owners', async ({ page }) => {
  const scripts = []; page.on('request', r => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.route(url=>/\/isle-resume-[^/]+\.js$/.test(url.pathname),async route=>{
    const response=await route.fetch();await route.fulfill({response,body:`window.resumeEvaluated=true;\n${await response.text()}`});
  });
  await page.goto(fixtures[0].url); await page.waitForLoadState('networkidle');
  expect(scripts.some(url => url.includes('isle-resume'))).toBe(true);
  expect(await page.evaluate(()=>window.resumeEvaluated??false)).toBe(false);
  expect(await page.evaluate(()=>window.isleDemo.metrics.restores)).toBe(0);
  await expect(formOf(page).locator('[name=email]')).toHaveAccessibleName('Email (required)');
  await expect(formOf(page).locator('[name=age]')).toHaveValue('21');
  expect(await page.locator('[id]').evaluateAll(nodes => new Set(nodes.map(n => n.id)).size === nodes.length)).toBe(true);
  await expect(formOf(page)).toHaveAttribute('data-isle-dirty', 'false');
});

test('cross-field errors have an accessible description, summary links and focus', async ({ page }) => {
  await page.goto(fixtures[0].url); const form = formOf(page);
  await fill(form); await form.locator('[name=confirmation]').fill('other@example.com');
  await form.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.locator('[name=confirmation]')).toHaveAccessibleDescription('These values must match.');
  await expect(form.locator('[name=confirmation]')).toBeFocused();
  await expect(form.getByRole('alert').getByRole('link')).toHaveAttribute('href', /confirmation/);
  expect(commits).toBe(0);
});

test('native invalid events use the accessible error UI without a second browser popup', async ({ page }) => {
  await page.goto(fixtures[0].url); const form = formOf(page);
  const cancelled = await form.evaluate(node => {
    let prevented = false;
    const listen = event => { prevented = event.defaultPrevented; };
    document.addEventListener('invalid', listen, { capture: true });
    node.querySelector('[name=email]').checkValidity();
    document.removeEventListener('invalid', listen, { capture: true });
    return prevented;
  });
  expect(cancelled).toBe(true);
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.locator('[name=email]')).toBeFocused();
});

test('typed submission and field errors use the same server rules', async ({ page }) => {
  validate = async ({ input }) => input.email === 'taken@example.com' ? [{ field: 'email', code: 'taken' }] : [];
  await page.goto(fixtures[0].url); const form = formOf(page);
  await fill(form, 'taken@example.com');
  await form.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(form.locator('[name=email]')).toHaveAccessibleDescription('This value is already in use.');
  await expect(form.locator('[name=email]')).toBeFocused(); expect(commits).toBe(0);
  await form.locator('[name=email]').fill('new@example.com');
  await form.locator('[name=confirmation]').fill('new@example.com');
  await form.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText('Saved.');
  expect(commits).toBe(1);
  expect(await page.evaluate(() => window.results)).toEqual([{ email: 'new@example.com' }]);
  await expect(page.getByRole('form', { name: 'Create account' }).nth(1)).toHaveAttribute('data-isle-dirty', 'false');
});

test('stale async validation cannot replace a newer value', async ({ page }) => {
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  validate = async ({ input }) => {
    if (input.email === 'old@example.com') { started.resolve(); await release.promise; return [{ field: 'email', code: 'taken' }]; }
    return [];
  };
  try {
    await page.goto(fixtures[0].url); const form = formOf(page);
    await fill(form, 'old@example.com'); await started.promise;
    await form.locator('[name=email]').fill('new@example.com'); await form.locator('[name=confirmation]').fill('new@example.com');
    await page.evaluate(() => window.isleDemo.settled()); release.resolve();
    await expect(form.locator('[name=email]')).toHaveAttribute('aria-invalid', 'false');
    await expect(form.locator('[data-isle-error=email]')).toBeHidden();
  } finally { release.resolve(); }
});

test('pending starts before imports and prevents duplicate submissions', async ({ page }) => {
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  prepare = async () => { started.resolve(); await release.promise; };
  try {
    await page.goto(fixtures[0].url); const form = formOf(page); await fill(form);
    await form.getByRole('button', { name: 'Create account', exact: true }).click(); await started.promise;
    await expect(form).toHaveAttribute('data-isle-pending', 'true');
    await expect(form.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
    await form.evaluate(node => { for (let i = 0; i < 3; i++) node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    release.resolve(); await page.evaluate(() => window.isleDemo.settled());
    expect(commits).toBe(1);
    await expect(form).toHaveAttribute('data-isle-pending', 'false');
    await expect(form.getByRole('status')).toHaveText('Saved.');
  } finally { release.resolve(); }
});

test('cold submission captures autofilled values and locks submission before loading code', async ({ page }) => {
  const loading = Promise.withResolvers(), release = Promise.withResolvers();
  await page.route('**/assets/isle-resume-*.js', async route => { loading.resolve(); await release.promise; await route.continue(); });
  try {
    await page.goto(fixtures[0].url); const form = formOf(page);
    expect(await form.evaluate(node => {
      node.querySelector('[name=email]').value = 'autofill@example.com';
      node.querySelector('[name=confirmation]').value = 'autofill@example.com';
      node.querySelector('[name=accepted]').checked = true;
      node.requestSubmit();
      return node.querySelector('button[type=submit]').disabled && node.dataset.islePending === 'true';
    })).toBe(true);
    await loading.promise;
    await form.evaluate(node => node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    release.resolve();
    await expect(form.getByRole('status')).toHaveText('Saved.');
    expect(commits).toBe(1); expect(await page.evaluate(() => window.results)).toEqual([{ email: 'autofill@example.com' }]);
  } finally { release.resolve(); }
});

test('reset clears dirty/touched/errors and ignores a late write response', async ({ page }) => {
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  prepare = async () => { started.resolve(); await release.promise; };
  try {
    await page.goto(fixtures[0].url); const form = formOf(page); await fill(form);
    await form.getByRole('button', { name: 'Create account', exact: true }).click(); await started.promise;
    await form.getByRole('button', { name: 'Reset' }).click();
    await expect(form.locator('[name=email]')).toHaveValue(''); await expect(form.locator('[name=age]')).toHaveValue('21');
    await expect(form.locator('[name=accepted]')).not.toBeChecked();
    await expect(form).toHaveAttribute('data-isle-dirty', 'false'); await expect(form).toHaveAttribute('data-isle-touched', '');
    release.resolve(); await page.evaluate(() => window.isleDemo.settled());
    await expect(form.getByRole('status')).toBeEmpty();
    expect(await page.evaluate(() => window.results)).toEqual([]);
  } finally { release.resolve(); }
});

test('closing and rebooting the loader creates a fresh form lifetime', async ({ page }) => {
  await page.goto(fixtures[0].url); const form = formOf(page); await fill(form);
  await page.evaluate(() => { window.isleDemo.close(); window.isleDemo = window.bootForms(); });
  await form.locator('[name=email]').fill('reopened@example.com'); await form.locator('[name=confirmation]').fill('reopened@example.com');
  await form.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText('Saved.'); expect(commits).toBe(1);
});

test('SSR-only forms POST native FormData through the same validation boundary', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage(); await page.goto(fixtures[1].url); const form = formOf(page); await fill(form);
    await expect(page.locator('script')).toHaveCount(0);
    const result = page.waitForResponse(response => response.url().includes('/__isle/action/register'));
    await form.getByRole('button', { name: 'Create account', exact: true }).click();
    expect(await (await result).json()).toEqual({ ok: true, value: { email: 'a@example.com' } });
    expect(commits).toBe(1);
  } finally { await context.close(); }
});

test('native textarea line endings preserve the shared maximum length', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage(); await page.goto(fixtures[1].url);
    const form = page.getByRole('form', { name: 'Notes', exact: true });
    await form.getByRole('textbox', { name: 'Note', exact: true }).fill('a\nb');
    const result = page.waitForResponse(response => response.url().includes('/__isle/action/writeNote'));
    await form.getByRole('button', { name: 'Save note' }).click();
    expect(await (await result).json()).toEqual({ ok: true, value: { note: 'a\nb' } }); expect(commits).toBe(1);
  } finally { await context.close(); }
});
