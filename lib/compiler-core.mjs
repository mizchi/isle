import { optimizeControls } from './control-optimize.mjs';
import { checkControlContracts } from './control-contracts.mjs';
import { compile as compileNative, checkDependencies as checkDependenciesNative } from '../_build/js/release/build/compiler/compiler.js';
import { prepareProgram } from './codegen.mjs';
import { checkPatterns } from './form-contracts.mjs';
import { lowerSchemaForms } from './schema-forms.mjs';
import { compilePattern } from '../runtime/validation.mjs';
import { lowerComposition } from './composition.mjs';
import { safeHref } from './html.mjs';
import { childrenOf } from './template.mjs';
import {lowerControlSyntax} from './control-syntax.mjs';

/** @returns {import('./contracts.d.ts').CompileResult} */
export function compile(source) {
  let lowered;
  try {lowered=lowerControlSyntax(source);} catch(error) {
    if(!error.code?.startsWith('E_CONTROL_')) throw error;
    return {ok:false,diagnostics:[error]};
  }
  const result = JSON.parse(compileNative(lowered.source));
  lowered.restore(result);
  if (!result.ok) return result;
  const composition = lowerComposition(result.ir);
  if (composition.length) return { ok: false, diagnostics: composition };
  const diagnostics = result.ir.components.flatMap(component => checkPatterns(component.root));
  function checkLinks(node) {
    for (const attribute of node.attributes ?? []) if (attribute.name === 'href' && attribute.value.kind === 'string') {
      try { safeHref(attribute.value.value); } catch {
        diagnostics.push({ code: 'E_LINK', message: 'Unsafe link URL', hint: 'Use relative, HTTP(S), mailto or tel destinations without control characters.', ...(node.source ?? { start: 0, end: 0 }) });
      }
    }
    childrenOf(node).forEach(checkLinks);
  }
  result.ir.components.forEach(component => checkLinks(component.root));
  for (const schema of result.ir.schemas) for (const field of schema.fields) for (const rule of field.constraints ?? []) {
    if (rule.kind === 'pattern') {
      try { new RegExp(rule.value, 'v'); compilePattern(rule.value); } catch {
        diagnostics.push({ code: 'E_SCHEMA_PATTERN', message: 'Invalid shared schema pattern', hint: 'Use an ES2023 Unicode pattern that is also valid in HTML. Set operations and inline flags are outside this subset.', ...rule.source });
      }
    }
    if (typeof rule.value === 'number' && (!Number.isFinite(rule.value) || (['minLength', 'maxLength'].includes(rule.kind) && !Number.isSafeInteger(rule.value)))) {
      diagnostics.push({ code: 'E_SCHEMA_RULE', message: 'Invalid numeric schema constraint', hint: 'Use a finite bound or safe integer length.', ...rule.source });
    }
  }
  if (!diagnostics.length) diagnostics.push(...lowerSchemaForms(result.ir));
  if (!diagnostics.length) diagnostics.push(...checkControlContracts(result.ir));
  if (!diagnostics.length) result.ir.components = result.ir.components.map(optimizeControls);
  return diagnostics.length ? { ok: false, diagnostics } : result;
}
/** @param {import('./contracts.d.ts').DependencyGraph} graph @returns {import('./contracts.d.ts').DependencyCheckResult} */
export function checkDependencies(graph) { return JSON.parse(checkDependenciesNative(JSON.stringify(graph))); }
export function requireIR(result) {
  if (result.ok) return result.ir;
  throw new Error(result.diagnostics.map(d => `${d.code}: ${d.message} (${d.start}..${d.end}) ${d.hint ?? ''}`).join('\n'));
}
export function explain(ir) {
  const program = prepareProgram(ir);
  return {
    version: ir.version,
    components: ir.components.map(component => {
      const generated = program.get(component.name).generate();
      return { name: component.name, side: component.side, components: program.reachable(component.name),
      states: component.states.map(state => state.name), derives: component.derives.map(derive => derive.name),
      chunks: generated.handlers.map(({ code, ...handler }) => ({ ...handler, loading: 'lazy' })),
      analysis: generated.analysis, cost: program.get(component.name).cost(), browserSetupReexecution: false };
    }),
    boundaries: ir.actions.map(action => ({ name: action.name, input: action.inputSchema, output: action.outputSchema,
      policy: action.policy.name, target: action.policy.targetField, operation: action.call.name,
      effects: action.effects, validation: action.validation, authorizationRequired: true,
      principalSource: 'server host.context(request)', policyImplementation: 'trusted host adapter',
      compilerProvesBusinessPolicy: false })),
  };
}
