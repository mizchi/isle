#!/usr/bin/env node
import { compileFile, explain, checkDependencies } from '../lib/compiler.mjs';
import { prepareProgram } from '../lib/codegen.mjs';
import { readFile } from 'node:fs/promises';
import { describeChunks } from '../lib/chunks.mjs';
import { analyzeCosts, checkCostBudgets } from '../lib/cost.mjs';
import { analyzeLayout } from '../lib/layout.mjs';
import { resolve, dirname } from 'node:path';
const [command, file, ...args] = process.argv.slice(2);
if (!file || !['check', 'explain', 'emit', 'ssr', 'chunks', 'dependencies', 'cost', 'layout'].includes(command)) {
  console.error('Usage: node tools/isle.mjs check|explain|emit|ssr <file.isle> [component] [props-json]\n       node tools/isle.mjs chunks <isle.manifest.json>\n       node tools/isle.mjs dependencies <graph.json>\n       node tools/isle.mjs cost <file.isle|isle.cost.json> [budgets.json]\n       node tools/isle.mjs layout <file.isle> <layout.json>');
  process.exitCode = 2;
} else {
  try {
    if (command === 'layout') {
      if (!args[0]) throw new Error('A layout sidecar is required');
      const result = await compileFile(file);
      if (!result.ok) { console.log(JSON.stringify(result, null, 2)); process.exitCode = 1; }
      else {
        const options = JSON.parse(await readFile(args[0], 'utf8'));
        if (typeof options.css !== 'string') throw new Error('layout.json needs a CSS file path');
        const cssFile = resolve(dirname(resolve(args[0])), options.css);
        if (options.reset !== undefined && (!Array.isArray(options.reset) || options.reset.some(file => typeof file !== 'string'))) throw new Error('layout.json reset must be an ordered array of CSS file paths');
        const reset = await Promise.all((options.reset ?? []).map(async file => {
          const path = resolve(dirname(resolve(args[0])), file);
          return { file: path, css: await readFile(path, 'utf8') };
        }));
        const report = analyzeLayout(result.ir, { ...options, reset, cssFile, css: await readFile(cssFile, 'utf8') });
        console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1;
      }
    } else if (command === 'cost') {
      const budgets = args[0] ? JSON.parse(await readFile(args[0], 'utf8')) : [];
      let report;
      if (file.endsWith('.json')) {
        report = JSON.parse(await readFile(file, 'utf8'));
        const previous = report.budget?.checks ?? [];
        const limits = args[0] ? budgets : previous.map(({ entry, metric, max }) => ({ entry, metric, max }));
        report.budget = checkCostBudgets(report, limits);
        report.ok = report.budget.ok;
      } else {
        const result = await compileFile(file);
        if (!result.ok) { console.log(JSON.stringify(result, null, 2)); process.exitCode = 1; }
        else report = analyzeCosts(result.ir, { budgets });
      }
      if (report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
    } else if (command === 'dependencies') {
      const result = checkDependencies(JSON.parse(await readFile(file, 'utf8')));
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } else if (command === 'chunks') {
      console.log(JSON.stringify(describeChunks(JSON.parse(await readFile(file, 'utf8'))), null, 2));
    } else {
      const result = await compileFile(file);
      if (!result.ok) {
        console.log(JSON.stringify(result, null, 2)); process.exitCode = 1;
      } else if (command === 'check') console.log(JSON.stringify({ ok: true, components: result.ir.components.map(c => c.name), actions: result.ir.actions.map(a => a.name) }, null, 2));
      else if (command === 'explain') console.log(JSON.stringify(explain(result.ir), null, 2));
      else {
        const component = result.ir.components.find(c => c.name === args[0]) ?? result.ir.components[0];
        if (!component) throw new Error('No component to emit');
        const program = prepareProgram(result.ir);
        if (command === 'emit') console.log(JSON.stringify(program.get(component.name).generate(), null, 2));
        else console.log(JSON.stringify(program.render(component.name, JSON.parse(args[1] ?? '{}')), null, 2));
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
