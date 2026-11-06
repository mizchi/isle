import { validateShape } from './shape.mjs';
import { createValidator, checkIssues } from '../runtime/validation.mjs';
import { decodeFormData } from '../runtime/form-data.mjs';
import { toSchemaIR } from './schema.mjs';
import { createActionHttp, actionResponse as response } from './action-http.mjs';

// Trusted prepare is effect-free; commit is synchronous in-memory mutation.
// Real database adapters must provide atomic authorization/write semantics.
export function createActionHandler(ir, host, options = {}) {
  ir = { ...ir, schemas: ir.schemas.map(toSchemaIR) };
  const schemas = new Map(ir.schemas.map(schema => [schema.name, schema.fields]));
  const actions = new Map(ir.actions.map(action => [action.name, action]));
  const contracts = new Map(ir.schemas.map(schema => [schema.name, { schema, validate: createValidator(schema) }]));
  return createActionHttp(async (request, route) => {
    const type = request.headers.get('content-type') ?? '';
    const json = type.startsWith('application/json');
    const form = type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data;');
    if (!json && !form) return response(415, { ok: false, error: 'unsupported_media_type' });
    const action = actions.get(route.name);
    if (!action) return response(404, { ok: false, error: 'unknown_action' });
    const validationOnly = route.mode === 'validate';
    const contract = contracts.get(action.inputSchema);
    let input;
    try {
      const body = await request.text();
      if (body.length > 16_384) return response(413, { ok: false, error: 'input_too_large' });
      if (json) input = validateShape(JSON.parse(body), schemas.get(action.inputSchema) ?? [], 'input');
      else {
        const decoded = decodeFormData(contract.schema, await new Request(request.url, { method: 'POST', headers: { 'content-type': type }, body }).formData());
        if (!decoded.ok) return response(422, { ok: false, error: 'validation_failed', issues: decoded.issues });
        input = decoded.value;
      }
    } catch { return response(400, { ok: false, error: 'invalid_input' }); }
    const issues = contract.validate(input);
    if (issues.length) return response(422, { ok: false, error: 'validation_failed', issues });
    try {
      const context = await host.context(request);
      if (!context || typeof context.subject !== 'string' || typeof context.tenant !== 'string') return response(401, { ok: false, error: 'unauthenticated' });
      const policy = host.policies[action.policy.name], operation = host.operations[action.call.name];
      if (!policy || !operation || operation.policy !== action.policy.name || !operation.effects.every(effect => action.effects.includes(effect))) throw new Error('Invalid trusted adapter');
      const target = input[action.policy.targetField];
      if (!await policy(context, target)) return response(403, { ok: false, error: 'forbidden' });
      const permit = Object.freeze({ subject: context.subject, tenant: context.tenant, target, operation: action.call.name });
      const declaration = action.validation;
      if (declaration) {
        const validator = host.validators?.[declaration.name];
        if (!validator || typeof validator.validate !== 'function' || !Array.isArray(validator.effects) ||
          !validator.effects.every(effect => declaration.effects.includes(effect))) throw new Error('Invalid validation adapter');
        const problems = checkIssues(await validator.validate({ input: Object.freeze({ ...input }), context, permit, signal: request.signal }), contract.schema.fields);
        const authorized = policy(context, target);
        if (authorized && typeof authorized.then === 'function') throw new Error('Validation recheck must be synchronous');
        if (!authorized) return response(403, { ok: false, error: 'forbidden' });
        if (problems.length) return response(422, { ok: false, error: 'validation_failed', issues: problems });
      }
      if (validationOnly) return response(200, { ok: true });
      const args = action.call.args.map(arg => arg.kind === 'grant' ? permit : input[arg.field]);
      const prepared = await operation.prepare?.({ context, permit, args });
      const allowed = policy(context, target);
      if (allowed && typeof allowed.then === 'function') throw new Error('Prototype commit policy must be synchronous');
      if (!allowed) return response(403, { ok: false, error: 'forbidden' });
      if (operation.commit.constructor.name === 'AsyncFunction') throw new Error('Prototype commit must be synchronous');
      const value = operation.commit({ context, permit, args, prepared });
      if (value && typeof value.then === 'function') throw new Error('Prototype commit returned Promise');
      validateShape(value, schemas.get(action.outputSchema) ?? [], 'response');
      if (contracts.get(action.outputSchema).validate(value).length) throw new Error('Invalid response constraints');
      return response(200, { ok: true, value });
    } catch { return response(500, { ok: false, error: 'internal_error' }); }
  }, options);
}
