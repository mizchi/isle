import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compile, requireIR, checkDependencies } from '../lib/compiler.mjs';

test('derive self-cycle reports the reference, declaration and closed path in UTF-16 offsets', () => {
  const source = '// 猫😀\nexport client component Cycle() {\n  derive a = a + 1;\n  <p>{a}</p>\n}';
  const result = compile(source), diagnostic = result.diagnostics[0];
  assert.equal(result.ok, false);
  assert.equal(diagnostic.code, 'E_DERIVE_CYCLE');
  assert.deepEqual(diagnostic.cycle, ['Cycle.a', 'Cycle.a']);
  assert.match(diagnostic.message, /Cycle\.a -> Cycle\.a/);
  assert.equal(diagnostic.start, source.indexOf('a + 1'));
  assert.equal(source.slice(diagnostic.start, diagnostic.end), 'a');
  assert.equal(diagnostic.related.length, 1);
  assert.equal(diagnostic.related[0].start, source.indexOf('derive a') + 'derive '.length);
});

test('indirect cycles exclude acyclic prefixes and are rejected before dead code removal', () => {
  const source = `export client component Cycle() {
    derive lead = a + 1;
    derive a = b + 1;
    derive b = c + 1;
    derive c = a + 1;
    <p>Static output</p>
  }`;
  const diagnostic = compile(source).diagnostics[0];
  assert.equal(diagnostic.code, 'E_DERIVE_CYCLE');
  assert.deepEqual(diagnostic.cycle, ['Cycle.a', 'Cycle.b', 'Cycle.c', 'Cycle.a']);
  assert.equal(diagnostic.start, source.lastIndexOf('a + 1'));
  assert.equal(diagnostic.related.length, 3);
  for (const [index, name] of ['a', 'b', 'c'].entries()) {
    assert.equal(diagnostic.related[index].start, source.indexOf(`derive ${name}`) + 'derive '.length);
  }
});

test('forward references and diamonds are ordered, while event read/write feedback stays valid', () => {
  const source = `export client component Counter() {
    state count = 1;
    derive total = left + right;
    derive left = base + 1;
    derive right = base + 2;
    derive base = count * 2;
    <button>on click increment { count += 1; }{total}</button>
  }`;
  const ir = requireIR(compile(source));
  assert.deepEqual(ir.components[0].derives.map(derive => derive.name), ['base', 'left', 'right', 'total']);
  assert.equal(compile('export client component Bad() { derive a = missing + 1; <p>{a}</p> }').diagnostics[0].code, 'E_UNKNOWN_NAME');
});

const location = (start, file = 'app.isle') => ({ file, start, end: start + 1 });
const node = (id, dependencies = [], start = 0, file) => ({ id, source: location(start, file),
  dependencies: dependencies.map((id, index) => ({ id, source: location(start + index + 10, file) })) });
const graph = nodes => ({ version: 1, nodes });

test('shared graph checker preserves cross-file cycle identity and source locations', () => {
  const input = graph([node('Counter.tone', ['Counter.ui.--tone'], 5, 'counter.isle'),
    node('Counter.ui.--tone', ['Counter.tone'], 20, 'theme.css')]);
  const diagnostic = checkDependencies(input).diagnostics[0];
  assert.equal(diagnostic.code, 'E_DEPENDENCY_CYCLE');
  assert.deepEqual(diagnostic.cycle, ['Counter.tone', 'Counter.ui.--tone', 'Counter.tone']);
  assert.equal(diagnostic.file, 'theme.css');
  assert.equal(diagnostic.start, 30);
  assert.deepEqual(diagnostic.related.map(item => item.file), ['counter.isle', 'theme.css']);
});

test('graph contract rejects unknown endpoints, duplicate nodes and malformed locations', () => {
  for (const [input, code] of [
    [graph([node('a', ['missing'])]), 'E_DEPENDENCY_UNKNOWN'],
    [graph([node('a'), node('a')]), 'E_DEPENDENCY_DUPLICATE'],
    [{ version: 2, nodes: [] }, 'E_DEPENDENCY_GRAPH'],
    [graph([{ ...node('a'), source: { start: -1, end: 1 } }]), 'E_DEPENDENCY_GRAPH'],
    [graph([{ ...node('a'), source: { start: 1.5, end: 2 } }]), 'E_DEPENDENCY_GRAPH'],
    [graph([{ ...node('a'), source: { start: 2, end: 1 } }]), 'E_DEPENDENCY_GRAPH'],
    [graph([{ ...node('a'), dependencies: null }]), 'E_DEPENDENCY_GRAPH'],
  ]) {
    const result = checkDependencies(input);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, code);
  }
  assert.deepEqual(checkDependencies(graph([])).order, []);
  assert.deepEqual(checkDependencies(graph([node('__proto__')])).order, ['__proto__']);
});

test('all 512 three-node graphs agree with a permutation-based acyclicity oracle', () => {
  const names = ['a', 'b', 'c'], permutations = [
    ['a', 'b', 'c'], ['a', 'c', 'b'], ['b', 'a', 'c'], ['b', 'c', 'a'], ['c', 'a', 'b'], ['c', 'b', 'a'],
  ];
  for (let mask = 0; mask < 512; mask++) {
    const nodes = names.map((name, index) => node(name, names.filter((_, dep) => mask & (1 << (index * 3 + dep)))));
    const ordered = order => nodes.every(node => node.dependencies.every(dep => order.indexOf(dep.id) < order.indexOf(node.id)));
    const result = checkDependencies(graph(nodes));
    assert.equal(result.ok, permutations.some(ordered), `graph ${mask}`);
    if (result.ok) {
      assert.equal(new Set(result.order).size, 3);
      assert.ok(ordered(result.order));
    } else {
      const path = result.diagnostics[0].cycle;
      assert.equal(path[0], path.at(-1));
      assert.equal(new Set(path.slice(0, -1)).size, path.length - 1);
      for (let i = 0; i < path.length - 1; i++) assert.ok(nodes.find(node => node.id === path[i]).dependencies.some(dep => dep.id === path[i + 1]));
    }
  }
});

test('long dependency chains are checked without using the JavaScript call stack', () => {
  const nodes = Array.from({ length: 12000 }, (_, index) => node(String(index), index < 11999 ? [String(index + 1)] : []));
  const result = checkDependencies(graph(nodes));
  assert.equal(result.ok, true);
  assert.equal(result.order.length, nodes.length);
  assert.equal(result.order[0], '11999');
  nodes.at(-1).dependencies = [{ id: '6000', source: location(42) }];
  const cycle = checkDependencies(graph(nodes));
  assert.equal(cycle.ok, false);
  assert.equal(cycle.diagnostics[0].cycle.length, 6001);
});

test('dependency CLI returns machine-readable diagnostics and a failing exit code for cycles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isle-dependencies-'));
  try {
    const file = join(directory, 'graph.json'), tool = fileURLToPath(new URL('../tools/isle.mjs', import.meta.url));
    await writeFile(file, JSON.stringify(graph([node('a', ['b']), node('b')])));
    const valid = spawnSync(process.execPath, [tool, 'dependencies', file], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout).order, ['b', 'a']);
    await writeFile(file, JSON.stringify(graph([node('a', ['b']), node('b', ['a'])])));
    const invalid = spawnSync(process.execPath, [tool, 'dependencies', file], { encoding: 'utf8' });
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.deepEqual(JSON.parse(invalid.stdout).diagnostics[0].cycle, ['a', 'b', 'a']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
