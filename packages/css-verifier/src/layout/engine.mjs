import { q, add, sub, mul, cmp, div, exact, number } from './linear.mjs';
import { scalar, width, height, sum, diff, times, evaluate, affine, sample, rectangle, clip, partition, projection, serialize } from './region.mjs';
import { validateOptions } from './input.mjs';
import { parseLayoutCSS, computeStyle, matches, px } from './css.mjs';
import { tracks, place } from './grid.mjs';
import { gapSize, trackArea, trackSlice, inheritTracks } from './subgrid.mjs';
import { scrollbarFrames } from './scrollbars.mjs';
import {absoluteOrigin} from './positioned.mjs';
import {textFontMismatch, textLinesMismatch, textLangMismatch, fittingLength, fittingLines} from './text-font.mjs';
import {validateFlexContainer, flexItem, crossAlignment, distribution, flexUnknown} from './flex.mjs';
import {judgeIntegrity} from './integrity.mjs';
import {judgeAccessibility, accessibilityRules, paintFacts} from './accessibility.mjs';
import {fact, sizeChain, sizeProperties, trackProperties, contractFact, explanation} from './explain.mjs';

const zero = q(0), one = q(1), minusOne = q(-1);
const total = values => values.reduce(sum, scalar(0));
const trackStart = (values,gap,index) => sum(total(values.slice(0,index)),scalar(mul(gap,q(index))));
const offset = (origin,inline,block) => origin ? {inline:sum(origin.inline,inline),block:sum(origin.block,block)} : null;
const inlineFeature = feature => ['width', 'inline-size'].includes(feature);
const compare = (value, relation) => relation === '>=' ? value >= 0 : relation === '>' ? value > 0 : relation === '<=' ? value <= 0 : relation === '<' ? value < 0 : value === 0;
function length(value, parent) {
  if (/^\d+(?:\.\d+)?%$/.test(value)) {
    if (!parent) throw new Error('Percentage block size needs a definite containing size; intrinsic percentage cycles are not modeled');
    return times(parent, div(q(value.slice(0, -1)), q(100)));
  }
  return scalar(px(value));
}

