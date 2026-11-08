import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const existing = readFileSync('log.jsonl', 'utf8').trim().split('\n').filter(Boolean);
const id = existing.length + 1;
const stdoutPath = `command-${String(id).padStart(2, '0')}.stdout.txt`;
const stderrPath = `command-${String(id).padStart(2, '0')}.stderr.txt`;
let stdout = '', stderr = '';
const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
child.on('error', err => { stderr += String(err); });
child.on('close', code => {
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);
  appendFileSync('log.jsonl', JSON.stringify({ type: 'command', command: args, exitCode: code, stdout: stdoutPath, stderr: stderrPath, nextEditSignal: null }) + '\n');
  process.exitCode = code ?? 1;
});
