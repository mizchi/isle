import { test, expect } from '@playwright/test';

for (const mode of ['production', 'disposed', 'development']) {
  test(`${mode}: handler fetch overlaps a blocked runtime without early evaluation or restoration`, async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      const development = mode === 'development';
      const url = `http://127.0.0.1:${development ? 4173 : 4174}/`;
      const manifest = development ? undefined : await (await page.request.get(new URL('isle.manifest.json', url).href)).json();
      const runtime = new URL(development ? '/@isle/resume.js' : manifest.references['isle:resume'].ref[0], url).pathname;
      const handler = new URL(development ? '/@isle/handler/Counter.h0.js' : manifest.references['Counter.h0'].ref[0], url).pathname;
      const editor = new URL(development ? '/@isle/handler/Editor.h1.js' : manifest.references['Editor.h1'].ref[0], url).pathname;
      const requested = [], errors = [];
      let runtimeStarted = false, handlerFinished = false;
      page.on('request', request => requested.push(new URL(request.url()).pathname));
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (new URL(response.url()).pathname === handler) response.finished().then(() => { handlerFinished = true; }); });
      await page.route(url => url.pathname === runtime, async route => { runtimeStarted = true; await gate; await route.continue(); });
      await page.route(url => url.pathname === handler, async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `window.handlerEvaluated = (window.handlerEvaluated ?? 0) + 1;\n${await response.text()}` });
      });
      await page.addInitScript(() => {
        window.parsedScopes = [];
        const parse = JSON.parse;
        JSON.parse = function (...args) {
          const value = Reflect.apply(parse, JSON, args);
          if (Array.isArray(value) && value[0] === 2 && value.length === 4) window.parsedScopes.push(value[2]);
          return value;
        };
      });
      await page.goto(url); await page.waitForLoadState('networkidle');
      expect(requested).not.toContain(runtime); expect(requested).not.toContain(handler); expect(requested).not.toContain(editor);
      const button = page.locator('[data-isle-root="counter-a"]');
      await button.click();
      await expect.poll(() => runtimeStarted).toBe(true);
      await expect.poll(() => handlerFinished, { timeout: 2000 }).toBe(true);
      expect(requested).not.toContain(editor);
      expect(await page.evaluate(() => [window.handlerEvaluated, window.parsedScopes])).toEqual([undefined, []]);
      await expect(button).toHaveText('37 / 74');
      if (mode === 'disposed') await page.evaluate(() => window.isleDemo.dispose('counter-a'));
      release();
      await page.evaluate(() => window.isleDemo.settled());
      if (mode === 'disposed') {
        expect(await page.evaluate(() => [window.handlerEvaluated, window.parsedScopes])).toEqual([undefined, []]);
        await expect(button).toHaveText('37 / 74');
      } else {
        await expect(button).toHaveText('38 / 76');
        expect(await page.evaluate(() => [window.handlerEvaluated, window.parsedScopes])).toEqual([1, ['counter-a']]);
        await page.locator('[data-isle-root="counter-b"]').click();
        await expect(page.locator('[data-isle-root="counter-b"]')).toHaveText('6 / 12');
        expect(requested.filter(path => path === handler)).toHaveLength(1);
      }
      expect(errors).toEqual([]);
    } finally { release(); }
  });
}
