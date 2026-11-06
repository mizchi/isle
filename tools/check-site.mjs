import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
import { walk } from '../site/build.mjs';
import { hasFragment } from '../site/config.mjs';
const directory = resolve('dist/site');
const metadata = JSON.parse(await readFile(resolve(directory, 'site.json'), 'utf8'));
const failures = [], htmlFiles = (await walk(directory)).filter(file => file.endsWith('.html'));
let checked = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
    const target = match[1].replaceAll('&amp;', '&');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    const path = file.slice(directory.length).replace(/\/index\.html$/, '/');
    const url = new URL(target, 'https://site.invalid' + metadata.base.slice(0, -1) + path);
    if (!url.pathname.startsWith(metadata.base)) { failures.push({ file, target, reason: 'outside Pages base' }); continue; }
    let destination = resolve(directory, decodeURIComponent(url.pathname.slice(metadata.base.length)) || 'index.html');
    try {
      if ((await stat(destination)).isDirectory()) destination = resolve(destination, 'index.html');
      await stat(destination); checked++;
      if (url.hash && destination.endsWith('.html')) {
        const content = await readFile(destination, 'utf8');
        if (!hasFragment(content, url.hash, metadata.hashRoutes?.[relative(directory, destination).replaceAll('\\', '/')])) failures.push({ file, target, reason: 'missing anchor' });
      }
    } catch { failures.push({ file, target, reason: 'missing file' }); }
  }
  if (file.includes('/docs/')) assert.doesNotMatch(html, /<script\b[^>]*type="module"/, 'Documentation must remain static');
}
await writeFile(resolve(directory, 'link-check.json'), JSON.stringify({ pages: htmlFiles.length, checked, failures }, null, 2));
console.log(JSON.stringify({ pages: htmlFiles.length, checked, failures }, null, 2));
if (failures.length) process.exitCode = 1;
