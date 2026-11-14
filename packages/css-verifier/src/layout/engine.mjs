import { q, add, sub, mul, cmp, div, exact, number } from './linear.mjs';
import { scalar, width, height, sum, diff, times, evaluate, affine, sample, rectangle, clip, partition, projection, serialize } from './region.mjs';
import { validateOptions } from './input.mjs';
import { parseLayoutCSS, computeStyle, matches, px } from './css.mjs';
import { tracks, place } from './grid.mjs';
import { compileSelector } from './selectors.mjs';
import { gapSize, trackArea, trackSlice, inheritTracks } from './subgrid.mjs';
import { scrollbarFrames } from './scrollbars.mjs';
import {absoluteOrigin} from './positioned.mjs';
import {textFontMismatch, textLinesMismatch, textLangMismatch, fittingLength, fittingLines} from './text-font.mjs';
import {validateFlexContainer, flexItem, crossAlignment, distribution, flexUnknown} from './flex.mjs';
import {judgeIntegrity, intersect } from './integrity.mjs';
import {judgeAccessibility, accessibilityRules, accessibilityProfiles, ruleTier, paintFacts} from './accessibility.mjs';
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

// `preferences` (internal) names non-default user preferences, e.g. 'prefers-color-scheme:dark'.
export function analyzeBoxTree(root, options, scrollbarProfile, budget, inlineSheets=[], inputDiagnostics=[], preferences=[]) {
  const pristine = options.accessibility && !preferences.length ? structuredClone(root) : null;
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
  // Contracts of generated boxes (selector::before / ::after) are applied when the pseudo-element is generated.
  const pseudoContracts = Object.entries(options.boxes ?? {}).flatMap(([selector, contract]) => { const m = /^(.*)::(before|after)$/.exec(selector); return m ? [{ base: m[1], kind: m[2], selector, contract }] : []; });
  for (const [selector, contract] of Object.entries(options.boxes ?? {}).filter(([selector]) => !/::(?:before|after)$/.test(selector))) {
    const selected = boxes.filter(box => matches(selector, box));
    if (!selected.length) throw new Error(`Layout contract does not match a box: ${selector}`);
    for (const box of selected) { if (box.contract) throw new Error(`Ambiguous layout contracts for ${box.label}`); box.contract = contract; box.contractSelector = selector; }
  }
  // A cell's textRuns contracts size its anonymous text blocks, in DOM order.
  for (const box of boxes.filter(box => box.anonymousRuns)) {
    const runs = box.contract?.textRuns ?? [], anonymous = box.children.filter(child => child.anonymous);
    if (runs.length !== anonymous.length) unknown('U_LAYOUT_INTRINSIC', `${box.label} has ${anonymous.length} anonymous text block(s); give its contract one textRuns entry per text run`, undefined, box);
    anonymous.forEach((child, k) => { if (runs[k]) { child.contract = runs[k]; child.contractSelector = `${box.contractSelector} text ${k}`; } });
  }
  const styleSources = [...(options.reset ?? []).map((sheet, index) => ({ ...sheet, kind: 'reset', file: sheet.file ?? `<reset:${index}>` })), { css: options.css, kind: 'app', file: options.cssFile ?? '<css>' },...inlineSheets];
  const { rules, layers, keyframeFrames } = parseLayoutCSS(styleSources, (code, message, line, file, detail) => {
    if(detail) diagnostics.push({code,message,...detail});
    else unknown(code,message,line,undefined,file);
  });
  if (rules.some(rule => rule.stateLayout) && !options.accessibility) unknown('U_LAYOUT_SELECTOR', 'A :focus rule changes the layout; the focused layout is modeled for the accessibility checks only');
  if (rules.some(rule => rule.stateGeometry) && !options.accessibility && !options.integrity) unknown('U_LAYOUT_SELECTOR', 'A state rule moves a box (focus insets or a transform); that is modeled for the accessibility and integrity checks only');
  // style attributes: each element's declarations as a rule that matches only it, element-attached in the cascade.
  for (const box of boxes.filter(box => box.inlineStyle !== undefined)) {
    if (box.inlineStyle === 'dynamic') { unknown('U_LAYOUT_CSS', `${box.label}: a dynamic style attribute decides its styles`, undefined, box); continue; }
    const attached = parseLayoutCSS([{ css: `*{${box.inlineStyle}}`, file: `${box.label} style attribute` }], (code, message, line, file, detail) => { if (detail) diagnostics.push({ code, message, ...detail }); else unknown(code, message, line, box, file); }).rules;
    for (const rule of attached) { rule.selectors = [{ source: `${box.label} [style]`, parts: [{ kind: 'path', value: box.path }], specificity: [0, 0, 0] }]; rule.attached = true; rules.push(rule); }
  }
  for (const rule of rules) rule.layerName = rule.layer === null ? undefined : layers[rule.layer];
  const bounded = values => { spend(values.length); if (values.length > 512) throw new Error('Layout state limit exceeded'); return values; };

  // Table cells do not overflow their height: the row grows with the content (not modeled), so it is Unknown there.
  function cellGrows(available, required, box, region) {
    const failed = clip(region, diff(required, available), true);
    if (failed) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label}: the content is taller than the cell here; a table row grows with its content`, box: box.label, path: box.path, source: box.source, axis: 'block', ...ranges(failed) });
  }
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
      if (atom.feature === 'orientation') {
        if (!target.block) throw new Error('An orientation query needs the viewport height domain');
        return { slack: atom.orientation === 'portrait' ? diff(target.block, target.inline) : diff(target.inline, target.block), relation: atom.relation };
      }
      const size = inlineFeature(atom.feature) ? target.inline : target.block;
      if (!size) throw new Error('Height condition needs a known container/viewport block size');
      return { slack: diff(size, scalar(atom.value)), relation: atom.relation };
    }));
    return { groups, target: target.box?.label, path: target.box?.path };
  }
  function styles(box, region, ancestors, inherited, emit, gridItem = true, state) {
    spend(rules.length + 1);
    if (preferences.length) state = new Set([...(state ?? []), ...preferences]);
    if (box.pseudo) state = new Set([...(state ?? []), `::${box.pseudo}`]);
    // The focused re-layout: the one focused box (focus-at:<path>) has :focus/:focus-visible, its ancestors :focus-within.
    const focusAt = preferences.find(p => p.startsWith('focus-at:'))?.slice(9);
    if (focusAt !== undefined && !box.pseudo && (box.path === focusAt || focusAt.startsWith(box.path + '/'))) state = new Set([...(state ?? []), 'focus-within', ...(box.path === focusAt ? ['focus', 'focus-visible'] : [])]);
    // :checked holds for a checkbox/radio with the checked attribute unless the unchecked state is asked for.
    if (box.nativeStates?.checked && !state?.has('unchecked')) state = new Set([...(state ?? []), 'checked']);
    const relevant = rules.filter(rule => rule.selectors.some(selector => matches(selector, box, state)));
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
      try {style=computeStyle(relevant,box,active,inherited,{spend,state});}
      catch(error) {error.box ??= box;throw error;}
      if (gridItem && inherited && style.display === 'inline') style.display = 'block';
      // A user-agent checkbox or radio (appearance auto, size, padding, border and minimum untouched): Chromium draws it
      // 13×13 border-box (measured). Laid out at that size for the accessibility checks; SC 2.5.8/2.5.5 exempt it.
      if (options.accessibility && !box.pseudo && box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType) && style.appearance === 'auto' && ['ua', 'inline-block', 'block'].includes(style.display)
        && ['inline-size', 'block-size'].every(key => style[key] === 'auto') && ['left', 'right', 'top', 'bottom'].every(side => ['ua', '0', '0px'].includes(style[`padding-${side}`]) && ['ua', '0', '0px'].includes(style[`border-${side}`])) && ['min-inline-size', 'min-block-size'].every(key => ['ua', 'auto'].includes(style[key])))
        style = { ...style, appearance: 'none', display: 'block', 'box-sizing': 'border-box', 'inline-size': '13px', 'block-size': '13px', 'min-inline-size': 'auto', 'min-block-size': 'auto', ...Object.fromEntries(['left', 'right', 'top', 'bottom'].flatMap(side => [[`padding-${side}`, '0'], [`border-${side}`, '0']])), $uaControl: true };
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
  const minimumOf = (region, a, b) => {
    const p = partition(region, diff(b, a), '>=');
    return [...p.yes.map(region => ({ region, value: a })), ...p.no.map(region => ({ region, value: b }))];
  };
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
    if(!box.pseudo && ['button', 'input', 'select', 'textarea'].includes(box.tag) && (style.appearance!=='none' || style.display!=='block')) throw new Error(`Checked ${box.tag === 'button' ? 'buttons' : 'form controls'} require appearance:none, display:block and explicit box-sizing/min-size/padding/border resets`);
    // A fieldset's rendered legend sits in its border: modeled only when the fieldset generates no box.
    // Replaced elements and text fields have intrinsic sizes the model does not compute.
    if(!box.pseudo && ['img', 'input', 'select', 'textarea', 'iframe', 'video', 'audio', 'marquee'].includes(box.tag) && (style.display!=='block' || style['inline-size']==='auto' || (block && style['block-size']==='auto'))) throw new Error(`Checked ${box.tag} elements require display:block and an explicit inline-size${block ? ' and block-size' : ''}; intrinsic sizes are not modeled`);
    // A translate moves painted and hit-tested coordinates, which the accessibility and integrity checks use; layout
    // proofs (transitions, no-shift, coordinate contracts) keep it Unknown.
    // A closed popover that author CSS displays keeps the UA [popover] { position: fixed; inset: 0; margin: auto }:
    // it renders as a fixed, centred box over the page, which is not modeled.
    if (box.popover === true && style.display !== 'none') throw Object.assign(new Error(`${box.label} is a closed popover that renders (author display overrides [popover]:not(:popover-open) { display: none }); its UA position: fixed is not modeled`), { code: 'U_LAYOUT_POPOVER' });
    if (style.$sticky && (!options.accessibility && !options.integrity || !['0', '0px'].includes(style.top) || ['bottom', 'left', 'right'].some(key => style[key] !== 'auto') || !block || !options.viewport.height || (options.hostBlockInset ?? 0) !== 0))
      throw Object.assign(new Error(`${box.label} is position: sticky; only top: 0 under the page scroll (no scrolling or clipping ancestor) is modeled, for the accessibility and integrity checks`), { code: 'U_LAYOUT_CSS' });
    if (style.$fixed && !options.accessibility && !options.integrity) throw Object.assign(new Error(`${box.label} is position: fixed; it is modeled (against the viewport at scroll position 0) for the accessibility and integrity checks only`), { code: 'U_LAYOUT_CSS' });
    if (style.$fixed && (!options.viewport.height || (options.hostInset ?? 0) !== 0 || (options.hostBlockInset ?? 0) !== 0)) throw Object.assign(new Error(`${box.label} is position: fixed; the viewport needs a height range and the component must start at the viewport origin`), { code: 'U_LAYOUT_CSS' });
    if (String(style.transform).startsWith('rotate-any(') && (!options.accessibility || options.integrity)) throw Object.assign(new Error(`transform ${style.transform}: an arbitrary rotation is modeled for the accessibility checks only (not integrity, whose overflow it changes)`), { code: 'U_LAYOUT_CSS' });
    if (style.transform !== 'none' && !options.accessibility && !options.integrity) throw Object.assign(new Error(`transform ${style.transform} moves the painted box; it is modeled for the accessibility and integrity checks only`), { code: 'U_LAYOUT_CSS' });
    if (['left', 'right', 'inline-start', 'inline-end'].includes(style.float)) { issue('E_LAYOUT_FLOAT', 'float is forbidden in checked layout', box, region); return false; }
    if (style.float !== 'none') throw new Error('Unsupported float value');
    if (style.display === 'contents') throw new Error('display: contents on the analyzed root or with text needs its parent box and anonymous items');
    if (!['block', 'grid', 'flex'].includes(style.display)) throw new Error(`Unsupported display: ${style.display}`);
    if (['grid', 'flex'].includes(style.display) && box.text) throw new Error('Wrap text in an explicit leaf; anonymous grid/flex text items need a layout adapter');
    // Main-axis auto margins of flex items absorb free space (resolved by the flex line).
    const marginOk = (key, axis) => style[key] === '0' || (style[key] === 'auto' && available.flexItem?.main === axis);
    if (['margin-left', 'margin-right'].some(key => !marginOk(key, 'inline'))) throw new Error(available.flexItem && ['margin-left', 'margin-right'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Only known zero inline margins are supported');
    if (block && ['margin-top', 'margin-bottom'].some(key => !marginOk(key, 'block'))) throw new Error(available.flexItem && ['margin-top', 'margin-bottom'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Reset native block margins explicitly before block checking');
    if (!['static', 'relative', 'absolute'].includes(style.position) || style['writing-mode'] !== 'horizontal-tb' || !['ltr', 'rtl'].includes(style.direction)) throw new Error('Only static/relative/local-absolute horizontal-tb boxes are supported');
    // rtl scroll containers put the scrollbar on the left; the container's own box and content width do not change,
    // and positions inside a scroll container are withheld anyway, so nothing depends on the side.
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
      // max-inline-size in px clamps the preferred width (CSS 2 §10.4: max(min, min(preferred, max))); flex items and
      // other max sizes are not modeled.
      // max-block-size in px: it caps an explicit or stretched height, and a leaf's content height; an auto-height
      // container with children is not modeled.
      if (axis === 'block' && style['max-block-size'] !== 'none' && !(/^\d+(?:\.\d+)?px$/.test(style['max-block-size']) && !available.flexItem && style.display !== 'table' && (style['block-size'] !== 'auto' || !(box.children ?? []).length || (available.block && available.alignBlock === undefined && !available.root)))) throw new Error('CSS max size clamping is not modeled');
      if (style[`max-${axis}-size`] !== 'none' && axis === 'inline' && !( (/^\d+(?:\.\d+)?px$/.test(style['max-inline-size']) || (/^\d+(?:\.\d+)?%$/.test(style['max-inline-size']) && available.inline && !available.flexItem)) && (!available.flexItem || available.flexItem.main === 'inline') && style.display !== 'table')) throw new Error('CSS max size clamping is not modeled');
      if (axis === 'inline') {
        if (style['min-inline-size'] !== 'auto') px(style['min-inline-size']);
      // A column flex item's minimum is resolved by the flex line (its track is never smaller).
      } else if (!['auto', '0', '0px'].includes(style['min-block-size']) && !available.flexBlockMinimum) throw new Error('CSS min-block-size clamping is not modeled');
    }
    // Flex containers and items validate their alignment in the flex model.
    if (block && ((style.display !== 'flex' && !['normal', 'stretch'].includes(style['align-items'])) || (!available.flexItem && !['auto', 'normal', 'stretch'].includes(style['align-self'])) || (style.display !== 'flex' && !['normal', 'stretch', 'start', ...(style.display === 'grid' ? ['center', 'end'] : [])].includes(style['align-content'])))) throw new Error('Only stretch items and normal/stretch/start (grid: center/end) content alignment are supported');
    return true;
  }

  function flex(region, available, definitions, gap, bases, stretchAuto) {
    // Automatic table columns (CSS 2 / Chromium auto table layout): below the summed minima every column keeps its
    // minimum (the table overflows); between minima and maxima each grows from its minimum by its share of
    // (max − min); above the maxima the width is shared in proportion to the maxima.
    // With px columns (measured): (1) below every minimum all stay at their minimum; (2) the px columns grow from
    // their content minimum toward px in proportion to (px − min); (3) then the auto columns from min toward max in
    // proportion to (max − min); (4) beyond, the auto columns share the rest in proportion to their max.
    if (definitions.some(t => t.autoTable)) {
      if (!definitions.every(t => t.autoTable)) throw new Error('Automatic table columns do not mix with other tracks');
      const mins = definitions.map(t => t.autoTable.min), tops = definitions.map(t => t.autoTable.max), fixed = definitions.map(t => Boolean(t.autoTable.fixed));
      const S = diff(available, scalar(gap)), total = list => list.reduce(add, zero);
      const A = total(mins), B = total(definitions.map((t, i) => fixed[i] ? tops[i] : mins[i])), C = total(tops);
      const autoMax = total(tops.filter((_, i) => !fixed[i])), autoCount = fixed.filter(f => !f).length;
      const out = [], within = (lo, hi) => region && clip(clip(region, diff(S, scalar(lo))), diff(scalar(hi), S), true);
      const under = clip(region, diff(scalar(A), S), true);
      if (under) out.push({ region: under, values: mins.map(scalar), required: scalar(add(A, gap)) });
      const phase = (lo, hi, grows) => { const spread = sub(hi, lo); if (cmp(spread, zero) <= 0) return; const r = within(lo, hi); if (!r) return;
        out.push({ region: r, values: definitions.map((t, i) => grows(i) ? sum(scalar(mins[i]), times(diff(S, scalar(lo)), div(sub(tops[i], mins[i]), spread))) : scalar(fixed[i] && lo === B ? tops[i] : mins[i])), required: scalar(gap) }); };
      phase(A, B, i => fixed[i]);
      // Phase 3: px columns at px, auto columns grow.
      { const spread = sub(C, B), r = cmp(spread, zero) > 0 ? within(B, C) : null; if (r) out.push({ region: r, values: definitions.map((t, i) => fixed[i] ? scalar(tops[i]) : sum(scalar(mins[i]), times(diff(S, scalar(B)), div(sub(tops[i], mins[i]), spread)))), required: scalar(gap) }); }
      const over = clip(region, diff(S, scalar(C)));
      if (over) out.push({ region: over, values: definitions.map((t, i) => fixed[i] ? scalar(tops[i]) : sum(scalar(tops[i]), times(diff(S, scalar(C)), cmp(autoMax, zero) > 0 ? div(tops[i], autoMax) : div(one, q(autoCount))))), required: scalar(gap) });
      return out;
    }
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
    // The hypothetical main size: the base clamped by the maximum, then the minimum (min wins over max).
    const capped = item => item.maximum && constantLess(item.maximum, item.base) ? item.maximum : item.base;
    const hypothetical = items.map(item => item.minimum === item.base && !item.maximum ? item.base : maximumConstant(capped(item), item.minimum));
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
        if (cmp(factor, zero) === 0 || (mode === 'shrink' && (item.content || (item.minimum !== item.base && constantLess(item.base, item.minimum)))) || (mode === 'grow' && item.maximum && constantLess(item.maximum, item.base))) frozen.set(index, hypothetical[index]);
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
          // §9.7 step 4d–e: clamp each target into [min, max]; by the sign of the total violation freeze the min
          // violators (positive), the max violators (negative) or all of them (zero).
          let parts = [{ region: state.region, under: [], over: [] }];
          for (const index of unfrozen) {
            if (items[index].minimum !== items[index].base) parts = bounded(parts.flatMap(part => {
              const split = partition(part.region, diff(targets[index], items[index].minimum), '>=');
              return [...split.yes.map(r => ({ ...part, region: r })), ...split.no.map(r => ({ ...part, region: r, under: [...part.under, index] }))];
            }));
            if (items[index].maximum) parts = bounded(parts.flatMap(part => {
              if (part.under.includes(index)) return [part];
              const split = partition(part.region, diff(items[index].maximum, targets[index]), '>=');
              return [...split.yes.map(r => ({ ...part, region: r })), ...split.no.map(r => ({ ...part, region: r, over: [...part.over, index] }))];
            }));
          }
          for (const part of parts) {
            if (!part.under.length && !part.over.length) { results.push({ region: part.region, values: targets, free: diff(available, sum(total(targets), scalar(gap))), mode }); continue; }
            const clampOf = index => part.under.includes(index) ? items[index].minimum : items[index].maximum;
            if (!part.over.length || !part.under.length) { next.push({ region: part.region, frozen: new Map([...state.frozen, ...[...part.under, ...part.over].map(index => [index, clampOf(index)])]) }); continue; }
            const violation = [...part.under, ...part.over].map(index => diff(clampOf(index), targets[index])).reduce((a, b) => sum(a, b));
            const positive = partition(part.region, violation, '>');
            for (const r of positive.yes) next.push({ region: r, frozen: new Map([...state.frozen, ...part.under.map(index => [index, items[index].minimum])]) });
            for (const rest of positive.no) {
              const negative = partition(rest, diff(scalar(zero), violation), '>');
              for (const r of negative.yes) next.push({ region: r, frozen: new Map([...state.frozen, ...part.over.map(index => [index, items[index].maximum])]) });
              for (const r of negative.no) next.push({ region: r, frozen: new Map([...state.frozen, ...[...part.under, ...part.over].map(index => [index, clampOf(index)])]) });
            }
          }
        }
        states = bounded(next);
      }
      if (states.length) throw new Error('Flex freezing did not converge');
    }
    return results;
  }
  // ---- flex layout (ADR-0011) ----------------------------------------------
  const constantItem = item => ({ ...item, base: scalar(item.base), minimum: scalar(item.minimum), maximum: item.maximum !== undefined ? scalar(item.maximum) : null, innerBase: sub(item.base, item.edges) });
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
  // Generated content outside a grid/flex container (a leaf, inline content, or a container whose children are
  // not collected here) has no modeled box: Unknown unless it generates nothing.
  // Generated text is allowed where it cannot change the geometry: in a leaf with px width and height, or in a
  // text leaf whose measured content already holds it (at its start for ::before, its end for ::after), set in the
  // leaf's font. It is recorded as the box's generated text (accessible names include it).
  function generatedElsewhere(box, region, parents, inheritedStyle) {
    if (box.pseudo) return null;
    const generated = {};
    for (const kind of ['before', 'after']) {
      const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : (box.children ?? []).length}`, label: `${box.label}::${kind}`, children: [], pseudo: kind };
      for (const c of styles(pbox, region, parents, inheritedStyle, false, false, new Set([`::${kind}`]))) {
        const content = c.style.content ?? 'none';
        if (content === 'none' || c.style.display === 'none') continue;
        const text = content.startsWith('text:') ? content.slice(5) : null;
        const fixed = !(box.children ?? []).length && !box.inline?.length && ['inline-size', 'block-size'].every(key => /^\d+(?:\.\d+)?px$/.test(inheritedStyle[key])) && c.style.position === 'static';
        const measured = box.contract?.textMetrics?.text, collapsedText = text?.replace(/\s+/g, ' ').trim();
        const inMeasure = text !== null && typeof measured === 'string' && collapsedText && (kind === 'before' ? measured.startsWith(collapsedText) : measured.endsWith(collapsedText)) && c.style.position === 'static'
          && ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform'].every(key => c.style[key] === inheritedStyle[key]) && c.style.display === 'inline';
        // An absolutely positioned generated box of a leaf (a hit-area expansion, a check mark) is out of flow: it is laid
        // out after the leaf, against its containing block (leafPseudo).
        if (text === null && c.style.position === 'absolute' && !(box.children ?? []).length && !box.inline?.length) { box.absolutePseudo = [...new Set([...(box.absolutePseudo ?? []), kind])]; continue; }
        if (text === null || !(fixed || inMeasure)) throw Object.assign(new Error(`${pbox.label} generates ${text === null ? 'a box' : 'text'} that may change the layout (only text in a px-sized leaf, or included in the leaf's measured text, is modeled)`), { code: 'U_LAYOUT_PSEUDO' });
        generated[kind] = text;
      }
    }
    return generated.before !== undefined || generated.after !== undefined ? generated : null;
  }
  // Measured bounds of an inline element in one line of fixed text (textMetrics.inline): an outer
  // rectangle it stays inside and an inner one it always covers, from the leaf's content box.
  const sixtyfourths = (value, round) => div(q(String(round(value * 64))), q(64));
  // A list of {region, outer, inner}: one piece for one line of text, one per width interval of the
  // line layout for wrapping text (none where the element is split across lines).
  function inlineBounds(child, leaf, leafStyle, leafRow, region) {
    const metrics = leaf.contract?.textMetrics;
    if (!leafRow?.origin || !metrics?.inline || !['start', 'left'].includes(leafStyle['text-align']) || leafStyle.direction !== 'ltr') return null;
    if (!(metrics.kind === 'content' && leaf.contract.wrap === 'nowrap') && metrics.kind !== 'lines') return null;
    const entry = Object.entries(metrics.inline).find(([selector]) => matches(compileSelector(selector), child));
    if (!entry) return null;
    const x = sum(leafRow.origin.inline, scalar(leafRow.content.left));
    // A table cell aligns its lines by vertical-align within its (stretched) content box (measured: middle by default).
    const L = leaf.contract.font?.lineHeight, align = leaf.tableCell ? leafStyle['vertical-align'] : 'top';
    if (!['top', 'middle', 'bottom'].includes(align) || (align !== 'top' && (!leafRow.block || !L))) return null;
    const contentBlock = leafRow.block && diff(leafRow.block, scalar(['top', 'bottom'].map(side => add(px(leafStyle[`padding-${side}`]), px(leafStyle[`border-${side}`]))).reduce(add, zero)));
    const shift = lines => align === 'top' ? scalar(zero) : times(diff(contentBlock, scalar(mul(q(String(L)), q(lines)))), align === 'middle' ? div(q(1), q(2)) : q(1));
    let y = sum(leafRow.origin.block, scalar(leafRow.content.top));
    const rect = (x0, x1, y0, y1) => cmp(x1, x0) > 0 && cmp(y1, y0) > 0 ? { origin: { inline: sum(x, scalar(x0)), block: sum(y, scalar(y0)) }, inline: scalar(sub(x1, x0)), block: scalar(sub(y1, y0)) } : null;
    const piece = (b, r) => ({ region: r, outer: rect(sixtyfourths(b.start[0], Math.floor), sixtyfourths(b.end[1], Math.ceil), sixtyfourths(b.top[0], Math.floor), sixtyfourths(b.bottom[1], Math.ceil)),
      inner: rect(sixtyfourths(b.start[1], Math.ceil), sixtyfourths(b.end[0], Math.floor), sixtyfourths(b.top[1], Math.ceil), sixtyfourths(b.bottom[0], Math.floor)) });
    const base = y;
    if (metrics.kind === 'content') { y = sum(base, shift(1)); return [piece(entry[1], region)]; }
    const content = leafRow.content.inline, out = [];
    for (const step of entry[1]) {
      if (step.split) continue;
      let r = clip(region, diff(content, scalar(sixtyfourths(step.atLeastInlineSize, Math.round))));
      if (r && step.below !== null) r = clip(r, diff(scalar(sixtyfourths(step.below, Math.round)), content), true);
      if (r && align !== 'top' && step.lines === undefined) return null;
      if (r) { y = sum(base, shift(step.lines ?? 1)); out.push(piece(step, r)); }
    }
    return out;
  }
  function inlineContent(leaf, leafStyle, region, parents, chain, leafRow) {
    for (const child of leaf.inline) for (const state of styles(child, region, parents.map(p => ({ ...p, names: [] })), parents.at(-1).style, false, false)) {
      const style = state.style;
      if (style.display === 'none') continue;
      const generatedText = generatedElsewhere(child, state.region, parents, style);
      if (generatedText) child.generated = generatedText;
      if (style.display !== 'inline' || style.position !== 'static' || style.float !== 'none') throw Object.assign(new Error(`${child.label} inside text must stay display: inline and static to keep the text's measured size`), { code: 'U_LAYOUT_INLINE' });
      // auto margins of inline boxes compute to 0.
      for (const side of ['left', 'right']) for (const key of [`padding-${side}`, `border-${side}`, `margin-${side}`]) if (!['0', '0px', ...(key.startsWith('margin') ? ['auto'] : [])].includes(String(style[key]))) throw Object.assign(new Error(`${child.label} inside text has horizontal ${key}; inline box edges change the measured text`), { code: 'U_LAYOUT_INLINE' });
      if (leaf.contract?.textMetrics && fontKeys.some(key => style[key] !== leafStyle[key])) throw Object.assign(new Error(`${child.label} changes the font inside text measured as one run`), { code: 'U_LAYOUT_INLINE' });
      const own = [...chain, paintFacts(style)];
      geometry.push({ box: child, path: child.path, region: state.region, origin: null, inline: null, block: null, position: 'static', inlineFlow: true,
        borders: { left: zero, right: zero, top: zero, bottom: zero }, overflow: 'visible', overflowValue: 'visible', painted: paints(style), paint: paintFacts(style), chain: own, parentText: leaf.path,
        ...(leafRow ? { bounds: inlineBounds(child, leaf, leafStyle, leafRow, state.region) ?? undefined } : {}) });
      if (child.children?.length) inlineContent({ ...child, inline: child.children, contract: leaf.contract }, style, state.region, [...parents, { box: child, style }], own);
    }
  }
  const focusState = new Set(['focus', 'focus-visible', 'focus-within']), hoverState = new Set(['hover']);
  const focusableBox = box => box.focusable === true || box.tabIndex >= 0 || (['button', 'select', 'textarea'].includes(box.tag) && box.focusable !== false) || (box.tag === 'input' && box.focusable !== false && box.inputType !== 'hidden');
  // A :focus rule that moves an absolutely positioned box by its insets: where the focused box lands (stateGeometry
  // rules; accessibility checks only). Any other focused inset change is not modeled.
  function focusMove(box, style, focused, available, inline, blockSize, parents) {
    const moved = ['left', 'right', 'top', 'bottom'].some(key => focused[key] !== style[key]), turned = focused.transform !== style.transform;
    if (!moved && !turned) return {};
    if (moved && style.position !== 'absolute') throw Object.assign(new Error(`${box.label}: a :focus rule changes the insets of a box that is not absolutely positioned`), { code: 'U_LAYOUT_SELECTOR' });
    // The focused box: placed by its focused insets, then painted through its focused transform.
    const painted = scaled(focused, resolvedOrigin(focused, available, inline, blockSize, parents), inline, blockSize);
    return painted.origin ? { origin: painted.origin, inline: painted.inline, block: painted.block } : { originUnknown: true };
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
        if (contract.minBlockSize !== undefined) (box.tableCell && (contract.overflowBlock ?? 'fit') === 'fit' ? cellGrows : obligation)(contentBlock, scalar(contract.minBlockSize), box, region, 'E_LAYOUT_CONTENT', 'block', (contract.overflowBlock ?? 'fit') === 'fit', content('block', 'minBlockSize'));
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
      const unscaledOrigin = origin ?? resolvedOrigin({...style,'overflow-x':'visible','overflow-y':'visible'},available,inline,blockSize,parents);
      const painted = scaled(style, unscaledOrigin, inline, blockSize), ownOrigin = painted.origin;
      // Inside an overflow: clip box positions are exact but parts may be clipped away: the other rules see no
      // position (as before), focus-clipped reads clipOrigin.
      const underClip = parents.some(p => p.clipScope);
      if (style.$sticky && parents.some(p => p.clipped || p.clipScope || (p.style && ['overflow-x', 'overflow-y'].some(key => p.style[key] !== 'visible')))) throw Object.assign(new Error(`${box.label} is position: sticky inside a scrolling or clipping ancestor, which it would stick to`), { code: 'U_LAYOUT_CSS' });
      geometry.push({ box, path: box.path, region, origin: underClip ? null : ownOrigin, clipOrigin: ownOrigin, ...(style.position === 'absolute' ? { containingPath: available.containingBlock?.path } : {}), ...(style.$fixed ? { fixed: true } : {}), ...(style.$uaControl ? { uaControl: true } : {}), ...(style.$sticky ? { sticky: { parent: parents.at(-1)?.box.path ?? null } } : {}), inline: painted.inline, block: painted.block, position: style.position,
        borders: Object.fromEntries(['left','right','top','bottom'].map(side => [side, px(style[`border-${side}`])])),
        // overflow: clip clips without scrolling (hidden still scrolls a focused descendant into view).
        clipAxes: { inline: style['overflow-x'] === 'clip', block: style['overflow-y'] === 'clip' },
        overflow: ['hidden','clip'].includes(overflowValue) ? 'clip' : ['auto','scroll'].includes(overflowValue) ? 'scroll' : 'visible', overflowValue,
        // Where a single line of text starts inside the box (font-derived text extents).
        content: { left: add(px(style['border-left']), px(style['padding-left'])), top: add(px(style['border-top']), px(style['padding-top'])), inline: contentInline },
        textAlign: style['text-align'], lineHeight: style['line-height'], painted: paints(style),
        // z-index applies to positioned boxes and to grid/flex items.
        zIndex: style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(parents.at(-1)?.style.display)) ? Number(style['z-index']) : null,
        paint: paintFacts(style), chain: [...ancestorPaint, ...parents.map((parent, i) => captionBackdrop(parent, parents[i + 1]?.box ?? box, paintFacts(parent.style))), paintFacts(style)],
        contentBlockSize: contentBlock ?? null, fontSize: style['font-size'],
        // The focused paint (paint-only :focus/:focus-visible/:focus-within rules) of focusable boxes.
        ...(focusableBox(box) || box.tag === 'a' ? { hoverStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, hoverState).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
        ...(style['animation-name'] !== 'none' ? { reducedMotion: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set(['prefers-reduced-motion:reduce'])).map(s => ({ region: s.region, paint: paintFacts(s.style) })) } : {}),
        // Both checked states of a checkbox/radio (paint-only :checked rules), for the checked-indicator rule.
        // A ::before/::after generated in a state is described by its content and paint (`marks`); one that is not
        // absolutely positioned would move the layout (`markUnknown`).
        ...(box.tag === 'input' && ['checkbox', 'radio'].includes(box.inputType) ? { checkedStates: ['checked', 'unchecked'].map(name => styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, new Set([name])).flatMap(s => {
          const owner = [...parents.map(p => ({ ...p, names: p.names ?? [] })), { box, style: s.style, names: [] }];
          let pieces = [{ region: s.region, marks: [], markUnknown: false }];
          for (const kind of ['before', 'after']) pieces = pieces.flatMap(piece => styles({ ...box, pseudo: kind }, piece.region, owner, s.style, false, false, new Set([name])).map(m => {
            const generated = !['none', 'normal'].includes(String(m.style.content ?? 'none')) && m.style.display !== 'none';
            return { region: m.region, marks: generated ? [...piece.marks, JSON.stringify([kind, m.style.content, m.style['background-color'], m.style.color, m.style.visibility, m.style.opacity])] : piece.marks, markUnknown: piece.markUnknown || (generated && m.style.position !== 'absolute') };
          }));
          return pieces.map(piece => ({ region: piece.region, paint: paintFacts(s.style), marks: piece.marks.join('|'), markUnknown: piece.markUnknown }));
        })) } : {}),
        // The placeholder text's paint (::placeholder rules; Chromium's UA color is rgb(117, 117, 117), measured).
        ...(box.placeholder && ['input', 'textarea'].includes(box.tag) ? { placeholderPaint: styles({ ...box, pseudo: 'placeholder' }, region, [...parents, { box, style, names: [] }], style, false, false, new Set(['::placeholder'])).map(s => ({ region: s.region, color: s.style.$sources.color ? s.style.color : '#757575', opacity: s.style.opacity })) } : {}),
        ...(focusableBox(box) ? { focusStates: styles(box, region, parents.map(p => ({ ...p, names: p.names ?? [] })), parents.at(-1)?.style, false, false, focusState).map(s => ({ region: s.region, paint: paintFacts(s.style), authorOutline: Boolean(s.style.$sources['outline-style']), ...focusMove(box, style, s.style, available, inline, blockSize, parents), ...(s.style['z-index'] !== style['z-index'] ? { zIndex: s.style['z-index'] !== 'auto' && (style.position !== 'static' || ['grid', 'flex'].includes(parents.at(-1)?.style.display)) ? Number(s.style['z-index']) : null } : {}) })) } : {}) });
      if (box.inline?.length) inlineContent(box, style, region, [...parents, { box, style }], geometry.at(-1).chain, geometry.at(-1));
      const shown = scaled(style, parents.some(p => p.clipScope) ? null : origin, inline, blockSize);
      const rect=shown.origin && shown.block ? {inlineStart:affine(shown.origin.inline),blockStart:affine(shown.origin.block),inlineSize:affine(shown.inline),blockSize:affine(shown.block)} : null;
      const sizeRow = { box: box.label, path: box.path, position:style.position, ...positioned,...(rect ? {rect} : {}), boxSizing: style['box-sizing'], boxSizingSource: style.$sources['box-sizing'],
        paddingInlineSize:affine(diff(inline,scalar(add(px(style['border-left']),px(style['border-right']))))),
        ...(blockSize ? {paddingBlockSize:affine(diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))))} : {}),
        // Explicit absolute sizing determines its public allocation independently
        // from child requirements. The enclosing padding box stays separate.
        allocatedInlineSize:affine(style.position==='absolute' ? inline : available.inline),
        ...(available.block ? {allocatedBlockSize:affine(style.position==='absolute' ? blockSize : available.block)} : {}),
        inlineSize:affine(inline),contentInlineSize:affine(contentInline),
        ...(blockSize ? {blockSize:affine(blockSize)} : {}),...(contentBlock ? {contentBlockSize:affine(contentBlock)} : {}),...ranges(region) };
      Object.defineProperty(sizeRow, '$shown', { value: { region, ...shown }, writable: true, enumerable: false });
      sizes.push(sizeRow);
      // rtl: the container places its children mirrored in its content box (each child's subtree moves; its own
      // interior follows its own direction). Absolute descendants use physical insets, so they are not modeled here.
      if (style.direction === 'rtl' && box.children.length && origin && box.$starts) {
        const L = sum(origin.inline, scalar(add(px(style['border-left']), px(style['padding-left'])))), R = diff(sum(origin.inline, inline), scalar(add(px(style['border-right']), px(style['padding-right']))));
        const childOf = path => path.slice(0, path.lastIndexOf('/')) === box.path;
        const rows = geometry.slice(box.$starts.geometry), sizeRows = sizes.slice(box.$starts.sizes);
        // An absolute child is placed by physical insets: the container does not mirror it.
        for (const child of rows.filter(row => childOf(row.path) && row.position !== 'absolute' && intersectRegions(row.region, region) && (row.origin || row.clipOrigin))) {
          const at = child.origin ?? child.clipOrigin, dx = diff(diff(sum(L, R), times(at.inline, q(2))), child.inline);
          // An absolute box keeps its physical place unless its containing block moves with this child.
          const within = path => path === child.path || isDescendant(child.path, path);
          const stays = rows.filter(row => row.position === 'absolute' && row !== child && isDescendant(child.path, row.path) && !(row.containingPath && within(row.containingPath))).map(row => row.path);
          const moved = row => (row === child || (isDescendant(child.path, row.path) && intersectRegions(row.region, child.region))) && !stays.some(path => row.path === path || isDescendant(path, row.path));
          const shift = o => o ? { inline: sum(o.inline, dx), block: o.block } : o;
          for (const row of rows.filter(row => moved(row) && !row.$mirrored?.has(box.path))) {
            row.origin = shift(row.origin); row.clipOrigin = shift(row.clipOrigin);
            if (row.bounds) row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && { ...piece.outer, origin: shift(piece.outer.origin) }, inner: piece.inner && { ...piece.inner, origin: shift(piece.inner.origin) } }));
            (row.$mirrored ??= new Set()).add(box.path);
          }
          for (const row of sizeRows.filter(row => row.$shown && (row.path === child.path || isDescendant(child.path, row.path)) && !stays.some(path => row.path === path || isDescendant(path, row.path)) && intersectRegions(row.$shown.region, child.region))) {
            row.$shown = { ...row.$shown, origin: shift(row.$shown.origin) };
            if (row.rect && row.$shown.origin) row.rect = { ...row.rect, inlineStart: affine(row.$shown.origin.inline) };
          }
        }
      }
      // An arbitrary rotation: the box's circumscribed rectangle (an upper bound: |cos|·w/2 + |sin|·h/2 per half
      // extent, rounded up) is what it may cover; its descendants have no position either.
      const turn = /^rotate-any\((-?[\d.]+)\)$/.exec(String(style.transform));
      if (turn && origin && blockSize) {
        const radians = Number(turn[1]) * Math.PI / 180, up = v => q(String(Math.ceil(Math.abs(v) * 1e6 + 1) / 1e6));
        const [c, sn] = [up(Math.cos(radians)), up(Math.sin(radians))], half = div(one, q(2));
        const extentInline = sum(times(inline, mul(c, half)), times(blockSize, mul(sn, half))), extentBlock = sum(times(inline, mul(sn, half)), times(blockSize, mul(c, half)));
        const centre = { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) };
        const own = geometry.findLast(row => row.path === box.path && intersectRegions(row.region, region));
        if (own) own.rotatedBounds = { origin: { inline: diff(centre.inline, extentInline), block: diff(centre.block, extentBlock) }, inline: times(extentInline, q(2)), block: times(extentBlock, q(2)) };
        if (box.$starts) for (const row of geometry.slice(box.$starts.geometry).filter(row => isDescendant(box.path, row.path) && intersectRegions(row.region, region))) { row.origin = null; row.clipOrigin = null; row.rotatedBy = box.path; }
      }
      // A scale maps the painted descendants too: r ↦ C + s·(r − C) about the box's centre C (affine, s constant).
      const matrix = linearOf(style);
      if (matrix && (box.children.length || box.inline?.length) && origin && blockSize && box.$starts) {
        const half = div(one, q(2));
        const map = mapper(matrix, { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) });
        const inside = row => isDescendant(box.path, row.path) && intersectRegions(row.region, region);
        for (const row of geometry.slice(box.$starts.geometry).filter(inside)) {
          Object.assign(row, map(row));
          if (row.bounds) row.bounds = row.bounds.map(piece => ({ ...piece, outer: piece.outer && map(piece.outer), inner: piece.inner && map(piece.inner) }));
        }
        for (const row of sizes.slice(box.$starts.sizes).filter(row => row.$shown && isDescendant(box.path, row.path) && intersectRegions(row.$shown.region, region))) {
          const moved = map(row.$shown);
          row.$shown = { ...row.$shown, ...moved };
          if (row.rect && moved.origin && moved.block) row.rect = { inlineStart: affine(moved.origin.inline), blockStart: affine(moved.origin.block), inlineSize: affine(moved.inline), blockSize: affine(moved.block) };
        }
      }
    }
    if (!box.children.length) {
      if (box.text && contract.minInlineSize === undefined && (contract.overflow ?? 'fit') === 'fit') unknown('U_LAYOUT_INTRINSIC', 'Text needs a minInlineSize bound or an explicit overflow policy', undefined, box);
      if (block && box.text && (contract.overflowBlock ?? 'fit') === 'fit') {
        if (contract.intrinsicBlockSize !== undefined) for (const required of intrinsic(box, contentInline, region)) {
          // Wrapped text reports the lines it needs at this width and how many the box holds.
          const needed = contract.textMetrics?.kind === 'lines' ? Math.round(number(evaluate(required.value, { x: zero, y: zero })) / contract.font.lineHeight) : 0;
          const annotate = needed ? offered => ({ text: { lines: needed, fitsLines: fittingLines(contract.font.lineHeight, offered, needed) } }) : undefined;
          if (emit) (box.tableCell ? cellGrows : obligation)(contentBlock, required.value, box, required.region, 'E_LAYOUT_CONTENT', 'block', true, undefined, annotate);
        }
        else if (contract.minBlockSize === undefined) unknown('U_LAYOUT_INTRINSIC', 'Text needs a block-height contract or an explicit overflowBlock policy', undefined, box);
      }
    }
    return { region, inline, block: blockSize };
  }

  // Root-relative border coordinates. Scroll offsets/gutter placement and shared
  // subgrid line offsets are deliberately outside the first transition profile.
  // A px translate moves the box (and, through its origin, its descendants) after layout.
  const isDescendant = (a, b) => b.startsWith(a + '/');
  const intersectRegions = (a, b) => Boolean(intersect(a, b));
  // A linear transform with one nonzero entry per row (scale, quarter-turn rotation) about the box's centre keeps
  // rectangles axis-aligned: each new axis interval is a scaled (and possibly flipped) old one, so it stays affine.
  const rational = v => { const [n, d = '1'] = v.split('/'); return div(q(n), q(d)); };
  const affineOf = style => { const m = /^affine\((.+)\)$/.exec(style.transform ?? 'none'); return m ? m[1].split(' ').map(rational) : null; };
  function linearOf(style) {
    const m = affineOf(style);
    return m && !(cmp(m[0], one) === 0 && cmp(m[1], zero) === 0 && cmp(m[2], zero) === 0 && cmp(m[3], one) === 0) ? m.slice(0, 4) : null;
  }
  function mapper(matrix, centre) {
    const [a, b, c, d] = matrix;
    const axis = (p, r) => cmp(p, zero) !== 0 ? { coef: p, from: 'inline' } : { coef: r, from: 'block' };
    const rows = [axis(a, b), axis(c, d)];
    return rect => {
      if (!rect?.origin || !rect.block) return rect;
      const rel = { inline: [diff(rect.origin.inline, centre.inline), diff(sum(rect.origin.inline, rect.inline), centre.inline)], block: [diff(rect.origin.block, centre.block), diff(sum(rect.origin.block, rect.block), centre.block)] };
      const size = { inline: rect.inline, block: rect.block };
      const out = rows.map(({ coef, from }) => cmp(coef, zero) > 0 ? { lo: times(rel[from][0], coef), size: times(size[from], coef) } : { lo: times(rel[from][1], coef), size: times(size[from], mul(coef, minusOne)) });
      return { origin: { inline: sum(centre.inline, out[0].lo), block: sum(centre.block, out[1].lo) }, inline: out[0].size, block: out[1].size };
    };
  }
  function scaled(style, origin, inline, blockSize) {
    // An arbitrary rotation leaves no axis-aligned painted box: no position (its circumscribed rectangle is recorded).
    if (String(style.transform).startsWith('rotate-any(')) return { origin: null, inline, block: blockSize };
    const matrix = linearOf(style);
    if (!matrix || !origin || !blockSize) return { origin: matrix ? null : origin, inline, block: blockSize };
    const half = div(one, q(2)), centre = { inline: sum(origin.inline, times(inline, half)), block: sum(origin.block, times(blockSize, half)) };
    return mapper(matrix, centre)({ origin, inline, block: blockSize });
  }
  function translated(style, origin, size) {
    const m = affineOf(style);
    if (!origin || !m) return origin;
    // Percentages scale with the box's own size: t0 + W·u + H·v.
    const needsH = cmp(m[8], zero) !== 0 || cmp(m[9], zero) !== 0;
    if (needsH && !size?.block) return null;
    // em: the element's font-size, which must be a px value.
    const needsEm = cmp(m[10], zero) !== 0 || cmp(m[11], zero) !== 0;
    if (needsEm && !/^\d+(?:\.\d{1,6})?px$/.test(style['font-size'])) throw Object.assign(new Error(`An em translation needs a px font-size (got ${style['font-size']})`), { code: 'U_LAYOUT_CSS' });
    const em = needsEm ? px(style['font-size']) : zero;
    // rem: the root element's font-size, known only when the analysed root is html with a px font-size.
    const needsRem = cmp(m[12], zero) !== 0 || cmp(m[13], zero) !== 0;
    if (needsRem && !rootFontSize) throw Object.assign(new Error('A rem translation needs the html root with a px font-size in the analysed tree'), { code: 'U_LAYOUT_CSS' });
    const rem = needsRem ? rootFontSize : zero;
    const along = k => sum(sum(sum(scalar(m[4 + k]), times(size.inline, m[6 + k])), needsH ? times(size.block, m[8 + k]) : scalar(zero)), scalar(add(mul(em, m[10 + k]), mul(rem, m[12 + k]))));
    return offset(origin, along(0), along(1));
  }
  function resolvedOrigin(style,available,inline,blockSize,parents) {
    return translated(style, untranslatedOrigin(style,available,inline,blockSize,parents), { inline, block: blockSize });
  }
  function untranslatedOrigin(style,available,inline,blockSize,parents) {
    // overflow: clip never scrolls, so positions inside it stay exact; hidden/auto/scroll may be scrolled.
    if(!block || parents.some(p=>p.clipped || p.subgrid) || ['overflow-x','overflow-y'].some(key=>!['visible','clip'].includes(style[key])) ||
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

  // Fixed table layout (CSS 2.2 §17.5.2.1) as a grid, measured equal in Chromium: column widths
  // from the first row (px widths share the width in proportion, auto columns take the rest),
  // border-spacing as gaps and as an inset inside the padding, rows as tall as their tallest cell.
  function tableAsGrid(table, style, region, parents, emit, available, probe) {
    const fail = message => { throw Object.assign(new Error(message), { code: 'U_LAYOUT_TABLE' }); };
    // Automatic layout equals the fixed one (measured) when content cannot widen a column: every cell
    // is empty or its content's min-content bound fits its px column, no spans or caption, and
    // at most one (empty) auto column, which needs an explicit table width; an auto width is the sum.
    const automatic = style['table-layout'] !== 'fixed';
    if (style['border-collapse'] !== 'separate') fail('border-collapse: collapse is not modeled');
    if (style['inline-size'] === 'auto' && !automatic) fail('A fixed table needs an explicit inline-size');
    const caption = table.children?.[0]?.tag === 'caption' ? table.children[0] : null;
    const sections = (table.children ?? []).slice(caption ? 1 : 0);
    if (sections.some(section => !['thead', 'tbody', 'tfoot'].includes(section.tag))) fail('A modeled table holds an optional first caption, then thead, tbody and tfoot (no colgroup)');
    if (sections.findIndex(s => s.tag === 'tfoot') >= 0 && sections.findIndex(s => s.tag === 'tfoot') !== sections.length - 1) fail('tfoot must come last (it renders after the bodies)');
    const rows = sections.flatMap(section => section.children ?? []);
    if (!rows.length || rows.some(row => row.tag !== 'tr' || !(row.children ?? []).length || row.children.some(cell => !['td', 'th'].includes(cell.tag)))) fail('Every row is a tr of td/th cells');
    const spanOf = cell => { if (cell.colSpan === 'dynamic' || cell.rowSpan === 'dynamic') fail('A dynamic colspan/rowspan decides the cells'); return cell.colSpan ?? 1; };
    const columns = rows[0].children.map(spanOf).reduce((a, b) => a + b, 0);
    // Occupancy: a rowspan cell takes its columns in the following rows of its row group.
    const taken = new Map();
    for (const section of sections) {
      const groupRows = section.children ?? [];
      groupRows.forEach((row, r) => {
        let column = 0;
        const busy = c => taken.get(`${row.path}:${c}`);
        for (const cell of row.children) {
          while (busy(column)) column++;
          const n = spanOf(cell), down = cell.rowSpan ?? 1;
          if (r + down > groupRows.length) fail('A rowspan past the end of its row group is not modeled');
          for (let k = 0; k < down; k++) for (let c = column; c < column + n; c++) taken.set(`${groupRows[r + k].path}:${c}`, true);
          if (down > 1) cell.tableRowSpan = down;
          cell.tableAt = { column, row: rows.indexOf(row), span: n, down };
          column += n;
        }
      });
    }
    if (rows.some(row => Array.from({ length: columns + 1 }, (_, c) => taken.get(`${row.path}:${c}`)).filter(Boolean).length !== columns)) fail('Every row needs the same number of columns (cells, colspan and rowspan)');
    // A td/th restyled away from table-cell is wrapped in an anonymous cell (its spans no longer apply), and a
    // display: none cell removes its column: neither is the modeled grid.
    for (const row of rows) for (const cell of row.children) for (const cs of styles(cell, region, parents, style, false, false))
      if (cs.style.display !== 'table-cell') fail(`${cell.label} has display: ${cs.style.display}; a modeled table needs its cells as table-cell`);
    // A cell with block-level children lays them out in block flow: with zero margins that is one start-aligned
    // column (a 1-column grid with align-content: start). The cell's vertical-align must not move it: top, or the
    // cell decides its row's height (the row's other cells are empty with an auto height, no rowspan in the table).
    const spanning = rows.some(row => row.children.some(cell => (cell.rowSpan ?? 1) > 1));
    for (const [r, row] of rows.entries()) for (const cell of row.children.filter(cell => (cell.children ?? []).length)) {
      const rowStyle = one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row)), region, parents, style, false, false)), false, false));
      const cs = one(styles(cell, region, parents, rowStyle, false, false));
      if (cell.text) fail(`${cell.label} mixes text and child elements (inline formatting is not modeled)`);
      const alone = !spanning && row.children.every(other => other === cell || (!other.text && !other.contract && !(other.children ?? []).length && one(styles(other, region, parents, rowStyle, false, false))['block-size'] === 'auto'));
      // baseline: a cell without line boxes takes its content bottom as baseline, and the row's baseline cells are
      // bottom-aligned at the row's top (measured; empty cells take no part): the only non-empty one sits at the top.
      const soleBaseline = cs['vertical-align'] === 'baseline' && !spanning && row.children.every(other => other === cell || (!other.text && !other.contract && !(other.children ?? []).length) || one(styles(other, region, parents, rowStyle, false, false))['vertical-align'] !== 'baseline');
      if (soleBaseline) cell.tableBaselineTop = true;
      else if (cs['vertical-align'] === 'baseline' && !spanning) cell.tableBaselineGroup = { row: r, style: cs };
      else if (!['top', 'middle', 'bottom'].includes(cs['vertical-align']) && !(alone && cs['block-size'] === 'auto')) fail(`${cell.label} has vertical-align: ${cs['vertical-align']} with other baseline cells in its row; baseline alignment across cells is not modeled`);
      for (const child of cell.children) for (const c of styles(child, region, parents, cs, false, false)) {
        if (c.style.display === 'none') continue;
        if (!['block', 'grid', 'flex'].includes(c.style.display) || c.style.position !== 'static' || c.style.float !== 'none') fail(`${child.label} in a table cell must be a static block-level box (block flow of inline content is not modeled)`);
      }
      cell.tableFlow = true;
    }
    // Several baseline cells with content: each baseline is padding-top + content height (no line boxes); with px
    // children the heights are constants, and each cell moves down by (largest baseline − its own).
    const contentHeight = cell => (cell.children ?? []).map(child => {
      const cs = one(styles(child, region, parents, cell.tableBaselineGroup.style, false, false));
      if (cs.display === 'none') return zero;
      if (!/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) fail(`${child.label}: baseline-aligned cells are modeled when their children have px heights`);
      const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
      return cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']);
    }).reduce(add, zero);
    // Text cells: the first line's baseline is floor((L − (A + D)) / 2) + A with Chromium's rounded ascent A and
    // descent D (measured); an odd negative leading rounds ambiguously, so it is Unknown.
    for (const row of rows) {
      const rowStyle = one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row)), region, parents, style, false, false)), false, false));
      for (const cell of row.children.filter(cell => cell.text && !(cell.children ?? []).length && !cell.tableRowSpan)) {
        const cs = one(styles(cell, region, parents, rowStyle, false, false));
        if (cs['vertical-align'] !== 'baseline') continue;
        const metrics = cell.contract?.textMetrics, L = cell.contract?.font?.lineHeight;
        if (spanning || !metrics?.baseline || !L) fail(`${cell.label}: a baseline-aligned text cell needs font-derived text metrics (its first baseline)`);
        const leading = L - metrics.baseline.ascent - metrics.baseline.descent;
        if (leading < 0 && leading % 2) fail(`${cell.label}: an odd negative leading rounds the baseline ambiguously`);
        cell.tableBaselineGroup = { row: rows.indexOf(row), style: cs, text: q(String(Math.floor(leading / 2) + metrics.baseline.ascent)) };
      }
    }
    for (const [r, row] of rows.entries()) {
      const group = row.children.filter(cell => cell.tableBaselineGroup);
      if (!group.length) continue;
      const baselines = group.map(cell => add(px(cell.tableBaselineGroup.style['padding-top']), cell.tableBaselineGroup.text ? cell.tableBaselineGroup.text : contentHeight(cell)));
      const top = baselines.reduce((a, b) => cmp(a, b) >= 0 ? a : b);
      group.forEach((cell, i) => {
        cell.tableBaselineShift = sub(top, baselines[i]);
        // A moved cell with a fixed height could need a taller row (the table grows it, the grid would not): Unknown.
        if (cmp(cell.tableBaselineShift, zero) > 0 && cell.tableBaselineGroup.style['block-size'] !== 'auto') fail(`${cell.label}: a baseline-shifted cell with a fixed block-size is not modeled`);
      });
    }
    for (const box of [...sections, ...rows]) box.tablePart = true;
    for (const row of rows) for (const cell of row.children) cell.tableCell = true;
    // Cells stretch to their row: a fixed block-size must be shared by the row's cells (a grid item would not stretch).
    for (const row of rows) {
      const rs = styles(row, region, parents, style, false, false);
      const heights = new Set(row.children.filter(cell => !cell.tableRowSpan).map(cell => rs.flatMap(r => styles(cell, r.region, parents, r.style, false, false)).map(c => c.style['block-size']).join('|')));
      // With rowspan the rows become explicit tracks (the tallest cell) and cells stretch; otherwise a grid item would not.
      if (heights.size > 1 && !rows.some(row => row.children.some(cell => cell.tableRowSpan))) fail('Cells of one row with different block-size values are not modeled (table cells stretch to the row)');
    }
    const [h, v = h] = String(style['border-spacing']).split(/\s+/).map(part => px(part));
    // A rowspan cell is stretched over its rows; it must not size them (Chromium and grid distribute differently).
    for (const row of rows) for (const cell of row.children.filter(cell => cell.tableRowSpan)) {
      const block = new Set(styles(cell, region, parents, style, false, false).map(c => c.style['block-size']));
      const empty = !cell.text && !cell.contract && !(cell.children ?? []).length;
      // An auto-height text cell whose height profile is known at its (constant) width counts as that height.
      const measured = cell.text && !(cell.children ?? []).length && cell.contract?.intrinsicBlockSize !== undefined;
      // Children that are blocks of a px block-size stack: the cell's content height is their sum. A child's own
      // content (text or children) does not change its px height; its overflow is that child's layout to check.
      const stackedHeight = () => {
        if (cell.text || cell.contract || !(cell.children ?? []).length) return null;
        let total = zero;
        for (const child of cell.children) {
          if (child.tag === 'table' || child.tableCell) return null;
          const cs = one(styles(child, region, [...parents, { box: cell, style }], style, false, false));
          if (cs.display === 'none') continue;
          // An auto-height text leaf with a constant measured height (intrinsicBlockSize as a number) counts as that.
          const measuredLeaf = cs['block-size'] === 'auto' && child.text && !(child.children ?? []).length && typeof child.contract?.intrinsicBlockSize === 'number';
          if ((!/^\d+(?:\.\d+)?px$/.test(cs['block-size']) && !measuredLeaf) || cs.position !== 'static' || ['margin-top', 'margin-bottom'].some(key => !['0', '0px'].includes(cs[key]))) return null;
          const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          total = add(total, measuredLeaf ? add(q(String(child.contract.intrinsicBlockSize)), edges) : cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']));
        }
        return total;
      };
      const stacked = [...block][0] === 'auto' && !empty && !measured ? stackedHeight() : null;
      if (block.size !== 1 || !(([...block][0] === 'auto' && (empty || measured || stacked !== null)) || /^\d+(?:\.\d+)?px$/.test([...block][0]))) fail('A rowspan cell is modeled when it is empty, measured text or a stack of px-height blocks with block-size: auto, or has a px block-size');
      if ([...block][0] === 'auto' && measured) cell.tableMeasuredSpan = true;
      if (stacked !== null) cell.tableStackedSpan = stacked;
    }
    // The first row's cell widths decide the columns.
    function one(list) { if (list.length !== 1) fail('Table styles that vary across viewport regions are not modeled'); return list[0].style; }
    const sectionStyle = one(styles(sections[0], region, parents, style, false, false)), rowStyle = one(styles(rows[0], region, parents, sectionStyle, false, false));
    // A first-row cell spanning n columns gives each (w − (n − 1)·spacing) / n (measured).
    const widths = rows[0].children.flatMap(cell => {
      const cs = one(styles(cell, region, parents, rowStyle, false, false)), n = spanOf(cell);
      if (cs['inline-size'] === 'auto') return Array(n).fill(null);
      if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Fixed table column widths must be px or auto');
      const edges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
      const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), edges) : px(cs['inline-size']);
      const each = div(sub(w, mul(h, q(n - 1))), q(n));
      if (cmp(each, zero) <= 0) fail('A spanning cell narrower than its inner spacing is not modeled');
      return Array(n).fill(each);
    });
    // Column widths of a px-wide fixed table are constants (as the grid resolves them): px columns share the content
    // width in proportion, or keep their px and auto columns split the rest equally.
    // Column widths as affine functions of the viewport: constants for a px width, or from the containing width for an
    // auto (stretched in a grid area) or 100% border-box table.
    const columnWidths = () => {
      const frame = ['left', 'right'].map(side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]))).reduce(add, zero);
      let outer;
      if (!automatic && /^\d+(?:\.\d+)?px$/.test(style['inline-size'])) outer = scalar(style['box-sizing'] === 'content-box' ? add(px(style['inline-size']), frame) : px(style['inline-size']));
      else if (!automatic && style['box-sizing'] === 'border-box' && available?.inline && (style['inline-size'] === '100%' || (style['inline-size'] === 'auto' && parents.at(-1)?.style.display === 'grid'))) outer = available.inline;
      else fail('A measured rowspan cell needs a fixed table with a px, 100% or grid-stretched width (its width decides its height)');
      const content = diff(outer, scalar(add(frame, mul(h, q(columns + 1)))));
      const fixed = widths.filter(Boolean).reduce(add, zero), autos = widths.filter(w => !w).length;
      if (clip(region, diff(scalar(fixed), content), true)) fail('A measured rowspan cell in a table narrower than its px columns is not modeled');
      return widths.every(Boolean) ? widths.map(w => times(content, div(w, fixed))) : widths.map(w => w ? scalar(w) : times(diff(content, scalar(fixed)), div(q(1), q(autos))));
    };
    function measuredHeight(cell, cs, r) {
      const at = cell.tableAt, cols = columnWidths().slice(at.column, at.column + at.span).reduce((a, b) => sum(a, b));
      const inner = diff(sum(cols, scalar(mul(h, q(at.span - 1)))), scalar(['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero)));
      const profile = cell.contract.intrinsicBlockSize;
      if (typeof profile === 'number') return q(String(profile));
      // The caller splits the region at the profile's widths, so the entry is the same everywhere in it.
      probe?.push({ inner, thresholds: profile.map(e => q(String(e.atLeastInlineSize))) });
      const width = evaluate(inner, sample(region));
      const entry = profile.filter(e => cmp(q(String(e.atLeastInlineSize)), width) <= 0).at(-1);
      if (!entry || entry.blockSize === null) fail('The measured rowspan cell has no known height at its width');
      return q(String(entry.blockSize));
    }
    // With a rowspan the rows become explicit tracks: each row's other cells give its px height (border box).
    let rowTracks = null;
    if (rows.some(row => row.children.some(cell => cell.tableRowSpan))) rowTracks = rows.map(row => {
      const own = row.children.filter(cell => !cell.tableRowSpan);
      if (!own.length) return zero;
      const rowStyle = one(styles(row, region, parents, style, false, false));
      return own.map(cell => {
        const cs = one(styles(cell, region, parents, rowStyle, false, false));
        if (!/^\d+(?:\.\d+)?px$/.test(cs['block-size'])) fail('With rowspan, every row needs cells with a px block-size');
        const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        return cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size']);
      }).reduce((a, b) => cmp(a, b) >= 0 ? a : b);
    });
    // A taller rowspan cell grows its rows in proportion to their heights (all to the last row when they are 0),
    // each share floored to 1/64px and the rest to the last row (measured in Chromium). Spans may not overlap.
    if (rowTracks) {
      // Chromium's RowspanCell order (table_layout_algorithm_types.h, the legacy height-distribution order):
      // same rows → larger min block size first; a span enclosed in another first; else the lower start row.
      // It is not a strict weak order in general, so it is used only where it is consistent on these spans.
      const spans = rows.flatMap((row, r) => row.children.filter(cell => cell.tableRowSpan).map(cell => {
        const cs = one(styles(cell, region, parents, one(styles(row, region, parents, style, false, false)), false, false));
        const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        const min = cs['block-size'] !== 'auto' ? (cs['box-sizing'] === 'content-box' ? add(px(cs['block-size']), edges) : px(cs['block-size'])) : cell.tableMeasuredSpan ? add(measuredHeight(cell, cs, r), edges) : cell.tableStackedSpan !== undefined ? add(cell.tableStackedSpan, edges) : zero;
        return { cell, row, r, n: cell.tableRowSpan, min };
      }));
      const inside = (a, b) => a.r >= b.r && a.r + a.n <= b.r + b.n;
      const before = (a, b) => a.r === b.r && a.n === b.n ? cmp(a.min, b.min) > 0 : inside(a, b) ? true : inside(b, a) ? false : a.r < b.r;
      for (const a of spans) for (const b of spans) for (const c of spans) if (before(a, b) && before(b, c) && !before(a, c)) fail('These rowspan cells have no consistent Chromium distribution order');
      for (const a of spans) for (const b of spans) if (a !== b && before(a, b) && before(b, a)) fail('These rowspan cells have no consistent Chromium distribution order');
      const ordered = [...spans].sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0);
      for (const { cell, row, r, n } of ordered) {
        const cs = one(styles(cell, region, parents, one(styles(row, region, parents, style, false, false)), false, false));
        if (cs['block-size'] === 'auto' && !cell.tableMeasuredSpan && cell.tableStackedSpan === undefined) continue;
        const edges = ['top', 'bottom'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
        const target = sub(spans.find(sp => sp.cell === cell).min, mul(v, q(n - 1)));
        const spanned = rowTracks.slice(r, r + n), total = spanned.reduce(add, zero);
        if (cmp(target, total) <= 0) continue;
        // Chromium's DistributeExcessBlockSizeToRows for a rowspan (rows here all have fixed heights, so none is
        // unconstrained): (1) rows after the first that start a rowspan share the excess equally; else (2) all rows
        // empty: the last takes it; else (3) the non-empty rows grow in proportion to their heights. Shares are
        // LayoutUnits (1/64px, truncated); the last receiving row takes the remainder.
        const floor64 = value => div(q(String(Math.floor(number(mul(value, q(64))) + 1e-9))), q(64));
        const excess = sub(target, total), grown = [...spanned];
        const starting = spanned.map((_, k) => k).filter(k => k > 0 && spans.some(other => other.r === r + k));
        const nonEmpty = spanned.map((h, k) => k).filter(k => cmp(spanned[k], zero) > 0);
        const share = (receivers, weight) => {
          let given = zero;
          receivers.forEach((k, i) => {
            const part = i === receivers.length - 1 ? sub(excess, given) : floor64(weight(k));
            grown[k] = add(grown[k], part); given = add(given, part);
          });
        };
        if (starting.length) share(starting, () => div(excess, q(starting.length)));
        else if (!nonEmpty.length) share([n - 1], () => excess);
        else share(nonEmpty, k => div(mul(spanned[k], excess), total));
        rowTracks.splice(r, n, ...grown);
      }
      rowTracks = rowTracks.map(value => `${number(value)}px`);
      // With explicit row tracks every cell stretches to its rows (its own height is in the track).
      for (const row of rows) for (const cell of row.children) cell.tableStretch = true;
    }
    // A caption sits outside the table box (above or below it, as wide as the table): an extra
    // grid row only when no border, padding or spacing separates the rows from the table edge.
    if (caption) {
      caption.tableCaption = { columns, rows: rows.length, side: one(styles(caption, region, parents, style, false, false))['caption-side'] };
    }
    let autoWidth = null, autoMinimum = null, contentTracks = null, contentShrink = null;
    if (automatic) {
      if (caption || rows.some(row => row.children.some(cell => (cell.colSpan ?? 1) > 1 || cell.tableRowSpan))) fail('Automatic table layout is modeled without captions, colspan or rowspan');
      const rowStyles = rows.map(row => one(styles(row, region, parents, one(styles(sections.find(sec => sec.children.includes(row)), region, parents, style, false, false)), false, false)));
      // Content-sized columns: no px widths at all, and every non-empty cell a leaf with trusted min- and max-content
      // widths (minInlineSize, maxInlineSize). Each column's range is its cells' widest (plus the cell edges).
      // Px columns may join (Chromium's auto table layout, measured): their range is [content minimum, px].
      const leafWith = (cell, auto) => !(cell.children ?? []).length && cell.contract?.minInlineSize !== undefined && (!auto || cell.contract?.maxInlineSize !== undefined);
      const emptyCell = cell => !cell.text && !cell.contract && !(cell.children ?? []).length;
      const contentColumns = widths.some(w => !w) && rows.every(row => row.children.every((cell, c) => emptyCell(cell) || leafWith(cell, !widths[c]))) && (widths.every(w => !w) || rows.some(row => row.children.some((cell, c) => !widths[c] && !emptyCell(cell))));
      const ranges = contentColumns ? Array.from({ length: columns }, () => ({ min: zero, max: zero })) : null;
      rows.forEach((row, r) => row.children.forEach((cell, c) => {
        const cs = one(styles(cell, region, parents, rowStyles[r], false, false));
        if (contentColumns) {
          const cellEdges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          if (cs['inline-size'] !== 'auto') {
            if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Automatic table column widths must be px or auto');
            const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), cellEdges) : px(cs['inline-size']);
            if (!widths[c] || cmp(w, widths[c]) !== 0) fail('In automatic table layout every px width of a column must be the first row\'s');
          }
          if (widths[c]) ranges[c].fixed = widths[c];
          const lo = add(q(String(cell.contract?.minInlineSize ?? 0)), cellEdges), hi = add(q(String(cell.contract?.maxInlineSize ?? 0)), cellEdges);
          if (cmp(lo, ranges[c].min) > 0) ranges[c].min = lo;
          if (cmp(hi, ranges[c].max) > 0) ranges[c].max = hi;
          return;
        }
        if (cs['inline-size'] !== 'auto') {
          if (!/^\d+(?:\.\d+)?px$/.test(cs['inline-size'])) fail('Automatic table column widths must be px or auto');
          const edges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          const w = cs['box-sizing'] === 'content-box' ? add(px(cs['inline-size']), edges) : px(cs['inline-size']);
          if (!widths[c] || cmp(w, widths[c]) !== 0) fail('In automatic table layout every px width of a column must be the first row\'s');
        }
        const empty = !cell.text && !cell.contract && !(cell.children ?? []).length;
        if (!empty) {
          if (!widths[c]) fail('An automatic table column without a px width is sized by its content');
          const edges = ['left', 'right'].map(side => add(px(cs[`padding-${side}`]), px(cs[`border-${side}`]))).reduce(add, zero);
          if (cell.contract?.minInlineSize === undefined || (cell.children ?? []).length || cmp(q(String(cell.contract.minInlineSize)), sub(widths[c], edges)) > 0)
            fail('In automatic table layout a cell needs a min-content bound (minInlineSize) that fits its px column');
        }
      }));
      const autos = widths.filter(w => !w).length;
      if (autos > 1 && !contentColumns) fail('Several auto columns share the extra width by content; not modeled');
      const edges = add(add(add(px(style['padding-left']), px(style['padding-right'])), add(px(style['border-left']), px(style['border-right']))), mul(h, q(columns + 1)));
      // An auto width stretches in a grid area (measured) and shrinks to fit at the root (block flow).
      const parentDisplay = parents.at(-1)?.style.display;
      if (style['inline-size'] === 'auto' && parentDisplay === 'flex') fail('An automatic table with an auto width in a flex container is sized by content');
      if (contentColumns) {
        for (const range of ranges) { if (cmp(range.max, range.min) < 0) range.max = range.min; if (range.fixed && cmp(range.fixed, range.min) < 0) range.fixed = range.min; }
        if (style['inline-size'] === 'auto' && parentDisplay === 'flex') fail('An automatic table with an auto width in a flex container is sized by content');
        // An auto width outside a grid area shrinks to fit: as wide as the available width, at most its columns'
        // max-content widths plus its edges (a max-inline-size on the equivalent grid).
        if (style['inline-size'] === 'auto' && parentDisplay !== 'grid') contentShrink = add(ranges.map(range => range.fixed ?? range.max).reduce(add, zero), edges);
        contentTracks = ranges.map(range => range.fixed ? `-isle-auto-table-fixed(${number(range.min)},${number(range.fixed)})` : `-isle-auto-table(${number(range.min)},${number(range.max)})`).join(' ');
      } else if (style['inline-size'] === 'auto' && parentDisplay === 'grid') autoMinimum = widths.filter(Boolean).reduce(add, zero);
      else if (style['inline-size'] === 'auto') {
        if (autos) fail('An automatic table with an auto column needs an explicit inline-size');
        autoWidth = add(widths.reduce(add, zero), edges);
      } else autoMinimum = widths.filter(Boolean).reduce(add, zero);
    }
    const tracks = contentTracks ? contentTracks.split(' ') : widths.every(Boolean) ? widths.map(w => `minmax(0, ${number(w)}fr)`) : widths.map(w => w ? `${number(w)}px` : 'minmax(0, 1fr)');
    const spacingEdges = { 'padding-left': add(px(style['padding-left']), h), 'padding-right': add(px(style['padding-right']), h), 'padding-top': add(px(style['padding-top']), v), 'padding-bottom': add(px(style['padding-bottom']), v) };
    // A content-box table's width includes the edge spacing (measured): the grid's content width is W − 2·spacing.
    let inlineSize = autoWidth ? `${number(autoWidth)}px` : style['inline-size'];
    if (autoWidth || contentShrink) style = { ...style, 'box-sizing': 'border-box', ...(contentShrink ? { 'max-inline-size': `${number(contentShrink)}px` } : {}) };
    else if (style['box-sizing'] === 'content-box') {
      if (!/^\d+(?:\.\d+)?px$/.test(inlineSize)) fail('A content-box fixed table needs a px inline-size');
      inlineSize = `${number(sub(px(inlineSize), add(h, h)))}px`;
    }
    // A caption with border-spacing: the caption spans the table's full width while the rows are inset, so the
    // spacing becomes explicit gap tracks (h c1 h c2 h; v r1 v r2 v) and every cell an explicit grid area.
    // The table's border and padding surround the rows but not the caption (measured): they join the edge tracks.
    const edge = side => add(px(style[`padding-${side}`]), px(style[`border-${side}`]));
    if (caption && (cmp(h, zero) !== 0 || cmp(v, zero) !== 0 || ['left', 'right', 'top', 'bottom'].some(side => cmp(edge(side), zero) !== 0))) {
      const top = caption.tableCaption.side !== 'bottom', gapH = `${number(h)}px`, gapV = `${number(v)}px`, track = value => `${number(value)}px`;
      const rowList = rowTracks ?? rows.map(() => 'auto');
      const rowTemplate = [track(add(edge('top'), v)), ...rowList.flatMap((t, i) => [t, i === rowList.length - 1 ? track(add(edge('bottom'), v)) : gapV])];
      // The caption is as wide as the table's border box; a content-box width excludes the border and padding.
      let width = style['inline-size'];
      if (style['box-sizing'] === 'content-box') {
        if (!/^\d+(?:\.\d+)?px$/.test(width)) fail('A content-box table with a caption needs a px inline-size');
        width = `${number(add(px(width), add(edge('left'), edge('right'))))}px`;
      }
      const columnTemplate = [track(add(edge('left'), h)), ...tracks.flatMap((t, i) => [t, i === tracks.length - 1 ? track(add(edge('right'), h)) : gapH])];
      const noEdges = Object.fromEntries(['left', 'right', 'top', 'bottom'].flatMap(side => [[`padding-${side}`, '0'], [`border-${side}`, '0']]));
      caption.tableCaption = { ...caption.tableCaption, interleaved: { columns: 2 * columns + 1, row: top ? 1 : rowTemplate.length + 1 } };
      for (const row of rows) for (const cell of row.children) cell.tableArea = { column: 2 * cell.tableAt.column + 2, span: 2 * cell.tableAt.span - 1, row: (top ? 3 : 2) + 2 * cell.tableAt.row, down: 2 * cell.tableAt.down - 1 };
      return { ...style, ...noEdges, 'box-sizing': 'border-box', 'inline-size': width, display: 'grid', 'grid-template-columns': columnTemplate.join(' '), 'grid-template-rows': (top ? ['auto', ...rowTemplate] : [...rowTemplate, 'auto']).join(' '),
        'grid-auto-rows': 'auto', 'column-gap': '0px', 'row-gap': '0px', tableColumns: automatic ? null : widths.every(Boolean) ? widths.reduce(add, zero) : null,
        tableGaps: add(mul(h, q(columns + 1)), add(edge('left'), edge('right'))) };
    }
    const grid = { ...style, 'inline-size': inlineSize, display: 'grid', 'grid-template-columns': tracks.join(' '), 'grid-template-rows': rowTracks ? (caption ? (caption.tableCaption.side === 'bottom' ? [...rowTracks, 'auto'] : ['auto', ...rowTracks]).join(' ') : rowTracks.join(' ')) : 'none', 'grid-auto-rows': 'auto', 'column-gap': `${number(h)}px`, 'row-gap': `${number(v)}px`,
      ...Object.fromEntries(Object.entries(spacingEdges).map(([key, value]) => [key, `${number(value)}px`])), tableColumns: automatic ? null : widths.every(Boolean) ? widths.reduce(add, zero) : null, tableGaps: mul(h, q(columns - 1)),
      ...(autoWidth ? { tableShrink: autoWidth } : {}), ...(autoMinimum ? { tableAutoMinimum: autoMinimum } : {}) };
    return grid;
  }
  // The table's background paints the table box only, not its caption (measured): content of the
  // caption sees through the table's background.
  function captionBackdrop(parent, next, paint) {
    return parent.box.tag === 'table' && next?.tableCaption ? { ...paint, backgroundColor: 'transparent', backgroundImage: 'none' } : paint;
  }
  // Cells fill their column (and span colspan columns); a caption is a full-width first or last row.
  function tablePlacement(box, style) {
    if (box.tableCell && !box.tableFlow && style.display === 'table-cell' && box.tableBaselineShift) style = { ...style, 'padding-top': `${number(add(px(style['padding-top']), box.tableBaselineShift))}px`, 'vertical-align': 'top' };
    if (box.tableFlow && style.display === 'table-cell') style = { ...style, display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', ...(box.tableBaselineShift ? { 'padding-top': `${number(add(px(style['padding-top']), box.tableBaselineShift))}px` } : {}), 'align-content': box.tableBaselineTop || box.tableBaselineShift ? 'start' : { middle: 'center', bottom: 'end' }[style['vertical-align']] ?? 'start', 'row-gap': '0', 'column-gap': '0', 'grid-auto-flow': 'row', $fromCell: true };
    if (box.tableCell && (style.display === 'table-cell' || style.$fromCell) && box.tableArea) return { ...style, display: style.$fromCell ? style.display : 'block', 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), 'grid-column': `${box.tableArea.column} / span ${box.tableArea.span}`, 'grid-row': `${box.tableArea.row} / span ${box.tableArea.down}` };
    if (box.tableCaption?.interleaved && style.display === 'table-caption') return { ...style, display: 'block', 'grid-column': `1 / span ${box.tableCaption.interleaved.columns}`, 'grid-row': String(box.tableCaption.interleaved.row) };
    if (box.tableCell && style.$fromCell) return { ...style, 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), ...(box.colSpan > 1 ? { 'grid-column': `span ${box.colSpan}` } : {}), ...(box.tableRowSpan ? { 'grid-row': `span ${box.tableRowSpan}` } : {}) };
    if (box.tableCell && style.display === 'table-cell') return { ...style, display: 'block', 'inline-size': 'auto', ...(box.tableStretch ? { 'block-size': 'auto' } : {}), ...(box.colSpan > 1 ? { 'grid-column': `span ${box.colSpan}` } : {}), ...(box.tableRowSpan ? { 'grid-row': `span ${box.tableRowSpan}` } : {}) };
    if (box.tableCaption && style.display === 'table-caption') return { ...style, display: 'block', 'grid-column': `1 / span ${box.tableCaption.columns}`, 'grid-row': String(box.tableCaption.side === 'bottom' ? box.tableCaption.rows + 1 : 1) };
    return style;
  }
  // Rendered legend: display block, static, explicit px inline-size and block-size, no block margins.
  function renderedLegend(box, style, region, parents) {
    if (box.tag !== 'fieldset' || style.display === 'contents') return null;
    const legendBox = (box.children ?? []).find(child => child.tag === 'legend');
    if (!legendBox) return null;
    const states = styles(legendBox, region, parents, style, false, false);
    if (states.length !== 1) throw Object.assign(new Error('The legend style varies across viewport regions; the rendered legend needs one size'), { code: 'U_LAYOUT_LEGEND' });
    const ls = states[0].style;
    if (ls.display === 'none') return { box: legendBox, hidden: true, effectiveTop: px(style['border-top']) };
    if (ls.display !== 'block' || ls.position !== 'static' || ls.float !== 'none' || ['inline-size', 'block-size'].some(key => !/^\d+(?:\.\d+)?px$/.test(ls[key])) || !['0', '0px'].includes(ls['margin-top']) || !['0', '0px'].includes(ls['margin-bottom']) || ls['margin-left'] === 'auto' || ls['margin-right'] === 'auto')
      throw Object.assign(new Error('A rendered legend needs display: block, an explicit px inline-size and block-size and no block or auto margins (its width is otherwise shrink-to-fit)'), { code: 'U_LAYOUT_LEGEND' });
    const vertical = add(add(px(ls['padding-top']), px(ls['padding-bottom'])), add(px(ls['border-top']), px(ls['border-bottom'])));
    const horizontal = add(add(px(ls['padding-left']), px(ls['padding-right'])), add(px(ls['border-left']), px(ls['border-right'])));
    const blockSize = ls['box-sizing'] === 'content-box' ? add(px(ls['block-size']), vertical) : px(ls['block-size']);
    const inlineSize = ls['box-sizing'] === 'content-box' ? add(px(ls['inline-size']), horizontal) : px(ls['inline-size']);
    const top = px(style['border-top']);
    return { box: legendBox, style: ls, blockSize, inlineSize, vertical, horizontal, effectiveTop: cmp(blockSize, top) > 0 ? blockSize : top,
      // The legend sits at border-left + padding-left + margin-left; a thicker border is centred on it.
      offset: { inline: add(add(px(style['border-left']), px(style['padding-left'])), px(ls['margin-left'])), block: cmp(top, blockSize) > 0 ? div(sub(top, blockSize), q(2)) : zero } };
  }
  function placeLegend(rendered, origin, region, ancestors, emit) {
    if (rendered.hidden) return;
    const inline = scalar(rendered.inlineSize), block = scalar(rendered.blockSize);
    const legendOrigin = origin ? { inline: sum(origin.inline, scalar(rendered.offset.inline)), block: sum(origin.block, scalar(rendered.offset.block)) } : null;
    finish(rendered.box, rendered.style, region, inline, diff(inline, scalar(rendered.horizontal)), block, diff(block, scalar(rendered.vertical)),
      { inline, block, ...(legendOrigin ? { origin: legendOrigin } : {}) }, ancestors, emit);
  }
  let rootFontSize = null;
  function solve(box, available, region, parents = [], inherited, emit = true) {
    let results = [];
    if (emit) box.$starts = { geometry: geometry.length, sizes: sizes.length };
    try {
      // A table with measured rowspan cells whose width varies: split the region where a cell's line count changes.
      const tableStates = state => {
        if (box.tag !== 'table' || state.style.display !== 'table') return [state];
        const probe = [];
        try { tableAsGrid(box, state.style, state.region, parents, false, available, probe); } catch { return [state]; }
        let pieces = [state.region];
        for (const { inner, thresholds } of probe) for (const t of thresholds) pieces = pieces.flatMap(r => { const p = partition(r, diff(inner, scalar(t)), '>='); return [...p.yes, ...p.no]; });
        if (pieces.length > 256) throw new Error('Table region limit exceeded');
        return pieces.map(r => ({ ...state, region: r }));
      };
      for (const state of styles(box, region, parents, inherited, emit, !available.root).flatMap(tableStates)) {
        let { style } = state;
        if (box.tag === 'html' && !parents.length && /^\d+(?:\.\d{1,6})?px$/.test(style['font-size'])) rootFontSize = px(style['font-size']);
        // A fixed table is laid out as its equivalent grid (rows and sections as contents, cells as blocks).
        if (box.tag === 'table' && style.display === 'table') style = tableAsGrid(box, style, state.region, parents, emit, available);
        if (!['grid', 'flex'].includes(style.display) && style.display !== 'none') { const generatedText = generatedElsewhere(box, state.region, [...parents, { box, style }], style); if (generatedText) box.generated = generatedText; }
        // A cell's width seeds its column (the cell fills the column); its height stretches to the row.
        style = tablePlacement(box, style);
        if (!validate(style, box, state.region, emit, available)) continue;
        // A fieldset's first legend is rendered in its block-start border (HTML §15.3.13): it is not a
        // layout child, and the fieldset's effective border-top is max(border-top, legend height).
        const rendered = renderedLegend(box, style, state.region, parents);
        if (rendered) style = { ...style, 'border-top': `${number(rendered.effectiveTop)}px` };
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
        const capped = style['max-inline-size'] !== 'none' ? minimumOf(state.region, preferred, sum(length(style['max-inline-size'], available.inline), style['box-sizing'] === 'content-box' ? cssInlineEdges : scalar(0))) : [{ region: state.region, value: preferred }];
        const preferredStates = capped.flatMap(c => cmp(minimum, zero) > 0 ? maximum(c.region, c.value, minimumBorderBox) : [c]);
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
          const maxBlock = block && style['max-block-size'] !== 'none' ? sum(scalar(px(style['max-block-size'])), style['box-sizing'] === 'content-box' ? cssBlockEdges : scalar(0)) : null;
          const fixedPieces = fixedBlock && maxBlock ? minimumOf(content.region, fixedBlock, maxBlock) : [{ region: content.region, value: fixedBlock }];
          const blockStates = fixedPieces.flatMap(piece => piece.value ? clamp(piece.region, diff(piece.value, blockEdges)) : [{ region: piece.region, value: null }]);
          for (const piece of fixedPieces) if (piece.value && emit) obligation(piece.value, blockEdges, box, piece.region, 'E_LAYOUT_BOX_EDGES', 'block', true, edgeExplanation('block'));
          for (const bs of blockStates) {
            const origin=resolvedOrigin(style,available,inline,bs.value ? sum(bs.value,blockEdges) : null,parents);
            const contentOrigin=offset(origin,edge(['left']),edge(['top']));
            // A transformed box is the containing block of its absolute descendants, like a positioned one.
            const knownBlock = bs.value, own = { box, style, inline: contentInline, block: knownBlock, positioned:style.position!=='static' || style.transform !== 'none',
              contentOrigin,paddingOrigin:offset(origin,scalar(px(style['border-left'])),scalar(px(style['border-top']))),
              subgrid:style['grid-template-columns']==='subgrid' || style['grid-template-rows']==='subgrid',
              clipped:!['visible','clip'].includes(style['overflow-x']) || !['visible','clip'].includes(style['overflow-y']), clipScope: style['overflow-x'] === 'clip' || style['overflow-y'] === 'clip',
              paddingInline:diff(inline,scalar(add(px(style['border-left']),px(style['border-right'])))),
              paddingBlock:knownBlock ? diff(sum(knownBlock,blockEdges),scalar(add(px(style['border-top']),px(style['border-bottom'])))) : null,
              type: style['container-type'], names: style['container-name'] === 'none' ? [] : style['container-name'].split(/\s+/) };
            const ancestors = [...parents, own];
            if (rendered) placeLegend(rendered, origin, bs.region, ancestors, emit);
            // A fixed table narrower than its px columns grows past its width; the grid cannot follow that.
            // An automatic table shares a width below its px columns by content (not modeled), and one with an auto
            // width shrinks to a narrower container: Unknown there.
            if (emit && style.tableAutoMinimum) { const narrow = clip(bs.region, diff(sum(scalar(style.tableAutoMinimum), scalar(style.tableGaps)), contentInline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} is narrower than its px columns; automatic layout then shares the width by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableShrink && available.inline) { const narrow = clip(bs.region, diff(scalar(style.tableShrink), available.inline), true); if (narrow) diagnostics.push({ code: 'U_LAYOUT_TABLE', severity: 'unknown', message: `${box.label} has an automatic width wider than its container here, where it shrinks by content`, box: box.label, path: box.path, source: box.source, ...ranges(narrow) }); }
            if (emit && style.tableColumns) obligation(diff(contentInline, scalar(style.tableGaps)), scalar(style.tableColumns), box, bs.region, 'E_LAYOUT_TABLE_WIDTH', 'inline');
            const { axes: inheritedAxes, regions: geometryRegions } = subgridGeometry(style, box, available, bs.region, emit);
            for (const geometryRegion of geometryRegions) {
              // Even an empty Grid has explicit tracks and contributes their
              // height/overflow. Only ordinary leaves use intrinsic height.
              if (!box.children.length && style.display !== 'grid') {
                let heights = !block ? [{ region: geometryRegion, value: null }] : knownBlock ? [{ region: geometryRegion, value: knownBlock }] : intrinsic(box, contentInline, geometryRegion);
                // A content height above max-block-size is capped; the content then has to fit (or overflow by contract).
                if (maxBlock && !knownBlock) heights = heights.flatMap(h => h.value ? minimumOf(h.region, h.value, diff(maxBlock, blockEdges)).map(c => {
                  if (c.value !== h.value && emit) obligation(c.value, h.value, box, c.region, 'E_LAYOUT_CONTENT', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit');
                  return c;
                }) : [h]);
                for (const h of heights) {
                  results.push(finish(box, style, h.region, inline, contentInline, h.value ? sum(h.value, blockEdges) : null, h.value, available, parents, emit));
                  // Absolute ::before/::after of the leaf, against the nearest positioned box (this leaf when it is).
                  for (const kind of box.absolutePseudo ?? []) {
                    const leafOwn = { ...own, paddingBlock: own.paddingBlock ?? (h.value ? diff(sum(h.value, blockEdges), scalar(add(px(style['border-top']), px(style['border-bottom'])))) : null) };
                    const chain = [...parents, leafOwn], containing = chain.findLast(a => a.positioned);
                    if (!block || !containing?.paddingBlock || containing.subgrid || chain.some(a => a.clipped)) throw Object.assign(new Error(`${box.label}::${kind} is absolutely positioned without an owned non-scrolling, unclipped containing block`), { code: 'U_LAYOUT_PSEUDO' });
                    const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : 0}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind, absolutePseudo: undefined,
                      named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
                    solve(pbox, { inline: containing.paddingInline, block: containing.paddingBlock, containingBlock: { path: containing.box.path, inline: containing.paddingInline, block: containing.paddingBlock, origin: containing.paddingOrigin } }, h.region, chain, style, emit);
                  }
                }
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
                    if (child.tableCell || child.tableCaption) c = { ...c, style: tablePlacement(child, c.style) };
                    if (child.tablePart && ['table-row-group', 'table-header-group', 'table-footer-group', 'table-row'].includes(c.style.display)) c = { ...c, style: { ...c.style, display: 'contents' } };
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
                // ::before/::after: an empty, absolutely positioned box with explicit sizes (decorative layers, overlays)
                // takes part as a child painted before or after the others; generated text is not modeled.
                const pseudo = kind => {
                  const pbox = { ...box, tag: box.tag, path: `${box.path}/${kind === 'before' ? -1 : box.children.length}`, label: `${box.label}::${kind}`, children: [], inline: undefined, text: false, contract: undefined, pseudo: kind,
                    named: undefined, focusable: false, tabIndex: undefined, role: undefined, href: undefined, ariaHidden: undefined, id: undefined };
                  states = bounded(states.flatMap(s => styles(pbox, s.region, ancestors, style, false, false, new Set([`::${kind}`])).map(c => {
                    const content = c.style.content ?? 'none';
                    if (content === 'none' || c.style.display === 'none') return { region: c.region, children: s.children };
                    // Generated text in a grid/flex container is an item of its own: sized by a selector::kind contract.
                    if (content.startsWith('text:')) {
                      const sized = pseudoContracts.find(p => p.kind === kind && matches(p.base, box));
                      if (!sized || c.style.position !== 'static') throw Object.assign(new Error(`${pbox.label} generates text${sized ? ' out of flow' : '; give it a contract (' + box.label + '::' + kind + ')'}`), { code: 'U_LAYOUT_PSEUDO' });
                      const tbox = { ...pbox, text: true, textContent: content.slice(5), generated: { [kind]: content.slice(5) }, contract: sized.contract, contractSelector: sized.selector };
                      return { region: c.region, children: kind === 'before' ? [{ box: tbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: tbox, style: c.style, inherited: style }] };
                    }
                    if (c.style.position !== 'absolute') throw Object.assign(new Error(`${pbox.label} is generated in flow; only absolutely positioned generated boxes are modeled`), { code: 'U_LAYOUT_PSEUDO' });
                    return { region: c.region, children: kind === 'before' ? [{ box: pbox, style: c.style, inherited: style }, ...s.children] : [...s.children, { box: pbox, style: c.style, inherited: style }] };
                  })));
                };
                if (!box.pseudo) pseudo('before');
                for (const child of box.children) if (child !== rendered?.box) visit(child, style);
                if (!box.pseudo) pseudo('after');
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
                    const layouts = sharedRows ? [{ region: m.region, values: sharedRows.values, required: trackArea(sharedRows.values, rowGap, 0, rows.length) }] : knownBlock ? flex(m.region, knownBlock, rows, gaps, m.bases, !['start', 'center', 'end'].includes(style['align-content'])) : fractions.map(f => {
                      const values = rows.map((row, i) => row.weight ? times(f.value, row.weight) : m.bases[i]);
                      return { region: f.region, values, required: sum(total(values), scalar(gaps)) };
                    });
                    for (const rs of layouts) {
                      const contentBlock = knownBlock ?? rs.required, blockSize = sum(contentBlock, blockEdges);
                      const finalAncestors = [...parents, { ...own, block: contentBlock, paddingBlock:diff(blockSize,scalar(add(px(style['border-top']),px(style['border-bottom'])))) }];
                      if (emit) obligation(contentBlock, rs.required, box, rs.region, 'E_LAYOUT_TRACKS', 'block', (box.contract?.overflowBlock ?? 'fit') === 'fit', () => explanation(sizeChain([...parents, { box, style }], 'block', { hostInset: options.hostBlockInset }), trackProperties('block').map(property => fact(box, style, property))));
                      let endings = [rs.region];
                      // align-content center/end (unstretched rows in a known height): the rows move by part of the free space.
                      const blockLead = knownBlock && ['center', 'end'].includes(style['align-content']) ? times(diff(knownBlock, rs.required), style['align-content'] === 'center' ? div(one, q(2)) : one) : scalar(zero);
                      for (const item of placed) endings = bounded(endings.flatMap(r => solve(item.box, { inline: areaInline(item), block: trackArea(rs.values, rowGap, item.row, item.rowSpan),
                        origin:cs.shift ? offset(contentOrigin,sum(sum(trackStart(cs.values,columnGap,item.start),cs.shift.lead),times(cs.shift.extra,q(item.start))),sum(trackStart(rs.values,rowGap,item.row),blockLead)) : null,
                        tracks: { inline: childColumns(item), block: trackSlice(rs.values, rowGap, box, item.row, item.rowSpan) },
                        fitInline: (box.contract?.overflow ?? 'fit') === 'fit', fitBlock: (box.contract?.overflowBlock ?? 'fit') === 'fit' }, r, finalAncestors, item.inherited ?? style, emit).map(result => result.region)));
                      for (const item of children.children.filter(child=>child.style.position==='absolute')) endings = bounded(endings.flatMap(r => {
                        // position: fixed: the viewport is the containing block, unless an ancestor transform (or a clip or
                        // scroll that would move it relative to the page) intervenes, which is not modeled.
                        if (item.style.$fixed) {
                          if (finalAncestors.some(ancestor=>ancestor.clipped || ancestor.subgrid || (ancestor.style && (ancestor.style.transform !== 'none' || ['overflow-x','overflow-y'].some(key=>ancestor.style[key] !== 'visible'))))) throw Object.assign(new Error(`${item.box.label} is position: fixed inside a transformed, clipped or scrolling ancestor`), { code: 'U_LAYOUT_CSS' });
                          const viewport = { inline: width, block: height, origin: { inline: scalar(0), block: scalar(0) } };
                          return solve(item.box,{inline:viewport.inline,block:viewport.block,containingBlock:{path:'viewport',...viewport}},r,finalAncestors,item.inherited ?? style,emit).map(result=>result.region);
                        }
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
    const judged = judgeAccessibility({ geometry, waived, root, domain: initial }, { keyframeFrames, hostInset: options.hostInset ?? 0, hostBlockInset: options.hostBlockInset ?? 0, viewportBlock: block && options.viewport.height ? height : null, scrollPaddingDeclared: rules.some(rule => rule.declarations.some(d => /^scroll-padding-(?:top|bottom)$/.test(d.property))), viewportMin: options.viewport.min, contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), ranges, block });
    diagnostics.push(...judged.findings, ...judged.unknowns);
    // Dark color scheme: when the CSS has prefers-color-scheme: dark rules, the contrast rules run
    // again with them (paint only, so the geometry is the same). System colors stay the light ones:
    // the color-scheme property is outside the subset.
    if (pristine && rules.some(rule => rule.preferences?.some(p => p.feature === 'prefers-color-scheme' && p.value === 'dark') || rule.declarations.some(d => d.property === 'color-scheme' && /\bdark\b/.test(d.value) && /\blight\b/.test(d.value)))) {
      const dark = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], ['prefers-color-scheme:dark']);
      const contrastCodes = new Set(['E_A11Y_CONTRAST', 'U_A11Y_CONTRAST', 'E_A11Y_STATE_CONTRAST', 'E_A11Y_LINK_IN_TEXT', 'U_A11Y_LINK_IN_TEXT', 'E_A11Y_FOCUS_VISIBLE']);
      // A finding that holds in both schemes is reported once, with `alsoUnder`.
      const same = (a, b) => a.code === b.code && a.path === b.path && a.message === b.message && JSON.stringify([a.range, a.heightRange, a.regionConstraints, a.state]) === JSON.stringify([b.range, b.heightRange, b.regionConstraints, b.state]);
      for (const d of dark.diagnostics.filter(d => contrastCodes.has(d.code))) {
        const light = diagnostics.find(l => same(l, d));
        if (light) light.alsoUnder = [...(light.alsoUnder ?? []), 'prefers-color-scheme: dark'];
        else diagnostics.push({ ...d, preference: 'prefers-color-scheme: dark', message: `${d.message} (prefers-color-scheme: dark)` });
      }
    }
    // Focus rules that change layout: each focusable box they can reach is laid out again focused, and the geometric
    // focus findings for that box come from that layout instead of the unfocused one.
    if (pristine && rules.some(rule => rule.stateLayout)) {
      const geometricFocus = new Set(['E_A11Y_FOCUS_OBSCURED', 'E_A11Y_FOCUS_OFFSCREEN', 'E_A11Y_FOCUS_CLIPPED', 'E_A11Y_FOCUS_SCROLLED_UNDER', 'E_A11Y_FOCUS_AREA', 'E_A11Y_FOCUS_CLIPPED_AWAY']);
      const layoutRules = rules.filter(rule => rule.stateLayout);
      const all = []; (function walk(box, chain) { all.push({ box, chain }); for (const child of box.children ?? []) walk(child, [...chain, box]); })(root, []);
      const reached = ({ box, chain }) => layoutRules.some(rule => rule.selectors.some(selector => (selector.state !== 'focus-within' && matches(selector, box, new Set(['focus', 'focus-visible', 'focus-within']))) || (selector.state === 'focus-within' && [...chain, box].some(a => matches(selector, a, new Set(['focus-within']))))));
      for (const entry of all.filter(entry => focusableBox(entry.box) && reached(entry))) {
        const focused = analyzeBoxTree(pristine, { ...options, integrity: undefined }, scrollbarProfile, budget, inlineSheets, [], [`focus-at:${entry.box.path}`]);
        for (let i = diagnostics.length - 1; i >= 0; i--) if (diagnostics[i].path === entry.box.path && geometricFocus.has(diagnostics[i].code)) diagnostics.splice(i, 1);
        if (focused.status === 'unknown') { diagnostics.push({ code: 'U_A11Y_FOCUS_LAYOUT', severity: 'unknown', message: `${entry.box.label}: its focused layout is not decided (${focused.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: entry.box.label, path: entry.box.path, rule: 'focus-obscured' }); continue; }
        for (const d of focused.diagnostics.filter(d => d.path === entry.box.path && geometricFocus.has(d.code))) diagnostics.push({ ...d, message: `${d.message} (in its focused layout)`, focusedLayout: true });
      }
    }
    // Profile: drop the rules outside it; every accessibility row carries its usefulness tier.
    const keep = accessibilityProfiles[options.accessibility.profile ?? 'all'];
    if (!keep) throw Object.assign(new Error(`Unknown accessibility profile ${options.accessibility.profile}`), { code: 'U_LAYOUT_OPTIONS' });
    const tiered = list => list.filter(d => !d.rule || keep(d.rule)).map(d => d.rule ? { ...d, tier: ruleTier(d.rule) } : d);
    const kept = diagnostics.flatMap(d => d.rule && accessibilityRules.includes(d.rule) ? tiered([d]) : [d]);
    diagnostics.length = 0; diagnostics.push(...kept);
    accessibilityWarnings = tiered(judged.warnings); accessibilityNotes = judged.notes; accessibilityExempted = judged.exempted;
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
    ...(geometry.some(row => row.bounds) ? { inlineBounds: geometry.filter(row => row.bounds).flatMap(row => row.bounds.map(piece => ({ box: row.box.label, path: row.path, ...ranges(piece.region), ...(block ? { regionConstraints: serialize(piece.region).constraints } : {}),
      ...Object.fromEntries(['outer', 'inner'].map(key => [key, piece[key] ? { inlineStart: affine(piece[key].origin.inline), blockStart: affine(piece[key].origin.block), inlineSize: affine(piece[key].inline), blockSize: affine(piece[key].block) } : null])) }))) } : {}),
    ...(scrollbars.length ? {scrollbars} : {}), ...(invalidSubstitutions.length ? {invalidSubstitutions} : {}),
    ...(options.accessibility ? { accessibility: { rules: accessibilityRules.filter(accessibilityProfiles[options.accessibility.profile ?? 'all']), profile: options.accessibility.profile ?? 'all', contrast: options.accessibility.contrast ?? 'AA', targetLevel: options.accessibility.targetLevel ?? 'AA', targetSize: options.accessibility.targetSize ?? (options.accessibility.targetLevel === 'AAA' ? 44 : 24), warnings: accessibilityWarnings, exempted: accessibilityExempted, notes: accessibilityNotes } } : {}),
    ...(options.integrity ? { integrity: { rules: ['page-overflow-x', 'container-protrusion', 'text-collision', 'target-undersized', 'clipped-content', 'nested-scroll'], targetSize: options.integrity.targetSize ?? 24, protrusion: options.integrity.protrusion ?? 'all', warnings: integrityWarnings, exempted: integrityExempted } } : {}) };
}
