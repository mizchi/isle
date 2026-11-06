import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createTodoServer } from './serve.mjs';
const binary = fileURLToPath(new URL('../../node_modules/.bin/vlmkit', import.meta.url));
const tasks = [
  ['check', 'integrity'], ['check', 'copy', '--manifest', 'benchmarks/todomvc/copy.txt'],
  ['scan', 'scroll'], ['scan', 'handlers'], ['check', 'interactions'],
  ['check', 'responsive', '--min-width', '375', '--max-width', '1440', '--runs', '24'],
  ['check', 'a11y', 'contrast'], ['check', 'a11y', 'focus'],
];
async function main() {
  const server = await createTodoServer({ quality: true }), results = [];
  try {
    for (const args of tasks) {
      const split = args[1] === 'a11y' ? 3 : 2;
      const command = [...args.slice(0, split), `${server.url}/todomvc/isle/quality/`, ...args.slice(split), '--json'];
      const result = await new Promise((resolve, reject) => {
        const child = spawn(binary, command, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
        child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
      });
      let report;
      try { report = JSON.parse(result.stdout); } catch { throw new Error(`vlmkit failed: ${result.stdout}\n${result.stderr}`); }
      results.push({ command: args.join(' '), ...report });
      await mkdir('evals/results/todomvc', { recursive: true });
      await writeFile('evals/results/todomvc/quality.json', JSON.stringify({ version: '0.24.0', results }, null, 2) + '\n');
      console.log(`${args.join(' ')}: ${report.verdict}`);
      if (result.status !== 0) throw new Error(JSON.stringify(report.findings, null, 2));
    }
  } finally { await server.close(); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
