import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { products, expectedProduct } from './scenario.mjs';
import { readBuilds, resultsDirectory } from './build.mjs';
import { createHeavyServer } from './serve.mjs';

/** Correctness instrumentation is kept out of the latency pass and out of all emitted assets. */
export function installCorrectnessProbe() {
  let mutations = [], queries = 0, queryMs = 0;
  const parses = [], originalParse = JSON.parse, query = Element.prototype.querySelectorAll;
  JSON.parse = function (...args) {
    const value = originalParse.apply(this, args);
    if (Array.isArray(value) && value[0] === 2 && typeof value[2] === 'string' && value[2].startsWith('orders/')) parses.push(value[2]);
    return value;
  };
  Element.prototype.querySelectorAll = function (selector) {
    if (String(selector).startsWith('[data-isle-binding-')) {
      queries++;
      const start = performance.now();
      try { return query.call(this, selector); }
      finally { queryMs += performance.now() - start; }
    }
    return query.call(this, selector);
  };
  const observer = new MutationObserver(records => mutations.push(...records));
  window.__heavyCorrectness = {
    arm() {
      observer.disconnect(); mutations = []; queries = 0; queryMs = 0;
      observer.observe(document.querySelector('[data-page]'), { subtree: true, characterData: true, childList: true, attributes: true, attributeFilter: ['data-cost'] });
    },
    read() {
      mutations.push(...observer.takeRecords()); observer.disconnect();
      return { textMutations: mutations.filter(record => record.type === 'characterData').length,
        attributeMutations: mutations.filter(record => record.type === 'attributes').length,
        childListMutations: mutations.filter(record => record.type === 'childList').length,
        bindingQueries: queries, bindingQueryMs: queryMs, restoredScopes: [...parses] };
    },
  };
}

export async function checkHeavyCase(browser, server, entry) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage(), errors = [], scripts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().endsWith('.js')) scripts.push(request.url()); });
    await page.addInitScript(installCorrectnessProbe);
    await page.goto(`${server.url}/heavy-render/${entry.id}/`);
    await page.waitForFunction(() => Boolean(window.heavyDemo));
    assert.equal(await page.locator('[data-product]').count(), entry.rows);
    const elements = await page.locator('[data-page]').evaluate(root => 1 + root.querySelectorAll('*').length - root.querySelectorAll('[data-isle-snapshot]').length);
    assert.equal(elements, entry.static.scenario.domElements);
    await page.evaluate(() => {
      window.originalRows = [...document.querySelectorAll('[data-product]')];
      window.__heavyCorrectness.arm();
    });
    const beforeAudit = new Set(scripts);
    await page.locator('[data-action="check"]').click();
    await page.evaluate(() => window.heavyDemo.settled());
    const audit = await page.evaluate(() => window.__heavyCorrectness.read());
    assert.equal(audit.textMutations, 1); assert.equal(audit.attributeMutations, 0);
    assert.equal(audit.restoredScopes.length, 1);
    const largeCode = entry.static.entries.find(row => row.id === 'Sheet.addAll').code.modules.at(-1);
    assert.ok(!scripts.filter(url => !beforeAudit.has(url)).includes(new URL(largeCode, `${server.url}/heavy-render/${entry.id}/`).href));
    const operations = [];
    for (const adjustment of [1, 2]) {
      await page.evaluate(() => window.__heavyCorrectness.arm());
      await page.locator('[data-action="add-all"]').click();
      await page.evaluate(() => window.heavyDemo.settled());
      const actual = await page.evaluate(() => window.__heavyCorrectness.read());
      const predicted = entry.static.entries.find(row => row.id === 'Sheet.addAll');
      assert.equal(actual.textMutations, predicted.work.textPatchCalls.value);
      assert.equal(actual.attributeMutations, predicted.work.attributePatchCalls.value);
      assert.equal(actual.childListMutations, predicted.work.createdElements.value);
      assert.equal(actual.bindingQueries, adjustment === 1 ? entry.rows : 0);
      assert.equal(actual.restoredScopes.length, 2);
      const rendered = await page.locator('[data-product]').evaluateAll(nodes => nodes.map(node => ({
        sku: node.getAttribute('data-product'), quantity: node.querySelector('[data-value="quantity"]').textContent.trim(),
        cost: node.querySelector('[data-value="cost"]').textContent.trim(),
        costAttribute: node.querySelector('[data-value="cost"]').getAttribute('data-cost'),
        weight: node.querySelector('[data-value="weight"]').textContent.trim(),
      })));
      rendered.forEach((row, index) => {
        const expected = expectedProduct(products[index], adjustment);
        assert.deepEqual(row, { sku: products[index].sku, quantity: String(expected.quantity), cost: `¥${expected.cost}`,
          costAttribute: String(expected.cost), weight: `${expected.weight} g` });
      });
      assert.equal(await page.evaluate(() => {
        const current = document.querySelectorAll('[data-product]');
        return window.originalRows.every((node, index) => node === current[index]);
      }), true);
      operations.push({ adjustment, ...actual });
    }
    assert.deepEqual(errors, []);
    return { rows: entry.rows, domElements: elements, audit, operations, pass: true };
  } finally { await context.close(); }
}

async function main() {
  const cases = (await readBuilds()).filter(entry => !entry.profile), server = await createHeavyServer(cases);
  let browser;
  try {
    browser = await chromium.launch();
    const results = [];
    for (const entry of cases) { results.push(await checkHeavyCase(browser, server, entry)); console.log(`${entry.rows}: static predictions match browser mutations`); }
    assert.deepEqual(server.errors, []);
    await mkdir(resultsDirectory, { recursive: true });
    await writeFile(resolve(resultsDirectory, 'correctness.json'), JSON.stringify({ pass: true, cases: results }, null, 2) + '\n');
  } finally { await browser?.close(); await server.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
