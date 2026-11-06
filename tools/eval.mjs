import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { compileFile, compile } from '../lib/compiler.mjs';
import { generateComponent, renderComponent } from '../lib/codegen.mjs';
import { gradeSchema } from './schema-eval.mjs';
import { speculationRules } from '../lib/speculation.mjs';

export async function grade(scenario, file) {
  if (['author-schema-dsl', 'author-schema-ts'].includes(scenario)) return gradeSchema(scenario, file);
  if (['intent', 'chunk-intent', 'inline-live-css-intent', 'layout-intent', 'layout-axes-intent', 'layout-reset-intent', 'layout-rejections-intent', 'control-flow-intent', 'static-split-intent', 'computation-intent', 'component-intent', 'composition-intent', 'static-cost-intent', 'form-intent', 'shared-form-intent', 'navigation-loading-intent', 'dashboard-intent'].includes(scenario)) {
    const expected = JSON.parse(await readFile(new URL(`../evals/expect/${scenario}.json`, import.meta.url), 'utf8'));
    const actual = JSON.parse(await readFile(file, 'utf8'));
    const checks = Object.entries(expected).map(([name, value]) => ({ name, pass: isDeepStrictEqual(actual[name], value) }));
    return { scenario, pass: checks.every(c => c.pass), score: checks.filter(c => c.pass).length, total: checks.length, checks };
  }
  const result = await compileFile(file);
  if (!result.ok) return { scenario, pass: false, score: 0, total: 1, diagnostics: result.diagnostics };
  const checks = [];
  const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  if (scenario === 'author-chunks') {
    const component = result.ir.components.find(c => c.name === 'Counter');
    check('client Counter', component?.side === 'client');
    check('two buttons in div', component?.root.tag === 'div' && component.root.children.filter(child => child.tag === 'button').length === 2);
    if (component) {
      const generated = generateComponent(component);
      check('named event boundaries', isDeepStrictEqual(generated.handlers.map(handler => handler.id).sort(), ['Counter.decrement', 'Counter.increment']));
      check('async independent from code loading', generated.handlers.every(handler => !handler.async && !handler.remote));
      for (const [name, delta] of [['increment', 1], ['decrement', -1]]) {
        const handler = generated.handlers.find(handler => handler.id === `Counter.${name}`);
        if (!handler) { check(`${name} resumes correctly`, false); continue; }
        const { snapshot } = renderComponent(component, { initial: 37 });
        const values = handler.captures.map(index => snapshot[3][index]), patches = [];
        const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
        await module.run(values, (key, value) => { values[key] = value; }, (_, value) => patches.push(value));
        const count = handler.captureNames.indexOf('count');
        check(`${name} resumes correctly`, values[count] === 37 + delta && patches.length === 2 && patches.every(value => value === String(37 + delta)));
      }
    }
  } else if (scenario === 'author-counter') {
    const counter = result.ir.components.find(c => c.name === 'Counter');
    check('client Counter', counter?.side === 'client');
    check('button with click', counter?.root.tag === 'button' && counter.root.handlers.some(h => h.event === 'click'));
    if (counter) {
      const generated = generateComponent(counter);
      check('count state and remaining derive', counter.states.some(s => s.name === 'count') && counter.derives.some(d => d.name === 'remaining'));
      for (const initial of [37, 5]) {
        const { snapshot } = renderComponent(counter, { initial });
        const patches = [];
        const handler = generated.handlers.find(h => h.event === 'click');
        if (!handler) { check(`resume from ${initial}`, false); continue; }
        const values = handler.captures.map(index => snapshot[3][index]);
        const module = await import(`data:text/javascript,${encodeURIComponent(handler.code)}`);
        await module.run(values, (key, value) => { values[key] = value; }, (_, value) => patches.push(value));
        const countSlot = handler.captures.indexOf(generated.fields.findIndex(field => field.name === 'count'));
        check(`resume from ${initial}`, values[countSlot] === initial + 3 && patches.includes(String(initial + 3)) && patches.includes(String(100 - initial - 3)));
      }
    }
  } else if (scenario === 'author-action') {
    const action = result.ir.actions.find(a => a.name === 'publishNote');
    const fields = name => result.ir.schemas.find(s => s.name === name)?.fields.map(f => `${f.name}:${f.type}`).sort();
    check('input schema', isDeepStrictEqual(fields('PublishInput'), ['body:string', 'noteId:string']));
    check('output schema', isDeepStrictEqual(fields('PublishedView'), ['body:string', 'noteId:string']));
    check('boundary schemas', action?.inputSchema === 'PublishInput' && action.outputSchema === 'PublishedView');
    check('resource policy', action?.policy.name === 'policy.notePublisher' && action.policy.targetField === 'noteId');
    check('effect contract', isDeepStrictEqual(action?.effects, ['db.write']));
    check('grant precedes mutation', action?.call.name === 'notes.publish' && isDeepStrictEqual(action.call.args, [{ kind: 'grant' }, { kind: 'input', field: 'body' }]));
  } else throw new Error(`Unknown scenario: ${scenario}`);
  return { scenario, pass: checks.length > 0 && checks.every(c => c.pass), score: checks.filter(c => c.pass).length, total: checks.length, checks };
}

