import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { examples } from '../catalog.mjs';

const url = id => `http://127.0.0.1:${examples.find(example => example.id === id).port + 200}/`;
test.beforeAll(() => mkdir('test-results/examples', { recursive: true }));

for (const example of examples.filter(example => example.kind === 'vite')) {
  test(`${example.id}: SSR content is readable on desktop and phone`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1040, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url(example.id));
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/examples/${example.id}-${width}.png` });
    }
    expect(errors).toEqual([]);
  });
}

test('hello resumes and resets the server-rendered value', async ({ page }) => {
  await page.goto(url('hello'));
  await expect(page.locator('output')).toHaveText('5 / 10');
  await page.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(page.locator('output')).toHaveText('6 / 12');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('output')).toHaveText('5 / 10');
});

test('partial updates preserve static and unrelated DOM without mutations', async ({ page }) => {
  await page.goto(url('partial-updates'));
  await page.evaluate(() => {
    window.unchanged = [document.querySelector('[data-static]'), document.querySelector('[data-note]')];
    window.unrelatedMutations = [];
    new MutationObserver(records => window.unrelatedMutations.push(...records.filter(record => window.unchanged.some(node => node.contains(record.target))).map(record => record.type)))
      .observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(page.locator('[data-count]')).toHaveText('1');
  await expect(page.locator('[data-doubled]')).toHaveText('2');
  expect(await page.evaluate(() => window.unrelatedMutations)).toEqual([]);
  expect(await page.evaluate(() => window.unchanged[0] === document.querySelector('[data-static]') && window.unchanged[1] === document.querySelector('[data-note]'))).toBe(true);
});

test('control flow preserves keyed rows and reaches empty/catch output', async ({ page }) => {
  await page.goto(url('control-flow'));
  await page.locator('[data-key="a"]').evaluate(node => { window.alpha = node; });
  await page.getByRole('button', { name: 'Reverse rows' }).click();
  await expect(page.locator('li[data-key]')).toHaveText(['Beta', 'Alpha']);
  expect(await page.locator('[data-key="a"]').evaluate(node => node === window.alpha)).toBe(true);
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(page.locator('[data-visibility]')).toHaveText('Hidden');
  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await expect(page.locator('[data-mode]')).toHaveText('Summary view');
  await page.getByRole('button', { name: 'Empty list' }).click();
  await expect(page.locator('ul')).toHaveText('No rows');
  await expect(page.locator('[data-error]')).toContainText('No first row:');
  await page.screenshot({ path: 'test-results/examples/control-flow-empty.png', fullPage: true });
});

test('fetch-only preloading does not activate the other component', async ({ page }) => {
  await page.goto(url('loading'));
  await expect(page.locator('[data-search]')).not.toHaveAttribute('data-setup');
  await expect(page.locator('[data-details]')).not.toHaveAttribute('data-setup');
  await page.getByLabel('Search query').fill('isle');
  await expect(page.locator('[data-search]')).toHaveAttribute('data-setup', 'ready');
  await expect(page.locator('output')).toHaveText('isle');
  await expect(page.locator('[data-details]')).not.toHaveAttribute('data-setup');
  await page.getByRole('button', { name: 'Open details' }).click();
  await expect(page.locator('[data-details]')).toHaveAttribute('data-setup', 'ready');
  await expect(page.getByText('Details resumed')).toBeVisible();
  await page.screenshot({ path: 'test-results/examples/loading-active.png', fullPage: true });
});

test('removing a component clears its owned timer and listener once', async ({ page }) => {
  await page.clock.install();
  await page.goto(url('resources'));
  await expect(page.locator('#lifecycle')).toHaveAttribute('data-state', 'inactive');
  await page.getByRole('button', { name: 'Activate / increment' }).click();
  await expect(page.locator('#lifecycle')).toHaveAttribute('data-state', 'active');
  await page.clock.fastForward(1000);
  await expect(page.locator('#lifecycle')).toContainText('ticks');
  await page.getByRole('button', { name: 'Remove component' }).click();
  await expect(page.locator('#lifecycle')).toHaveAttribute('data-state', 'disposed');
  await page.clock.fastForward(2000);
  await expect(page.locator('#lifecycle')).toHaveText('Disposed: timer and listener released');
  await page.getByRole('button', { name: 'Remove component' }).click();
  await expect(page.locator('#lifecycle')).toHaveAttribute('data-cleanups', '1');
  await page.screenshot({ path: 'test-results/examples/resources-disposed.png', fullPage: true });
});

test('lazy component CSS is applied before setup', async ({ page }) => {
  await page.goto(url('styles'));
  await page.getByRole('button', { name: 'Activate style' }).click();
  await expect(page.locator('.lazy-card')).toHaveAttribute('data-style-at-setup', 'ready');
  await expect(page.locator('output')).toHaveText('1');
  await page.screenshot({ path: 'test-results/examples/styles-active.png', fullPage: true });
});

test('navigation uses a data block and an ordinary working link', async ({ page }) => {
  await page.goto(url('navigation'));
  const rules = JSON.parse(await page.locator('script[type="speculationrules"]').textContent());
  expect(rules.prefetch[0].where.selector_matches).toBe('a[data-prefetch]');
  expect(await page.locator('script[type="module"]').count()).toBe(0);
  await page.getByRole('link', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/next\.html$/);
  await expect(page.locator('h1')).toHaveText('Destination page');
});

test('native form constraints block invalid input and accept a complete form', async ({ page }) => {
  await page.goto(url('form'));
  await page.getByRole('textbox').fill('invalid');
  expect(await page.getByRole('textbox').evaluate(input => input.checkValidity())).toBe(false);
  await page.getByRole('textbox').fill('reader@example.com');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('output')).toHaveText('reader@example.com');
});

test('the counter example invokes its explicit server action', async ({ page }) => {
  await page.goto(url('counter'));
  await page.getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Draft!', exact: true })).toBeVisible();
});
