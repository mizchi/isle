const symbolPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function check(ref) {
  if (!Array.isArray(ref) || ref.length !== 3 || typeof ref[0] !== 'string' || !ref[0] || ref[0].includes('#') || typeof ref[1] !== 'string' || !symbolPattern.test(ref[1]) ||
    !Array.isArray(ref[2]) || ref[2].includes(undefined) || ref[2].some(slot => !Number.isSafeInteger(slot) || slot < 0 || Object.is(slot, -0)) || new Set(ref[2]).size !== ref[2].length)
    throw new Error('Invalid code reference');
  return ref;
}

/** Serializable reference to an export and its indices in the island snapshot. */
export function codeRef(url, symbol, captures = []) {
  check([url, symbol, captures]);
  return Object.freeze([url, symbol, Object.freeze([...captures])]);
}
export function encodeCodeRef(ref) {
  check(ref);
  return `${ref[0]}#${ref[1]}${ref[2].length ? `[${ref[2].join(',')}]` : ''}`;
}
export function decodeCodeRef(text) {
  const index = text.lastIndexOf('#'), match = /^([A-Za-z_$][A-Za-z0-9_$]*)(?:\[(.*)\])?$/.exec(text.slice(index + 1));
  if (index < 1 || !match) throw new Error('Invalid code reference');
  const slots = match[2] ? match[2].split(',') : [];
  if (slots.some(slot => !/^(0|[1-9][0-9]*)$/.test(slot))) throw new Error('Invalid captured slot');
  return codeRef(text.slice(0, index), match[1], slots.map(Number));
}

export function createCodeResolver(baseURL, importModule = url => import(/* @vite-ignore */ url)) {
  const base = new URL(baseURL), modules = new Map();
  return { async resolve(ref) {
    check(ref);
    const url = new URL(ref[0], base);
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) throw new Error('Unsupported code reference protocol');
    const key = url.href;
    if (!modules.has(key)) modules.set(key, Promise.resolve().then(() => importModule(key)).catch(error => { modules.delete(key); throw error; }));
    const module = await modules.get(key), value = Object.hasOwn(module, ref[1]) && module[ref[1]];
    if (typeof value !== 'function') throw new Error(`Missing callable export: ${ref[1]}`);
    return value;
  } };
}
