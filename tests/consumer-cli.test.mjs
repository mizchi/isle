import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run = (...args) => spawnSync(process.execPath, ['tools/isle.mjs', ...args], {encoding:'utf8'});

test('npm consumers can request successful help without a source file', () => {
  for (const args of [['--help'], ['-h'], ['layout', '--help']]) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: isle /);
    assert.doesNotMatch(result.stdout, /node tools\/isle/);
    assert.equal(result.stderr, '');
  }
  assert.equal(run('typo').status, 2);
});
