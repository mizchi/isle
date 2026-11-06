import { childrenOf } from './template.mjs';
/** HTML patterns use Unicode sets. Checked by the Node 24 backend; no RegExp is shipped. */
export function validatePattern(pattern) {
  try { new RegExp(pattern, 'v'); } catch { throw new Error('Invalid form pattern'); }
}

export function checkPatterns(node, diagnostics = []) {
  if (['select', 'each', 'boundary'].includes(node.kind)) { childrenOf(node).forEach(child => checkPatterns(child, diagnostics)); return diagnostics; }
  if (node.kind === 'island') { node.children.forEach(child => checkPatterns(child, diagnostics)); return diagnostics; }
  if (node.kind !== 'element') return diagnostics;
  for (const attribute of node.attributes) {
    if (attribute.name !== 'pattern' || attribute.value.kind !== 'string') continue;
    try { validatePattern(attribute.value.value); } catch {
      diagnostics.push({ code: 'E_FORM_PATTERN', message: 'Invalid HTML pattern',
        hint: 'Use a valid Unicode sets (v flag) regular expression.',
        start: node.source?.start ?? 0, end: node.source?.end ?? 1, file: '' });
    }
  }
  node.children.forEach(child => checkPatterns(child, diagnostics));
  return diagnostics;
}
