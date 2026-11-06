import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, requireIR, explain } from '../lib/compiler.mjs';
import { createActionHandler } from '../lib/server.mjs';
import { generateComponent } from '../lib/codegen.mjs';

const action = (name, validation = '') => `export server action ${name}(input: Email): Saved
  using request: RequestContext
  authorize grant = policy.${name}(request, input.email)
  ${validation}
  effects { db.write }
{ return await accounts.${name}(grant, input.email); }`;
const source = `schema Email { email: string format("email"); } view Saved { email: string; }
${action('signup', 'validate accounts.available effects { db.read }')}
${action('edit', 'validate accounts.editable effects { db.read }')}
${action('saveDraft')}
export client component Signup() {
  <form schema="Email" submit="signup" aria-label="Signup">
    <label>Email<input name="email" /></label><button type="submit">Save</button>
  </form>
}
export client component Draft() {
  <form schema="Email" submit="saveDraft" aria-label="Draft">
    <label>Email<input name="email" /></label><button type="submit">Save</button>
  </form>
}`;

test('one schema has independent action validation contracts and client capabilities', () => {
  const ir = requireIR(compile(source));
  assert.ok(ir.schemas.every(schema => !Object.hasOwn(schema, 'validation')));
  assert.deepEqual(ir.actions.map(action => action.validation), [
    { name: 'accounts.available', effects: ['db.read'] },
    { name: 'accounts.editable', effects: ['db.read'] }, null,
  ]);
  const handlers = ir.components.map(component => generateComponent(component).handlers[0]);
  assert.deepEqual(handlers.map(handler => handler.form.asyncValidation), [true, false]);
  assert.doesNotMatch(JSON.stringify(handlers), /accounts\.|db\.read|policy\./);
  assert.deepEqual(explain(ir).boundaries[0].validation, ir.actions[0].validation);
});

test('schema-scoped validation and effectful action validators receive explicit diagnostics', () => {
  for (const [text, code] of [
    ['schema Email { email: string; } async validate accounts.available effects { db.read }', 'E_SCHEMA_VALIDATION'],
    [source.replace('validate accounts.available effects { db.read }', 'validate accounts.available effects { db.write }'), 'E_VALIDATION_EFFECT'],
  ]) {
    const result = compile(text);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, code);
  }
});

test('action-specific validation runs only after its own policy, including direct requests', async () => {
  const ir = requireIR(compile(source)), calls = [], allowed = { signup: true, edit: false, saveDraft: true };
  const host = {
    context: () => ({ subject: 'alice', tenant: 'demo' }),
    policies: Object.fromEntries(Object.keys(allowed).map(name => [`policy.${name}`, () => { calls.push(`policy.${name}`); return allowed[name]; }])),
    validators: {
      'accounts.available': { effects: ['db.read'], validate: ({ permit }) => {
        calls.push(permit.operation); return [{ field: 'email', code: 'taken' }];
      } },
      'accounts.editable': { effects: ['db.read'], validate: () => { calls.push('editable'); return []; } },
    },
    operations: Object.fromEntries(Object.keys(allowed).map(name => [`accounts.${name}`, {
      policy: `policy.${name}`, effects: ['db.write'], commit: ({ args }) => { calls.push(`commit.${name}`); return { email: args[1] }; },
    }])),
  };
  const handle = createActionHandler(ir, host);
  const request = (name, mode = 'action') => new Request(`https://app.test/__isle/${mode}/${name}`, {
    method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com' }),
  });
  assert.equal((await handle(request('signup', 'validate'))).status, 422);
  assert.deepEqual(calls.splice(0), ['policy.signup', 'accounts.signup', 'policy.signup']);
  assert.equal((await handle(request('edit', 'validate'))).status, 403);
  assert.deepEqual(calls.splice(0), ['policy.edit']);
  assert.equal((await handle(request('saveDraft'))).status, 200);
  assert.deepEqual(calls.splice(0), ['policy.saveDraft', 'policy.saveDraft', 'commit.saveDraft']);
  allowed.edit = true;
  assert.equal((await handle(request('edit'))).status, 200);
  assert.deepEqual(calls, ['policy.edit', 'editable', 'policy.edit', 'policy.edit', 'commit.edit']);
});
