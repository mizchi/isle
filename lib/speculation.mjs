const eagerness = ['immediate', 'eager', 'moderate', 'conservative'];
const policies = ['no-referrer', 'no-referrer-when-downgrade', 'same-origin', 'origin', 'strict-origin', 'origin-when-cross-origin', 'strict-origin-when-cross-origin', 'unsafe-url'];
const predicates = ['and', 'or', 'not', 'href_matches', 'selector_matches'];
const fail = path => { throw new Error(`Invalid Isle speculation rules: ${path}`); };
function record(value, allowed, path) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key))) fail(path);
}
function strings(value, path) {
  if (typeof value === 'string' && value.length) return value;
  if (Array.isArray(value) && value.length && value.every(item => typeof item === 'string' && item.length)) return [...value];
  fail(path);
}
function tag(value, path) {
  if (value !== null && (typeof value !== 'string' || !/^[\x20-\x7e]*$/.test(value))) fail(path);
  return value;
}
function predicate(value, ancestors = new Set()) {
  record(value, predicates, 'where');
  const keys = Object.keys(value);
  if (keys.length !== 1 || ancestors.has(value)) fail('where must have one predicate and no cycles');
  ancestors.add(value);
  const key = keys[0], argument = value[key];
  let result;
  if (key === 'and' || key === 'or') {
    if (!Array.isArray(argument)) fail(`where.${key}`);
    result = argument.map(item => predicate(item, ancestors));
  } else if (key === 'not') result = predicate(argument, ancestors);
  else result = strings(argument, `where.${key}`);
  ancestors.delete(value);
  return { [key]: result };
}

/** Build-side subset of native JSON; URLs stay relative to the document, not the chunk manifest. */
export function speculationRules(input) {
  if (input === undefined || input === false) return null;
  record(input, ['prefetch', 'prerender', 'tag'], 'ruleset');
  const output = {};
  if (input.tag !== undefined) output.tag = tag(input.tag, 'tag');
  for (const kind of ['prefetch', 'prerender']) {
    if (input[kind] === undefined) continue;
    if (!Array.isArray(input[kind])) fail(kind);
    const rules = input[kind].map(rule => {
      record(rule, ['urls', 'where', 'eagerness', 'tag', 'referrer_policy'], kind);
      if (Object.hasOwn(rule, 'urls') === Object.hasOwn(rule, 'where')) fail(`${kind}: choose urls or where`);
      let result;
      if (Object.hasOwn(rule, 'urls')) {
        if (!Array.isArray(rule.urls)) fail(`${kind}.urls`);
        const urls = rule.urls.map(url => {
          if (typeof url !== 'string' || !url.length || /[\x00-\x20]/.test(url)) fail(`${kind}.urls`);
          let parsed;
          try { parsed = new URL(url, 'https://isle.invalid/'); } catch { fail(`${kind}.urls`); }
          if (!['http:', 'https:'].includes(parsed.protocol)) fail(`${kind}.urls must use HTTP(S)`);
          return url;
        });
        result = { urls: [...new Set(urls)] };
      } else result = { where: predicate(rule.where) };
      if (rule.eagerness !== undefined) {
        if (!eagerness.includes(rule.eagerness)) fail(`${kind}.eagerness`);
        result.eagerness = rule.eagerness;
      }
      if (rule.tag !== undefined) result.tag = tag(rule.tag, `${kind}.tag`);
      if (rule.referrer_policy !== undefined) {
        if (!policies.includes(rule.referrer_policy)) fail(`${kind}.referrer_policy`);
        result.referrer_policy = rule.referrer_policy;
      }
      return result.urls?.length === 0 ? null : result;
    }).filter(Boolean);
    if (rules.length) output[kind] = rules;
  }
  return output.prefetch || output.prerender ? output : null;
}

/** A data block, with no runtime JS or polyfill. Escape HTML raw-text delimiters. */
export function speculationTags(input, nonce) {
  const rules = speculationRules(input);
  return rules ? [{ tag: 'script', attrs: { type: 'speculationrules', ...(nonce ? { nonce } : {}) },
    children: JSON.stringify(rules).replaceAll('<', '\\u003c'), injectTo: 'head' }] : [];
}
