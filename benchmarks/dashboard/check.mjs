import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createDashboardServer, variants } from './serve.mjs';
import { tasks } from './model.mjs';

export async function checkDashboard(browser, server, id) {
  server.reset();
  const url = `${server.url}/dashboard/${id}/`, checks = [], errors = [];
  const plain = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await plain.newPage(); await page.goto(url);
    await expect(page.locator('[data-task]')).toHaveCount(64);
    await expect(page.locator('[data-task="task-00"] [data-value="hours"]')).toHaveText(String(tasks[0].initial));
    await page.locator('[data-task="task-00"] summary').click();
    await expect(page.locator('[data-task="task-00"] details')).toHaveAttribute('open', '');
    checks.push('SSR and native disclosure without JavaScript');
  } finally { await plain.close(); }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  let page, workModule, runtimeModule, startupScripts, workPreloaded;
  const scripts = [];
  try {
    page = await context.newPage();
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    if (id === 'isle') await page.addInitScript(() => {
      window.restoredScopes = []; const parse = JSON.parse;
      JSON.parse = function (...args) { const value = Reflect.apply(parse, JSON, args);
        if (Array.isArray(value) && value[0] === 2 && value.length === 4) window.restoredScopes.push(value[2]); return value; };
    });
    page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/__isle/')) errors.push(`${response.status()}: ${response.url()}`); });
    await page.goto(url); await page.waitForLoadState('networkidle');
    if (id === 'isle') {
      assert.deepEqual(await page.evaluate(() => window.restoredScopes), [], 'code preload cannot restore form or task state');
      const manifest = JSON.parse(server.routes.get('/dashboard/isle/isle.manifest.json').body);
      const formModule = new URL(manifest.references['ProjectForm.__form0'].ref[0], url).href;
      workModule = new URL(manifest.references['WorkItem.increment'].ref[0], url).href;
      runtimeModule = new URL(manifest.references['isle:resume'].ref[0], url).href;
      workPreloaded = manifest.references['WorkItem.increment'].loading !== 'lazy';
      const formPreloaded = manifest.references['ProjectForm.__form0'].loading !== 'lazy';
      assert.equal(scripts.includes(formModule), formPreloaded, 'form preloading matches the emitted policy');
      assert.equal(scripts.includes(workModule), workPreloaded, 'work package preloading matches the emitted policy');
      startupScripts = new Set(scripts);
      checks.push('code preloading matches the emitted policy and never restores task or form state');
    }
    await expect(page.locator('[data-task] .meta')).toHaveText(tasks.map(task => `${task.team} · ${task.rate} credits per hour`));
    await expect(page.locator('[data-task] .description')).toHaveText(tasks.map(task => task.description));
    await page.evaluate(() => { window.initialButtons = [...document.querySelectorAll('[data-task] [data-action="increment"]')]; });
    const item = page.locator('[data-task="task-00"]'), other = page.locator('[data-task="task-01"]');
    await item.locator('[data-action=increment]').click(); await item.locator('[data-action=increment]').click();
    await expect(item.locator('[data-value=hours]')).toHaveText('4'); await expect(item.locator('[data-value=cost]')).toHaveText('320');
    await expect(other.locator('[data-value=hours]')).toHaveText('3');
    await item.locator('input[type=checkbox]').check(); await expect(item.locator('[data-action=increment]')).toBeDisabled();
    await item.locator('input[type=checkbox]').uncheck(); await item.locator('[data-action=save]').click();
    await expect(item.locator('[data-value=saved]')).toHaveText('4'); await expect(item.locator('[data-value=difference]')).toHaveText('0');
    await item.locator('[data-action=increment]').click(); await item.locator('[data-action=reset]').click();
    await expect(item.locator('[data-value=hours]')).toHaveText('4');
    await page.evaluate(() => { const button = document.querySelector('[data-task="task-00"] [data-action="increment"]'); button.click(); button.click(); button.click(); });
    await expect(item.locator('[data-value=hours]')).toHaveText('7');
    await item.locator('[data-action=reset]').click(); await expect(item.locator('[data-value=hours]')).toHaveText('4');
    if (id === 'isle') {
      const expected = new Set([runtimeModule, workModule].filter(url => !startupScripts.has(url)));
      const requested = scripts.filter(url => !startupScripts.has(url));
      assert.deepEqual(new Set(requested), expected, 'increment, lock, save and reset reuse one handler module');
      assert.equal(requested.length, expected.size, 'shared modules are fetched only once');
    }
    await page.locator('#team-1').check(); await expect(item).toBeHidden(); await expect(other).toBeVisible();
    await page.locator('#team-all').check(); checks.push('derived values, isolation, lock, remote save, reset and native filter');
    const form = page.locator('[data-project-form]');
    await form.locator('[name=project]').fill('Taken project'); await form.locator('[name=email]').fill('owner@example.com');
    await form.locator('[name=confirmation]').fill('different@example.com'); await form.locator('[name=accepted]').check();
    await form.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('These values must match.');
    await form.locator('[name=confirmation]').fill('owner@example.com');
    await expect(form.locator('[name=project]')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByRole('alert')).toContainText('This value is already in use.');
    await form.locator('[name=project]').fill('Delivery roadmap');
    await expect(form.locator('[name=project]')).toHaveAttribute('aria-invalid', 'false');
    await page.evaluate(() => { const form = document.querySelector('[data-project-form]'); form.requestSubmit(); form.requestSubmit(); });
    await expect(form.getByRole('status')).toHaveText('Saved.');
    await expect(form.getByRole('button', { name: 'Create project', exact: true })).toBeEnabled();
    assert.equal(server.commits.createProject, 1, `${id}: duplicate submission`);
    await form.getByRole('button', { name: 'Reset form' }).click(); await expect(form.locator('[name=project]')).toHaveValue('');
    await expect(form.locator('[name=budget]')).toHaveValue('400'); await expect(form.getByRole('status')).toHaveText('');
    checks.push('correlation, authorized async validation, submit, duplicate prevention and reset');
    assert.equal(await page.evaluate(() => window.initialButtons.every((node, index) => node === document.querySelectorAll('[data-task] [data-action="increment"]')[index])), true);
    assert.deepEqual(errors, [], `${id}: browser errors`);
    checks.push('SSR button identity and no browser errors');
    if (id === 'isle') {
      assert.deepEqual(await page.evaluate(() => [...new Set(window.restoredScopes)].sort()), ['project', 'task-00']);
      checks.push('only the form and activated work package restore among 65 scopes');
    }
    return { id, pass: true, checks };
  } catch (error) {
    console.error(JSON.stringify({ id, errors, form: await page.locator('[data-project-form]').evaluate(form => ({
      text: form.textContent, values: [...new FormData(form)], valid: form.checkValidity(), html: form.outerHTML.slice(0, 7000),
    })).catch(() => null) }, null, 2));
    throw error;
  } finally { await context.close(); }
}

async function main() {
  const server = await createDashboardServer(); let browser;
  try {
    browser = await chromium.launch();
    const reports = [];
    for (const id of variants) { reports.push(await checkDashboard(browser, server, id)); console.log(`${id}: dashboard correctness passed`); }
    assert.deepEqual(server.errors, []);
    await mkdir(new URL('../results/dashboard/', import.meta.url), { recursive: true });
    await writeFile(new URL('../results/dashboard/correctness.json', import.meta.url), JSON.stringify({ pass: true, reports }, null, 2) + '\n');
  } finally { await browser?.close(); await server.close(); }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
