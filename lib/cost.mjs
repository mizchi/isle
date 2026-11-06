import { createHash } from 'node:crypto';
import { prepareProgram } from './codegen.mjs';
import { costMetrics } from './cost-plan.mjs';
import { planCodeLoad } from '../runtime/manifest.mjs';

const budgetMetrics = new Set([...costMetrics, 'snapshotSlots', 'coldBytes', 'coldGzipBytes', 'durationMs', 'domElements', 'resumableOwners']);

function codeClosure(manifest, ids) {
  const { modules, styles } = planCodeLoad(manifest, ids), urls = new Set(modules);
  const chunks = Object.values(manifest.chunks).filter(chunk => urls.has(chunk.url));
  const assets = [...chunks, ...Object.values(manifest.styles ?? {}).filter(style => styles?.includes(style.url))];
  const sum = name => assets.every(asset => Number.isSafeInteger(asset[name]) && asset[name] >= 0)
    ? { [name]: assets.reduce((sum, asset) => sum + asset[name], 0) } : {};
  return { scope: 'static-code-closure', modules, ...(styles ? { styles } : {}), ...sum('bytes'), ...sum('gzipBytes'),
    dynamicImports: [...new Set(chunks.flatMap(chunk => chunk.dynamicImports ?? []).map(file => manifest.chunks[file]?.url).filter(url => url && !urls.has(url)))] };
}

/** Analyze a closed v0 program without executing props, handlers or server adapters. */
export function analyzeCosts(ir, { mounts, mode = 'resume', manifest, budgets = [] } = {}) {
  if (!['resume', 'ssr'].includes(mode)) throw new Error('Unknown cost render mode');
  const program = prepareProgram(ir), definitions = new Map(ir.components.map(component => [component.name, component]));
  const costs = new Map(ir.components.map(component => [component.name, program.get(component.name).cost()]));
  let scenario = null;
  if (mounts !== undefined) {
    if (!Array.isArray(mounts)) throw new Error('Cost mounts must be an array');
    const instances = new Map();
    scenario = { mode, mounts: [], domElements: 0, resumableOwners: 0, snapshotSlots: 0, components: {} };
    function component(name, projection, activeMode) {
      if (!definitions.has(name)) throw new Error(`Unknown cost component: ${name}`);
      const count = instances.get(name) ?? { instances: 0, resumableInstances: 0 };
      count.instances++;
      if (activeMode === 'resume' && costs.get(name).restore.owners) {
        count.resumableInstances++; scenario.resumableOwners++;
        scenario.snapshotSlots += costs.get(name).restore.snapshotSlots;
      }
      instances.set(name, count);
      node(definitions.get(name).root, projection, activeMode);
    }
    function node(value, projection, activeMode) {
      if (value.kind === 'slot') { projection?.(); return; }
      if (value.kind === 'island') {
        component(value.component, () => value.children.forEach(child => node(child, projection, activeMode)), activeMode); return;
      }
      if (['select', 'each', 'boundary'].includes(value.kind)) { scenario.domElements = null; return; }
      if (value.kind === 'element' && scenario.domElements !== null) scenario.domElements++;
      value.children?.forEach(child => node(child, projection, activeMode));
    }
    for (const mount of mounts) {
      if (!mount || (mount.mode !== undefined && !['resume', 'ssr'].includes(mount.mode))) throw new Error('Unknown cost mount mode');
      const activeMode = mode === 'ssr' ? 'ssr' : mount.mode ?? 'resume';
      scenario.mounts.push({ component: mount.component, mode: activeMode });
      component(mount.component, undefined, activeMode);
    }
    scenario.components = Object.fromEntries(instances);
  }
  const components = [...costs.values()].filter(cost => scenario === null || Object.hasOwn(scenario.components, cost.component));
  const entries = components.flatMap(component => component.entries).filter(entry => mode !== 'ssr' && (scenario === null || scenario.components[entry.component].resumableInstances > 0))
    .map(entry => ({ ...entry, ...(scenario ? { instances: scenario.components[entry.component].resumableInstances } : {}) }));
  const report = { version: 1, coverage: 'generated-handler-operations',
    exclusions: ['browser style/layout/paint duration', 'runtime internals and DOM locator traversal', 'network/server duration', 'HTTP cache and bootstrap transfer', 'host wrappers and metadata script elements'],
    components, entries, scenario };
  report.planId = createHash('sha256').update(JSON.stringify([ir, report])).digest('hex').slice(0, 16);
  if (manifest) {
    const ids = [], unresolvedReferences = [];
    for (const entry of entries) {
      if (!Object.hasOwn(manifest.references, entry.id)) { unresolvedReferences.push(entry.id); continue; }
      const reference = manifest.references[entry.id];
      if (reference.schemaId !== undefined && reference.schemaId !== costs.get(entry.component).schemaId) throw new Error(`Cost manifest schema mismatch: ${entry.id}`);
      entry.code = codeClosure(manifest, [entry.id]);
      if (reference.source) entry.location = reference.source;
      ids.push(entry.id);
    }
    report.code = codeClosure(manifest, ids);
    if (unresolvedReferences.length) {
      delete report.code.bytes; delete report.code.gzipBytes;
      report.code.unresolvedReferences = unresolvedReferences;
    }
    report.buildId = manifest.buildId;
  }
  report.budget = checkCostBudgets(report, budgets);
  report.ok = report.budget.ok;
  return report;
}

/** Unknown bounds and misspelled/missing targets fail explicit budgets, never pass as zero. */
export function checkCostBudgets(report, budgets) {
  if (report?.version !== 1 || !Array.isArray(report.entries)) throw new Error('Unsupported cost report');
  if (!Array.isArray(budgets)) throw new Error('Cost budgets must be an array');
  const checks = [];
  for (const budget of budgets) {
    if (!budget || typeof budget.entry !== 'string' || !budget.entry || !budgetMetrics.has(budget.metric) || !Number.isFinite(budget.max) || budget.max < 0) throw new Error('Invalid cost budget');
    const targets = budget.entry === '$page' ? [{ id: '$page' }] : report.entries.filter(entry => budget.entry === '*' || entry.id === budget.entry);
    if (!targets.length) {
      checks.push({ ...budget, actual: null, status: 'unmatched' }); continue;
    }
    for (const entry of targets) {
      let actual;
      if (entry.id === '$page') actual = report.scenario?.[budget.metric];
      else if (entry.work[budget.metric]?.kind === 'upper-bound') actual = entry.work[budget.metric].value;
      else if (budget.metric === 'snapshotSlots') actual = entry.restore.snapshotSlots;
      else if (budget.metric === 'coldBytes') actual = entry.code?.bytes;
      else if (budget.metric === 'coldGzipBytes') actual = entry.code?.gzipBytes;
      const known = typeof actual === 'number' && Number.isFinite(actual) && actual >= 0;
      checks.push({ entry: entry.id, metric: budget.metric, max: budget.max, actual: known ? actual : null,
        status: !known ? 'unknown' : actual <= budget.max ? 'pass' : 'exceeded' });
    }
  }
  return { ok: checks.every(check => check.status === 'pass'), checks };
}
