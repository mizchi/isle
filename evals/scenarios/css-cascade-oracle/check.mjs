// Differential eval: CSS verifier cascade/computed subset vs mizchi/css.
// Output: evals/results/css-cascade-oracle/report.json. Exit 1 on any
// unexplained difference. Browser rendering is not used.
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadOracle, compareCase, generateCase, comparedProperties} from '../../../packages/css-verifier/oracle/differential.mjs';

const seeds = Number(process.argv[2] ?? 5000);
const oracle = await loadOracle();
const cases = {}, properties = {}, unsupported = {}, differences = [];
for (let seed = 1; seed <= seeds; seed++) {
  const input = generateCase(seed), result = compareCase(oracle, input);
  cases[result.status] = (cases[result.status] ?? 0) + 1;
  if (result.reason) { const key = result.reason.replace(/^[^:]*: /, ''); unsupported[key] = (unsupported[key] ?? 0) + 1; }
  for (const row of result.rows) {
    properties[row.property] ??= {};
    properties[row.property][row.status] = (properties[row.property][row.status] ?? 0) + 1;
    if (row.status === 'different' && differences.length < 20) differences.push({seed, css: input.css, width: input.width, ...row});
  }
}
const lock = readFileSync(new URL('../../../packages/css-verifier/oracle/moon.mod', import.meta.url), 'utf8').match(/"mizchi\/css@([^"]+)"/)?.[1];
const git = args => { try { return execFileSync('git', args, {encoding: 'utf8'}).trim(); } catch { return null; } };
const report = {
  version: 1, status: differences.length ? 'different' : 'consistent',
  measured: {commit: git(['rev-parse', 'HEAD']), dirty: Boolean(git(['status', '--porcelain'])), node: process.version, oracle: `mizchi/css@${lock}`},
  input: {generator: 'packages/css-verifier/oracle/differential.mjs#generateCase', seeds: [1, seeds], comparedProperties},
  scope: 'Specified-to-computed values of the shared longhand subset at one concrete viewport per case. Geometry, container queries, layers and Z3 are outside this eval.',
  cases,
  properties, verifierUnsupported: unsupported, differences,
};
const out = new URL('../../results/css-cascade-oracle/', import.meta.url);
mkdirSync(out, {recursive: true});
writeFileSync(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, cases}));
if (differences.length) process.exit(1);
