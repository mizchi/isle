import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('layout CLI loads CSS relative to its sidecar and fails closed with structured diagnostics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-'));
  const run = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', 'layout', ...args], { encoding: 'utf8' });
  try {
    const source = join(directory, 'app.isle'), config = join(directory, 'layout.json'), css = join(directory, 'app.css');
    await writeFile(source, 'component Panel() { <main class="panel">Content</main> }');
    await writeFile(config, JSON.stringify({ component: 'Panel', css: './app.css', viewport: { min: 320, max: 1000 }, boxes: { '.panel': { minInlineSize: 300 } } }));
    await writeFile(css, '.panel { padding: 16px; }');
    let result = run(source, config);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'violated');
    await writeFile(css, '.panel { padding: 8px; }');
    result = run(source, config);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'verified');
    await writeFile(css, '.panel { width: var(--host-size); }');
    result = run(source, config);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).status, 'unknown');
    await writeFile(source, 'component Invalid() { await nope(); }');
    result = run(source, config);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).ok, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('layout CLI loads ordered reset files relative to the sidecar and preserves their diagnostics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-layout-reset-cli-'));
  const run = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', 'layout', ...args], { encoding: 'utf8' });
  try {
    const source = join(directory, 'app.isle'), config = join(directory, 'layout.json'), reset = join(directory, 'reset.css');
    await writeFile(source, 'component Panel() { <main class="panel">Content</main> }');
    await writeFile(join(directory, 'app.css'), '.panel {width:100%;padding:16px;}');
    await writeFile(reset, 'html {box-sizing:border-box;} *,*::before,*::after {box-sizing:inherit;margin:0;}');
    await writeFile(config, JSON.stringify({ css: './app.css', reset: ['./reset.css'], ancestors: [{tag:'html'}, {tag:'body'}], viewport:{min:320,max:640}, boxes:{'.panel':{minInlineSize:100}} }));
    let result = run(source, config);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).sizes[0].boxSizing, 'border-box');
    // Relative units are outside the checked subset: Unknown, attributed to the reset file.
    await writeFile(reset, '* {padding:1em;}');
    result = run(source, config);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).diagnostics[0].css.file, reset);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
