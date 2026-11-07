import { q, add, sub, mul, cmp, div, exact, number } from './linear.mjs';
import { scalar, width, height, sum, diff, times, evaluate, affine, sample, rectangle, clip, partition, projection, serialize } from './region.mjs';
import { validateOptions, extractBoxes } from './input.mjs';
import { parseLayoutCSS, computeStyle, matches, px } from './css.mjs';
import { tracks, place } from './grid.mjs';
import { gapSize, trackArea, trackSlice, inheritTracks } from './subgrid.mjs';
import { scrollbarFrames } from './scrollbars.mjs';

const zero = q(0), one = q(1), minusOne = q(-1);
const total = values => values.reduce(sum, scalar(0));
const inlineFeature = feature => ['width', 'inline-size'].includes(feature);
const compare = (value, relation) => relation === '>=' ? value >= 0 : relation === '>' ? value > 0 : relation === '<=' ? value <= 0 : relation === '<' ? value < 0 : value === 0;
function length(value, parent) {
  if (/^\d+(?:\.\d+)?%$/.test(value)) {
    if (!parent) throw new Error('Percentage block size needs a definite containing size; intrinsic percentage cycles are not modeled');
    return times(parent, div(q(value.slice(0, -1)), q(100)));
  }
  return scalar(px(value));
}

