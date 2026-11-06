import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

/** Observe native prerendering through the fixture's HTTP reports, without a DevTools attachment. */
export async function uninstrumentedChromium(url) {
  const profile = await mkdtemp(join(tmpdir(), 'isle-native-chromium-'));
  const child = spawn(chromium.executablePath(), ['--headless', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, url], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  const close = async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    await rm(profile, { recursive: true, force: true });
  };
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    return { close, diagnostics: () => stderr };
  } catch (error) { await close(); throw error; }
}
