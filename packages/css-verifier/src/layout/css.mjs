import postcss from 'postcss';
import {findCSSWriteConflicts,cssWriteConflictMessage} from '../css-writes.mjs';
import { q, cmp } from './linear.mjs';
import { parseCondition } from './conditions.mjs';
import {customName,variableValue,variableEnvironment,substituteDeclaration} from './variables.mjs';

import { compileSelector, matches, greaterRank } from './selectors.mjs';
export { matches, simpleSelector } from './selectors.mjs';
const pointSize = /^(?:\d+(?:\.\d{1,6})?px|0)$/;
export function px(text) {
  if (!pointSize.test(text)) throw new Error(`Unsupported CSS pixel length: ${text}`);
  return q(text.replace(/px$/, ''));
}

const aliases = { width: 'inline-size', 'min-width': 'min-inline-size', 'max-width': 'max-inline-size', height: 'block-size', 'min-height': 'min-block-size', 'max-height': 'max-block-size' };
const insets = { 'inset-inline-start':'left', 'inset-inline-end':'right', 'inset-block-start':'top', 'inset-block-end':'bottom' };
const geometry = new Set(['display', 'appearance', 'box-sizing', 'inline-size', 'min-inline-size', 'max-inline-size', 'column-gap', 'grid-template-columns', 'grid-column', 'grid-row', 'overflow-x', 'overflow-y', 'scrollbar-gutter', 'scrollbar-width', 'white-space', 'overflow-wrap', 'float', 'position', 'writing-mode', 'direction', 'block-size', 'min-block-size', 'max-block-size', 'row-gap', 'grid-template-rows', 'grid-auto-rows', 'grid-auto-flow', 'container-type', 'container-name', 'align-items', 'align-self', 'align-content', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'order']);
// Text/font metrics come from trusted caller contracts. Paint is not validated.
const wide = new Set(['inherit', 'initial', 'unset', 'revert']);
const decoration = /^(?:color|background-(?:position|size|repeat|clip|origin|attachment)|border-(?:color|radius)|outline(?:-(?:color|style|width|offset))?|box-shadow|text-shadow|text-decoration|cursor|opacity|visibility)$/;
// Inherited text properties. They are kept as specified strings and only
// interpreted for boxes whose contract derives text metrics from a font.
export const textProperties = ['font-family', 'font-size', 'line-height', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'text-transform', 'letter-spacing', 'word-spacing', 'text-align'];
const textPropertySet = new Set(textProperties);
/** Marker for longhands set by the `font` shorthand, which is not modeled. */
export const fontShorthand = 'font-shorthand';
function expand(property, value) {
  property = aliases[property] ?? property;
  property = insets[property] ?? property;
  if (!['container', 'container-name'].includes(property)) value = value.toLowerCase();
  if (property === 'container-name' && value.toLowerCase() === 'none') value = 'none';
  if (value === 'revert-layer') throw new Error('revert-layer is outside this subset');
  if (geometry.has(property)) return [[property, value]];
  if (['left','right','top','bottom'].includes(property)) return [[property,value]];
  if (['inset','inset-inline','inset-block'].includes(property)) {
    const p = postcss.list.space(value), max = property === 'inset' ? 4 : 2;
    if (!p.length || p.length > max) throw new Error('Unsupported inset shorthand');
    if (property === 'inset') return [['top',p[0]],['right',p[1] ?? p[0]],['bottom',p[2] ?? p[0]],['left',p[3] ?? p[1] ?? p[0]]];
    return property === 'inset-inline' ? [['left',p[0]],['right',p[1] ?? p[0]]] : [['top',p[0]],['bottom',p[1] ?? p[0]]];
  }
  if (property==='scrollbar-color') return [];
  if (property === 'all') {
    if (!wide.has(value)) throw new Error('Unsupported all reset');
    return [...geometry, ...textProperties, 'background-color', 'background-image', ...['left', 'right', 'top', 'bottom'].flatMap(side => [side, `padding-${side}`, `margin-${side}`, `border-${side}`])].filter(key => key !== 'direction').map(key => [key, value]);
  }
  if (property === 'flex') return flexShorthand(value);
  if (property === 'flex-flow') {
    if (wide.has(value)) return [['flex-direction', value], ['flex-wrap', value]];
    const parts = postcss.list.space(value), direction = parts.filter(p => /^(?:row|row-reverse|column|column-reverse)$/.test(p)), wrap = parts.filter(p => /^(?:nowrap|wrap|wrap-reverse)$/.test(p));
    if (!parts.length || parts.length > 2 || direction.length > 1 || wrap.length > 1 || direction.length + wrap.length !== parts.length) throw new Error(`Unsupported flex-flow: ${value}`);
    return [['flex-direction', direction[0] ?? 'row'], ['flex-wrap', wrap[0] ?? 'nowrap']];
  }
  if (property === 'gap' && wide.has(value)) return [['row-gap', value], ['column-gap', value]];
  if (property === 'overflow' && wide.has(value)) return [['overflow-x', value], ['overflow-y', value]];
  if (property === 'content' && ['none', 'normal'].includes(value)) return [];
  if (property === 'gap') {
    const parts = postcss.list.space(value); if (parts.length > 2) throw new Error('Unsupported gap');
    parts.forEach(part => { if (part !== 'normal') px(part); }); return [['row-gap', parts[0]], ['column-gap', parts.at(-1)]];
  }
  if (property === 'overflow') {
    const parts = postcss.list.space(value); if (parts.length > 2) throw new Error('Unsupported overflow');
    return [['overflow-x', parts[0]], ['overflow-y', parts[1] ?? parts[0]]];
  }
  if (property === 'padding') {
    const p = postcss.list.space(value); if (p.length < 1 || p.length > 4) throw new Error('Unsupported padding');
    if (!wide.has(value)) p.forEach(px); return [['padding-top', p[0]], ['padding-right', p[1] ?? p[0]], ['padding-bottom', p[2] ?? p[0]], ['padding-left', p[3] ?? p[1] ?? p[0]]];
  }
  if (property === 'padding-inline' || property === 'padding-block') {
    const p = postcss.list.space(value); if (p.length > 2) throw new Error('Unsupported padding-inline');
    if (!wide.has(value)) p.forEach(px); return property === 'padding-inline' ? [['padding-left', p[0]], ['padding-right', p[1] ?? p[0]]] : [['padding-top', p[0]], ['padding-bottom', p[1] ?? p[0]]];
  }
  if (['padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end', 'padding-top', 'padding-bottom', 'padding-block-start', 'padding-block-end'].includes(property)) {
    if (!wide.has(value)) px(value); return [[property.replace('inline-start', 'left').replace('inline-end', 'right').replace('block-start', 'top').replace('block-end', 'bottom'), value]];
  }
  if (/^margin(?:-(?:inline|block|left|right|top|bottom|inline-start|inline-end|block-start|block-end))?$/.test(property)) {
    const sides = property === 'margin' ? ['top', 'right', 'bottom', 'left'] : property === 'margin-inline' ? ['left', 'right'] : property === 'margin-block' ? ['top', 'bottom'] : [property.slice(7).replace('inline-start', 'left').replace('inline-end', 'right').replace('block-start', 'top').replace('block-end', 'bottom')];
    if (wide.has(value)) return sides.map(side => [`margin-${side}`, value]);
    const parts = postcss.list.space(value);
    const maximum = property === 'margin' ? 4 : ['margin-inline', 'margin-block'].includes(property) ? 2 : 1;
    if (!parts.length || parts.length > maximum) throw new Error(`${property} requires 1..${maximum} values`);
    // Zero, or auto (only flex items may use it on their main axis; checked by the engine).
    const margin = v => v === 'auto' ? 'auto' : cmp(px(v), q(0)) === 0 ? '0' : (() => { throw new Error('Only zero or auto margins are supported'); })();
    const values = property === 'margin' ? [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]] : sides.length === 2 ? [parts[0], parts[1] ?? parts[0]] : [parts[0]];
    return sides.map((side, i) => [`margin-${side}`, margin(values[i])]);
  }
  if (property === 'border' || property === 'border-inline' || property === 'border-block') {
    const sides = property === 'border' ? ['left', 'right', 'top', 'bottom'] : property === 'border-inline' ? ['left', 'right'] : ['top', 'bottom'];
    if (wide.has(value)) return sides.map(side => [`border-${side}`, value]);
    const p = postcss.list.space(value);
    if (p.length === 1 && ['0', 'none'].includes(value)) return sides.map(side => [`border-${side}`, '0']);
    if (p.length !== 3 || p[1] !== 'solid') throw new Error('Use a pixel solid border with a color');
    if (!/^(?:black|white|red|green|blue|transparent|currentcolor|#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8})$/.test(p[2])) throw new Error('Use a supported literal border color');
    px(p[0]); return sides.map(side => [`border-${side}`, p[0]]);
  }
  if (property === 'container') {
    const p = value.split('/').map(v => v.trim());
    if (p.length > 2 || !p[0]) throw new Error('Unsupported container shorthand');
    return [['container-name', p[0].toLowerCase() === 'none' ? 'none' : p[0]], ['container-type', (p[1] ?? 'normal').toLowerCase()]];
  }
  if (textPropertySet.has(property)) {
    if (['letter-spacing', 'word-spacing'].includes(property) && !wide.has(value) && !['normal', '0', '0px'].includes(value)) throw new Error(`Unsupported ${property}: ${value}`);
    return [[property, value]];
  }
  if (property === 'font') return textProperties.filter(key => key.startsWith('font-') || key === 'line-height').map(key => [key, wide.has(value) ? value : fontShorthand]);
  // Paint only: whether a box draws a background (integrity `protrusion: 'painted'`).
  if (property === 'background-color' || property === 'background-image') return [[property, value]];
  if (property === 'background') {
    if (wide.has(value)) return [['background-color', value], ['background-image', value]];
    const parts = postcss.list.space(value), image = parts.find(p => /^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set)\(/.test(p)) ?? 'none';
    const color = parts.find(p => !/^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|image-set)\(/.test(p) && !/^(?:none|repeat|repeat-x|repeat-y|no-repeat|space|round|scroll|fixed|local|top|bottom|left|right|center|border-box|padding-box|content-box|\d.*|\/|auto|cover|contain)$/.test(p)) ?? 'transparent';
    return [['background-color', color], ['background-image', image]];
  }
  if (decoration.test(property)) return [];
  throw new Error(`Unsupported layout property: ${property}`);
}

// css-flexbox-1 §7.2: [<grow> <shrink>?] || <basis>, none, auto. A unitless
// zero is a flex factor unless two factors already precede it.
const flexNumber = /^\d+(?:\.\d+)?$/;
const flexBasis = value => value === 'auto' || value === 'content' || /^\d+(?:\.\d+)?(?:px|%)$/.test(value);
function flexShorthand(value) {
  if (wide.has(value)) return ['flex-grow', 'flex-shrink', 'flex-basis'].map(key => [key, value]);
  if (value === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
  if (value === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
  const parts = postcss.list.space(value), factors = [];
  let basis, groupEnded = false;
  for (const part of parts) {
    if (flexNumber.test(part) && !(part === '0' && factors.length === 2) && !(groupEnded && factors.length)) {
      if (factors.length === 2) throw new Error(`Invalid flex: ${value}`);
      factors.push(part);
    } else if (basis === undefined && (flexBasis(part) || part === '0')) { basis = part === '0' ? '0px' : part; if (factors.length) groupEnded = true; }
    else throw new Error(`Invalid flex: ${value}`);
  }
  if (!factors.length && basis === undefined) throw new Error(`Invalid flex: ${value}`);
  // Omitted grow is 1 and omitted shrink is 1; an omitted basis is 0 (computed as 0%).
  return [['flex-grow', factors[0] ?? '1'], ['flex-shrink', factors[1] ?? '1'], ['flex-basis', basis ?? '0%']];
}

export function parseLayoutCSS(sheets, diagnostic) {
  const rules = [], layers = [];
  const layerIndex = name => { if (!layers.includes(name)) layers.push(name); return layers.indexOf(name); };
  let count = 0;
  const visit = (nodes, contexts, layer, filename, depth = 0) => {
    const problem = (code, message, line) => diagnostic(code, message, line, filename);
    if (depth > 32) { problem('U_LAYOUT_LIMIT', 'Conditional nesting limit exceeded'); return; }
    for (const node of nodes) {
      if (node.type === 'comment') continue;
      if (++count > 2048) { problem('U_LAYOUT_LIMIT', 'CSS node limit exceeded'); return; }
      if (node.type === 'atrule' && node.name.toLowerCase() === 'layer') {
        if (layer !== null || contexts.length) { problem('U_LAYOUT_LAYER', 'Nested or conditional layer declarations are outside the subset', node.source.start.line); continue; }
        const names = node.params.trim() ? postcss.list.comma(node.params) : [];
        if (names.some(name => !/^[a-zA-Z_][\w-]*$/.test(name)) || (node.nodes && names.length > 1) || (!node.nodes && !names.length)) { problem('U_LAYOUT_LAYER', 'Use flat named layers or anonymous blocks', node.source.start.line); continue; }
        const indices = names.map(layerIndex);
        if (node.nodes) visit(node.nodes, contexts, indices[0] ?? layerIndex(`@anonymous:${layers.length}`), filename, depth + 1);
        continue;
      }
      if (node.type === 'atrule') {
        if (!['media', 'container'].includes(node.name.toLowerCase()) || !node.nodes) { problem('U_LAYOUT_CSS', `Unsupported @${node.name}`, node.source.start.line); continue; }
        try {
          const condition = parseCondition(node.params, node.name.toLowerCase());
          // Provenance for explanations only; never consulted by the proof.
          condition.params = node.params.trim(); condition.css = {file: filename, line: node.source.start.line};
          if (condition.groups.length) visit(node.nodes, [...contexts, condition], layer, filename, depth + 1);
        } catch (error) { problem('U_LAYOUT_QUERY', error.message, node.source.start.line); }
        continue;
      }
      let selectors;
      try {
        if (node.type !== 'rule') throw new Error(`Unsupported CSS node: ${node.type}`);
        selectors = node.selectors.map(selector => compileSelector(selector));
      } catch (error) { problem('U_LAYOUT_SELECTOR', error.message, node.source.start.line); continue; }
      const declarations = [];
      const authored=node.nodes.filter(declaration=>declaration.type==='decl');
      const conflicts=findCSSWriteConflicts(authored.map(declaration=>declaration.prop));
      for(const conflict of conflicts) {
        const location=index=>({file:filename,line:authored[index].source.start.line,column:authored[index].source.start.column});
        const css=location(conflict.later);
        diagnostic('E_CSS_SHORTHAND_CONFLICT',cssWriteConflictMessage(conflict),css.line,filename,
          {severity:'error',css,hint:conflict.hint,conflict:{properties:conflict.properties,longhands:conflict.longhands},
            related:[{css:location(conflict.earlier),message:`Earlier ${conflict.properties[0]} declaration`}]});
      }
      if(conflicts.length) continue;
      for (const declaration of node.nodes) {
        if (declaration.type === 'comment') continue;
        if (declaration.type !== 'decl') { problem('U_LAYOUT_CSS', 'Nested CSS rules are outside the subset', declaration.source.start.line); continue; }
        try {
          const custom=declaration.prop.startsWith('--'),property=custom ? declaration.prop : declaration.prop.toLowerCase();
          const expression=custom || /var\(/i.test(declaration.value) ? variableValue(declaration.value) : undefined;
          const pending=!custom && expression?.references.length ? {property,expression} : undefined;
          if(custom && !customName(property)) throw Object.assign(new Error('Use unescaped ASCII custom-property names'),{code:'U_LAYOUT_VARIABLE'});
          for (const [name, value] of custom ? [[property,declaration.value]] : expand(property,pending ? 'initial' : declaration.value)) {
            declarations.push({ property:name, value, ...(custom ? {expression} : {}), ...(pending ? {pending,specified:declaration.value} : {}), important: declaration.important ? 1 : 0, line: declaration.source.start.line, file: filename });
          }
        } catch (error) { problem(error.code ?? 'U_LAYOUT_CSS', error.message, declaration.source.start.line); }
      }
      rules.push({ selectors, contexts, declarations, layer, file: filename });
    }
  };
  for (const sheet of sheets) {
    try { const root = postcss.parse(sheet.css, { from: sheet.file }); visit(root.nodes, [], null, sheet.file); }
    catch (error) { diagnostic('U_LAYOUT_CSS', error.reason ?? error.message, error.line, sheet.file); }
  }
  return { rules, layers };
}

// The UA default family and the user's default font size are not author
// facts: `medium` and `ua-default` stay unresolved for text metrics.
const textInitial = { 'font-family': 'ua-default', 'font-size': 'medium', 'line-height': 'normal', 'font-weight': 'normal', 'font-style': 'normal', 'font-stretch': 'normal', 'font-variant': 'normal', 'text-transform': 'none', 'letter-spacing': 'normal', 'word-spacing': 'normal', 'text-align': 'start' };

export function computeStyle(rules, box, active, inherited = {}, {spend}={}) {
  const values = {
    display: ['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'output', 'label'].includes(box.tag) ? 'inline' : 'block',
    'box-sizing': 'content-box', 'inline-size': 'auto', 'min-inline-size': 'auto', 'max-inline-size': 'none',
    'padding-left': '0', 'padding-right': '0', 'border-left': '0', 'border-right': '0',
    'padding-top': '0', 'padding-bottom': '0', 'border-top': '0', 'border-bottom': '0',
    'margin-left': box.tag === 'body' ? 'ua' : '0', 'margin-right': box.tag === 'body' ? 'ua' : '0',
    'margin-top': /^(?:body|p|h[1-6])$/.test(box.tag) ? 'ua' : '0', 'margin-bottom': /^(?:body|p|h[1-6])$/.test(box.tag) ? 'ua' : '0',
    'block-size': 'auto', 'min-block-size': 'auto', 'max-block-size': 'none',
    'grid-template-columns': 'none', 'grid-template-rows': 'none', 'grid-auto-rows': 'auto', 'grid-auto-flow': 'row', 'row-gap': 'normal',
    'container-type': 'normal', 'container-name': 'none', 'align-items': 'normal', 'align-self': 'auto', 'align-content': 'normal',
    'column-gap': 'normal', 'grid-column': 'auto', 'grid-row': 'auto',
    'background-color': 'transparent', 'background-image': 'none',
    'flex-direction': 'row', 'flex-wrap': 'nowrap', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'justify-content': 'normal', order: '0',
    'overflow-x': 'visible', 'overflow-y': 'visible', 'white-space': inherited['white-space'] ?? 'normal',
    'scrollbar-gutter':'auto', 'scrollbar-width':'auto',
    appearance:'auto',
    'overflow-wrap': inherited['overflow-wrap'] ?? 'normal', float: 'none', position: 'static',
    left:'auto',right:'auto',top:'auto',bottom:'auto',
    'writing-mode': inherited['writing-mode'] ?? 'horizontal-tb', direction: inherited.direction ?? 'ltr',
    ...Object.fromEntries(textProperties.map(key => [key, inherited[key] ?? textInitial[key]])),
  };
  const defaults={...values};
  if(box.tag==='button') {
    for(const side of ['left','right','top','bottom']) {values[`padding-${side}`]='ua';values[`border-${side}`]='ua';}
    for(const key of ['display','box-sizing','min-inline-size','min-block-size']) values[key]='ua';
  }
  // UA font rules (h1–h6 size and weight, strong/b weight, em/i style, small
  // size) are not author facts: they stay 'ua' until author CSS sets them.
  if (/^h[1-6]$/.test(box.tag)) { values['font-size'] = 'ua'; values['font-weight'] = 'ua'; }
  if (['strong', 'b'].includes(box.tag)) values['font-weight'] = 'ua';
  if (['em', 'i'].includes(box.tag)) values['font-style'] = 'ua';
  if (box.tag === 'small') values['font-size'] = 'ua';
  const ua = { ...values };
  const initial = { ...defaults, ...textInitial, display: 'inline', 'white-space': 'normal', 'overflow-wrap': 'normal', 'writing-mode': 'horizontal-tb', direction: 'ltr', 'margin-left': '0', 'margin-right': '0', 'margin-top': '0', 'margin-bottom': '0' };
  const inheritedProperties = new Set(['white-space', 'overflow-wrap', 'writing-mode', 'direction', ...textProperties]);
  const priorities = new Map(), sources = {},custom=new Map(),dormant={},overridden={};
  const conditions = rule => rule.contexts.length ? {conditions: rule.contexts.map(c => ({kind: c.kind, ...(c.name ? {name: c.name} : {}), params: c.params, css: c.css}))} : {};
  for (const rule of rules) {
    if (!active(rule)) {
      // Matching declarations whose conditions are false here: explanation data.
      const selector = rule.selectors.find(selector => matches(selector, box));
      if (selector) for (const declaration of rule.declarations) (dormant[declaration.property] ??= []).push({file: declaration.file, line: declaration.line, selector: selector.source, ...(rule.layerName ? {layer: rule.layerName} : {}), specified: declaration.specified ?? declaration.value, ...conditions(rule)});
      continue;
    }
    for (const selector of rule.selectors) {
      if (!matches(selector, box)) continue;
      for (const declaration of rule.declarations) {
        const layer = rule.layer === null ? (declaration.important ? -Infinity : Infinity) : declaration.important ? -rule.layer : rule.layer;
        const rank = [declaration.important, layer, ...selector.specificity];
        const origin = { file: declaration.file, line: declaration.line, selector: selector.source, layer: rule.layerName, specified: declaration.specified ?? declaration.value, ...conditions(rule) };
        const wins = !priorities.has(declaration.property) || greaterRank(rank, priorities.get(declaration.property));
        // Explanation data only: the losing side of each comparison.
        const loser = wins ? sources[declaration.property] : origin;
        if (loser) (overridden[declaration.property] ??= []).push(loser);
        if (wins) {
          if(declaration.expression) custom.set(declaration.property,declaration);
          else values[declaration.property] = declaration.pending ? declaration : declaration.value;
          priorities.set(declaration.property, rank);
          sources[declaration.property] = origin;
        }
      }
    }
  }
  const environment=variableEnvironment(custom,inherited.$variables,box.documentRoot,spend),expanded=new Map(),invalid=[];
  for (const property of Object.keys(values)) {
    let value = values[property];
    if(typeof value==='object') {
      const declaration=value;
      try {
        if(!expanded.has(declaration.pending)) {
          const result=substituteDeclaration(declaration.pending.expression,environment,spend);
          // Invalid at computed-value time: every longhand it writes is unset.
          if(result.invalid) invalid.push({property:declaration.pending.property,file:declaration.file,line:declaration.line,...result.invalid,longhands:[]});
          expanded.set(declaration.pending,{map:new Map(expand(declaration.pending.property,result.invalid ? 'unset' : result.value)),invalid:result.invalid ? invalid.at(-1) : undefined});
        }
        const entry=expanded.get(declaration.pending);
        value=entry.map.get(property);
        entry.invalid?.longhands.push(property);
        if(value===undefined) throw new Error('CSS variable shorthand does not produce the required property');
      } catch(error) {error.css={file:declaration.file,line:declaration.line};throw error;}
    }
    if (value === 'revert') value = ua[property];
    if (value === 'unset') value = inheritedProperties.has(property) ? 'inherit' : 'initial';
    if (value === 'initial') value = initial[property];
    if (value === 'inherit') {
      if (Object.hasOwn(inherited, property)) value = inherited[property];
      else if (box.documentRoot) value = initial[property];
      else throw new Error(`Cannot resolve inherited ${property}; provide the real ancestor chain`);
    }
    values[property] = value;
  }
  values.$sources = sources;
  values.$dormant = dormant;
  values.$overridden = overridden;
  values.$invalid = invalid;
  values.$variables = environment;
  const nonscroll = value => ['visible', 'clip'].includes(value);
  const x = values['overflow-x'], y = values['overflow-y'];
  if (!nonscroll(y)) values['overflow-x'] = x === 'visible' ? 'auto' : x === 'clip' ? 'hidden' : x;
  if (!nonscroll(x)) values['overflow-y'] = y === 'visible' ? 'auto' : y === 'clip' ? 'hidden' : y;
  return values;
}
