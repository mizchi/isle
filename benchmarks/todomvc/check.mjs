import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createTodoServer } from './serve.mjs';
import { variants } from './scenario.mjs';
import { todoFlow } from './flow.mjs';
async function main() {
  const server = await createTodoServer(); let browser;
  try {
    browser = await chromium.launch();
    await mkdir('test-results/todomvc', { recursive: true });
    for (const id of variants) {
      const plain = await browser.newContext({ javaScriptEnabled: false });
      const ssr = await plain.newPage(); await ssr.goto(`${server.url}/todomvc/${id}/`);
      await expect(ssr.locator('h1')).toHaveText('todos'); await expect(ssr.locator('.new-todo')).toBeVisible();
      await expect(ssr.locator('.main')).toBeHidden(); await plain.close();
      for (const width of [1280, 375]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
        const page = await context.newPage(), errors = [], failed = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
        await todoFlow(page, `${server.url}/todomvc/${id}/`, { storageKey: `todos-${id}`, screenshot: state => page.screenshot({ path: `test-results/todomvc/${id}-${width}-${state}.png`, fullPage: true }) });
        assert.deepEqual(errors, [], `${id}: browser errors`); assert.deepEqual(failed, [], `${id}: failed responses`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: page overflow`);
        await context.close();
      }
      console.log(`${id}: SSR, add/edit/escape/blur/delete, filtering, toggle-all, persistence, DOM identity, desktop + phone passed`);
    }
    const cold = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await cold.addInitScript(() => localStorage.setItem('todos-isle', '{invalid'));
      const page = await cold.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/assets/isle-resume-*.js', async route => { await new Promise(resolve => setTimeout(resolve, 150)); await route.continue(); });
      await page.goto(`${server.url}/todomvc/isle/`);
      const input = page.getByRole('textbox', { name: 'New todo', exact: true });
      await input.pressSequentially('Rapid <b>typing</b>');
      await input.press('Enter');
      await expect(page.locator('.todo-title')).toHaveText('Rapid <b>typing</b>');
      await expect(page.locator('.todo-list b')).toHaveCount(0);
      await expect(input).toHaveValue('');
      assert.deepEqual(errors, []);
      console.log('isle: delayed cold runtime preserves rapid input, escapes text and ignores malformed storage');
    } finally { await cold.close(); }
    assert.deepEqual(server.errors, []);
  } finally { await browser?.close(); await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
