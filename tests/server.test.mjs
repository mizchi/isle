import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionHandler } from '../lib/server.mjs';
import { compileFile, requireIR } from '../lib/compiler.mjs';

const ir = requireIR(await compileFile(new URL('../examples/counter/app.isle', import.meta.url)));
function fixture() {
  const documents = new Map([['a', { id: 'a', title: 'Before', owner: 'alice' }], ['b', { id: 'b', title: 'Other', owner: 'bob' }]]);
  let prepare = async () => undefined;
  const host = {
    context: () => ({ subject: 'alice', tenant: 'demo' }),
    policies: { 'policy.documentEditor': (context, target) => documents.get(target)?.owner === context.subject },
    operations: { 'documents.rename': { policy: 'policy.documentEditor', effects: ['db.write'],
      prepare: (...args) => prepare(...args),
      commit: ({ permit, args }) => {
        const document = documents.get(permit.target);
        document.title = args[1];
        return { id: document.id, title: document.title };
      } } },
  };
  return { documents, host, setPrepare: fn => { prepare = fn; }, handle: createActionHandler(ir, host) };
}
const request = (body, origin = 'https://app.test') => new Request('https://app.test/__isle/action/renameDocument', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('direct RPC request validates and authorizes resource on the server', async () => {
  const f = fixture();
  assert.equal((await f.handle(request({ id: 'b', title: 'stolen' }))).status, 403);
  assert.equal(f.documents.get('b').title, 'Other');
  const response = await f.handle(request({ id: 'a', title: 'After' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, value: { id: 'a', title: 'After' } });
});

test('wire identity cannot replace the request principal and cross-origin writes are refused', async () => {
  const f = fixture();
  assert.equal((await f.handle(request({ id: 'b', title: 'stolen', subject: 'bob' }))).status, 400);
  assert.equal((await f.handle(request({ id: 'a', title: 'bad' }, 'https://evil.test'))).status, 403);
});

test('revocation while async prepare waits is checked before commit', async () => {
  const f = fixture();
  f.setPrepare(async () => { f.documents.get('a').owner = 'bob'; });
  assert.equal((await f.handle(request({ id: 'a', title: 'bad' }))).status, 403);
  assert.equal(f.documents.get('a').title, 'Before');
});

test('response schema rejects accidental extra fields and hides adapter errors', async () => {
  const f = fixture();
  f.host.operations['documents.rename'].commit = () => ({ id: 'a', title: 'ok', secret: 'server-only' });
  const response = await f.handle(request({ id: 'a', title: 'After' }));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes('server-only'));
});
