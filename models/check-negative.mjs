import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./permit/', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'isle-negative-'));
const run = (args) => spawnSync('moon', args, {
  cwd: directory, encoding: 'utf8', timeout: 60000,
});
const reports = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
  const child = join(path, entry.name);
  return entry.isDirectory() ? reports(child) :
    entry.name.endsWith('.proof.json') ? [JSON.parse(readFileSync(child, 'utf8'))] : [];
});

try {
  for (const name of ['moon.pkg', 'permit.mbt', 'permit.mbtp']) {
    copyFileSync(join(source, name), join(directory, name));
  }
  copyFileSync(join(source, 'negative.mbt.txt'), join(directory, 'negative.mbt'));
  writeFileSync(join(directory, 'moon.mod'), 'name = "mizchi/isle-negative"\n');

  const checked = run(['check', '--deny-warn']);
  assert.ifError(checked.error);
  assert.equal(checked.status, 0, `negative fixture must type-check:\n${checked.stdout}${checked.stderr}`);

  const proved = run(['prove']);
  assert.ifError(proved.error);
  const proofReports = reports(join(directory, '_build', 'verif'));
  const rejectedGoal = proofReports.some((report) =>
    report.result !== 'success' &&
    report.failures?.some((failure) => JSON.stringify(failure).includes('negative_control')));
  assert.notEqual(proved.status, 0, 'the false postcondition must not be proved');
  assert.ok(rejectedGoal, `expected a failed negative_control proof goal:\n${proved.stdout}${proved.stderr}`);
  console.log(JSON.stringify({
    name: 'permit/wrong-resource-negative-control',
    result: 'false-postcondition-rejected',
    type_checked: true,
    proof_report_checked: true,
  }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
