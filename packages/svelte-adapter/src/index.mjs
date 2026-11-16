// Svelte 5 component adapter for @mizchi/css-verifier.
//
// A component is a family of DOM trees: every {#if} branch, class: directive and {#each} item count is a choice. The
// adapter enumerates the combinations (bounded), renders each as HTML, and runs the generic analysis on each one.
// It is an adapter in the sense of AGENTS.md: the verifier core knows nothing of Svelte.
//
// Choices with the same expression source are the same condition ({#if open} … class:active={open}); `!x` is the
// negation of `x`. Other correlations between conditions are not known, so the enumeration may include states the
// component can never reach (an over-approximation: a violation may be in an unreachable state; a verified result
// holds for every enumerated state). {#each} is checked at the item counts in `eachCounts`, all items taking the
// same choices — a finite model, recorded in the report's `coverage`.
//
// Unknown (never verified): child components, {@html}, {@render}, <slot>, dynamic class={…} that is not a literal
// conditional, style: directives and style={…}, <svelte:element>, and more states than `maxStates`.
import { parse } from 'svelte/compiler';
import { analyzeStates, scopeEscapes, boundary } from '@mizchi/css-verifier-adapter-core';

const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = s => escapeText(s).replace(/"/g, '&quot;');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// The condition key of an expression: its source text, with a leading ! turned into a negation.
function condition(source, node) {
  let text = source.slice(node.start, node.end).trim(), negate = false;
  while (text.startsWith('!') && !text.startsWith('!=')) { negate = !negate; text = text.slice(1).trim(); }
  if (/^\(.*\)$/.test(text)) text = text.slice(1, -1).trim();
  return { key: text, negate };
}

/**
 * Enumerate the component's trees.
 * @returns {{ states: { html: string, choices: Record<string, unknown> }[], css: string, unknowns: { code: string, message: string }[], assumptions: string[] }}
 */
export function expandSvelte(source, { maxStates = 64, eachCounts = [0, 1, 2], sourceLines = false } = {}) {
  const ast = parse(source, { modern: true });
  const unknowns = [], assumptions = new Set();
  const unknown = (code, message) => { if (!unknowns.some(u => u.message === message)) unknowns.push({ code, message }); };
  const css = ast.css ? source.slice(ast.css.content.start, ast.css.content.end) : '';

  // Each render function returns variants: [{ html, choices }] where choices maps condition keys to values; a
  // variant is dropped when it contradicts a choice already made (the same condition taken both ways).
  const merge = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) { if (k in out && out[k] !== v) return null; out[k] = v; } return out; };
  const product = (lists) => {
    let acc = [{ html: '', choices: {} }];
    for (const list of lists) {
      const next = [];
      for (const left of acc) for (const right of list) { const choices = merge(left.choices, right.choices); if (choices) next.push({ html: left.html + right.html, choices }); }
      acc = next;
      if (acc.length > maxStates) { unknown('U_SVELTE_STATES', `more than ${maxStates} template states; raise maxStates or split the component`); return acc.slice(0, maxStates); }
    }
    return acc;
  };
  const choose = (key, value) => ({ [key]: value });

  function attributes(node) {
    // Static attributes, class: directives (a choice each) and literal-conditional class={a ? 'x' : 'y'}.
    const statics = [], classVariants = [[{ html: '', choices: {} }]], attrVariants = [];
    let classes = [];
    for (const attr of node.attributes) {
      if (attr.type === 'Attribute') {
        if (attr.value === true) { statics.push(` ${attr.name}`); continue; }
        const parts = Array.isArray(attr.value) ? attr.value : [attr.value];
        if (parts.every(p => p.type === 'Text')) {
          const value = parts.map(p => p.data).join('');
          if (attr.name === 'class') classes.push(...value.split(/\s+/).filter(Boolean)); else statics.push(` ${attr.name}="${escapeAttr(value)}"`);
          continue;
        }
        if (attr.name === 'class') {
          const expr = parts.length === 1 && parts[0].type === 'ExpressionTag' ? parts[0].expression : null;
          if (expr?.type === 'ConditionalExpression' && [expr.consequent, expr.alternate].every(e => e.type === 'Literal' && typeof e.value === 'string')) {
            const { key, negate } = condition(source, expr.test);
            classVariants.push([true, false].map(v => ({ html: (v !== negate ? expr.consequent.value : expr.alternate.value), choices: choose(key, v) })));
            continue;
          }
          unknown('U_SVELTE_DYNAMIC_CLASS', `<${node.name}> has a dynamic class={…}: its classes are not known`);
          continue;
        }
        if (attr.name === 'style') { unknown('U_SVELTE_DYNAMIC_STYLE', `<${node.name}> has a dynamic style attribute`); continue; }
        // A literal conditional (dir={rtl ? 'rtl' : 'ltr'}) is a choice between its two values.
        const literal = parts.length === 1 && parts[0].type === 'ExpressionTag' ? parts[0].expression : null;
        if (literal?.type === 'ConditionalExpression' && [literal.consequent, literal.alternate].every(e => e.type === 'Literal' && ['string', 'number'].includes(typeof e.value))) {
          const { key, negate } = condition(source, literal.test);
          attrVariants.push([true, false].map(v => ({ html: ` ${attr.name}="${escapeAttr(String(v !== negate ? literal.consequent.value : literal.alternate.value))}"`, choices: choose(key, v) })));
          continue;
        }
        // Another attribute with an expression: rendered with a placeholder value (recorded as an assumption).
        assumptions.add(`dynamic attribute ${attr.name} on <${node.name}> is rendered with a non-empty placeholder value`);
        statics.push(` ${attr.name}="dynamic"`);
      } else if (attr.type === 'ClassDirective') {
        const { key, negate } = attr.expression ? condition(source, attr.expression) : { key: attr.name, negate: false };
        classVariants.push([true, false].map(v => ({ html: v !== negate ? attr.name : '', choices: choose(key, v) })));
      } else if (attr.type === 'StyleDirective') unknown('U_SVELTE_DYNAMIC_STYLE', `<${node.name}> has a style:${attr.name} directive`);
      else if (attr.type === 'SpreadAttribute') unknown('U_SVELTE_SPREAD', `<${node.name}> spreads attributes; its classes and attributes are not known`);
      // on:/onclick= handlers, bind:, use:, transition: do not change the static tree.
    }
    // Class choices and attribute choices combine; an attribute variant's text joins the static attributes.
    const tagged = [...classVariants.slice(1).map(list => list.map(v => ({ ...v, kind: 'class' }))), ...attrVariants.map(list => list.map(v => ({ ...v, kind: 'attr' })))];
    const combos = [{ classes: [], attrs: '', choices: {} }];
    let acc = combos;
    for (const list of tagged) {
      const next = [];
      for (const left of acc) for (const right of list) { const choices = merge(left.choices, right.choices); if (choices) next.push({ classes: right.kind === 'class' ? [...left.classes, ...right.html.split(/\s+/).filter(Boolean)] : left.classes, attrs: right.kind === 'attr' ? left.attrs + right.html : left.attrs, choices }); }
      acc = next;
    }
    return acc.map(v => ({ choices: v.choices, classList: [...classes, ...v.classes], statics: statics.join('') + v.attrs }));
  }

  function renderNodes(nodes, context) { return product((nodes ?? []).map(n => renderNode(n, context))); }
  function renderNode(node, context) {
    switch (node.type) {
      case 'Text': return [{ html: escapeText(node.data), choices: {} }];
      case 'Comment': return [{ html: '', choices: {} }];
      case 'ExpressionTag': assumptions.add('{expression} text is rendered as placeholder text; its size comes from the box contracts'); return [{ html: '…', choices: {} }];
      case 'RegularElement': {
        const own = attributes(node), inner = voidTags.has(node.name) ? [{ html: '', choices: {} }] : renderNodes(node.fragment.nodes, context);
        const out = [];
        for (const a of own) for (const b of inner) {
          const choices = merge(a.choices, b.choices); if (!choices) continue;
          const cls = a.classList.length ? ` class="${escapeAttr(a.classList.join(' '))}"` : '';
          out.push({ html: `<${node.name}${cls}${a.statics}${sourceLines ? ` data-src-line="${source.slice(0, node.start).split('\n').length}"` : ''}>${voidTags.has(node.name) ? '' : `${b.html}</${node.name}>`}`, choices });
        }
        return out;
      }
      case 'IfBlock': {
        const { key, negate } = condition(source, node.test);
        const yes = renderNodes(node.consequent.nodes, context).map(v => ({ html: v.html, choices: merge(v.choices, choose(key, !negate)) }));
        const no = (node.alternate ? renderNodes(node.alternate.nodes, context) : [{ html: '', choices: {} }]).map(v => ({ html: v.html, choices: merge(v.choices, choose(key, negate)) }));
        return [...yes, ...no].filter(v => v.choices);
      }
      case 'EachBlock': {
        const key = `#each ${source.slice(node.expression.start, node.expression.end)}`;
        assumptions.add(`{#each} is checked at ${eachCounts.join(', ')} items, all items taking the same branch choices`);
        const body = renderNodes(node.body.nodes, context);
        return eachCounts.flatMap(count => count === 0
          ? (node.fallback ? renderNodes(node.fallback.nodes, context) : [{ html: '', choices: {} }]).map(v => ({ html: v.html, choices: merge(v.choices, choose(key, 0)) }))
          : body.map(v => ({ html: v.html.repeat(count), choices: merge(v.choices, choose(key, count)) }))).filter(v => v.choices);
      }
      case 'KeyBlock': return renderNodes(node.fragment.nodes, context);
      case 'AwaitBlock': {
        const key = `#await ${source.slice(node.expression.start, node.expression.end)}`;
        return [['pending', node.pending], ['then', node.then], ['catch', node.catch]].filter(([, f]) => f)
          .flatMap(([phase, f]) => renderNodes(f.nodes, context).map(v => ({ html: v.html, choices: merge(v.choices, choose(key, phase)) }))).filter(v => v.choices);
      }
      case 'ConstTag': case 'DebugTag': case 'SnippetBlock': case 'SvelteHead': case 'SvelteWindow': case 'SvelteDocument': case 'SvelteBody': case 'SvelteOptions': return [{ html: '', choices: {} }];
      case 'HtmlTag': unknown('U_SVELTE_HTML', '{@html …} inserts markup that is not known statically'); return [{ html: boundary('html'), choices: {} }];
      case 'RenderTag': unknown('U_SVELTE_RENDER', '{@render …} inserts a snippet from the caller; its markup is not known here'); return [{ html: boundary('children'), choices: {} }];
      case 'SlotElement': unknown('U_SVELTE_SLOT', '<slot> content comes from the caller'); return [{ html: boundary('slot'), choices: {} }];
      case 'Component': case 'SvelteComponent': case 'SvelteSelf': unknown('U_SVELTE_COMPONENT', `child component <${node.name}>: its markup is analysed with that component, not here`); return [{ html: boundary('component', node.name), choices: {} }];
      case 'SvelteElement': unknown('U_SVELTE_ELEMENT', '<svelte:element> has a dynamic tag'); return [{ html: '', choices: {} }];
      default: unknown('U_SVELTE_NODE', `unsupported template node ${node.type}`); return [{ html: '', choices: {} }];
    }
  }

  const states = renderNodes(ast.fragment.nodes, {}).map(v => ({ html: v.html.trim(), choices: v.choices }));
  return { states, css, unknowns, assumptions: [...assumptions] };
}

// Svelte scopes component selectors to the component's own elements; :global(…) opts out. Analysing the component
// alone, both match the same elements, so :global(x) is unwrapped to x.
export const unscopeCSS = css => css.replace(/:global\(([^()]*)\)/g, '$1');

/**
 * Analyse every template state of a Svelte component.
 * @param {string} source the .svelte file
 * @param {object} options css-verifier options (viewport, boxes, accessibility, selectors, …) plus:
 *   pageCSS — CSS for the page around the component (html, body); page(html) — the document around it;
 *   maxStates, eachCounts — the enumeration bounds.
 */
export function analyzeSvelte(source, { maxStates, eachCounts, sourceLines, ...options } = {}) {
  const { states, css, unknowns, assumptions } = expandSvelte(source, { maxStates, eachCounts, sourceLines });
  // Svelte scopes every compound of a selector to the component (an ancestor outside it never matches: an unused
  // selector, which the Svelte compiler and W_CSS_SELECTOR_* report); :global(…) reaches past it (E_SCOPE_ESCAPE).
  return analyzeStates({ states, css: unscopeCSS(css), unknowns, assumptions, scope: { mode: 'scoped', ancestors: 'scoped', escapes: scopeEscapes(css, ['global']) } }, options);
}
