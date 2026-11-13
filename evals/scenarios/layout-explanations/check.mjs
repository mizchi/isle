// ADR-0002 eval: each counterexample must cite the declarations that produced
// both sides, and nothing unrelated. Static only; no browser is used.
import {mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {analyzeLayout} from '../../../packages/css-verifier/src/index.mjs';
import {verifyLayoutReport} from '../../../packages/css-verifier/src/layout-z3-node.mjs';

const cells = (n, extra = {}) => Array.from({length: n}, () => ({tag: 'div', classes: ['cell'], ...extra}));
const strip = value => JSON.parse(JSON.stringify(value, (key, v) => key === 'explanation' ? undefined : v));
const cited = facts => facts.filter(f => f.origin === 'author').map(f => `${f.path} ${f.property}@${f.css.line}`);
const scenarios = [
  {name: 'gap-four-boxes', expectedStatus: 'violated',
    tree: {tag: 'main', classes: ['row'], children: cells(4)},
    css: '* { box-sizing: border-box; }\n.row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }\n.cell { min-width: 40px; }\n.cell-wide { min-width: 99px; }\n',
    viewport: {min: 100, max: 1200},
    expect: {code: 'E_LAYOUT_ITEM_SIZE', available: ['Four grid-template-columns@2', 'Four column-gap@2'], required: ['Four/0 min-inline-size@3'], forbidden: ['@4']}},
  {name: 'fixed-tracks', expectedStatus: 'violated',
    tree: {tag: 'main', classes: ['row']},
    css: '* { box-sizing: border-box; }\n.row { display: grid; grid-template-columns: 100px 100px; width: 150px; }\n',
    viewport: {min: 400, max: 800},
    expect: {code: 'E_LAYOUT_TRACKS', available: ['Four inline-size@2'], required: ['Four grid-template-columns@2'], noViewport: true}},
  {name: 'media-boundary', expectedStatus: 'violated',
    tree: {tag: 'main', classes: ['row'], children: cells(4)},
    css: '* { box-sizing: border-box; }\n.row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.cell { min-width: 40px; }\n@media (max-width: 299.5px) {\n  .row { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n}\n',
    viewport: {min: 100, max: 1200},
    expect: {code: 'E_LAYOUT_ITEM_SIZE', available: ['Four grid-template-columns@5'], required: ['Four/0 min-inline-size@3'], condition: {line: 4, params: '(max-width: 299.5px)'}, dormantLine: 2}},
  {name: 'nested-owner', expectedStatus: 'violated',
    tree: {tag: 'main', classes: ['page'], children: [{tag: 'section', classes: ['card'], owner: 'Card', children: [{tag: 'div', classes: ['label'], owner: 'Card'}]}]},
    css: '* { box-sizing: border-box; }\n.page { display: grid; grid-template-columns: 120px; }\n.card { display: grid; grid-template-columns: minmax(0, 1fr); padding: 0 20px; }\n.label { min-width: 100px; }\n',
    viewport: {min: 300, max: 800},
    expect: {code: 'E_LAYOUT_ITEM_SIZE', available: ['Four/0 grid-template-columns@3', 'Four/0 padding-left@3', 'Four grid-template-columns@2'], required: ['Four/0/0 min-inline-size@4'], owners: {available: ['Card', 'Four'], required: ['Card']}, noViewport: true}},
  {name: 'unsupported-css', expectedStatus: 'unknown',
    tree: {tag: 'main', classes: ['row'], children: cells(2)},
    css: '.row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }\n.cell { transform: translateX(4px); }\n',
    viewport: {min: 100, max: 400}, expect: {noExplanation: true}},
];

const results = [];
for (const scenario of scenarios) {
  const failures = [];
  const report = analyzeLayout(scenario.tree, {name: 'Four', css: scenario.css, viewport: scenario.viewport});
  const proof = await verifyLayoutReport(report);
  const plain = await verifyLayoutReport(strip(report));
  if (report.status !== scenario.expectedStatus) failures.push(`status ${report.status}`);
  if (JSON.stringify(strip(proof)) !== JSON.stringify(strip(plain))) failures.push('proof depends on explanations');
  const {expect} = scenario;
  const finding = report.diagnostics.find(d => d.code === expect.code);
  if (expect.noExplanation) { if (report.diagnostics.some(d => d.explanation)) failures.push('unknown diagnostic has an explanation'); }
  else if (!finding?.explanation) failures.push(`missing ${expect.code} explanation`);
  else {
    const {available, required} = finding.explanation;
    for (const [side, wanted] of [[available, expect.available], [required, expect.required]]) for (const item of wanted) if (!cited(side.facts).includes(item)) failures.push(`missing ${item}`);
    // Parent allocation and child requirement are never mixed.
    if (cited(required.facts).some(item => !item.startsWith(finding.path + ' '))) failures.push('required side cites another box');
    if (expect.code === 'E_LAYOUT_ITEM_SIZE' && cited(available.facts).some(item => item.startsWith(finding.path + ' ') && !/grid-(?:column|row)/.test(item))) failures.push('available side cites the item size');
    for (const forbidden of expect.forbidden ?? []) if (JSON.stringify(finding.explanation).includes(`"line":${forbidden.slice(1)}`)) failures.push(`cites unrelated ${forbidden}`);
    if (expect.noViewport && available.facts.some(f => f.kind === 'viewport')) failures.push('definite size still cites the viewport');
    if (expect.condition) {
      const conditions = available.facts.flatMap(f => f.css?.conditions ?? []);
      if (!conditions.some(c => c.css.line === expect.condition.line && c.params === expect.condition.params)) failures.push('missing media condition');
      if (!available.facts.some(f => f.overridden?.some(d => d.css.line === expect.dormantLine))) failures.push('missing overridden base declaration');
    }
    for (const [side, owners] of Object.entries(expect.owners ?? {})) {
      const actual = [...new Set(finding.explanation[side].facts.filter(f => f.owner).map(f => f.owner))].sort();
      if (JSON.stringify(actual) !== JSON.stringify(owners)) failures.push(`${side} owners ${actual}`);
    }
  }
  results.push({name: scenario.name, expectedStatus: scenario.expectedStatus, status: report.status, proof: proof.status,
    ...(finding ? {finding: {code: finding.code, path: finding.path, range: finding.range, witness: finding.witness, available: cited(finding.explanation?.available.facts ?? []), required: cited(finding.explanation?.required.facts ?? [])}} : {}),
    passed: !failures.length, failures});
}
const git = args => { try { return execFileSync('git', args, {encoding: 'utf8'}).trim(); } catch { return null; } };
const out = new URL('../../results/layout-explanations/', import.meta.url);
mkdirSync(out, {recursive: true});
writeFileSync(new URL('report.json', out), JSON.stringify({version: 1, measured: {commit: git(['rev-parse', 'HEAD']), node: process.version}, scope: 'Static counterexample provenance (ADR-0002 core/CLI). Playground diagrams are not covered.', results}, null, 2) + '\n');
const failed = results.filter(r => !r.passed);
console.log(`Layout explanations: ${results.length - failed.length}/${results.length} scenarios passed.`);
for (const r of failed) console.log(`  ${r.name}: ${r.failures.join('; ')}`);
if (failed.length) process.exit(1);