export function analyzeLayout(ir, options, scrollbarProfile, budget, inlineSheets=[]) {
  const domain = validateOptions(options), block = options.block ?? Boolean(options.viewport.height);
  const component = options.component ?? ir.components[0]?.name;
  const h = options.viewport.height ?? { min: 0, max: 0 };
  const initial = rectangle(domain, { min: q(h.min), max: q(h.max) });
  const diagnostics = [], findings = [], checks = [], policies = [], sizes = [], queries = [], subgrids = [], scrollbars = [];
  let work = 0;
  const spend = count => {
    work += count;
    if(budget) {budget.remaining-=count;if(budget.remaining<0) throw Object.assign(new Error('Combined layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});}
    if (work > 2_000_000) throw Object.assign(new Error('Layout analysis work limit exceeded'),{code:'U_LAYOUT_LIMIT'});
  };
  const unknown = (code, message, line, box, file = options.cssFile ?? '<css>') => diagnostics.push({ code, severity: 'unknown', message, ...(line ? { css: { file, line } } : {}), ...(box ? { box: box.label, path: box.path, source: box.source } : {}) });
  const ranges = region => ({ range: projection(region, 'x'), ...(block ? { heightRange: projection(region, 'y'), region: serialize(region) } : {}) });
  const issue = (code, message, box, region, axis) => diagnostics.push({ code, severity: 'error', message, box: box.label, path: box.path, source: box.source, ...(axis ? { axis } : {}), ...ranges(region) });
  const subgridError = (message, box, region, axis) => Object.assign(new Error(message), { code: 'U_LAYOUT_SUBGRID', box, region, axis });
  const root = extractBoxes(ir, component, unknown), boxes = [];
  const collect = box => { if (box) { boxes.push(box); box.children.forEach(collect); } };
  collect(root);
  for (const [selector, contract] of Object.entries(options.boxes ?? {})) {
    const selected = boxes.filter(box => matches(selector, box));
    if (!selected.length) throw new Error(`Layout contract does not match a box: ${selector}`);
    for (const box of selected) { if (box.contract) throw new Error(`Ambiguous layout contracts for ${box.label}`); box.contract = contract; }
  }
  const styleSources = [...(options.reset ?? []).map((sheet, index) => ({ ...sheet, kind: 'reset', file: sheet.file ?? `<reset:${index}>` })), { css: options.css, kind: 'app', file: options.cssFile ?? '<css>' },...inlineSheets];
  const { rules, layers } = parseLayoutCSS(styleSources, (code, message, line, file) => unknown(code, message, line, undefined, file));
  for (const rule of rules) rule.layerName = rule.layer === null ? undefined : layers[rule.layer];
  const bounded = values => { spend(values.length); if (values.length > 512) throw new Error('Layout state limit exceeded'); return values; };

  function obligation(available, required, box, region, code, axis, enabled = true) {
    checks.push({ box: box.label, path: box.path, code, axis, ...ranges(region), available: affine(available), required: affine(required), enforced: enabled });
    if (!enabled) return;
    const failed = clip(region, diff(required, available), true);
    if (!failed) return;
    const p = sample(failed), need = evaluate(required, p), offered = evaluate(available, p);
    findings.push({ code, severity: 'error', box: box.label, path: box.path, source: box.source, axis,
      message: `${box.label} requires ${exact(need)}px but receives ${exact(offered)}px on ${axis} axis at viewport ${exact(p.x)}px${block ? ` × ${exact(p.y)}px` : ''}`,
      ...ranges(failed), signature: JSON.stringify([box.path, code, axis, affine(available), affine(required)]),
      witness: { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}), available: number(offered), required: number(need) },
    });
  }

  function context(condition, ancestors) {
    let target;
    if (condition.kind === 'media') target = { inline: width, block: options.viewport.height ? height : null };
    else {
      const needsBlock = condition.groups.flat().some(atom => !inlineFeature(atom.feature));
      target = ancestors.findLast(ancestor => (!condition.name || ancestor.names.includes(condition.name)) &&
        (ancestor.type === 'size' || (!needsBlock && ancestor.type === 'inline-size')));
      if (!target) return { groups: [], target: undefined };
    }
    const groups = condition.groups.map(group => group.map(atom => {
      const size = inlineFeature(atom.feature) ? target.inline : target.block;
      if (!size) throw new Error('Height condition needs a known container/viewport block size');
      return { slack: diff(size, scalar(atom.value)), relation: atom.relation };
    }));
    return { groups, target: target.box?.label, path: target.box?.path };
  }
  function styles(box, region, ancestors, inherited, emit, gridItem = true) {
    spend(rules.length + 1);
    const relevant = rules.filter(rule => rule.selectors.some(selector => matches(selector, box)));
    const contexts = new Map();
    for (const rule of relevant) for (const condition of rule.contexts) if (!contexts.has(condition)) contexts.set(condition, context(condition, ancestors));
    let regions = [region];
    const split = new Set();
    for (const compiled of contexts.values()) for (const atom of compiled.groups.flat()) {
      const key = JSON.stringify([affine(atom.slack), atom.relation]);
      if (split.has(key)) continue; split.add(key);
      regions = regions.flatMap(r => { const p = partition(r, atom.slack, atom.relation); return [...p.yes, ...p.no]; });
      if (regions.length > 512) throw new Error('Conditional region limit exceeded');
    }
    return regions.map(r => {
      const p = sample(r), activeContext = compiled => compiled.groups.some(group => group.every(atom => compare(cmp(evaluate(atom.slack, p), zero), atom.relation)));
      const active = rule => rule.contexts.every(condition => activeContext(contexts.get(condition)));
      let style;
      try {style=computeStyle(relevant,box,active,inherited,{spend});}
      catch(error) {error.box ??= box;throw error;}
      if (gridItem && inherited && style.display === 'inline') style.display = 'block';
      if (emit) for (const [condition, compiled] of contexts) if (condition.kind === 'container') queries.push({ box: box.label, path: box.path, name: condition.name, target: compiled.target, targetPath: compiled.path, matched: activeContext(compiled), ...ranges(r) });
      return { region: r, style };
    });
  }
  const maximum = (region, a, b) => {
    const p = partition(region, diff(a, b), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
  const clamp = (region, value) => maximum(region, value, scalar(0));
  function intrinsic(box, content, region) {
    const value = box.contract?.intrinsicBlockSize;
    if (typeof value === 'number') return [{ region, value: scalar(value) }];
    if (Array.isArray(value)) {
      let states = [{ region, value: null }];
      for (const entry of value) states = states.flatMap(state => {
        const p = partition(state.region, diff(content, scalar(entry.atLeastInlineSize)), '>=');
        return [...p.yes.map(region => ({ region, value: scalar(entry.blockSize) })), ...p.no.map(region => ({ ...state, region }))];
      });
      for (const state of states) if (!state.value) unknown('U_LAYOUT_INTRINSIC', 'Intrinsic block profile does not cover the available inline size', undefined, box);
      return states.filter(state => state.value);
    }
    if (box.text) throw new Error('Automatic text height needs an intrinsicBlockSize contract');
    return [{ region, value: scalar(0) }];
  }
  function validate(style, box, region, emit) {
    if (style.display === 'none') return false;
    if(box.tag==='button' && (style.appearance!=='none' || style.display!=='block')) throw new Error('Checked buttons require appearance:none, display:block and explicit box-sizing/min-size/padding/border resets');
    if (['left', 'right', 'inline-start', 'inline-end'].includes(style.float)) { issue('E_LAYOUT_FLOAT', 'float is forbidden in checked layout', box, region); return false; }
    if (style.float !== 'none') throw new Error('Unsupported float value');
    if (!['block', 'grid'].includes(style.display)) {
      if (style.display === 'flex') issue('E_LAYOUT_CONTAINER', 'Layout containers must use grid', box, region);
      else throw new Error(`Unsupported display: ${style.display}`);
      return false;
    }
    if (style.display === 'grid' && box.text) throw new Error('Wrap text in an explicit leaf; anonymous grid text items need a layout adapter');
    if (['margin-left', 'margin-right'].some(key => style[key] !== '0')) throw new Error('Only known zero inline margins are supported');
    if (block && ['margin-top', 'margin-bottom'].some(key => style[key] !== '0')) throw new Error('Reset native block margins explicitly before block checking');
    if (!['static', 'relative'].includes(style.position) || style['writing-mode'] !== 'horizontal-tb' || style.direction !== 'ltr') throw new Error('Only in-flow horizontal-tb / ltr boxes are supported');
    if (!['border-box', 'content-box'].includes(style['box-sizing'])) throw new Error('Unsupported box-sizing');
    if (!['normal', 'inline-size', 'size'].includes(style['container-type'])) throw new Error('Unsupported container-type');
    if (style['container-name'] !== 'none' && !style['container-name'].split(/\s+/).every(name => /^[a-zA-Z_][\w-]*$/.test(name) && !['and', 'or', 'not', 'none', 'default', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(name.toLowerCase()))) throw new Error('Unsupported container-name');
    for (const axis of ['inline', 'block']) {
      const key = axis === 'inline' ? 'x' : 'y', policy = box.contract?.[axis === 'inline' ? 'overflow' : 'overflowBlock'] ?? 'fit';
      if (!['visible', 'hidden', 'clip', 'auto', 'scroll'].includes(style[`overflow-${key}`])) throw new Error('Unsupported overflow value');
      if (axis === 'block' && !block) continue;
      if (emit) {
        const value = style[`overflow-${key}`];
        if ((policy === 'scroll' && !['auto', 'scroll'].includes(value)) || (policy === 'clip' && !['clip', 'hidden'].includes(value)) || (policy === 'visible' && value !== 'visible')) issue('E_LAYOUT_OVERFLOW_POLICY', `Requested ${policy} policy disagrees with computed overflow-${key}: ${value}`, box, region, axis);
        policies.push({ box: box.label, path: box.path, axis, overflow: policy, ...ranges(region) });
      }
    }
    if (!['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'].includes(style['white-space']) || !['normal', 'anywhere', 'break-word'].includes(style['overflow-wrap'])) throw new Error('Unsupported text wrapping value');
    const nowrap = ['nowrap', 'pre'].includes(style['white-space']), wrap = box.contract?.wrap;
    if (emit && ((wrap === 'anywhere' && (nowrap || style['overflow-wrap'] !== 'anywhere')) || (wrap === 'normal' && nowrap) || (wrap === 'nowrap' && !nowrap))) issue('E_LAYOUT_WRAP', `Requested ${wrap} wrapping disagrees with CSS`, box, region);
    for (const axis of ['inline', 'block']) {
      if (axis === 'block' && !block) {
        if (style['block-size'] !== 'auto' || style['grid-template-rows'] !== 'none') throw new Error('Enable block checking for explicit block sizes or row tracks');
        continue;
      }
      if (style[`max-${axis}-size`] !== 'none') throw new Error('CSS max size clamping is not modeled');
      if (axis === 'inline') {
        if (style['min-inline-size'] !== 'auto') px(style['min-inline-size']);
      } else if (!['auto', '0', '0px'].includes(style['min-block-size'])) throw new Error('CSS min-block-size clamping is not modeled');
    }
    if (block && (!['normal', 'stretch'].includes(style['align-items']) || !['auto', 'normal', 'stretch'].includes(style['align-self']) || !['normal', 'stretch', 'start'].includes(style['align-content']))) throw new Error('Only stretch items and normal/stretch/start content alignment are supported');
    return true;
  }

  function flex(region, available, definitions, gap, bases, stretchAuto) {
    const overhead = sum(total(bases), scalar(gap));
    return clamp(region, diff(available, overhead)).map(({ region, value: free }) => {
      const weights = definitions.filter(t => t.weight).map(t => t.weight).reduce(add, zero);
      const denominator = cmp(weights, one) < 0 ? one : weights;
      const automatic = definitions.filter(t => t.auto).length;
      const allocatedFraction = div(weights, denominator);
      const remaining = times(free, sub(one, allocatedFraction));
      const values = definitions.map((track, index) => track.weight ? times(free, div(track.weight, denominator)) :
        track.auto && stretchAuto ? sum(bases[index], times(remaining, div(one, q(automatic)))) : bases[index]);
      return { region, values, required: overhead };
    });
  }
  function finish(box, style, region, inline, contentInline, blockSize, contentBlock, available, parents, emit) {
    const contract = box.contract ?? {};
    if (emit) {
      obligation(available.inline, inline, box, region, 'E_LAYOUT_ITEM_SIZE', 'inline', available.fitInline !== false);
      if (contract.minInlineSize !== undefined) obligation(contentInline, scalar(contract.minInlineSize), box, region, 'E_LAYOUT_CONTENT', 'inline', (contract.overflow ?? 'fit') === 'fit');
      if (block) {
        if (available.block) obligation(available.block, blockSize, box, region, 'E_LAYOUT_ITEM_SIZE', 'block', available.fitBlock !== false);
        if (contract.minBlockSize !== undefined) obligation(contentBlock, scalar(contract.minBlockSize), box, region, 'E_LAYOUT_CONTENT', 'block', (contract.overflowBlock ?? 'fit') === 'fit');
      }
      sizes.push({ box: box.label, path: box.path, boxSizing: style['box-sizing'], boxSizingSource: style.$sources['box-sizing'], inlineSize: affine(inline), ...(available.scrollbarFrame ? {contentInlineSize:affine(contentInline),...(contentBlock ? {contentBlockSize:affine(contentBlock)} : {})} : {}), ...(blockSize ? { blockSize: affine(blockSize) } : {}), ...ranges(region) });
    }
    if (!box.children.length) {
      if (box.text && contract.minInlineSize === undefined && (contract.overflow ?? 'fit') === 'fit') unknown('U_LAYOUT_INTRINSIC', 'Text needs a minInlineSize bound or an explicit overflow policy', undefined, box);
      if (block && box.text && (contract.overflowBlock ?? 'fit') === 'fit') {
        if (contract.intrinsicBlockSize !== undefined) for (const required of intrinsic(box, contentInline, region)) {
          if (emit) obligation(contentBlock, required.value, box, required.region, 'E_LAYOUT_CONTENT', 'block');
        }
        else if (contract.minBlockSize === undefined) unknown('U_LAYOUT_INTRINSIC', 'Text needs a block-height contract or an explicit overflowBlock policy', undefined, box);
      }
    }
    return { region, inline, block: blockSize };
  }

  function subgridGeometry(style, box, available, region, emit) {
    const axes = {};
    let geometryRegions = [region];
    for (const [axis, property, sides, gapProperty] of [
      ['inline', 'grid-template-columns', ['left', 'right'], 'column-gap'],
      ['block', 'grid-template-rows', ['top', 'bottom'], 'row-gap'],
    ]) {
      if (style.display !== 'grid' || !/^subgrid\b/.test(style[property])) continue;
      if (style[property] !== 'subgrid') throw subgridError('Subgrid line names and repeat syntax are not modeled', box, region, axis);
      if (style['container-type'] !== 'normal') throw subgridError('Subgrid size-query containment differs across target browsers; put the size query container on a parent', box, region, axis);
      const parent = available.tracks?.[axis];
      if (!parent) throw subgridError('Subgrid requires resolved parent tracks; external parents and intrinsic row contributions are not modeled', box, region, axis);
      if (style[`${axis}-size`] !== 'auto') throw subgridError('Checked subgrids require auto size in their shared axis', box, region, axis);
      if (style[`min-${axis}-size`] !== 'auto' && cmp(px(style[`min-${axis}-size`]), zero) !== 0) throw subgridError('Minimum size on a shared subgrid axis is outside the checked subset', box, region, axis);
      const insets = sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`])));
      const gap = gapSize(style[gapProperty], parent), values = inheritTracks(parent, gap, ...insets);
      axes[axis] = { ...parent, gap, values, insets };
      for (const value of values) geometryRegions = bounded(geometryRegions.flatMap(region => {
        const parts = partition(region, value, '>=');
        for (const failed of parts.no) diagnostics.push({ code: 'U_LAYOUT_SUBGRID', severity: 'unknown', message: 'Subgrid gap/insets produce a negative effective track; CSS collapse is not modeled', box: box.label, path: box.path, source: box.source, axis, ...ranges(failed) });
        return parts.yes;
      }));
    }
    if (emit) for (const geometryRegion of geometryRegions) for (const [axis, inheritedAxis] of Object.entries(axes)) subgrids.push({ box: box.label, path: box.path, axis,
      parent: inheritedAxis.box.label, parentPath: inheritedAxis.box.path, startLine: inheritedAxis.startLine, span: inheritedAxis.values.length,
      gap: exact(inheritedAxis.gap), insets: inheritedAxis.insets.map(exact), tracks: inheritedAxis.values.map(affine), ...ranges(geometryRegion) });
    return { axes, regions: geometryRegions };
  }

  function solve(box, available, region, parents = [], inherited, emit = true) {
    let results = [];
    try {
      for (const state of styles(box, region, parents, inherited, emit, !available.root)) {
        const { style } = state;
        if (!validate(style, box, state.region, emit)) continue;
        if (box.tag==='body' && parents.at(-1)?.box.documentRoot && inherited['overflow-x']==='visible' && inherited['overflow-y']==='visible' && inherited['container-type']==='normal' && style['container-type']==='normal' && (style['overflow-x']!=='visible' || style['overflow-y']!=='visible')) throw Object.assign(new Error('Body overflow propagation requires explicit overflow on html; set html overflow to auto or hidden'),{code:'U_LAYOUT_SCROLLBAR'});
        const incoming=available;
        for (const frame of scrollbarFrames(style,scrollbarProfile,box.documentRoot)) {
        const active=frame.inlineSize>0 || frame.blockSize>0;
        if (active && (style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid')) throw Object.assign(new Error('Scrollbar insets on a shared subgrid axis need an adapter'),{code:'U_LAYOUT_SUBGRID',box,region:state.region,axis:'inline'});
        // Root scrollbars reduce the viewport; local scrollbars reduce the content box.
        const available=box.documentRoot ? {...incoming,inline:diff(incoming.inline,scalar(frame.inlineSize)),block:incoming.block ? diff(incoming.block,scalar(frame.blockSize)) : null,scrollbarFrame:active} : {...incoming,scrollbarFrame:active};
        if(emit && (active || ['auto','scroll'].includes(style['overflow-x']) || ['auto','scroll'].includes(style['overflow-y']))) scrollbars.push({box:box.label,path:box.path,...frame,viewport:Boolean(box.documentRoot),...ranges(state.region)});
        const edge = sides => scalar(sides.map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero));
        const cssInlineEdges=edge(['left','right']),cssBlockEdges=edge(['top','bottom']);
        const inlineEdges = sum(cssInlineEdges,scalar(box.documentRoot ? 0 : frame.inlineSize)), blockEdges = sum(cssBlockEdges,scalar(box.documentRoot ? 0 : frame.blockSize));
        let preferred = style['inline-size'] === 'auto' ? available.inline : length(style['inline-size'], available.inline);
        if (style['inline-size'] !== 'auto' && style['box-sizing'] === 'content-box') preferred = sum(preferred, cssInlineEdges);
        const minimum = style['min-inline-size'] === 'auto' ? zero : px(style['min-inline-size']);
        const minimumBorderBox = sum(scalar(minimum), style['box-sizing'] === 'content-box' ? cssInlineEdges : scalar(0));
        const preferredStates = cmp(minimum, zero) > 0 ? maximum(state.region, preferred, minimumBorderBox) : [{ region: state.region, value: preferred }];
        for (const proposal of preferredStates) if (emit) obligation(proposal.value, inlineEdges, box, proposal.region, 'E_LAYOUT_BOX_EDGES', 'inline');
        const contentStates = preferredStates.flatMap(proposal => clamp(proposal.region, diff(proposal.value, inlineEdges)));
        for (const content of contentStates) {
          const inline = sum(content.value, inlineEdges), contentInline = content.value;
          let fixedBlock = null;
          if (block) {
            if (style['block-size'] !== 'auto') fixedBlock = length(style['block-size'], available.block);
            else if (!available.root && available.block) fixedBlock = available.block;
            else if (style['container-type'] === 'size') fixedBlock = blockEdges;
            if (style['block-size'] !== 'auto' && style['box-sizing'] === 'content-box') fixedBlock = sum(fixedBlock, cssBlockEdges);
          }
          const blockStates = fixedBlock ? clamp(content.region, diff(fixedBlock, blockEdges)) : [{ region: content.region, value: null }];
          if (fixedBlock && emit) obligation(fixedBlock, blockEdges, box, content.region, 'E_LAYOUT_BOX_EDGES', 'block');
          for (const bs of blockStates) {
            const knownBlock = bs.value, own = { box, inline: contentInline, block: knownBlock, type: style['container-type'], names: style['container-name'] === 'none' ? [] : style['container-name'].split(/\s+/) };
            const ancestors = [...parents, own];
            const { axes: inheritedAxes, regions: geometryRegions } = subgridGeometry(style, box, available, bs.region, emit);
            for (const geometryRegion of geometryRegions) {
              // Even an empty Grid has explicit tracks and contributes their
              // height/overflow. Only ordinary leaves use intrinsic height.
              if (!box.children.length && style.display !== 'grid') {
                const heights = !block ? [{ region: geometryRegion, value: null }] : knownBlock ? [{ region: geometryRegion, value: knownBlock }] : intrinsic(box, contentInline, geometryRegion);
                for (const h of heights) results.push(finish(box, style, h.region, inline, contentInline, h.value ? sum(h.value, blockEdges) : null, h.value, available, parents, emit));
                continue;
              }
              if (style.display !== 'grid') { issue('E_LAYOUT_CONTAINER', 'Layout containers must use grid', box, bs.region); continue; }
              if (style['grid-auto-flow'] !== 'row') throw new Error('Only sparse row auto-placement is supported');
              const sharedColumns = inheritedAxes.inline;
              const columns = sharedColumns ? sharedColumns.values.map(value => ({ definite: value })) :
                !box.children.length && style['grid-template-columns'] === 'none' ? [] : tracks(style['grid-template-columns'] ?? 'none');
              const columnGap = gapSize(style['column-gap'], sharedColumns);
              const columnBases = columns.map(track => scalar(track.fixed ?? zero));
              const columnLayouts = sharedColumns ? [{ region: geometryRegion, values: sharedColumns.values, required: trackArea(sharedColumns.values, columnGap, 0, columns.length) }] : flex(geometryRegion, contentInline, columns, mul(columnGap, q(Math.max(0, columns.length - 1))), columnBases, false);
              for (const cs of columnLayouts) {
                if (emit) obligation(contentInline, cs.required, box, cs.region, 'E_LAYOUT_TRACKS', 'inline', (box.contract?.overflow ?? 'fit') === 'fit');
                let childStates = [{ region: cs.region, children: [] }];
                for (const child of box.children) childStates = bounded(childStates.flatMap(s => styles(child, s.region, ancestors, style, false).map(c => ({ region: c.region, children: c.style.display === 'none' ? s.children : [...s.children, { box: child, style: c.style }] }))));
                for (const children of childStates) {
                  let placed;
                  try { placed = place(children.children, columns.length, { subgridColumns: Boolean(sharedColumns), rows: inheritedAxes.block?.values.length }); }
                  catch (error) { error.region = children.region; throw error; }
                  const areaInline = item => trackArea(cs.values, columnGap, item.start, item.span);
                  const childColumns = item => trackSlice(cs.values, columnGap, box, item.start, item.span);
                  if (!block) {
                    let endings = [children.region];
                    for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: areaInline(item), tracks: { inline: childColumns(item) }, fitInline: (box.contract?.overflow ?? 'fit') === 'fit' }, r, ancestors, style, emit).map(result => result.region)));
                    for (const r of endings) results.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
                    continue;
                  }
                  const rowCount = placed.length ? Math.max(...placed.map(item => item.row + item.rowSpan)) : 0;
                  const sharedRows = inheritedAxes.block;
                  let rows = sharedRows ? sharedRows.values.map(value => ({ definite: value })) : style['grid-template-rows'] === 'none' ? [] : tracks(style['grid-template-rows'], true);
                  const explicitRowCount = rows.length;
                  const implicit = sharedRows ? [] : tracks(style['grid-auto-rows'], true);
                  while (rows.length < rowCount) rows.push(implicit[(rows.length - explicitRowCount) % implicit.length]);
                  if (rows.length > 2048) throw new Error('Grid row limit exceeded');
                  const rowGap = gapSize(style['row-gap'], sharedRows), gaps = mul(rowGap, q(Math.max(0, rows.length - 1)));
                  for (const item of placed) if (rows.slice(item.row, item.row + item.rowSpan).some(row => row.auto || (!knownBlock && row.weight)) &&
                    (item.rowSpan > 1 || item.style['grid-template-rows'] === 'subgrid')) {
                    throw subgridError('Intrinsic row contributions across subgrids or row spans are not modeled; use independently sized parent rows', item.box, children.region, 'block');
                  }
                  let measurements = [{ region: children.region, bases: rows.map(row => row.definite ?? scalar(row.fixed ?? zero)) }];
                  for (const item of placed.filter(item => rows[item.row].auto || (!knownBlock && rows[item.row].weight))) {
                    measurements = bounded(measurements.flatMap(m => solve(item.box, { inline: areaInline(item), tracks: { inline: childColumns(item) } }, m.region, ancestors, style, false).flatMap(measured => maximum(measured.region, m.bases[item.row], measured.block).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) })))));
                  }
                  for (const m of measurements) {
                    let fractions = [{ region: m.region, value: scalar(0) }];
                    if (!knownBlock) for (let i = 0; i < rows.length; i++) if (rows[i].weight) {
                      const divisor = cmp(rows[i].weight, one) > 0 ? rows[i].weight : one;
                      fractions = fractions.flatMap(f => maximum(f.region, f.value, times(m.bases[i], div(one, divisor))));
                    }
                    const layouts = sharedRows ? [{ region: m.region, values: sharedRows.values, required: trackArea(sharedRows.values, rowGap, 0, rows.length) }] : knownBlock ? flex(m.region, knownBlock, rows, gaps, m.bases, style['align-content'] !== 'start') : fractions.map(f => {
                      const values = rows.map((row, i) => row.weight ? times(f.value, row.weight) : m.bases[i]);
                      return { region: f.region, values, required: sum(total(values), scalar(gaps)) };
                    });
                    for (const rs of layouts) {
                      const contentBlock = knownBlock ?? rs.required, blockSize = sum(contentBlock, blockEdges);
                      const finalAncestors = [...parents, { ...own, block: contentBlock }];
                      if (emit) obligation(contentBlock, rs.required, box, rs.region, 'E_LAYOUT_TRACKS', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit');
                      let endings = [rs.region];
                      for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: areaInline(item), block: trackArea(rs.values, rowGap, item.row, item.rowSpan),
                        tracks: { inline: childColumns(item), block: trackSlice(rs.values, rowGap, box, item.row, item.rowSpan) },
                        fitInline: (box.contract?.overflow ?? 'fit') === 'fit', fitBlock: (box.contract?.overflowBlock ?? 'fit') === 'fit' }, r, finalAncestors, style, emit).map(result => result.region)));
                      for (const r of endings) results.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
                    }
                  }
                }
              }
            }
          }
        }
        }
      }
    } catch (error) {
      if (error.code?.startsWith('E_LAYOUT_')) issue(error.code, error.message, error.box ?? box, error.region ?? region, error.axis);
      else if (error.code === 'U_LAYOUT_SUBGRID') diagnostics.push({ code: error.code, severity: 'unknown', message: error.message, box: error.box.label, path: error.box.path, source: error.box.source, axis: error.axis, ...ranges(error.region) });
      else unknown(error.code?.startsWith('U_LAYOUT_') ? error.code : 'U_LAYOUT_GEOMETRY', error.message, error.css?.line, error.box ?? box,error.css?.file);
    }
    return results;
  }
  if (!diagnostics.length) {
    try {
      let environments = [{ region: initial, style: undefined }];
      for (let i = 0; i < (options.ancestors ?? []).length; i++) {
        const ancestor = options.ancestors[i];
        const host = { ...ancestor, classes: ancestor.classes ?? [], documentRoot: i === 0 && ancestor.tag === 'html', label: `ancestor:${ancestor.tag}`, path: `ancestor/${i}` };
        environments = bounded(environments.flatMap(environment => styles(host, environment.region, [], environment.style, false, false).filter(state => {
          if (state.style.display === 'none') { unknown('U_LAYOUT_ANCESTOR', 'A hidden ancestor cannot provide the declared containing sizes', undefined, host); return false; }
          if (state.style['container-type'] === 'normal') return true;
          unknown('U_LAYOUT_ANCESTOR', 'Query containers need size geometry; include this ancestor in the analyzed template', undefined, host); return false;
        })));
      }
      for (const environment of environments) solve(root, { root: true, inline: diff(width, scalar(options.hostInset ?? 0)), block: block && options.viewport.height ? diff(height, scalar(options.hostBlockInset ?? 0)) : null }, environment.region, [], environment.style);
    } catch (error) { unknown(error.code?.startsWith('U_LAYOUT_') ? error.code : 'U_LAYOUT_ANCESTOR', error.message,error.css?.line,undefined,error.css?.file); }
  }
  // Preserve compact one-dimensional diagnostics; 2-D regions retain correlated constraints.
  findings.sort((a, b) => a.signature.localeCompare(b.signature) || a.range.min - b.range.min);
  const merged = [];
  for (const finding of findings) {
    const previous = merged.at(-1);
    if (!block && previous?.signature === finding.signature && previous.range.maxExact === finding.range.minExact && (previous.range.maxInclusive || finding.range.minInclusive)) previous.range = { ...previous.range, max: finding.range.max, maxExact: finding.range.maxExact, maxInclusive: finding.range.maxInclusive };
    else merged.push({ ...finding });
  }
  diagnostics.push(...merged.map(({ signature, ...finding }) => finding));
  const status = diagnostics.some(d => d.severity === 'unknown') ? 'unknown' : diagnostics.length ? 'violated' : 'verified';
  return { version: 1, ok: status === 'verified', status, component,
    scope: { axis: block ? 'both' : 'inline', viewport: { ...projection(initial, 'x'), ...(block ? { height: options.viewport.height ? projection(initial, 'y') : null } : {}) }, hostInset: options.hostInset ?? 0, ...(block ? { hostBlockInset: options.hostBlockInset ?? 0 } : {}), closedCSS: true, browserRounding: false, blockSizing: block },
    assumptions: ['The supplied CSS is the complete author cascade and the selected root has no external query-container ancestors; host provides the declared containing sizes without unmodeled scrollbar gutters.',
      'Each minInlineSize/minBlockSize is a trusted sufficient content-size bound; intrinsicBlockSize is a trusted exact auto-height profile for the permitted content/fonts.',
      'Only horizontal-tb/ltr in-flow geometry is checked; ink overflow and browser pixel rounding are outside the contract.',
      ...(rules.some(rule=>rule.declarations.some(d=>d.expression || d.pending)) ? ['Custom properties are unregistered; unknown external inheritance and cycles through fallback references prevent verification when used by geometry.'] : [])],
    styleSources: styleSources.map(({ kind, file }) => ({ kind, file })), diagnostics, policies, checks, sizes, queries, subgrids, ...(scrollbars.length ? {scrollbars} : {}) };
}