export function analyzeBoxTree(root, options, scrollbarProfile, budget, inlineSheets=[], inputDiagnostics=[]) {
  const domain = validateOptions(options), block = options.block ?? Boolean(options.viewport.height);
  const component = options.name ?? 'Document';
  const h = options.viewport.height ?? { min: 0, max: 0 };
  const initial = rectangle(domain, { min: q(h.min), max: q(h.max) });
  const diagnostics = [...inputDiagnostics], findings = [], checks = [], policies = [], sizes = [], queries = [], subgrids = [], scrollbars = [], invalidSubstitutions = [];
  // Live geometry and waived obligations for the opt-in integrity rules.
  const geometry = [], waived = [];
  // Paint facts of the options.ancestors chain (html, body, …) for the accessibility rules.
  let ancestorPaint = [];
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
  const boxes = [];
  const collect = box => { if (box) { boxes.push(box); box.children.forEach(collect); } };
  collect(root);
  for (const [selector, contract] of Object.entries(options.boxes ?? {})) {
    const selected = boxes.filter(box => matches(selector, box));
    if (!selected.length) throw new Error(`Layout contract does not match a box: ${selector}`);
    for (const box of selected) { if (box.contract) throw new Error(`Ambiguous layout contracts for ${box.label}`); box.contract = contract; box.contractSelector = selector; }
  }
  const styleSources = [...(options.reset ?? []).map((sheet, index) => ({ ...sheet, kind: 'reset', file: sheet.file ?? `<reset:${index}>` })), { css: options.css, kind: 'app', file: options.cssFile ?? '<css>' },...inlineSheets];
  const { rules, layers } = parseLayoutCSS(styleSources, (code, message, line, file, detail) => {
    if(detail) diagnostics.push({code,message,...detail});
    else unknown(code,message,line,undefined,file);
  });
  for (const rule of rules) rule.layerName = rule.layer === null ? undefined : layers[rule.layer];
  const bounded = values => { spend(values.length); if (values.length > 512) throw new Error('Layout state limit exceeded'); return values; };

  function obligation(available, required, box, region, code, axis, enabled = true, explain, annotate) {
    checks.push({ box: box.label, path: box.path, code, axis, ...ranges(region), available: affine(available), required: affine(required), enforced: enabled });
    if (!enabled) {
      // A contract allowed this overflow; the integrity rules still report where it happens.
      const failed = clip(region, diff(required, available), true);
      if (failed) waived.push({ box, path: box.path, code, axis, region: failed, self: code !== 'E_LAYOUT_ITEM_SIZE' });
      return;
    }
    const failed = clip(region, diff(required, available), true);
    if (!failed) return;
    const p = sample(failed), need = evaluate(required, p), offered = evaluate(available, p);
    findings.push({ code, severity: 'error', box: box.label, path: box.path, source: box.source, axis,
      message: `${box.label} requires ${exact(need)}px but receives ${exact(offered)}px on ${axis} axis at viewport ${exact(p.x)}px${block ? ` × ${exact(p.y)}px` : ''}`,
      ...ranges(failed), signature: JSON.stringify([box.path, code, axis, affine(available), affine(required)]),
      witness: { viewport: number(p.x), viewportExact: exact(p.x), ...(block ? { viewportHeight: number(p.y), viewportHeightExact: exact(p.y) } : {}), available: number(offered), required: number(need) },
      ...(explain ? { explanation: explain() } : {}),
      ...(annotate ? annotate(offered) : {}),
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
      if (emit) for (const entry of style.$invalid) invalidSubstitutions.push({ box: box.label, path: box.path, property: entry.property, longhands: entry.longhands, css: { file: entry.file, line: entry.line }, reason: entry.code === 'U_LAYOUT_VARIABLE_CYCLE' ? 'cycle' : 'guaranteed-invalid', message: entry.message, resolution: 'unset', ...ranges(r) });
      if (emit) for (const [condition, compiled] of contexts) if (condition.kind === 'container') queries.push({ box: box.label, path: box.path, name: condition.name, target: compiled.target, targetPath: compiled.path, matched: activeContext(compiled), ...ranges(r) });
      return { region: r, style };
    });
  }
  const maximum = (region, a, b) => {
    const p = partition(region, diff(a, b), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
  const clamp = (region, value) => maximum(region, value, scalar(0));
  // A box paints when it has a border or a background (vlmkit's painted-parent filter).
  const paints = style => ['left','right','top','bottom'].some(side => cmp(px(style[`border-${side}`]), zero) > 0) || style['background-image'] !== 'none' ||
    !/^(?:transparent|initial|unset|revert|rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0\s*\)|#(?:[\da-f]{3}0|[\da-f]{6}00)|hsla\([^)]*,\s*0\s*\))$/.test(style['background-color']);
  // Flex sizes: constants compared without splitting a region.
  const constantLess = (a, b) => cmp(evaluate(a, { x: zero, y: zero }), evaluate(b, { x: zero, y: zero })) < 0 && cmp(a.x, zero) === 0 && cmp(a.y, zero) === 0 && cmp(b.x, zero) === 0 && cmp(b.y, zero) === 0;
  const maximumConstant = (a, b) => { if ([a, b].some(v => cmp(v.x, zero) || cmp(v.y, zero))) throw flexUnknown('A content-dependent minimum with a different base is outside the subset'); return constantLess(a, b) ? b : a; };
  function intrinsic(box, content, region) {
    const value = box.contract?.intrinsicBlockSize;
    if (typeof value === 'number') return [{ region, value: scalar(value) }];
    if (Array.isArray(value)) {
      let states = [{ region, value: null }];
      for (const entry of value) states = states.flatMap(state => {
        const p = partition(state.region, diff(content, scalar(entry.atLeastInlineSize)), '>=');
        return [...p.yes.map(region => ({ region, value: entry.blockSize === null ? 'undetermined' : scalar(entry.blockSize) })), ...p.no.map(region => ({ ...state, region }))];
      });
      for (const state of states) {
        if (!state.value) unknown('U_LAYOUT_INTRINSIC', 'Intrinsic block profile does not cover the available inline size', undefined, box);
        else if (state.value === 'undetermined') { const r = ranges(state.region).range; unknown('U_LAYOUT_INTRINSIC', `The line count depends on text-spacing-trim (a closing bracket at a line end may be set half-width)${r ? ` for viewport width ${r.minExact}..${r.maxExact}` : ''}`, undefined, box); }
      }
      return states.filter(state => state.value && state.value !== 'undetermined');
    }
    if (box.text) throw new Error('Automatic text height needs an intrinsicBlockSize contract');
    return [{ region, value: scalar(0) }];
  }
  function validate(style, box, region, emit, available = {}) {
    if (style.display === 'none') return false;
    if(box.whitespace && !['normal','nowrap'].includes(style['white-space'])) throw new Error('Preserved whitespace needs explicit text geometry from the input adapter');
    // Derived text metrics apply only to the exact font they were measured with.
    if (box.contract?.font) { const reason = textFontMismatch(style, box.contract.font) ?? textLangMismatch(style.$lang, box.contract.textMetrics?.lang) ?? (box.contract.textMetrics?.kind === 'lines' ? textLinesMismatch(style, box.contract) : null); if (reason) throw Object.assign(new Error(reason), {code: 'U_LAYOUT_TEXT_FONT'}); }
    if(['button', 'input', 'select', 'textarea'].includes(box.tag) && (style.appearance!=='none' || style.display!=='block')) throw new Error(`Checked ${box.tag === 'button' ? 'buttons' : 'form controls'} require appearance:none, display:block and explicit box-sizing/min-size/padding/border resets`);
    // A fieldset's rendered legend sits in its border: modeled only when the fieldset generates no box.
    if(box.tag==='fieldset' && style.display!=='contents' && (box.children ?? []).some(child => child.tag === 'legend')) throw new Error('A fieldset with a legend is laid out with the legend in its border; use display: contents on the fieldset or leave the legend out');
    // Replaced elements and text fields have intrinsic sizes the model does not compute.
    if(['img', 'input', 'select', 'textarea'].includes(box.tag) && (style.display!=='block' || style['inline-size']==='auto' || (block && style['block-size']==='auto'))) throw new Error(`Checked ${box.tag} elements require display:block and an explicit inline-size${block ? ' and block-size' : ''}; intrinsic sizes are not modeled`);
    if (['left', 'right', 'inline-start', 'inline-end'].includes(style.float)) { issue('E_LAYOUT_FLOAT', 'float is forbidden in checked layout', box, region); return false; }
    if (style.float !== 'none') throw new Error('Unsupported float value');
    if (style.display === 'contents') throw new Error('display: contents on the analyzed root or with text needs its parent box and anonymous items');
    if (!['block', 'grid', 'flex'].includes(style.display)) throw new Error(`Unsupported display: ${style.display}`);
    if (['grid', 'flex'].includes(style.display) && box.text) throw new Error('Wrap text in an explicit leaf; anonymous grid/flex text items need a layout adapter');
    // Main-axis auto margins of flex items absorb free space (resolved by the flex line).
    const marginOk = (key, axis) => style[key] === '0' || (style[key] === 'auto' && available.flexItem?.main === axis);
    if (['margin-left', 'margin-right'].some(key => !marginOk(key, 'inline'))) throw new Error(available.flexItem && ['margin-left', 'margin-right'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Only known zero inline margins are supported');
    if (block && ['margin-top', 'margin-bottom'].some(key => !marginOk(key, 'block'))) throw new Error(available.flexItem && ['margin-top', 'margin-bottom'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Reset native block margins explicitly before block checking');
    if (!['static', 'relative', 'absolute'].includes(style.position) || style['writing-mode'] !== 'horizontal-tb' || style.direction !== 'ltr') throw new Error('Only static/relative/local-absolute horizontal-tb / ltr boxes are supported');
    if (style.position === 'relative' && ['left','right','top','bottom'].some(key=>!['auto','0','0px'].includes(style[key]))) throw new Error('Relative positioning spaces require zero offsets');
    if (style.position === 'absolute' && (!block || ['inline-size','block-size'].some(key=>style[key]==='auto') || style['grid-column']!=='auto' || style['grid-row']!=='auto')) throw new Error('Absolute boxes require both explicit sizes, both-axis analysis and auto Grid placement');
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
      // A column flex item's minimum is resolved by the flex line (its track is never smaller).
      } else if (!['auto', '0', '0px'].includes(style['min-block-size']) && !available.flexBlockMinimum) throw new Error('CSS min-block-size clamping is not modeled');
    }
    // Flex containers and items validate their alignment in the flex model.
    if (block && ((style.display !== 'flex' && !['normal', 'stretch'].includes(style['align-items'])) || (!available.flexItem && !['auto', 'normal', 'stretch'].includes(style['align-self'])) || (style.display !== 'flex' && !['normal', 'stretch', 'start'].includes(style['align-content'])))) throw new Error('Only stretch items and normal/stretch/start content alignment are supported');
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
  // One flex line (css-flexbox-1 §9.7) as a finite case split. Items carry
  // affine outer `base`/`minimum` sizes. The region is split by the sign of
  // the free space (grow or shrink mode) and, every round, by "target ≥
  // minimum" for each unfrozen item; violators freeze at their minimum and the
  // rest is redistributed. Frozen items never thaw, so it ends within
  // items+1 rounds. Returns outer sizes and the remaining free space.
  function resolveFlexLine(region, available, items, gap) {
    const hypothetical = items.map(item => item.minimum === item.base ? item.base : maximumConstant(item.base, item.minimum));
    const sumHypothetical = sum(total(hypothetical), scalar(gap));
    const modes = partition(region, diff(available, sumHypothetical), '>');
    const results = [];
    for (const [mode, regions] of [['grow', modes.yes], ['shrink', modes.no]]) for (const start of regions) {
      // Initially frozen (§9.7 step 2): zero factor; in shrink mode also an item whose base is below its minimum.
      const frozen = new Map();
      items.forEach((item, index) => {
        const factor = mode === 'grow' ? item.grow : item.shrink;
        // Content-sized items cannot shrink below their base (= their minimum). With
        // only minimum violations the result does not depend on the freezing order.
        if (cmp(factor, zero) === 0 || (mode === 'shrink' && (item.content || (item.minimum !== item.base && constantLess(item.base, item.minimum))))) frozen.set(index, hypothetical[index]);
      });
      let states = [{ region: start, frozen }];
      for (let round = 0; states.length && round <= items.length; round++) {
        const next = [];
        for (const state of states) {
          const unfrozen = items.map((_, index) => index).filter(index => !state.frozen.has(index));
          const used = items.map((item, index) => state.frozen.get(index) ?? item.base);
          const free = diff(available, sum(total(used), scalar(gap)));
          const factors = unfrozen.map(index => mode === 'grow' ? items[index].grow : items[index].shrink);
          const factorSum = factors.reduce(add, zero);
          // §9.7 step 4b scales by the initial free space when factors sum below 1; only the first round without freezing is modeled.
          const mayFreeze = unfrozen.some(index => !items[index].content && constantLess(items[index].base, items[index].minimum));
          const shrinks = mode === 'shrink' && unfrozen.some(index => cmp(items[index].shrink, zero) > 0 && cmp(items[index].innerBase, zero) > 0);
          if (unfrozen.length && cmp(factorSum, one) < 0 && (round > 0 || (mode === 'grow' && mayFreeze) || shrinks)) throw flexUnknown('Flex factors summing below 1 with freezing or shrinking are outside the subset');
          let targets;
          if (mode === 'grow') targets = items.map((item, index) => state.frozen.has(index) ? used[index] : sum(item.base, times(free, div(item.grow, cmp(factorSum, one) < 0 ? one : factorSum))));
          else {
            // Shrinking is proportional to the scaled factor shrink × inner base size.
            if (unfrozen.some(index => items[index].automaticBelowBase)) throw flexUnknown('An item whose automatic minimum depends on its content would shrink; set an explicit minimum or flex-shrink: 0');
            const scaled = unfrozen.map(index => mul(items[index].shrink, items[index].innerBase));
            const scaledSum = scaled.reduce(add, zero);
            targets = items.map((item, index) => {
              if (state.frozen.has(index)) return used[index];
              const k = unfrozen.indexOf(index);
              return cmp(scaledSum, zero) === 0 ? item.base : sum(item.base, times(free, div(scaled[k], scaledSum)));
            });
          }
          let parts = [{ region: state.region, violators: [] }];
          for (const index of unfrozen) if (items[index].minimum !== items[index].base) parts = bounded(parts.flatMap(part => {
            const split = partition(part.region, diff(targets[index], items[index].minimum), '>=');
            return [...split.yes.map(r => ({ region: r, violators: part.violators })), ...split.no.map(r => ({ region: r, violators: [...part.violators, index] }))];
          }));
          for (const part of parts) {
            if (!part.violators.length) results.push({ region: part.region, values: targets, free: diff(available, sum(total(targets), scalar(gap))), mode });
            else next.push({ region: part.region, frozen: new Map([...state.frozen, ...part.violators.map(index => [index, items[index].minimum])]) });
          }
        }
        states = bounded(next);
      }
      if (states.length) throw new Error('Flex freezing did not converge');
    }
    return results;
  }
  // ---- flex layout (ADR-0011) ----------------------------------------------
  const constantItem = item => ({ ...item, base: scalar(item.base), minimum: scalar(item.minimum), innerBase: sub(item.base, item.edges) });
  // Greedy line breaking by outer hypothetical sizes (constants), split by width thresholds.
  function breakLines(region, available, hypothetical, gap) {
    const n = hypothetical.length, done = [];
    let states = [{ region, start: 0, lines: [] }];
    while (states.length) {
      const next = [];
      for (const state of states) {
        if (state.start >= n) { done.push(state); continue; }
        const pending = [{ region: state.region, end: state.start + 1 }];
        while (pending.length) {
          const p = pending.pop();
          const line = [...Array(p.end - state.start).keys()].map(k => state.start + k);
          if (p.end >= n) { next.push({ region: p.region, start: n, lines: [...state.lines, line] }); continue; }
          const need = add(hypothetical.slice(state.start, p.end + 1).reduce(add, zero), mul(gap, q(p.end - state.start)));
          const split = partition(p.region, diff(available, scalar(need)), '>=');
          for (const r of split.yes) pending.push({ region: r, end: p.end + 1 });
          for (const r of split.no) next.push({ region: r, start: p.end, lines: [...state.lines, line] });
        }
      }
      states = bounded(next);
    }
    return bounded(done);
  }
  // Main-axis start offsets of a line's items: auto margins absorb positive free
  // space, otherwise justify-content distributes it. null = not modeled there.
  function mainStarts(region, values, free, flags, gap, main, justify) {
    const count = values.length, autos = flags.reduce((n, f) => n + Number(f.autoStart) + Number(f.autoEnd), 0);
    const place = (lead, extra, margin) => {
      let position = lead; const starts = [];
      values.forEach((value, i) => {
        if (flags[i].autoStart) position = sum(position, margin);
        starts.push(position);
        position = sum(sum(position, value), sum(scalar(gap), extra));
        if (flags[i].autoEnd) position = sum(position, margin);
      });
      return starts;
    };
    const none = scalar(0), d = distribution(justify, main, count);
    if (!autos && cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0) return [{ region, starts: place(none, none, none) }];
    const split = partition(region, free, '>='), out = [];
    for (const r of split.yes) out.push({ region: r, starts: autos ? place(none, none, times(free, div(one, q(autos)))) : place(times(free, d.lead), times(free, d.extra), none) });
    // Negative free space: auto margins are zero and justify falls back or is not modeled.
    for (const r of split.no) out.push({ region: r, starts: d.negative === 'start' ? place(none, none, none) : null });
    return out;
  }
  function layoutFlex({ box, style, region, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit }) {
    const out = [], { main, wrap } = validateFlexContainer(style);
    const fitInline = (box.contract?.overflow ?? 'fit') === 'fit', fitBlock = (box.contract?.overflowBlock ?? 'fit') === 'fit';
    const mainGap = gapSize(style[main === 'inline' ? 'column-gap' : 'row-gap']), crossGap = gapSize(style[main === 'inline' ? 'row-gap' : 'column-gap']);
    const explainTracks = axis => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), trackProperties(axis).map(property => fact(box, style, property)));
    const gaps = (gap, count) => mul(gap, q(Math.max(0, count - 1)));
    for (const state of collect(region)) {
      if (state.children.some(child => child.style.position === 'absolute')) throw flexUnknown('Absolute children of a flex container use flex static positions');
      const model = state.children.map(child => {
        try {
          const align = crossAlignment(style['align-items'], child.style['align-self']);
          // A column item that is not stretched is as wide as its own px width.
          if (main === 'block' && align !== 'stretch' && !/^\d+(?:\.\d+)?px$/.test(child.style['inline-size'])) throw flexUnknown('A column item that is not stretched (align) shrink-wraps its content; give it a px width');
          return { child, item: flexItem(child.style, { empty: !child.box.text && !child.box.children.length, axis: main }), align };
        } catch (error) { error.box ??= child.box; throw error; }
      });
      const inheritedOf = entry => entry.child.inherited ?? style;
      const itemAvailable = (entry, extra) => ({ ...extra, flexItem: { main }, ...(main === 'block' ? { flexBlockMinimum: true } : {}),
        ...(entry.align !== 'stretch' ? (main === 'inline' ? { alignBlock: entry.align } : { alignInline: entry.align }) : {}) });
      if (main === 'inline') {
        const items = model.map(entry => constantItem(entry.item));
        const hypothetical = items.map(item => maximumConstant(item.base, item.minimum)).map(v => v.b);
        const sets = wrap ? breakLines(state.region, contentInline, hypothetical, mainGap) : [{ region: state.region, lines: model.length ? [model.map((_, i) => i)] : [] }];
        for (const set of sets) {
          let combos = [{ region: set.region, lines: [] }];
          for (const indices of set.lines) combos = bounded(combos.flatMap(c => resolveFlexLine(c.region, contentInline, indices.map(i => items[i]), gaps(mainGap, indices.length))
            .flatMap(r => mainStarts(r.region, r.values, r.free, indices.map(i => items[i]), mainGap, main, style['justify-content'])
              .map(m => ({ region: m.region, lines: [...c.lines, { indices, values: r.values, starts: m.starts }] })))));
          for (const combo of combos) {
            for (const line of combo.lines) if (emit) obligation(contentInline, sum(total(line.values), scalar(gaps(mainGap, line.indices.length))), box, combo.region, 'E_LAYOUT_TRACKS', 'inline', fitInline, explainTracks('inline'));
            if (!block) {
              let endings = [combo.region];
              for (const line of combo.lines) line.indices.forEach((i, k) => { endings = bounded(endings.flatMap(r => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], fitInline }), r, ancestors, inheritedOf(model[i]), emit).map(result => result.region))); });
              for (const r of endings) out.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
              continue;
            }
            // Cross sizes of the lines: a definite single line is the container; otherwise the tallest item.
            let measured = [{ region: combo.region, sizes: combo.lines.map(() => scalar(0)) }];
            if (wrap || !knownBlock) combo.lines.forEach((line, l) => line.indices.forEach((i, k) => {
              measured = bounded(measured.flatMap(m => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k] }), m.region, ancestors, inheritedOf(model[i]), false)
                .flatMap(result => maximum(result.region, m.sizes[l], result.block).map(mx => ({ region: mx.region, sizes: m.sizes.map((v, j) => j === l ? mx.value : v) })))));
            }));
            else measured = [{ region: combo.region, sizes: [knownBlock] }];
            for (const m of measured) {
              const crossGaps = scalar(gaps(crossGap, combo.lines.length)), used = sum(total(m.sizes), crossGaps);
              let stretched = [{ region: m.region, sizes: m.sizes }];
              if (wrap && knownBlock && ['normal', 'stretch'].includes(style['align-content'])) stretched = clamp(m.region, diff(knownBlock, used)).map(({ region: r, value: extra }) => ({ region: r, sizes: m.sizes.map(v => sum(v, times(extra, div(one, q(combo.lines.length))))) }));
              for (const st of stretched) {
                const contentBlock = knownBlock ?? used, blockSize = sum(contentBlock, blockEdges);
                if (emit && knownBlock) obligation(knownBlock, used, box, st.region, 'E_LAYOUT_TRACKS', 'block', fitBlock, explainTracks('block'));
                let endings = [st.region], lineStart = scalar(0);
                combo.lines.forEach((line, l) => {
                  const top = lineStart;
                  line.indices.forEach((i, k) => {
                    const origin = line.starts ? offset(contentOrigin, line.starts[k], top) : null;
                    endings = bounded(endings.flatMap(r => solve(model[i].child.box, itemAvailable(model[i], { inline: line.values[k], block: st.sizes[l], origin, fitInline, fitBlock }), r, ancestors, inheritedOf(model[i]), emit).map(result => result.region)));
                  });
                  lineStart = sum(sum(lineStart, st.sizes[l]), scalar(crossGap));
                });
                for (const r of endings) out.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
              }
            }
          }
        }
        continue;
      }
      // Column: the main axis is the block axis; items are as wide as the content box unless aligned.
      if (!block) {
        let endings = [state.region];
        for (const entry of model) endings = bounded(endings.flatMap(r => solve(entry.child.box, itemAvailable(entry, { inline: contentInline, fitInline }), r, ancestors, inheritedOf(entry), emit).map(result => result.region)));
        for (const r of endings) out.push(finish(box, style, r, inline, contentInline, null, null, available, parents, emit));
        continue;
      }
      // Measure content-sized items (their block size is both base and minimum).
      let measured = [{ region: state.region, items: model.map(entry => entry.item.base === 'content' ? null : constantItem(entry.item)) }];
      model.forEach((entry, i) => {
        if (entry.item.base !== 'content') return;
        measured = bounded(measured.flatMap(m => solve(entry.child.box, itemAvailable(entry, { inline: contentInline }), m.region, ancestors, inheritedOf(entry), false)
          .map(result => ({ region: result.region, items: m.items.map((v, j) => j === i ? { ...entry.item, base: result.block, minimum: result.block, content: true } : v) }))));
      });
      for (const m of measured) {
        let lines;
        if (knownBlock) lines = resolveFlexLine(m.region, knownBlock, m.items, gaps(mainGap, m.items.length));
        else {
          if (m.items.some(item => cmp(item.grow, zero) > 0)) throw flexUnknown('Flexible items in a column with an indefinite height grow from their content; give the container a definite height');
          const values = m.items.map(item => item.content ? item.base : maximumConstant(item.base, item.minimum));
          lines = [{ region: m.region, values, free: scalar(0) }];
        }
        for (const line of lines) for (const placed of mainStarts(line.region, line.values, line.free, m.items, mainGap, main, style['justify-content'])) {
          const used = sum(total(line.values), scalar(gaps(mainGap, line.values.length)));
          const contentBlock = knownBlock ?? used, blockSize = sum(contentBlock, blockEdges);
          if (emit && knownBlock) obligation(knownBlock, used, box, placed.region, 'E_LAYOUT_TRACKS', 'block', fitBlock, explainTracks('block'));
          let endings = [placed.region];
          model.forEach((entry, i) => {
            const origin = placed.starts ? offset(contentOrigin, scalar(0), placed.starts[i]) : null;
            endings = bounded(endings.flatMap(r => solve(entry.child.box, itemAvailable(entry, { inline: contentInline, block: line.values[i], origin, fitInline, fitBlock }), r, ancestors, inheritedOf(entry), emit).map(result => result.region)));
          });
          for (const r of endings) out.push(finish(box, style, r, inline, contentInline, blockSize, contentBlock, available, parents, emit));
        }
      }
    }
    return out;
  }
  // Inline content of a text leaf: phrasing elements that stay display: inline add no geometry when
  // they have no horizontal padding, border or margin (and keep a font-derived contract's font).
  // Each gets its own computed style and DOM facts as a row without a rectangle.
  const fontKeys = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform'];
  function inlineContent(leaf, leafStyle, region, parents, chain) {
    for (const child of leaf.inline) for (const state of styles(child, region, parents.map(p => ({ ...p, names: [] })), parents.at(-1).style, false, false)) {
      const style = state.style;
      if (style.display === 'none') continue;
      if (style.display !== 'inline' || style.position !== 'static' || style.float !== 'none') throw Object.assign(new Error(`${child.label} inside text must stay display: inline and static to keep the text's measured size`), { code: 'U_LAYOUT_INLINE' });
      // auto margins of inline boxes compute to 0.
      for (const side of ['left', 'right']) for (const key of [`padding-${side}`, `border-${side}`, `margin-${side}`]) if (!['0', '0px', ...(key.startsWith('margin') ? ['auto'] : [])].includes(String(style[key]))) throw Object.assign(new Error(`${child.label} inside text has horizontal ${key}; inline box edges change the measured text`), { code: 'U_LAYOUT_INLINE' });
      if (leaf.contract?.textMetrics && fontKeys.some(key => style[key] !== leafStyle[key])) throw Object.assign(new Error(`${child.label} changes the font inside text measured as one run`), { code: 'U_LAYOUT_INLINE' });
      const own = [...chain, paintFacts(style)];
      geometry.push({ box: child, path: child.path, region: state.region, origin: null, inline: null, block: null, position: 'static', inlineFlow: true,
        borders: { left: zero, right: zero, top: zero, bottom: zero }, overflow: 'visible', overflowValue: 'visible', painted: paints(style), paint: paintFacts(style), chain: own, parentText: leaf.path });
      if (child.children?.length) inlineContent({ ...child, inline: child.children, contract: leaf.contract }, style, state.region, [...parents, { box: child, style }], own);
    }
  }
  function finish(box, style, region, inline, contentInline, blockSize, contentBlock, available, parents, emit) {
    const contract = box.contract ?? {};
    if (emit) {
      const self = [...parents, { box, style }];
      const offered = axis => () => parents.length ? [...trackProperties(axis).map(property => fact(parents.at(-1).box, parents.at(-1).style, property)),
        fact(box, style, axis === 'inline' ? 'grid-column' : 'grid-row'), ...sizeChain(parents, axis, { hostInset: options.hostInset })] : [{ kind: 'viewport', axis }];
      const own = axis => sizeProperties(axis).filter(property => style.$sources[property] || property === (axis === 'inline' ? 'inline-size' : 'block-size')).map(property => fact(box, style, property));
      const item = axis => () => explanation(offered(axis)(), own(axis));
      const content = (axis, property) => () => explanation(sizeChain(self, axis, { hostInset: options.hostInset }), [contractFact(box, property)]);
      obligation(available.inline, inline, box, region, 'E_LAYOUT_ITEM_SIZE', 'inline', available.fitInline !== false, item('inline'));
      // A text domain reports how many characters still fit at the witness.
      const domain = contract.textMetrics?.kind === 'domain' ? offeredInline => ({ text: { maxLength: contract.textMetrics.maxLength, fitsUpTo: fittingLength(contract.textMetrics, offeredInline), widest: contract.textMetrics.widest } }) : undefined;
      if (contract.minInlineSize !== undefined) obligation(contentInline, scalar(contract.minInlineSize), box, region, 'E_LAYOUT_CONTENT', 'inline', (contract.overflow ?? 'fit') === 'fit', content('inline', 'minInlineSize'), domain);
      if (block) {
        if (available.block) obligation(available.block, blockSize, box, region, 'E_LAYOUT_ITEM_SIZE', 'block', available.fitBlock !== false, item('block'));
        if (contract.minBlockSize !== undefined) obligation(contentBlock, scalar(contract.minBlockSize), box, region, 'E_LAYOUT_CONTENT', 'block', (contract.overflowBlock ?? 'fit') === 'fit', content('block', 'minBlockSize'));
      }
      let positioned;
      if (style.position === 'absolute') {
        const containing = available.containingBlock;
        if (!containing || !blockSize) throw new Error('Absolute box has no independently resolved local containing block');
        const origin = absoluteOrigin(style, containing, {inline, block:blockSize});
        for (const [axis, dimension] of [['inline',inline],['block',blockSize]]) {
          obligation(origin[axis], scalar(0), box, region, 'E_LAYOUT_ABSOLUTE_START', axis);
          obligation(containing[axis], sum(origin[axis],dimension), box, region, 'E_LAYOUT_ABSOLUTE_END', axis);
        }
        positioned = {origin:{inline:affine(origin.inline),block:affine(origin.block)},containingBlock:{path:containing.path,inline:affine(containing.inline),block:affine(containing.block)}};
      }
      const origin=resolvedOrigin(style,available,inline,blockSize,parents);
      const overflowValue=[style['overflow-x'],style['overflow-y']].find(v=>v!=='visible') ?? 'visible';
      // A box's own overflow clips its content, not its border box.
      const ownOrigin = origin ?? resolvedOrigin({...style,'overflow-x':'visible','overflow-y':'visible'},available,inline,blockSize,parents);
      geometry.push({ box, path: box.path, region, origin: ownOrigin, inline, block: blockSize, position: style.position,
        borders: Object.fromEntries(['left','right','top','bottom'].map(side => [side, px(style[`border-${side}`])])),
        overflow: ['hidden','clip'].includes(overflowValue) ? 'clip' : ['auto','scroll'].includes(overflowValue) ? 'scroll' : 'visible', overflowValue,
        // Where a single line of text starts inside the box (font-derived text extents).
        content: { left: add(px(style['border-left']), px(style['padding-left'])), top: add(px(style['border-top']), px(style['padding-top'])), inline: contentInline },
        textAlign: style['text-align'], painted: paints(style),
        paint: paintFacts(style), chain: [...ancestorPaint, ...parents.map(parent => paintFacts(parent.style)), paintFacts(style)] });
      if (box.inline?.length) inlineContent(box, style, region, [...parents, { box, style }], geometry.at(-1).chain);
      const rect=origin && blockSize ? {inlineStart:affine(origin.inline),blockStart:affine(origin.block),inlineSize:affine(inline),blockSize:affine(blockSize)} : null;
      sizes.push({ box: box.label, path: box.path, position:style.position, ...positioned,...(rect ? {rect} : {}), boxSizing: style['box-sizing'], boxSizingSource: style.$sources['box-sizing'],
        paddingInlineSize:affine(diff(inline,scalar(add(px(style['border-left']),px(style['border-right']))))),
        ...(blockSize ? {paddingBlockSize:affine(diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))))} : {}),
        // Explicit absolute sizing determines its public allocation independently
        // from child requirements. The enclosing padding box stays separate.
        allocatedInlineSize:affine(style.position==='absolute' ? inline : available.inline),
        ...(available.block ? {allocatedBlockSize:affine(style.position==='absolute' ? blockSize : available.block)} : {}),
        inlineSize:affine(inline),contentInlineSize:affine(contentInline),
        ...(blockSize ? {blockSize:affine(blockSize)} : {}),...(contentBlock ? {contentBlockSize:affine(contentBlock)} : {}),...ranges(region) });
    }
    if (!box.children.length) {
      if (box.text && contract.minInlineSize === undefined && (contract.overflow ?? 'fit') === 'fit') unknown('U_LAYOUT_INTRINSIC', 'Text needs a minInlineSize bound or an explicit overflow policy', undefined, box);
      if (block && box.text && (contract.overflowBlock ?? 'fit') === 'fit') {
        if (contract.intrinsicBlockSize !== undefined) for (const required of intrinsic(box, contentInline, region)) {
          // Wrapped text reports the lines it needs at this width and how many the box holds.
          const needed = contract.textMetrics?.kind === 'lines' ? Math.round(number(evaluate(required.value, { x: zero, y: zero })) / contract.font.lineHeight) : 0;
          const annotate = needed ? offered => ({ text: { lines: needed, fitsLines: fittingLines(contract.font.lineHeight, offered, needed) } }) : undefined;
          if (emit) obligation(contentBlock, required.value, box, required.region, 'E_LAYOUT_CONTENT', 'block', true, undefined, annotate);
        }
        else if (contract.minBlockSize === undefined) unknown('U_LAYOUT_INTRINSIC', 'Text needs a block-height contract or an explicit overflowBlock policy', undefined, box);
      }
    }
    return { region, inline, block: blockSize };
  }

  // Root-relative border coordinates. Scroll offsets/gutter placement and shared
  // subgrid line offsets are deliberately outside the first transition profile.
  function resolvedOrigin(style,available,inline,blockSize,parents) {
    if(!block || parents.some(p=>p.clipped || p.subgrid) || ['overflow-x','overflow-y'].some(key=>style[key]!=='visible') ||
      ['grid-template-columns','grid-template-rows'].some(key=>style[key]==='subgrid')) return null;
    if(style.position!=='absolute') {
      // Cross-axis alignment of a flex item that is not stretched.
      let origin = available.origin ?? null;
      if (origin && available.alignBlock !== undefined) origin = blockSize ? { inline: origin.inline, block: sum(origin.block, times(diff(available.block, blockSize), available.alignBlock)) } : null;
      if (origin && available.alignInline !== undefined) origin = { inline: sum(origin.inline, times(diff(available.inline, inline), available.alignInline)), block: origin.block };
      return origin;
    }
    const containing=available.containingBlock;
    if(!containing?.origin || !blockSize) return null;
    const local=absoluteOrigin(style,containing,{inline,block:blockSize});
    return offset(containing.origin,local.inline,local.block);
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
        if (!validate(style, box, state.region, emit, available)) continue;
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
        const edgeExplanation = axis => () => explanation(sizeChain([...parents, { box, style }], axis, { hostInset: options.hostInset }), sizeProperties(axis).filter(property => /^(?:padding|border)-/.test(property)).map(property => fact(box, style, property)));
        for (const proposal of preferredStates) if (emit) obligation(proposal.value, inlineEdges, box, proposal.region, 'E_LAYOUT_BOX_EDGES', 'inline', true, edgeExplanation('inline'));
        const contentStates = preferredStates.flatMap(proposal => clamp(proposal.region, diff(proposal.value, inlineEdges)));
        for (const content of contentStates) {
          const inline = sum(content.value, inlineEdges), contentInline = content.value;
          let fixedBlock = null;
          if (block) {
            if (style['block-size'] !== 'auto') fixedBlock = length(style['block-size'], available.block);
            else if (!available.root && available.block && available.alignBlock === undefined) fixedBlock = available.block;
            else if (style['container-type'] === 'size') fixedBlock = blockEdges;
            if (style['block-size'] !== 'auto' && style['box-sizing'] === 'content-box') fixedBlock = sum(fixedBlock, cssBlockEdges);
          }
          const blockStates = fixedBlock ? clamp(content.region, diff(fixedBlock, blockEdges)) : [{ region: content.region, value: null }];
          if (fixedBlock && emit) obligation(fixedBlock, blockEdges, box, content.region, 'E_LAYOUT_BOX_EDGES', 'block', true, edgeExplanation('block'));
          for (const bs of blockStates) {
            const origin=resolvedOrigin(style,available,inline,bs.value ? sum(bs.value,blockEdges) : null,parents);
            const contentOrigin=offset(origin,edge(['left']),edge(['top']));
            const knownBlock = bs.value, own = { box, style, inline: contentInline, block: knownBlock, positioned:style.position!=='static',
              contentOrigin,paddingOrigin:offset(origin,scalar(px(style['border-left'])),scalar(px(style['border-top']))),
              subgrid:style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid',
              clipped:style['overflow-x']!=='visible' || style['overflow-y']!=='visible',
              paddingInline:diff(inline,scalar(add(px(style['border-left']),px(style['border-right'])))),
              paddingBlock:knownBlock ? diff(sum(knownBlock,blockEdges),scalar(add(px(style['border-top']),px(style['border-bottom'])))) : null,
              type: style['container-type'], names: style['container-name'] === 'none' ? [] : style['container-name'].split(/\s+/) };
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
              if (!['grid', 'flex'].includes(style.display)) { issue('E_LAYOUT_CONTAINER', 'Layout containers must use grid or the flex subset', box, bs.region); continue; }
              const isFlex = style.display === 'flex';
              if (!isFlex && style['grid-auto-flow'] !== 'row') throw new Error('Only sparse row auto-placement is supported');
              // Child boxes per region. display: contents is replaced by its
              // children, which inherit from it (the element tree) but are
              // laid out as items of this container.
              const collect = region => {
                let states = [{ region, children: [] }];
                const visit = (child, inheritedStyle) => {
                  states = bounded(states.flatMap(s => styles(child, s.region, ancestors, inheritedStyle, false).flatMap(c => {
                    if (c.style.display === 'none') return [{ region: c.region, children: s.children }];
                    if (c.style.display !== 'contents') return [{ region: c.region, children: [...s.children, { box: child, style: c.style, inherited: inheritedStyle }] }];
                    if (child.text || child.contract || child.targets?.length) throw new Error('display: contents with text, contracts or noshift targets needs anonymous or absent boxes');
                    return [{ region: c.region, children: s.children, contents: c.style }];
                  })));
                  const nested = states.filter(state => state.contents);
                  if (!nested.length) return;
                  if (nested.length !== states.length) throw new Error('display: contents that varies across regions is outside the subset');
                  const contentsStyle = nested[0].contents;
                  for (const state of states) delete state.contents;
                  for (const grandchild of child.children) visit(grandchild, contentsStyle);
                };
                for (const child of box.children) visit(child, style);
                for (const state of states) for (const child of state.children) if (child.style.order !== '0') throw Object.assign(new Error('order changes the item sequence; only order: 0 is modeled'), { code: isFlex ? 'U_LAYOUT_FLEX' : undefined });
                return states;
              };
              if (isFlex) { for (const result of layoutFlex({ box, style, region: geometryRegion, inline, contentInline, knownBlock, blockEdges, available, parents, ancestors, contentOrigin, collect, emit })) results.push(result); continue; }
              const sharedColumns = inheritedAxes.inline;
              // Flex: the items' flex properties define one row of tracks.
              const plans = [{ region: geometryRegion, columns: sharedColumns ? sharedColumns.values.map(value => ({ definite: value })) :
                style['grid-template-columns'] === 'none' ? [] : tracks(style['grid-template-columns'] ?? 'none') }];
              for (const plan of plans) {
              const columns = plan.columns;
              const columnGap = gapSize(style['column-gap'], sharedColumns);
              const columnBases = columns.map(track => scalar(track.fixed ?? track.edges ?? zero));
              const columnLayouts = sharedColumns ? [{ region: plan.region, values: sharedColumns.values, required: trackArea(sharedColumns.values, columnGap, 0, columns.length) }] :
                flex(plan.region, contentInline, columns, mul(columnGap, q(Math.max(0, columns.length - 1))), columnBases, false);
              // justify-content distributes free space between tracks (positions only).
              const justified = columnLayouts.flatMap(cs => {
                const d = sharedColumns ? { lead: zero, extra: zero, negative: 'start' } : distribution(style['justify-content'], 'inline', columns.length);
                if (cmp(d.lead, zero) === 0 && cmp(d.extra, zero) === 0) return [{ ...cs, shift: { lead: scalar(0), extra: scalar(0) } }];
                const free = diff(contentInline, sum(total(cs.values), scalar(mul(columnGap, q(Math.max(0, columns.length - 1))))));
                const split = partition(cs.region, free, '>=');
                return [...split.yes.map(region => ({ ...cs, region, shift: { lead: times(free, d.lead), extra: times(free, d.extra) } })),
                  ...split.no.map(region => ({ ...cs, region, shift: d.negative === 'start' ? { lead: scalar(0), extra: scalar(0) } : null }))];
              });
              for (const cs of justified) {
                if (emit) obligation(contentInline, cs.required, box, cs.region, 'E_LAYOUT_TRACKS', 'inline', (box.contract?.overflow ?? 'fit') === 'fit', () => explanation(sizeChain([...parents, { box, style }], 'inline', { hostInset: options.hostInset }), trackProperties('inline').map(property => fact(box, style, property))));
                const childStates = collect(cs.region);
                for (const children of childStates) {
                  if (!block && children.children.some(child=>child.style.position==='absolute')) throw new Error('Absolute boxes require both-axis analysis');
                  if (!columns.length && children.children.some(child=>child.style.position!=='absolute')) throw new Error('In-flow Grid children require explicit supported columns');
                  let placed;
                  try { placed = place(children.children.filter(child=>child.style.position!=='absolute'), columns.length, { subgridColumns: Boolean(sharedColumns), rows: inheritedAxes.block?.values.length }).map(item => ({ ...item, inherited: children.children.find(child => child.box === item.box).inherited })); }
                  catch (error) { error.region = children.region; throw error; }
                  const areaInline = item => trackArea(cs.values, columnGap, item.start, item.span);
                  const childColumns = item => trackSlice(cs.values, columnGap, box, item.start, item.span);
                  if (!block) {
                    let endings = [children.region];
                    for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: areaInline(item), tracks: { inline: childColumns(item) }, fitInline: (box.contract?.overflow ?? 'fit') === 'fit' }, r, ancestors, item.inherited ?? style, emit).map(result => result.region)));
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
                  let measurements = [{ region: children.region, bases: rows.map(row => row.definite ?? scalar(row.fixed ?? row.edges ?? zero)) }];
                  for (const item of placed.filter(item => rows[item.row].auto || (!knownBlock && rows[item.row].weight))) {
                    measurements = bounded(measurements.flatMap(m => solve(item.box, { inline: areaInline(item), tracks: { inline: childColumns(item) } }, m.region, ancestors, item.inherited ?? style, false).flatMap(measured => maximum(measured.region, m.bases[item.row], measured.block).map(mx => ({ region: mx.region, bases: m.bases.map((v, i) => i === item.row ? mx.value : v) })))));
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
                      const finalAncestors = [...parents, { ...own, block: contentBlock, paddingBlock:diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))) }];
                      if (emit) obligation(contentBlock, rs.required, box, rs.region, 'E_LAYOUT_TRACKS', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit', () => explanation(sizeChain([...parents, { box, style }], 'block', { hostInset: options.hostBlockInset }), trackProperties('block').map(property => fact(box, style, property))));
                      let endings = [rs.region];
                      for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: areaInline(item), block: trackArea(rs.values, rowGap, item.row, item.rowSpan),
                        origin:cs.shift ? offset(contentOrigin,sum(sum(trackStart(cs.values,columnGap,item.start),cs.shift.lead),times(cs.shift.extra,q(item.start))),trackStart(rs.values,rowGap,item.row)) : null,
                        tracks: { inline: childColumns(item), block: trackSlice(rs.values, rowGap, box, item.row, item.rowSpan) },
                        fitInline: (box.contract?.overflow ?? 'fit') === 'fit', fitBlock: (box.contract?.overflowBlock ?? 'fit') === 'fit' }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region)));
                      for (const item of children.children.filter(child=>child.style.position==='absolute')) endings = bounded(endings.flatMap(r => {
                        const containing = finalAncestors.findLast(ancestor=>ancestor.positioned);
                        if (!containing?.paddingBlock || containing.subgrid || finalAncestors.some(ancestor=>ancestor.clipped)) throw new Error('Absolute boxes require an owned non-scrolling, unclipped containing block without subgrid placement');
                        return solve(item.box,{inline:containing.paddingInline,block:containing.paddingBlock,
                          containingBlock:{path:containing.box.path,inline:containing.paddingInline,block:containing.paddingBlock,origin:containing.paddingOrigin}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                      }));
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
      let environments = [{ region: initial, style: undefined, paint: [] }];
      for (let i = 0; i < (options.ancestors ?? []).length; i++) {
        const ancestor = options.ancestors[i];
        const host = { ...ancestor, classes: ancestor.classes ?? [], documentRoot: i === 0 && ancestor.tag === 'html', label: `ancestor:${ancestor.tag}`, path: `ancestor/${i}` };
        environments = bounded(environments.flatMap(environment => styles(host, environment.region, [], environment.style, false, false).map(state => ({ ...state, paint: [...environment.paint, paintFacts(state.style)] })).filter(state => {
          if (state.style.display === 'none') { unknown('U_LAYOUT_ANCESTOR', 'A hidden ancestor cannot provide the declared containing sizes', undefined, host); return false; }
          if (state.style['container-type'] === 'normal') return true;
          unknown('U_LAYOUT_ANCESTOR', 'Query containers need size geometry; include this ancestor in the analyzed template', undefined, host); return false;
        })));
      }
      for (const environment of environments) (ancestorPaint = environment.paint ?? [], solve(root, { root: true,origin:{inline:scalar(0),block:scalar(0)}, inline: diff(width, scalar(options.hostInset ?? 0)), block: block && options.viewport.height ? diff(height, scalar(options.hostBlockInset ?? 0)) : null }, environment.region, [], environment.style));
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
  let integrityWarnings = [], integrityExempted = [], accessibilityWarnings = [], accessibilityNotes = [], accessibilityExempted = [];
  if (options.integrity && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeIntegrity({ geometry, waived }, { block, targetSize: options.integrity.targetSize ?? 24, protrusion: options.integrity.protrusion ?? 'all', ranges });
    diagnostics.push(...judged.findings);
    integrityWarnings = judged.warnings; integrityExempted = judged.exempted;
  }
  if (options.accessibility && !diagnostics.some(d => d.severity === 'unknown')) {
    const judged = judgeAccessibility({ geometry, waived, root, domain: initial }, { viewportMin: options.viewport.min, contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), ranges, block });
    diagnostics.push(...judged.findings, ...judged.unknowns);
    accessibilityWarnings = judged.warnings; accessibilityNotes = judged.notes; accessibilityExempted = judged.exempted;
  }
  const status = diagnostics.some(d => d.severity === 'unknown') ? 'unknown' : diagnostics.length ? 'violated' : 'verified';
  return { version: 1, ok: status === 'verified', status, component,
    scope: { axis: block ? 'both' : 'inline', viewport: { ...projection(initial, 'x'), ...(block ? { height: options.viewport.height ? projection(initial, 'y') : null } : {}) }, hostInset: options.hostInset ?? 0, ...(block ? { hostBlockInset: options.hostBlockInset ?? 0 } : {}), closedCSS: true, browserRounding: false, blockSizing: block },
    assumptions: ['The supplied CSS is the complete author cascade and the selected root has no external query-container ancestors; host provides the declared containing sizes without unmodeled scrollbar gutters.',
      'Each minInlineSize/minBlockSize is a trusted sufficient content-size bound; intrinsicBlockSize is a trusted exact auto-height profile for the permitted content/fonts.',
      'Only horizontal-tb/ltr in-flow and explicitly sized local absolute geometry is checked; ink overflow and browser pixel rounding are outside the contract.',
      ...(rules.some(rule=>rule.declarations.some(d=>d.expression || d.pending)) ? ['Custom properties are unregistered; unknown external inheritance and cycles through fallback references prevent verification when used by geometry.'] : [])],
    styleSources: styleSources.map(({ kind, file }) => ({ kind, file })), diagnostics, policies, checks, sizes, queries, subgrids,
    elements:boxes.map(({path,tag,id,classes,owner,targets,targetIdentity})=>({path,tag,...(id ? {id} : {}),classes,owner,...(targets?.length ? {targets} : {}),...(targetIdentity ? {targetIdentity} : {})})),
    ...(boxes.some(box=>box.layoutContracts?.length) ? {layoutBindings:boxes.flatMap(box=>(box.layoutContracts ?? []).map(declaration=>({path:box.path,declaration})))} : {}),
    ...(scrollbars.length ? {scrollbars} : {}), ...(invalidSubstitutions.length ? {invalidSubstitutions} : {}),
    ...(options.accessibility ? { accessibility: { rules: accessibilityRules, contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), warnings: accessibilityWarnings, exempted: accessibilityExempted, notes: accessibilityNotes } } : {}),
    ...(options.integrity ? { integrity: { rules: ['page-overflow-x', 'container-protrusion', 'text-collision', 'target-undersized', 'clipped-content', 'nested-scroll'], targetSize: options.integrity.targetSize ?? 24, protrusion: options.integrity.protrusion ?? 'all', warnings: integrityWarnings, exempted: integrityExempted } } : {}) };
}
