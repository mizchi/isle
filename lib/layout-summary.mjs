// CLI presentation only. The complete machine-readable report remains unchanged.
const interval = value => `${value.minInclusive === false ? '(' : '['}${value.minExact ?? value.min}, ${value.maxExact ?? value.max}${value.maxInclusive === false ? ')' : ']'}`;
function location(source, file, offset) {
  if (!Number.isInteger(offset)) return file;
  const before = source.slice(0, offset), line = before.split('\n').length;
  return `${file}:${line}:${before.length - before.lastIndexOf('\n')}`;
}

export function formatLayoutSummary(report, {file, source}) {
  const lines = [`Layout ${report.component ?? file}: ${report.status ?? 'invalid'}`];
  const viewport = report.scope?.viewport;
  if (viewport) lines.push(`Deployment: width ${interval(viewport)}px${viewport.height ? `; height ${interval(viewport.height)}px` : ''}`);
  const declarations = report.declarations ?? [];
  if (declarations.length) {
    const counts = new Map();
    for (const item of declarations) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    lines.push(`Declared instances: ${[...counts].map(([status,count]) => `${count} ${status}`).join(', ')}`);
  }
  const rows = [...(report.diagnostics ?? [])];
  for (const item of declarations.filter(item => item.status !== 'verified')) {
    const witness = item.proof.witness;
    if (witness && witness.axis !== undefined && witness.required !== undefined) {
      const diagnostic = (report.diagnostics ?? []).find(row => row.box === witness.box && row.path === witness.path);
      rows.push({...witness, source:diagnostic?.source, path:witness.path ?? item.instance.path,
        checkedContract:`${item.contract.component} at ${item.instance.path}`,
        message:`${witness.box ?? 'box'} ${witness.axis} size: requires ${witness.required}px but receives ${witness.available}px at viewport ${witness.viewportExact}px × ${witness.viewportHeightExact}px`});
    } else if (witness) rows.push({...witness,path:item.instance.path,message:`${item.contract.component}: implementation facts do not cover every required input, box and case`});
    for (const diagnostic of [...(item.coverage?.diagnostics ?? []),...(item.proof.diagnostics ?? [])]) rows.push({...diagnostic,path:item.instance.path});
  }
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.code,row.message,row.source,row.css,row.range,row.heightRange]);
    if (!groups.has(key)) groups.set(key, {row,paths:new Set(),contracts:new Set()});
    if (row.path) groups.get(key).paths.add(row.path);
    if (row.checkedContract) groups.get(key).contracts.add(row.checkedContract);
  }
  for (const {row,paths,contracts} of groups.values()) {
    const at = row.css ? `${row.css.file}:${row.css.line ?? 1}${row.css.column ? `:${row.css.column}` : ''}` : location(source,file,row.source?.start ?? row.start);
    lines.push(`${row.code}: ${row.message}`, `  at ${at}${paths.size ? `; instances: ${[...paths].join(', ')}` : ''}`);
    if (contracts.size) lines.push(`  checked contracts: ${[...contracts].join(', ')}`);
    if (row.range) lines.push(`  width ${interval(row.range)}px${row.heightRange ? `; height ${interval(row.heightRange)}px` : ''}`);
    if (row.hint) lines.push(`  ${row.hint}`);
    for(const related of row.related??[]) lines.push(`  ${related.message}: ${related.css.file}:${related.css.line}${related.css.column ? `:${related.css.column}` : ''}`);
  }
  if (report.assumptions?.length) lines.push('Scope: closed CSS and trusted content-size bounds; excludes ink overflow and browser pixel rounding.');
  lines.push('Full report: use --json (default).');
  return lines.join('\n');
}
