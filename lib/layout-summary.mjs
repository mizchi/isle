// CLI presentation only. The complete machine-readable report remains unchanged.
const interval = value => `${value.minInclusive === false ? '(' : '['}${value.minExact ?? value.min}, ${value.maxExact ?? value.max}${value.maxInclusive === false ? ')' : ']'}`;
function location(source, file, offset) {
  if (!Number.isInteger(offset)) return file;
  const before = source.slice(0, offset), line = before.split('\n').length;
  return `${file}:${line}:${before.length - before.lastIndexOf('\n')}`;
}

const cssAt = css => `${css.file}:${css.line}`;
const condition = css => css.conditions?.length ? ` under ${css.conditions.map(c => `@${c.kind}${c.name ? ` ${c.name}` : ''} ${c.params} (${cssAt(c.css)})`).join(' and ')}` : '';
/** ADR-0002: one line per side, citing only authored CSS, caller contracts and the viewport. */
export function explanationLines(explanation, limit = 6) {
  if (!explanation) return [];
  const lines = [], dormant = [], overridden = [];
  for (const side of ['available', 'required']) {
    const parts = [];
    for (const fact of explanation[side].facts) {
      if (fact.kind === 'viewport') parts.push(`viewport ${fact.axis} size${fact.hostInset ? ` minus host inset ${fact.hostInset}px` : ''}`);
      else if (fact.kind === 'contract') parts.push(`${fact.box} ${fact.property} ${fact.value}px (${fact.derivedFrom ? `derived from ${fact.derivedFrom}` : 'trusted contract'} ${JSON.stringify(fact.selector)})`);
      else if (fact.origin === 'author') parts.push(`${fact.box} ${fact.property}: ${fact.css.specified}${fact.css.specified === fact.value ? '' : ` = ${fact.value}`} (${cssAt(fact.css)}${condition(fact.css)})`);
      for (const entry of fact.overridden ?? []) overridden.push(`${fact.box} ${fact.property}: ${entry.css.specified} (${cssAt(entry.css)}${condition(entry.css)})`);
      for (const entry of fact.dormant ?? []) dormant.push(`${fact.box} ${fact.property}: ${entry.css.specified} (${cssAt(entry.css)}${condition(entry.css)})`);
    }
    if (parts.length) lines.push(`  ${side === 'available' ? 'offered by' : 'required by'}: ${parts.slice(0, limit).join('; ')}${parts.length > limit ? `; … ${parts.length - limit} more` : ''}`);
  }
  for (const [label, list] of [['overridden', overridden]]) {
    const items = [...new Set(list)];
    if (items.length) lines.push(`  ${label}: ${items.slice(0, limit).join('; ')}${items.length > limit ? `; … ${items.length - limit} more` : ''}`);
  }
  const unique = [...new Set(dormant)];
  if (unique.length) lines.push(`  not applied here: ${unique.slice(0, limit).join('; ')}${unique.length > limit ? `; … ${unique.length - limit} more` : ''}`);
  return lines;
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
  // Integrity warnings (clipped content, nested scrolling) are listed but do not change the status.
  const rows = [...(report.diagnostics ?? []), ...(report.integrity?.warnings ?? []), ...(report.accessibility?.warnings ?? [])];
  if(report.noshift) {
    const {noshift}=report;
    lines.push(`Noshift: ${noshift.status}; ${noshift.comparisons.checked}/${noshift.comparisons.planned} comparisons (all finite cases)`);
    rows.push(...noshift.diagnostics);
    for(const check of noshift.checks.filter(row=>row.status!=='verified')) {
      const witness=check.proof.witness,change=check.change;
      const index=check.contract.targets.findIndex(target=>target.name===(change?.target ?? witness?.box));
      const target=check.targets[index];
      const identity=check.identities?.find(row=>row.target===change?.target);
      const keys=identity?.keys.length ? ` key ${identity.keys.map(key=>JSON.stringify(key.value)).join(' / ')}` : '';
      if(witness) rows.push({...witness,source:target?.source ?? check.source,
        message:change ? `${JSON.stringify(target?.selector ?? (target?.nodeId ? '@noshift' : change.target))}${keys} ${change.field} changes by ${change.delta.exact}px (${change.before.exact} -> ${change.after.exact}) at viewport ${witness.viewportExact}px × ${witness.viewportHeightExact}px` : `${check.component}: noshift target must remain present in every live case`});
      rows.push(...check.proof.diagnostics.map(row=>({...row,path:check.path,source:target?.source ?? check.source})));
    }
  }
  for (const item of declarations.filter(item => item.status !== 'verified')) {
    const witness = item.proof.witness;
    if (witness && witness.axis !== undefined && witness.required !== undefined) {
      const diagnostic = (report.diagnostics ?? []).find(row => row.box === witness.box && row.path === witness.path);
      rows.push({...witness, source:diagnostic?.source, path:witness.path ?? item.instance.path,
        checkedContract:`${item.contract.component} at ${item.instance.path}`,
        message:`${witness.box ?? 'box'} ${witness.axis} size: requires ${witness.required}px but receives ${witness.available}px at viewport ${witness.viewportExact}px × ${witness.viewportHeightExact}px`});
    } else if (witness) rows.push({...witness,path:witness.path ?? item.instance.path,checkedContract:`${item.contract.component} at ${item.instance.path}`,
      message:witness.code.startsWith('U_') ? `${item.contract.component}: implementation facts do not cover every required input, box and case` : `${item.contract.component}: declared layout obligation failed`});
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
    if (row.text?.lines) lines.push(`  text: wraps into ${row.text.lines} lines at this width; ${row.text.fitsLines} fit`);
    else if (row.text) lines.push(`  text: up to ${row.text.fitsUpTo} of ${row.text.maxLength} characters fit here (widest ${JSON.stringify(row.text.widest)}); ${row.text.fitsUpTo + 1} or more may overflow`);
    lines.push(...explanationLines(row.explanation));
    for(const related of row.related??[]) lines.push(`  ${related.message}: ${related.css.file}:${related.css.line}${related.css.column ? `:${related.css.column}` : ''}`);
  }
  if (report.assumptions?.length) lines.push('Scope: closed CSS and trusted content-size bounds; excludes ink overflow and browser pixel rounding.');
  lines.push('Full report: use --json (default).');
  return lines.join('\n');
}
