import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWidget } from '../runtime/widget-mount.mjs';
import { runtimeIdentity } from '../runtime/runtime-identity.mjs';

test('abort releases root ownership before an uncancellable asynchronous stage finishes', async () => {
  let finish, requests = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const root = { ownerDocument: { defaultView: { fetch() { return ++requests === 1 ? pending : Promise.reject(new Error('next request reached transport')); } } } };
  const abort = new AbortController();
  const first = mountWidget(root, 'https://widget.example/card.json', { signal: abort.signal });
  abort.abort();
  const next = mountWidget(root, 'https://widget.example/card.json');
  try { await assert.rejects(next, /next request reached transport/); }
  finally {
    finish(Response.json({ version: 2, runtime: runtimeIdentity, html: '', module: null, preload: [] }));
    await assert.rejects(first, { name: 'AbortError' });
  }
});

test('mismatched descriptor is rejected before parsing markup or importing code', async () => {
  const root = { ownerDocument: { defaultView: { fetch() { return Promise.resolve(Response.json({ version: 2, runtime: { ...runtimeIdentity, version: `${runtimeIdentity.version}-other` }, html: '<p>Never inserted</p>', module: './app.js', preload: [] })); } } } };
  await assert.rejects(mountWidget(root, 'https://widget.example/card.json'), /version mismatch/);
});

test('failed mount does not retain ownership of a reusable root', async () => {
  const root = { ownerDocument: { defaultView: { fetch() { return Promise.reject(new Error('offline')); } } } };
  for (let i = 0; i < 2; i++) await assert.rejects(mountWidget(root, 'https://widget.example/card.json'), /offline/);
});
