import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { summarizeTransfers } from './metrics.mjs';

test('counts inline loader and state once as HTML, and compresses each response separately', () => {
  const html = '<html><script>loader()</script><script type="application/json">{"count":37}</script></html>';
  const js = 'export const count = 37;';
  const result = summarizeTransfers([
    { url: '/app/', phase: 'initial', kind: 'html', body: Buffer.from(html) },
    { url: '/app/main.js', phase: 'initial', kind: 'js', body: Buffer.from(js) },
  ]);
  assert.equal(result.phases.initial.html.raw, Buffer.byteLength(html));
  assert.equal(result.phases.initial.js.raw, Buffer.byteLength(js));
  assert.equal(result.total.gzip, gzipSync(html, { level: 6 }).length + gzipSync(js, { level: 6 }).length);
});

test('deduplicates preloaded modules by URL and attributes them to their first phase', () => {
  const asset = { url: '/app/lazy.js', kind: 'js', body: Buffer.from('export const x=1;') };
  const result = summarizeTransfers([
    { ...asset, phase: 'initial' },
    { ...asset, phase: 'counter-first' },
    { url: '/__isle/action/renameDocument', kind: 'rpc', phase: 'remote-first', body: Buffer.from('{"ok":true}') },
  ]);
  assert.equal(result.phases.initial.js.count, 1);
  assert.equal(result.phases['counter-first'].js.count, 0);
  assert.equal(result.total.count, 1);
  assert.equal(result.phases['remote-first'].rpc.count, 1);
});

test('records repeated RPC responses individually, outside the asset total', () => {
  const rpc = { url: '/__isle/action/renameDocument', kind: 'rpc', phase: 'remote-first', body: Buffer.from('{"ok":true}') };
  const result = summarizeTransfers([rpc, rpc]);
  assert.equal(result.phases['remote-first'].rpc.count, 2);
  assert.equal(result.total.gzip, 0);
});
