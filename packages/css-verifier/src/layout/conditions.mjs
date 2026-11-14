import postcss from 'postcss';
import { q } from './linear.mjs';

/** User preference media features, their values and the default each check assumes (the first). */
export const preferenceValues = { 'prefers-reduced-motion': ['no-preference', 'reduce'], 'prefers-color-scheme': ['light', 'dark'], 'prefers-contrast': ['no-preference', 'more', 'less', 'custom'], 'forced-colors': ['none', 'active'] };
export function parseCondition(params, kind) {
  let name;
  if (kind === 'container') {
    if (params.includes(',')) throw new Error('Container query lists are outside this subset');
    const named = params.match(/^([a-zA-Z_][\w-]*)\s+(?=\()/);
    if (named) {
      name = named[1];
      if (['and', 'or', 'not', 'none', 'default', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(name.toLowerCase())) throw new Error('Reserved container query name');
      params = params.slice(named[0].length);
    }
  }
  const groups = postcss.list.comma(params).map(part => {
    if (kind === 'media') {
      if (/^print(?:\s|$)/i.test(part)) return null;
      part = part.replace(/^(?:screen|all)(?:\s+and\s+|$)/i, '').trim();
      if (!part) return [];
    }
    const atoms = [];
    for (const term of part.split(/\s+and\s+/i)) {
      if (!/^\([^()]+\)$/.test(term.trim())) throw new Error(`Unsupported ${kind} condition: ${params}`);
      const value = term.trim().slice(1, -1).trim();
      const push = (feature, relation, size) => atoms.push({ feature: feature.toLowerCase(), relation, value: q(size) });
      let m;
      // orientation: portrait is height >= width, landscape is width > height (Media Queries 4).
      // User preferences: not geometry. They become paint-only states (see parseLayoutCSS).
      if (kind === 'media' && (m = value.match(/^(prefers-reduced-motion|prefers-color-scheme|prefers-contrast|forced-colors)\s*:\s*([a-z-]+)$/i))) {
        const feature = m[1].toLowerCase(), v = m[2].toLowerCase();
        if (!preferenceValues[feature].includes(v)) throw new Error(`Unsupported ${feature} value: ${v}`);
        atoms.push({ feature, preference: v });
      }
      else if (kind === 'media' && (m = value.match(/^orientation\s*:\s*(portrait|landscape)$/i))) atoms.push({ feature: 'orientation', relation: m[1].toLowerCase() === 'portrait' ? '>=' : '>', value: q(0), orientation: m[1].toLowerCase() });
      else if ((m = value.match(/^(min|max)-(width|height|inline-size|block-size)\s*:\s*(\d+(?:\.\d{1,6})?)px$/i))) push(m[2], m[1].toLowerCase() === 'min' ? '>=' : '<=', m[3]);
      else if ((m = value.match(/^(width|height|inline-size|block-size)\s*(<=|>=|<|>|=)\s*(\d+(?:\.\d{1,6})?)px$/i))) push(m[1], m[2], m[3]);
      else if ((m = value.match(/^(\d+(?:\.\d{1,6})?)px\s*(<=|<)\s*(width|height|inline-size|block-size)(?:\s*(<=|<)\s*(\d+(?:\.\d{1,6})?)px)?$/i))) {
        push(m[3], m[2] === '<' ? '>' : '>=', m[1]); if (m[4]) push(m[3], m[4], m[5]);
      } else throw new Error(`Unsupported ${kind} condition: ${params}`);
      if (kind === 'media' && atoms.some(atom => atom.feature.includes('-size'))) throw new Error('Media queries use width/height, not logical size features');
    }
    return atoms;
  }).filter(Boolean);
  return { kind, name, groups };
}
