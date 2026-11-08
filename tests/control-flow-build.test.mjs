import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { isle } from '../lib/vite.mjs';
import { gzipSync } from 'node:zlib';
import { validValue, rowKey } from '../runtime/value.mjs';
import { compile, requireIR } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { analyzeCosts } from '../lib/cost.mjs';

async function bundle(source, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'isle-regions-'));
  try {
    const entry = join(directory, 'app.isle');
    await writeFile(entry, source);
    await writeFile(join(directory, 'client.mjs'), "import {boot} from 'virtual:isle-loader';boot();");
    await writeFile(join(directory, 'index.html'), '<!doctype html><html><head></head><body><!--isle:ssr--></body></html>');
    const result = await build({ configFile: false, root: directory, base: './', logLevel: 'silent',
      plugins: [isle({ entry, diagnostics: false, profile: false,
        mounts: [{ component: 'C', props: { initial: 1 }, label: 'C' }], ...options })], build: { write: false } });
    return result.output;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const source = body => `client component C(initial: number) { state n=initial; <div><button type="button">on click add { n += 1; }{n}</button>${body}</div> }`;

test('unused control capabilities cost zero bytes, and unreachable arms are erased after type checking', async () => {
  const before = await bundle(source('<p>Static</p>'));
  const after = await bundle(source('<Show when={false} fallback={<Fragment> <p>Static</p> </Fragment>}> <p>Dead branch payload</p> </Show>'));
  const js = output => output.filter(item => item.type === 'chunk').map(chunk => chunk.code);
  assert.deepEqual(js(after), js(before));
  assert.equal(js(after).reduce((sum, code) => sum + gzipSync(code).length, 0), js(before).reduce((sum, code) => sum + gzipSync(code).length, 0));
  assert.ok(!js(after).join('').includes('region'));
  assert.doesNotMatch(after.find(item => item.fileName === 'index.html').source, /Dead branch payload/);
  assert.equal(compile(source('<Show when={false}><p>{missing}</p></Show>')).diagnostics[0].code, 'E_UNKNOWN_NAME');
});

test('selection-only apps erase keyed and failure-boundary helpers; SSR controls emit zero JS', async () => {
  const output = await bundle(source('<Show when={n > 0} fallback={<Fragment><p>Empty</p></Fragment>}><p>{n}</p></Show>'));
  const code = output.filter(item => item.type === 'chunk').map(chunk => chunk.code).join('');
  assert.ok(!code.includes('Duplicate row key'));
  assert.ok(!code.includes('Render failed'));
  assert.ok(!code.includes('extractContents'));
  const ssr = await bundle(source('<Show when={n > 0}><p>{n}</p></Show>'), { mode: 'ssr' });
  assert.equal(ssr.filter(item => item.type === 'chunk').length, 0);
  assert.doesNotMatch(ssr.find(item => item.fileName === 'index.html').source, /data-isle-|<!--[rte]:/);
});

test('an unobserved event becomes static HTML with no runtime, snapshot or handler chunks',async()=>{
  const output=await bundle('client component C(initial:number){state n=initial;<button type="button">on click add{n+=1;}Click</button>}');
  assert.deepEqual(output.filter(item=>item.type==='chunk'),[]);
  const html=output.find(item=>item.fileName==='index.html').source;
  assert.match(html,/>Click<\/button>/);assert.doesNotMatch(html,/data-isle-on|data-isle-snapshot|type="module"/);
});

test('a custom client entry preserves activation that external controller code may observe',async()=>{
  const output=await bundle('client component C(initial:number){state n=initial;<button type="button">on click activate{n+=1;}Activate</button>}',{clientEntry:'./client.mjs'});
  const manifest=JSON.parse(output.find(item=>item.fileName==='isle.manifest.json').source);
  assert.ok(manifest.references['C.activate']);
  assert.match(output.find(item=>item.fileName==='index.html').source,/data-isle-on-click/);
});

test('server-only region edits preserve emitted JavaScript and initializer props stay out of snapshots',async()=>{
  const input=`client component C(initial:number){state n=initial;state open=false;
    event add(e:EventSnapshot<MouseEvent>){n+=1;}event toggle(e:EventSnapshot<MouseEvent>){open=!open;}
    <main><h1>Server heading</h1><button on:click={add}>{n}</button><button on:click={toggle}>Toggle</button><Show when={open}><p>{n}</p></Show></main>}`;
  const before=await bundle(input),after=await bundle(input.replace('Server heading','Another heading').replace('state n=initial','state n=initial+1'));
  const scripts=output=>output.filter(item=>item.type==='chunk').map(chunk=>[chunk.fileName,chunk.code]).sort();
  assert.deepEqual(scripts(after),scripts(before));
  assert.notEqual(before.find(item=>item.fileName==='index.html').source,after.find(item=>item.fileName==='index.html').source);
  for(const chunk of before.filter(item=>item.type==='chunk')) assert.ok(!Object.keys(chunk.modules).some(id=>/resume-plan|region-codegen/.test(id)));
});

test('one row factory serves 4,096 rows, and unrelated writes skip the list', () => {
  const ir = requireIR(compile(`client component C(xs: number[]) { state n=0; <div><button>on click add {n+=1;}{n}</button><ul><For each={xs}>{(x) => <Fragment key={x}><li>{x}</li></Fragment>}</For></ul></div> }`));
  const program = prepareProgram(ir), compiled = program.get('C').generate();
  const first = program.render('C', { xs: [1] }), large = program.render('C', { xs: Array.from({ length: 4096 }, (_, i) => i) });
  assert.equal((large.html.match(/<li>/g) ?? []).length, 4096);
  assert.equal((first.html.match(/<li>/g) ?? []).length, 1);
  assert.deepEqual(compiled, program.get('C').generate());
  assert.match(compiled.regions.code, /if\(!d\|\|d.has\("xs"\)\)\{const parentLocals=l; c.each/);
  const costs = analyzeCosts(ir, { mounts: [{ component: 'C' }], budgets: [{ entry: '$page', metric: 'domElements', max: 10000 }] });
  assert.equal(costs.scenario.domElements, null);
  assert.equal(costs.ok, false, 'data-dependent work must not pass a constant budget');
});

test('closed value codecs reject sparse arrays, accessors and malformed keys without executing getters', () => {
  const type = { array: { record: { id: 'string', value: 'number' } } };
  assert.equal(validValue(type, [{ id: 'a', value: 1 }]), true);
  assert.equal(validValue(type, [{ id: 'a', value: 1, extra: true }]), false);
  const sparse = new Array(1); sparse.extra = 1;
  assert.equal(validValue({ array: 'number' }, sparse), false);
  const accessor = []; Object.defineProperty(accessor, '0', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.equal(validValue({ array: 'number' }, accessor), false);
  for (const key of [NaN, Infinity, -0, 1.5, Number.MAX_SAFE_INTEGER + 1, {}, true]) assert.throws(() => rowKey(key));
  assert.notEqual(rowKey('1'), rowKey(1));
  assert.doesNotThrow(() => rowKey('\ud800'));
});
