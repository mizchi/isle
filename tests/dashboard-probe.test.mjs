import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { installProbe } from '../benchmarks/dashboard/probe.mjs';

test('latency probe waits for every expected update and excludes time spent retrieving the result', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<button>Update</button><output id="first">0</output><output id="last">0</output>');
    await page.evaluate(installProbe);
    await page.evaluate(() => { document.querySelector('button').onclick = () => {
      document.querySelector('#first').textContent = '1';
      setTimeout(() => { document.querySelector('#last').textContent = '2'; }, 30);
    }; });
    const id = await page.evaluate(() => window.__dashboard.arm({ name: 'two updates', event: 'click', trigger: 'button',
      expected: [{ selector: '#first', text: '1' }, { selector: '#last', text: '2' }] }));
    await page.getByRole('button').click();
    const first = await page.evaluate(id => window.__dashboard.wait(id), id);
    assert.ok(Number.isFinite(first.duration) && first.duration >= 25, JSON.stringify(first));
    assert.equal(first.trusted, true);
    const again = await page.evaluate(id => window.__dashboard.wait(id), id);
    assert.deepEqual(again, first);
    await assert.rejects(page.evaluate(() => window.__dashboard.arm({ name: 'missing', event: 'click', trigger: 'button', expected: [{ selector: '#missing', text: '1' }] })), /Missing benchmark target/);
  } finally { await browser.close(); }
});
