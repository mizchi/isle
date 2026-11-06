import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { compileFile } from '../lib/compiler.mjs';
import { toSchemaIR } from '../lib/schema.mjs';
let revision = 0;

/** TS submissions are trusted local code evaluated by Node, not a sandbox or static TS extractor. */
export async function gradeSchema(scenario, file) {
  const report = { scenario, pass: false, score: 0, total: 1, checks: [] };
  try {
    const url = file instanceof URL ? new URL(file) : pathToFileURL(resolve(file));
    const source = await readFile(url, 'utf8');
    let actual;
    if (scenario === 'author-schema-ts') {
      url.searchParams.set('isle-eval', String(++revision));
      actual = toSchemaIR((await import(url.href)).default);
    } else {
      const result = await compileFile(url);
      if (!result.ok) return { ...report, diagnostics: result.diagnostics };
      if (result.ir.schemas.length !== 1 || result.ir.actions.length || result.ir.components.length) throw new Error('Declare exactly one value schema');
      actual = toSchemaIR(result.ir.schemas[0]);
    }
    const expected = JSON.parse(await readFile(new URL('../evals/expect/schema-authoring.json', import.meta.url), 'utf8'));
    const checks = [
      { name: 'schema name and kind', pass: actual.name === expected.name && actual.kind === expected.kind },
      { name: 'ordered fields and types', pass: isDeepStrictEqual(actual.fields.map(({ name, type }) => ({ name, type })), expected.fields.map(({ name, type }) => ({ name, type }))) },
      ...expected.fields.map(field => ({ name: `${field.name} constraints`,
        pass: isDeepStrictEqual(actual.fields.find(item => item.name === field.name)?.constraints, field.constraints) })),
    ];
    return { ...report, pass: checks.every(check => check.pass), score: checks.filter(check => check.pass).length, total: checks.length, checks,
      metrics: { sourceBytes: Buffer.byteLength(source), lines: source.trimEnd().split('\n').length, schemaIRBytes: Buffer.byteLength(JSON.stringify(actual)) } };
  } catch (error) { return { ...report, diagnostics: [{ message: error.message }] }; }
}
