import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';

const root = new URL('../', import.meta.url);
const directory = new URL('docs/overview/', root);
const asset = name => new URL(`figures/${name}`, directory);
const read = url => readFile(url, 'utf8');
const variants = [
  { name: 'desktop', width: 1040 },
  { name: 'mobile', width: 375 },
];
const digest = value => createHash('sha256').update(value).digest('hex');
const figurePage = (html, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Isle overview</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f6f7f9}*{box-sizing:border-box}</style></head><body>${html}</body></html>`;

// This is the actual source shown in the diagram, not a second illustrative DSL.
const source = await read(new URL('counter.isle', directory));
const program = prepareProgram(requireIR(compile(source)));
const generated = program.get('Counter').generate();
const rendered = program.render('Counter', {});
assert.equal(generated.handlers.length, 1);
assert.deepEqual(generated.handlers[0].captureNames, ['count']);
assert.equal(generated.bindings.length, 1);
assert.match(rendered.html, /\bbutton\b/);
assert.deepEqual(rendered.snapshot[3], [0]);
const { run } = await import(`data:text/javascript,${encodeURIComponent(generated.handlers[0].code)}`);
const state = [...rendered.snapshot[3]], updates = [];
run(state, (key, value) => { state[key] = value; }, (key, value) => updates.push([key, value]));
assert.deepEqual(state, [1]);
assert.deepEqual(updates, [[generated.bindings[0].id, '1']]);
assert.equal(program.render('Counter', {}, { mode: 'ssr' }).snapshotHtml, '');
console.log('Counter: compile → SSR 0 → resume 1; one dynamic text patch');

const browser = await chromium.launch();
try {
  for (const { lang, stem, suffix, readmeFile } of [
    { lang: 'ja', stem: 'isle-overview', suffix: '', readmeFile: 'README.ja.md' },
    { lang: 'en', stem: 'isle-overview.en', suffix: '.en', readmeFile: 'README.md' },
  ]) {
    const html = await read(asset(`${stem}.fig.html`));
    const facts = JSON.parse(await read(asset(`${stem}.facts.json`)));
    const checking = process.argv.includes('--check');
    const recordPath = new URL(`render${suffix}.json`, directory);
    const savedRecord = checking ? JSON.parse(await read(recordPath)) : undefined;
    if (checking) {
      assert.equal(savedRecord.sourceHash, digest(html), 'Figure source changed; run just overview-build');
      assert.equal(savedRecord.codeHash, digest(source), 'Example changed; run just overview-build');
    }
    const codeHash = digest(source);
    const sourceHash = digest(html);
    const records = [];
    for (const variant of variants) {
      const page = await browser.newPage({ viewport: { width: variant.width, height: 900 }, deviceScaleFactor: 2 });
      await page.setContent(figurePage(html, lang));
      await page.evaluate(() => document.fonts.ready);
      const figure = page.locator('.isle-overview');
      assert.equal((await page.locator('[data-example]').innerText()).trim(), source.trim(), 'The pictured code must match the compiled example');
      const text = await figure.innerText();
      for (const label of facts.labels) assert.ok(text.includes(label), `Missing fact: ${label}`);
      for (const label of facts.forbidden) assert.ok(!text.includes(label), `Unsupported claim: ${label}`);
      const geometry = await figure.evaluate(el => ({ width: el.scrollWidth, frame: el.clientWidth }));
      assert.ok(geometry.width <= geometry.frame, 'The figure must not scroll horizontally');
      const path = asset(`${stem}.${variant.name}.png`);
      // Check the saved image's provenance, allowing different OS font rendering.
      const png = checking ? await readFile(path) : Buffer.from(await figure.screenshot({ animations: 'disabled' }));
      if (!checking) await writeFile(path, png);
      const record = { variant: variant.name, cssWidth: variant.width, sha256: digest(png), bytes: png.length };
      if (checking) assert.deepEqual(savedRecord.images.find(image => image.variant === variant.name), record, 'Saved image changed; run just overview-build');
      records.push(record);
      console.log(`Image ${variant.name}: facts present; compiled example matches; no horizontal overflow`);
      await page.close();
    }
    const record = { sourceHash, codeHash, images: records };
    if (checking) {
      assert.deepEqual(savedRecord, record, 'Image provenance is stale');
    } else {
      await writeFile(recordPath, JSON.stringify(record, null, 2) + '\n');
    }
    // A page-wide overflow test can miss code protruding into an adjacent card.
    const page = await browser.newPage();
    for (const width of [375, 620, 621, 728, 740, 741, 760, 1040]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>body{margin:0}</style>${html}`);
      const protruding = await page.locator('.io-step, .io-cap, .io-time').evaluateAll(cards => cards.filter(card => {
        const frame = card.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(card);
        return [...range.getClientRects()].some(text => text.right > frame.right + 1 || text.left < frame.left - 1);
      }).length);
      assert.equal(protruding, 0, `Text protrudes from a card at ${width}px`);
    }
    await page.close();
    // Exercise the actual README's picture markup, including the switch boundary.
    const preview = new URL(`dist/readme-preview${suffix}.html`, directory);
    const introduction = (await read(new URL(readmeFile, root))).split(/\n## (?:Quick start|はじめる)\n/)[0];
    await mkdir(new URL('dist/', directory), { recursive: true });
    await writeFile(new URL(`dist/figure-preview${suffix}.html`, directory), figurePage(html, lang));
    await writeFile(preview, `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><base href="${root.href}"><title>Isle README preview</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;color:#1f2328;background:white;font:16px/1.7 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:24px}img{display:block;max-width:100%;height:auto}a{color:#0550ae}code{font-size:.9em}h1,h2{line-height:1.4}@media(prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}a{color:#79c0ff}}</style></head><body><main>${marked.parse(introduction)}</main></body></html>`);
    const readme = await browser.newPage();
    for (const width of [375, 760, 761, 1040]) {
      await readme.setViewportSize({ width, height: 900 });
      await readme.goto(preview.href);
      const image = readme.locator('picture img');
      await image.evaluate(el => el.decode());
      const actual = await image.evaluate(el => ({ source: el.currentSrc, width: el.naturalWidth, alt: el.alt }));
      assert.ok(actual.source.endsWith(`${stem}.${width <= 760 ? 'mobile' : 'desktop'}.png`), 'README must select the right image');
      assert.ok(actual.width > 0 && actual.alt.includes('resume'), 'README image must load with explanatory alt text');
      if (width === 375 || width === 1040) await readme.screenshot({ path: new URL(`dist/readme${suffix}-${width}.png`, directory).pathname, fullPage: true });
    }
    await readme.close();
    console.log('README picture: mobile/desktop switch checked at 375, 760, 761, 1040px');
  }
} finally {
  await browser.close();
}
console.log('README overview: verified');
