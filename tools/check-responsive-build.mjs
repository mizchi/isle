import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = 'examples/responsive-checked';
const html = await readFile(`${directory}/dist/index.html`,'utf8');
const certificate = JSON.parse(await readFile(`${directory}/dist/isle.layout.json`,'utf8'));
assert.equal(certificate.status,'verified');
assert.equal(certificate.document.sha256,createHash('sha256').update(html).digest('hex'));
const gates = [
  ['check','integrity'],
  ['check','copy','--manifest',`${directory}/copy.txt`],
  ['scan','scroll'],
  ['scan','handlers'],
  ['check','interactions'],
  ['check','breakpoints','--sweep'],
  ['check','responsive','--min-width','320','--max-width','1280','--min-height','240','--max-height','900'],
];
const binary = fileURLToPath(new URL('../node_modules/.bin/vlmkit',import.meta.url));
const results = [];
await mkdir('evals/results/layout-build',{recursive:true});
for (const [group,name,...options] of gates) {
  const run = spawnSync(binary,[group,name,`${directory}/dist/index.html`,...options,'--json'],{encoding:'utf8',maxBuffer:8<<20});
  let report;
  try { report=JSON.parse(run.stdout); } catch { throw new Error(`vlmkit failed: ${run.stdout}\n${run.stderr}`); }
  results.push({gate:report.gate,verdict:report.verdict,counts:report.counts,findings:report.findings});
  await writeFile('evals/results/layout-build/quality.json',JSON.stringify({document:certificate.document,results},null,2)+'\n');
  assert.equal(run.status,0,`${group} ${name}: ${JSON.stringify(report.findings)}`);
  console.log(`${group} ${name}: ${report.verdict}`);
}
