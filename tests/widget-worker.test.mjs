import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerHandler } from '../lib/worker.mjs';
import { createActionHandler } from '../lib/server.mjs';

const ir = { schemas: [
  { name: 'Input', kind: 'schema', fields: [{ name: 'id', type: 'string' }, { name: 'hours', type: 'number', constraints: [{ kind: 'min', value: 0 }] }] },
  { name: 'Output', kind: 'view', fields: [{ name: 'hours', type: 'number' }] },
], actions: [{ name: 'savePlan', inputSchema: 'Input', outputSchema: 'Output', policy: { name: 'policy.planEditor', targetField: 'id' },
  effects: ['db.write'], validation: null, call: { name: 'plans.save', args: [{ kind: 'grant' }, { kind: 'input', field: 'hours' }] } }] };
function fixture(options) {
  const state = { commits: 0, assets: 0 };
  const host = { context: () => ({ subject: 'public-demo', tenant: 'widget' }), policies: { 'policy.planEditor': (_, id) => id === 'task-00' },
    operations: { 'plans.save': { policy: 'policy.planEditor', effects: ['db.write'], commit: ({ args }) => { state.commits++; return { hours: args[1] }; } } } };
  return { state, host, worker: createWorkerHandler(ir, host, options), env: { ASSETS: { async fetch(request) { state.assets++; return new Response(new URL(request.url).pathname); } } } };
}
const request = (path = '/__isle/action/savePlan', { origin = 'https://widget.example', input = { id: 'task-00', hours: 3 } } = {}) =>
  new Request(`https://widget.example${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });

test('worker delegates static requests to its asset binding and restricts unrelated methods', async () => {
  const { worker, env, state } = fixture();
  const response = await worker.fetch(new Request('https://widget.example/assets/main.js'), env);
  assert.equal(response.status, 200); assert.equal(await response.text(), '/assets/main.js');
  assert.equal((await worker.fetch(new Request('https://widget.example/', { method: 'POST' }), env)).status, 405);
  assert.equal(state.assets, 1);
});

test('default RPC retains same-origin, policy and validation checks', async () => {
  const { worker, env, state } = fixture();
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, value: { hours: 3 } });
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await worker.fetch(request(undefined, { origin: 'https://publisher.example' }), env)).status, 403);
  assert.equal((await worker.fetch(request(undefined, { input: { id: 'other', hours: 3 } }), env)).status, 403);
  assert.equal((await worker.fetch(request(undefined, { input: { id: 'task-00', hours: -1 } }), env)).status, 422);
  assert.equal((await worker.fetch(request('/__isle/action/missing'), env)).status, 404);
  assert.equal(state.commits, 1); assert.equal(state.assets, 0);
});

test('readonly validation never invokes a commit through the worker adapter', async () => {
  const { worker, env, state } = fixture();
  assert.equal((await worker.fetch(request('/__isle/validate/savePlan'), env)).status, 200);
  assert.equal(state.commits, 0);
});

test('public widget CORS permits cookie-free requests, preserving policy and shape checks', async () => {
  const { worker, env, state } = fixture({ allowedOrigins: '*' });
  const response = await worker.fetch(request(undefined, { origin: 'https://publisher.example' }), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  const invalid = await worker.fetch(request(undefined, { origin: 'https://publisher.example', input: { id: 'task-00', hours: -1 } }), env);
  assert.equal(invalid.status, 422); assert.equal(invalid.headers.get('access-control-allow-origin'), '*');
  for (const origin of ['null', 'https://evil.example/path']) assert.equal((await worker.fetch(request(undefined, { origin }), env)).status, 403);
  for (const header of ['cookie', 'authorization']) {
    const unsafe = request(undefined, { origin: 'https://publisher.example' }); unsafe.headers.set(header, 'secret');
    assert.equal((await worker.fetch(unsafe, env)).status, 403);
  }
  assert.equal(state.commits, 1);
});

test('CORS preflight checks origins, method and requested headers without invoking an operation', async () => {
  const { worker, env, state } = fixture({ allowedOrigins: ['https://publisher.example'] });
  const preflight = (origin = 'https://publisher.example', method = 'POST', headers = 'content-type') => new Request('https://widget.example/__isle/action/savePlan', {
    method: 'OPTIONS', headers: { origin, 'access-control-request-method': method, 'access-control-request-headers': headers },
  });
  const response = await worker.fetch(preflight(), env);
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), 'https://publisher.example');
  assert.match(response.headers.get('vary'), /Origin/); assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
  assert.equal((await worker.fetch(preflight('https://other.example'), env)).status, 403);
  assert.equal((await worker.fetch(preflight(undefined, 'DELETE'), env)).status, 405);
  assert.equal((await worker.fetch(preflight(undefined, undefined, 'authorization'), env)).status, 403);
  const allowed = await worker.fetch(request(undefined, { origin: 'https://publisher.example' }), env);
  assert.equal(allowed.status, 200); assert.equal(state.commits, 1);
});

test('portable action handler owns CORS and custom routing; worker only adapts assets', async () => {
  const options = { allowedOrigins: '*', actionBasePath: '/package/api/' };
  const { host, state, worker, env } = fixture(options), handle = createActionHandler(ir, host, options);
  const url = 'https://widget.example/package/api/action/savePlan';
  const preflight = () => new Request(url, { method: 'OPTIONS', headers: { origin: 'https://publisher.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  for (const handler of [handle, request => worker.fetch(request, env)]) {
    const response = await handler(preflight()); assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const post = new Request(url, { method: 'POST', headers: { origin: 'https://publisher.example', 'content-type': 'application/json' }, body: JSON.stringify({ id: 'task-00', hours: 4 }) });
    const saved = await handler(post); assert.equal(saved.status, 200); assert.equal(saved.headers.get('access-control-allow-origin'), '*');
  }
  assert.equal(state.commits, 2); assert.equal(state.assets, 0);
  assert.throws(() => createActionHandler(ir, host, { actionBasePath: '/api' }), /path/);
});
