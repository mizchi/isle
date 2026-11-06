import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequester } from '../runtime/request.mjs';

function fixture() {
  const calls = [];
  return { calls, document: { baseURI: 'https://publisher.example/articles/page', defaultView: {
    fetch: (url, options) => { calls.push({ url, options }); return Promise.resolve(Response.json({ ok: true })); },
  } } };
}
test('standalone requests retain same-origin credentials and the standard action route', async () => {
  const { document, calls } = fixture();
  await createRequester(document)('action', 'save', { hours: 3 });
  assert.equal(calls[0].url, 'https://publisher.example/__isle/action/save');
  assert.equal(calls[0].options.credentials, 'same-origin');
});
test('widget requests use the explicit provider without ambient credentials for action and validation', async () => {
  const { document, calls } = fixture(), signal = new AbortController().signal;
  const request = createRequester(document, { actionBaseURL: 'https://widget.example/__isle/' });
  await request('validate', 'create', { project: 'Work' }, signal);
  await request('action', 'save', { hours: 3 });
  assert.equal(calls[0].url, 'https://widget.example/__isle/validate/create');
  assert.equal(calls[1].url, 'https://widget.example/__isle/action/save');
  for (const { options } of calls) assert.equal(options.credentials, 'omit');
  assert.equal(calls[0].options.signal, signal);
  for (const actionBaseURL of ['javascript:alert(1)', 'https://widget.example/no-slash', 'https://user:pass@widget.example/']) {
    assert.throws(() => createRequester(document, { actionBaseURL }), /base URL/);
  }
});
