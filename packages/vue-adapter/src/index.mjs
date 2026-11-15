// Vue 3 SFC adapter for @mizchi/css-verifier. The template's branches are choices: v-if / v-else-if / v-else chains,
// v-show (display: none when false), :class objects, arrays and literal conditionals, literal-conditional bindings
// of other attributes, and v-for item counts. Every combination is analysed by the core (adapter-core), the same way
// as the Svelte adapter. A condition is named by its expression source; !x negates x.
//
// Unknown (never verified): child components, <slot>, v-html, <component :is>, a dynamic :class or :style that is
// not a literal shape, <style module>, and more states than maxStates. Scoped styles are unscoped (:deep(x),
// :slotted(x) and :global(x) become x): analysed alone, a component's scoped selectors match its own elements.
import { parse } from 'vue/compiler-sfc';
import { parseExpression } from '@babel/parser';
import { product, merge, choose, conditionKey, analyzeStates } from '@mizchi/css-verifier-adapter-core';

const ELEMENT = 1, TEXT = 2, COMMENT = 3, INTERPOLATION = 5, ATTRIBUTE = 6, DIRECTIVE = 7;
const COMPONENT = 1, SLOT = 2, TEMPLATE = 3;
const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = s => escapeText(s).replace(/"/g, '&quot;');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

export const unscopeVueCSS = css => css.replace(/:(?:deep|slotted|global)\(([^()]*)\)/g, '$1');

export function expandVue(source, { maxStates = 64, eachCounts = [0, 1, 2] } = {}) {
  const { descriptor, errors } = parse(source);
  const unknowns = [], assumptions = new Set();
  const unknown = (code, message) => { if (!unknowns.some(u => u.message === message)) unknowns.push({ code, message }); };
  if (errors.length) unknown('U_VUE_PARSE', `the SFC does not parse: ${errors[0].message ?? errors[0]}`);
  for (const style of descriptor.styles) if (style.module) unknown('U_VUE_CSS_MODULE', '<style module> class names come from $style at run time');
  const css = descriptor.styles.filter(s => !s.module).map(s => unscopeVueCSS(s.content)).join('\n');
  const limit = { maxStates, onLimit: max => unknown('U_VUE_STATES', `more than ${max} template states; raise maxStates or split the component`) };
  const empty = [{ html: '', choices: {} }];
  const exprChoice = (text, value) => { const { key, negate } = conditionKey(text); return choose(key, value !== negate); };

  // :class (and static class) to class-list variants.
  function classVariants(expr) {
    let node;
    try { node = parseExpression(expr); } catch { unknown('U_VUE_DYNAMIC_CLASS', `:class="${expr}" does not parse`); return null; }
    const of = n => {
      if (n.type === 'StringLiteral') return [{ classes: n.value.split(/\s+/).filter(Boolean), choices: {} }];
      if (n.type === 'ObjectExpression') {
        let acc = [{ classes: [], choices: {} }];
        for (const p of n.properties) {
          if (p.type !== 'ObjectProperty' || p.computed) return null;
          const name = p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null;
          if (name === null) return null;
          const cond = expr.slice(p.value.start, p.value.end);
          const next = [];
          for (const left of acc) for (const on of [true, false]) { const choices = merge(left.choices, exprChoice(cond, on)); if (choices) next.push({ classes: on ? [...left.classes, ...name.split(/\s+/)] : left.classes, choices }); }
          acc = next;
        }
        return acc;
      }
      if (n.type === 'ArrayExpression') {
        let acc = [{ classes: [], choices: {} }];
        for (const el of n.elements) {
          const part = el && of(el);
          if (!part) return null;
          const next = [];
          for (const left of acc) for (const right of part) { const choices = merge(left.choices, right.choices); if (choices) next.push({ classes: [...left.classes, ...right.classes], choices }); }
          acc = next;
        }
        return acc;
      }
      if (n.type === 'ConditionalExpression') {
        const yes = of(n.consequent), no = of(n.alternate), cond = expr.slice(n.test.start, n.test.end);
        if (!yes || !no) return null;
        return [...yes.map(v => ({ ...v, choices: merge(v.choices, exprChoice(cond, true)) })), ...no.map(v => ({ ...v, choices: merge(v.choices, exprChoice(cond, false)) }))].filter(v => v.choices);
      }
      return null;
    };
    const out = of(node);
    if (!out) unknown('U_VUE_DYNAMIC_CLASS', `:class="${expr}" is not a literal string, object, array or conditional`);
    return out;
  }

  function element(node) {
    if (node.tagType === COMPONENT) { unknown('U_VUE_COMPONENT', `child component <${node.tag}>: its markup is analysed with that component, not here`); return empty; }
    if (node.tagType === SLOT) { unknown('U_VUE_SLOT', '<slot> content comes from the parent'); return empty; }
    if (node.tag === 'component') { unknown('U_VUE_DYNAMIC_COMPONENT', '<component :is> has a dynamic tag'); return empty; }
    const statics = [], classes = [];
    let classLists = [{ classes: [], choices: {} }], show = null;
    const attrLists = [];
    for (const p of node.props) {
      if (p.type === ATTRIBUTE) { if (p.name === 'class') classes.push(...(p.value?.content ?? '').split(/\s+/).filter(Boolean)); else statics.push(p.value ? ` ${p.name}="${escapeAttr(p.value.content)}"` : ` ${p.name}`); continue; }
      if (p.type !== DIRECTIVE || ['if', 'else-if', 'else', 'for', 'on', 'model', 'once', 'memo', 'cloak', 'pre'].includes(p.name)) continue;
      if (p.name === 'show') { show = p.exp.content; continue; }
      if (p.name === 'html') { unknown('U_VUE_HTML', 'v-html inserts markup that is not known statically'); continue; }
      if (p.name === 'text') { assumptions.add('v-text content is placeholder text; its size comes from the box contracts'); continue; }
      if (p.name !== 'bind' || !p.arg?.content) { unknown('U_VUE_DIRECTIVE', `v-${p.name} on <${node.tag}> is not modeled`); continue; }
      const attr = p.arg.content, expr = p.exp?.content ?? attr;
      if (attr === 'key') continue;
      if (attr === 'class') { const variants = classVariants(expr); if (variants) classLists = classLists.flatMap(l => variants.map(v => { const choices = merge(l.choices, v.choices); return choices && { classes: [...l.classes, ...v.classes], choices }; })).filter(Boolean); continue; }
      if (attr === 'style') { unknown('U_VUE_DYNAMIC_STYLE', `<${node.tag}> has a dynamic :style`); continue; }
      let lit;
      try { lit = parseExpression(expr); } catch { lit = null; }
      if (lit?.type === 'ConditionalExpression' && [lit.consequent, lit.alternate].every(e => e.type === 'StringLiteral' || e.type === 'NumericLiteral')) {
        const cond = expr.slice(lit.test.start, lit.test.end);
        attrLists.push([true, false].map(v => ({ html: ` ${attr}="${escapeAttr(String((v ? lit.consequent : lit.alternate).value))}"`, choices: exprChoice(cond, v) })));
      } else if (lit?.type === 'StringLiteral' || lit?.type === 'NumericLiteral') statics.push(` ${attr}="${escapeAttr(String(lit.value))}"`);
      else { assumptions.add(`dynamic attribute ${attr} on <${node.tag}> is rendered with a non-empty placeholder value`); statics.push(` ${attr}="dynamic"`); }
    }
    const own = [];
    for (const c of classLists) for (const a of product(attrLists)) {
      const choices = merge(c.choices, a.choices); if (!choices) continue;
      for (const shown of show ? [true, false] : [null]) {
        const all = shown === null ? choices : merge(choices, exprChoice(show, shown)); if (!all) continue;
        const list = [...classes, ...c.classes];
        own.push({ open: `<${node.tag}${list.length ? ` class="${escapeAttr(list.join(' '))}"` : ''}${statics.join('')}${a.html}${shown === false ? ' style="display: none"' : ''}>`, choices: all });
      }
    }
    if (node.tag === 'template' || node.tagType === TEMPLATE) return children(node.children);
    const inner = voidTags.has(node.tag) ? empty : children(node.children);
    const out = [];
    for (const o of own) for (const i of inner) { const choices = merge(o.choices, i.choices); if (choices) out.push({ html: `${o.open}${voidTags.has(node.tag) ? '' : `${i.html}</${node.tag}>`}`, choices }); }
    return out;
  }

  // v-for over one element: the item counts, every item taking the same choices.
  function withFor(node, render) {
    const dir = node.props.find(p => p.type === DIRECTIVE && p.name === 'for');
    if (!dir) return render();
    const key = `#for ${dir.exp?.content ?? ''}`;
    assumptions.add(`v-for is checked at ${eachCounts.join(', ')} items, all items taking the same branch choices`);
    const body = render();
    return eachCounts.flatMap(n => body.map(v => ({ html: v.html.repeat(n), choices: merge(v.choices, choose(key, n)) }))).filter(v => v.choices);
  }

  function children(nodes) {
    const lists = [];
    const list = (nodes ?? []).filter(n => !(n.type === COMMENT) && !(n.type === TEXT && !n.content.trim()));
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.type === TEXT) { lists.push([{ html: escapeText(n.content), choices: {} }]); continue; }
      if (n.type === INTERPOLATION) { assumptions.add('{{ interpolation }} text is placeholder text; its size comes from the box contracts'); lists.push([{ html: '…', choices: {} }]); continue; }
      if (n.type !== ELEMENT) continue;
      const directive = name => n.props.find(p => p.type === DIRECTIVE && p.name === name);
      if (directive('if')) {
        // A v-if chain: branch k holds when its condition does and every earlier one does not.
        const chain = [n];
        while (list[i + 1]?.type === ELEMENT && list[i + 1].props.some(p => p.type === DIRECTIVE && ['else-if', 'else'].includes(p.name))) chain.push(list[++i]);
        const variants = [];
        let earlier = {};
        for (const b of chain) {
          const cond = b.props.find(p => p.type === DIRECTIVE && ['if', 'else-if'].includes(p.name));
          const taken = cond ? merge(earlier, exprChoice(cond.exp.content, true)) : earlier;
          if (taken) for (const v of withFor(b, () => element(b))) { const choices = merge(v.choices, taken); if (choices) variants.push({ html: v.html, choices }); }
          if (!cond) { earlier = null; break; }
          earlier = merge(earlier, exprChoice(cond.exp.content, false));
          if (!earlier) break;
        }
        if (earlier) variants.push({ html: '', choices: earlier });
        lists.push(variants);
        continue;
      }
      lists.push(withFor(n, () => element(n)));
    }
    return product(lists, limit);
  }

  const states = descriptor.template ? children(descriptor.template.ast.children).map(v => ({ html: v.html.trim(), choices: v.choices })) : [];
  if (!descriptor.template) unknown('U_VUE_TEMPLATE', 'the SFC has no <template>');
  return { states, css, unknowns, assumptions: [...assumptions] };
}

/** Analyse every template state of a Vue SFC (options: css-verifier options, pageCSS, page, maxStates, eachCounts). */
export function analyzeVue(source, { maxStates, eachCounts, ...options } = {}) {
  return analyzeStates(expandVue(source, { maxStates, eachCounts }), options);
}