async function main() {
  const [scenario, file] = process.argv.slice(2);
  let reports;
  if (scenario) reports = [await grade(scenario, file)];
  else {
    reports = [await grade('author-counter', new URL('../evals/solutions/counter.isle', import.meta.url)),
      await grade('author-chunks', new URL('../evals/solutions/chunks.isle', import.meta.url)),
      await grade('author-action', new URL('../evals/solutions/action.isle', import.meta.url)),
      await grade('author-schema-dsl', new URL('../evals/solutions/schema-dsl.isle', import.meta.url)),
      await grade('author-schema-ts', new URL('../evals/solutions/schema-ts.ts', import.meta.url))];
    const original = await readFile(new URL('../evals/solutions/action.isle', import.meta.url), 'utf8');
    for (const [name, source, expected] of [
      ['missing policy', original.replace(/authorize grant[^\n]+\n/, ''), 'E_ACTION_POLICY'],
      ['forged grant', original.replace('notes.publish(grant,', 'notes.publish(input.noteId,'), 'E_ACTION_GRANT'],
      ['server state', 'export server component Bad() { state n = 0; <p>{n}</p> }', 'E_SERVER_STATE'],
    ]) {
      const result = compile(source);
      reports.push({ scenario: name, pass: !result.ok && result.diagnostics[0]?.code === expected });
    }
    const fixture = await compileFile(new URL('../evals/scenarios/intent/fixture.isle', import.meta.url));
    reports.push({ scenario: 'intent fixture compiles', pass: fixture.ok });
    const chunkFixture = await compileFile(new URL('../evals/scenarios/chunk-intent/fixture.isle', import.meta.url));
    reports.push({ scenario: 'chunk intent fixture compiles', pass: chunkFixture.ok });
    const staticFixture = await compileFile(new URL('../evals/scenarios/static-split/fixture.isle', import.meta.url));
    reports.push({ scenario: 'static split fixture compiles', pass: staticFixture.ok });
    const computationFixture = await compileFile(new URL('../evals/scenarios/computation-lifetime/fixture.isle', import.meta.url));
    reports.push({ scenario: 'computation lifetime fixture compiles', pass: computationFixture.ok });
    const componentFixture = await compileFile(new URL('../evals/scenarios/component-intent/fixture.isle', import.meta.url));
    reports.push({ scenario: 'component intent fixture compiles', pass: componentFixture.ok });
    const compositionFixture = await compileFile(new URL('../evals/scenarios/composition-intent/fixture.isle', import.meta.url));
    reports.push({ scenario: 'composition intent fixture compiles', pass: compositionFixture.ok });
    const controlFixture = await compileFile(new URL('../evals/scenarios/control-flow/fixture.isle', import.meta.url));
    reports.push({ scenario: 'control flow fixture compiles', pass: controlFixture.ok });
    const costFixture = await compileFile(new URL('../evals/scenarios/static-cost/fixture.isle', import.meta.url));
    reports.push({ scenario: 'static cost fixture compiles', pass: costFixture.ok });
    const layoutFixture = await compileFile(new URL('../evals/scenarios/layout/fixture.isle', import.meta.url));
    reports.push({ scenario: 'layout fixture compiles', pass: layoutFixture.ok });
    const layoutAxesFixture = await compileFile(new URL('../evals/scenarios/layout-axes/fixture.isle', import.meta.url));
    reports.push({ scenario: 'container/block layout fixture compiles', pass: layoutAxesFixture.ok });
    const layoutResetFixture = await compileFile(new URL('../evals/scenarios/layout-reset/fixture.isle', import.meta.url));
    reports.push({ scenario: 'reset layout fixture compiles', pass: layoutResetFixture.ok });
    const rejectionExamples = await import('../evals/scenarios/layout-rejections/cases.mjs');
    reports.push({ scenario: 'rejection example sources compile', pass: rejectionExamples.cases.every(c => compile(c.reject.source).ok && compile(c.accept.source).ok) });
    const formFixture = await compileFile(new URL('../evals/scenarios/forms/fixture.isle', import.meta.url));
    reports.push({ scenario: 'form fixture compiles', pass: formFixture.ok });
    const sharedFormFixture = await compileFile(new URL('../evals/scenarios/forms/shared.isle', import.meta.url));
    reports.push({ scenario: 'shared form fixture compiles', pass: sharedFormFixture.ok });
    const navigation = await import('../evals/scenarios/navigation-loading/fixture.mjs');
    reports.push({ scenario: 'navigation loading fixture validates', pass: Boolean(speculationRules(navigation.options.speculation)) });
    const dashboard = await compileFile(new URL('../benchmarks/variants/isle/dashboard.isle', import.meta.url));
    reports.push({ scenario: 'dashboard fixture compiles', pass: dashboard.ok });
    for (const attempt of await readdir(new URL('../evals/attempts/', import.meta.url))) {
      const candidates = await readdir(new URL(`../evals/attempts/${attempt}/`, import.meta.url));
      for (const [scenario, name] of [
        ['author-counter', 'counter.isle'], ['author-action', 'action.isle'], ['author-chunks', 'chunks.isle'],
        ['intent', 'answers.json'], ['chunk-intent', 'chunk-answers.json'],
        ['inline-live-css-intent', 'inline-live-css-answers.json'],
        ['layout-intent', 'layout-answers.json'],
        ['layout-axes-intent', 'layout-axes-answers.json'],
        ['layout-reset-intent', 'layout-reset-answers.json'],
        ['layout-rejections-intent', 'layout-rejections-answers.json'],
        ['control-flow-intent', 'control-flow-answers.json'],
        ['static-split-intent', 'static-split-answers.json'],
        ['computation-intent', 'computation-answers.json'],
        ['component-intent', 'component-answers.json'],
        ['composition-intent', 'composition-answers.json'],
        ['static-cost-intent', 'static-cost-answers.json'],
        ['form-intent', 'form-answers.json'],
        ['shared-form-intent', 'shared-form-answers.json'],
        ['navigation-loading-intent', 'navigation-loading-answers.json'],
        ['dashboard-intent', 'dashboard-answers.json'],
        ['author-schema-dsl', 'schema-dsl.isle'], ['author-schema-ts', 'schema-ts.ts'],
      ]) {
        if (candidates.includes(name)) {
          reports.push({ attempt, ...await grade(scenario, new URL(`../evals/attempts/${attempt}/${name}`, import.meta.url)) });
        }
      }
    }
  }
  const report = { version: 1, pass: reports.every(report => report.pass), reports };
  if (!scenario) {
    await mkdir(new URL('../evals/results/', import.meta.url), { recursive: true });
    await writeFile(new URL('../evals/results/corpus.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
