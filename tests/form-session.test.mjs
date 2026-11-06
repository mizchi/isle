import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFormData } from '../runtime/form-data.mjs';
import { createFormSession } from '../runtime/form-session.mjs';

const schema = { name: 'Example', fields: [
  { name: 'email', type: 'string', constraints: [{ kind: 'minLength', value: 3 }] },
  { name: 'age', type: 'number', constraints: [{ kind: 'min', value: 18 }] }, { name: 'accepted', type: 'boolean' },
] };
const value = { email: 'a@example.com', age: 21, accepted: true };

test('typed FormData decodes primitive values and rejects duplicate, missing and non-string entries', () => {
  assert.deepEqual(decodeFormData(schema, [['email', 'a@example.com'], ['age', '21'], ['accepted', 'on']]), { ok: true, value });
  assert.deepEqual(decodeFormData(schema, [['email', 'a@example.com'], ['age', '21']]), { ok: true, value: { ...value, accepted: false } });
  for (const entries of [
    [['email', 'a@example.com'], ['age', '']], [['email', 'a@example.com'], ['age', '0x10']],
    [['email', 'a@example.com'], ['age', '-0']], [['email', 'a@example.com'], ['age', 'Infinity']],
    [['email', 'a@example.com'], ['age', '21'], ['age', '22']], [['email', new Blob(['file'])], ['age', '21']],
    [['email', 'a@example.com'], ['age', '21'], ['subject', 'bob']],
  ]) assert.equal(decodeFormData(schema, entries).ok, false);
});

test('native POST line endings and DOM FormData produce the same string value', () => {
  const text = { fields: [{ name: 'note', type: 'string' }] };
  assert.deepEqual(decodeFormData(text, [['note', 'a\r\nb']]), decodeFormData(text, [['note', 'a\nb']]));
});

test('stale asynchronous validation cannot replace newer field results', async () => {
  const jobs = [], session = createFormSession({ schema, asyncValidation: true }, value, {
    validate: (data, signal) => new Promise(resolve => jobs.push({ data, signal, resolve })), submit: async () => ({ ok: true, value: {} }),
  });
  const a = session.update(value, 'email');
  const b = session.update({ ...value, email: 'b@example.com' }, 'email');
  assert.equal(jobs[0].signal.aborted, true);
  jobs[1].resolve([]); await b;
  jobs[0].resolve([{ field: 'email', code: 'taken' }]); await a;
  assert.deepEqual(session.snapshot().issues, []);
  assert.equal(session.snapshot().values.email, 'b@example.com');
});

test('submission uses its typed input, prevents duplicate writes and maps server field errors', async () => {
  let requests = 0;
  const pending = Promise.withResolvers();
  const session = createFormSession({ schema }, value, { submit: async () => { requests++; return pending.promise; } });
  const first = session.submit(value);
  assert.equal(session.snapshot().pending, true);
  await session.submit(value);
  assert.equal(requests, 1);
  pending.resolve({ ok: false, issues: [{ field: 'email', code: 'taken' }] }); await first;
  assert.equal(session.snapshot().pending, false);
  assert.deepEqual(session.snapshot().issues, [{ field: 'email', code: 'taken' }]);
});

test('reset restores defaults, clears dirty/touched and discards late submit completion', async () => {
  const pending = Promise.withResolvers();
  let successes = 0, signal;
  const defaults = { email: '', age: 21, accepted: false };
  const session = createFormSession({ schema }, defaults, { submit: (_, current) => { signal = current; return pending.promise; }, success: () => successes++ });
  await session.update(value, 'email');
  const submitted = session.submit(value);
  assert.equal(session.snapshot().dirty, true);
  assert.ok(session.snapshot().touched.includes('email'));
  session.reset();
  assert.equal(signal.aborted, true);
  assert.deepEqual(session.snapshot(), { values: defaults, issues: [], touched: [], dirty: false, pending: false, validating: false, status: '' });
  pending.resolve({ ok: true, value: { secret: 'old' } }); await submitted;
  assert.equal(successes, 0);
  assert.deepEqual(session.snapshot().values, defaults);
});

test('edits made during submit retain their values and do not receive old server errors', async () => {
  const pending = Promise.withResolvers();
  const session = createFormSession({ schema }, value, { submit: () => pending.promise });
  const submitted = session.submit(value);
  await session.update({ ...value, email: 'new@example.com' }, 'email');
  pending.resolve({ ok: false, issues: [{ field: 'email', code: 'taken' }] }); await submitted;
  assert.deepEqual(session.snapshot().issues, []);
  assert.equal(session.snapshot().values.email, 'new@example.com');
});

test('a blur with unchanged values does not supersede an in-flight submission', async () => {
  const pending = Promise.withResolvers();
  const session = createFormSession({ schema }, value, { submit: () => pending.promise });
  const submitted = session.submit(value);
  await session.update(value, 'email');
  pending.resolve({ ok: true, value: {} }); await submitted;
  assert.equal(session.snapshot().status, 'Saved.');
});

test('invalid input does not submit and disposal prevents late validation changes', async () => {
  let calls = 0;
  const pending = Promise.withResolvers();
  const session = createFormSession({ schema, asyncValidation: true }, value, {
    validate: () => pending.promise, submit: async () => { calls++; return { ok: true, value: {} }; },
  });
  await session.submit({ ...value, age: 17 });
  assert.equal(calls, 0);
  const validation = session.update(value, 'email');
  session.dispose(); const after = session.snapshot();
  pending.resolve([{ field: 'email', code: 'taken' }]); await validation;
  assert.deepEqual(session.snapshot(), after);
});
