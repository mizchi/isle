import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR } from '../lib/compiler.mjs';
import { createValidator } from '../runtime/validation.mjs';
import { createActionHandler } from '../lib/server.mjs';

export const source = `schema Registration {
  email: string minLength(3) maxLength(80) format("email");
  confirmation: string sameAs(email);
  age: number min(18) max(120) integer();
  accepted: boolean equals(true);
}
view Registered { email: string; }
export server action register(input: Registration): Registered using request: RequestContext
  authorize grant = policy.signup(request, input.email)
  validate accounts.available effects { db.read }
  effects { db.write }
{ return await accounts.register(grant, input.email); }`;

test('schema rules produce the same deterministic field issues for a shared validator', () => {
  const schema = requireIR(compile(source)).schemas[0], validate = createValidator(schema);
  const valid = { email: 'a@example.com', confirmation: 'a@example.com', age: 21, accepted: true };
  assert.deepEqual(validate(valid), []);
  assert.deepEqual(validate({ ...valid, email: 'bad', confirmation: 'different', age: 17.5, accepted: false }), [
    { field: 'email', code: 'format' }, { field: 'confirmation', code: 'sameAs' },
    { field: 'age', code: 'min' }, { field: 'age', code: 'integer' }, { field: 'accepted', code: 'equals' },
  ]);
  schema.fields[0].constraints[0].value = 80;
  assert.deepEqual(validate(valid), [], 'the compiled validator owns its contract');
  for (const age of [NaN, Infinity, -0]) assert.deepEqual(validate({ ...valid, age }), [{ field: 'age', code: 'type' }]);
  assert.deepEqual(validate({ ...valid, unexpected: true }), [{ field: '', code: 'unknownField' }]);
});

test('schema checking rejects invalid rules, mismatched references and invalid patterns', () => {
  for (const [fields, code] of [
    ['x: number minLength(2);', 'E_SCHEMA_RULE'], ['x: string minLength(-1);', 'E_SCHEMA_RULE'],
    ['x: string sameAs(missing);', 'E_SCHEMA_REFERENCE'], ['x: string sameAs(y); y: number;', 'E_SCHEMA_REFERENCE'],
    ['x: string minLength(8) maxLength(2);', 'E_SCHEMA_RULE'], ['x: boolean equals("true");', 'E_SCHEMA_RULE'],
    ['x: string pattern("[");', 'E_SCHEMA_PATTERN'], ['x: string mystery(3);', 'E_SCHEMA_RULE'],
    ['x: string pattern("[a&&b]");', 'E_SCHEMA_PATTERN'],
    ['x: number equals(-0);', 'E_SCHEMA_RULE'],
  ]) {
    const result = compile(`schema Bad { ${fields} }`);
    assert.equal(result.ok, false, fields);
    assert.equal(result.diagnostics[0].code, code, JSON.stringify(result));
  }
});

test('public validator contracts reject malformed manual schemas', () => {
  for (const schema of [
    { fields: [{ name: 'x', type: 'object' }] },
    { fields: [{ name: 'x', type: 'number', constraints: [{ kind: 'minLength', value: 2 }] }] },
    { fields: [{ name: 'x', type: 'number', constraints: [{ kind: 'min', value: Infinity }] }] },
    { fields: [{ name: 'x', type: 'string' }, { name: 'x', type: 'string' }] },
  ]) assert.throws(() => createValidator(schema), /Invalid validation contract/);
});

test('native form posts are typed and still enforce cross-field rules', async () => {
  const f = fixture();
  const native = values => new Request('https://app.test/__isle/action/register', {
    method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
  assert.equal((await f.handle(native({ email: data.email, confirmation: 'different', age: '21', accepted: 'on' }))).status, 422);
  assert.equal((await f.handle(native({ email: data.email, confirmation: data.email, age: '21', accepted: 'on' }))).status, 200);
  assert.equal(f.commits, 1);
});

test('native multiline posts validate the same API value as browser FormData', async () => {
  const program = requireIR(compile(`schema Note { note: string maxLength(3); } view Written { note: string; }
    export server action write(input: Note): Written using request: RequestContext
    authorize grant = policy.note(request, input.note) effects { db.write }
    { return await notes.write(grant, input.note); }`));
  const handle = createActionHandler(program, {
    context: () => ({ subject: 'alice', tenant: 'demo' }), policies: { 'policy.note': () => true },
    operations: { 'notes.write': { policy: 'policy.note', effects: ['db.write'], commit: ({ args }) => ({ note: args[1] }) } },
  });
  const response = await handle(new Request('https://app.test/__isle/action/write', { method: 'POST',
    headers: { origin: 'https://app.test', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ note: 'a\r\nb' }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, value: { note: 'a\nb' } });
});

const data = { email: 'a@example.com', confirmation: 'a@example.com', age: 21, accepted: true };
const request = (body, mode = 'action') => new Request(`https://app.test/__isle/${mode}/register`, {
  method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify(body),
});
function fixture() {
  let commits = 0, allowed = true, validations = 0;
  let validate = async () => [];
  const host = { context: () => ({ subject: 'alice', tenant: 'demo' }),
    policies: { 'policy.signup': () => allowed },
    validators: { 'accounts.available': { effects: ['db.read'], validate: async args => { validations++; return validate(args); } } },
    operations: { 'accounts.register': { policy: 'policy.signup', effects: ['db.write'], commit: ({ args }) => { commits++; return { email: args[1] }; } } } };
  return { host, handle: createActionHandler(requireIR(compile(source)), host),
    setValidate(fn) { validate = fn; }, revoke() { allowed = false; },
    get commits() { return commits; }, get validations() { return validations; } };
}

test('direct requests enforce shared and asynchronous rules before writes', async () => {
  const f = fixture();
  const bad = await f.handle(request({ ...data, confirmation: 'other' }));
  assert.equal(bad.status, 422);
  assert.deepEqual((await bad.json()).issues, [{ field: 'confirmation', code: 'sameAs' }]);
  assert.equal(f.validations, 0); assert.equal(f.commits, 0);
  f.setValidate(async ({ input, permit }) => {
    assert.equal(permit.subject, 'alice'); assert.equal(Object.isFrozen(input), true);
    return [{ field: 'email', code: 'taken' }];
  });
  assert.equal((await f.handle(request(data))).status, 422);
  assert.equal(f.commits, 0);
});

test('validation requests cannot commit, and a later submission revalidates', async () => {
  const f = fixture();
  assert.deepEqual(await (await f.handle(request(data, 'validate'))).json(), { ok: true });
  assert.equal(f.commits, 0); assert.equal(f.validations, 1);
  assert.equal((await f.handle(request(data))).status, 200);
  assert.equal(f.commits, 1); assert.equal(f.validations, 2);
});

test('async validation cannot reveal results after authorization is revoked', async () => {
  const f = fixture();
  f.setValidate(async () => { f.revoke(); return [{ field: 'email', code: 'taken' }]; });
  const response = await f.handle(request(data, 'validate'));
  assert.equal(response.status, 403); assert.equal(f.commits, 0);
  assert.equal((await response.text()).includes('taken'), false);
});

test('missing, effectful or malformed validator adapters fail closed', async () => {
  for (const mutate of [
    f => { delete f.host.validators['accounts.available']; },
    f => { f.host.validators['accounts.available'].effects = ['db.write']; },
    f => { f.setValidate(async () => [{ field: 'private', code: 'secret' }]); },
  ]) {
    const f = fixture(); mutate(f);
    const response = await f.handle(request(data));
    assert.equal(response.status, 500); assert.equal(f.commits, 0);
    assert.equal((await response.text()).includes('secret'), false);
  }
});
