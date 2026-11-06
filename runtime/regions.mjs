import { rowKey } from './value.mjs';
const SELECT = typeof __ISLE_SELECT__ === 'undefined' || __ISLE_SELECT__;
const EACH = typeof __ISLE_EACH__ === 'undefined' || __ISLE_EACH__;
const BOUNDARY = typeof __ISLE_BOUNDARY__ === 'undefined' || __ISLE_BOUNDARY__;
const contexts = new WeakMap();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export { escape, rowKey };
export const rangeHTML = (id, html) => `<!--r:${id}-->${html}<!--e:${id}-->`;
export function keyed(values, key) {
  const seen = new Set();
  return values.map((value, index) => {
    const id = rowKey(key(value, index));
    if (seen.has(id)) throw new Error('Duplicate row key');
    seen.add(id); return [id, value, index];
  });
}
/** Generated block functions call these operations directly; no template AST/VM in the browser. */
export function regionContext(root, scope, spec, values) {
  if (contexts.has(root)) return contexts.get(root);
  const document = root.ownerDocument;
  let handles = new Map(), frames = new Map();
  let queue = [], binding = true;
  function scan(container) {
    const walker = document.createTreeWalker(container, 129);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === 1) {
        if (node.hasAttribute('data-isle-node')) handles.set(node.getAttribute('data-isle-frame') + '|' + node.getAttribute('data-isle-node'), node);
      } else if (node.nodeType === 8) {
        if (node.data.startsWith('r:') || node.data.startsWith('e:')) handles.set(node.data, node);
        else if (node.data.startsWith('t:')) {
          let text = node.nextSibling;
          if (text?.nodeType !== 3) { text = document.createTextNode(''); node.after(text); }
          handles.set(node.data, text);
        }
      }
    }
  }
  scan(root);
  const frame = (id, spec, locals) => ({ id, spec, locals, children: new Map(), start: handles.get('r:' + id), end: handles.get('e:' + id) });
  function remember(f) { frames.set(f.id, f); }
  function forget(f) {
    frames.delete(f.id);
    for (const child of f.children.values()) for (const row of child.frames) forget(row);
    // A disposed frame never retains DOM handles or captured row values.
    for (const key of handles.keys()) if (key === 'r:' + f.id || key === 'e:' + f.id || key.startsWith('t:' + f.id + '|') || key.startsWith(f.id + '|')) handles.delete(key);
  }
  function remove(f) {
    forget(f);
    for (let node = f.start; node;) { const next = node.nextSibling; node.remove(); if (node === f.end) break; node = next; }
  }
  function install(next) {
    for (const [key, value] of next.handles) handles.set(key, value);
    for (const [key, value] of next.frames) frames.set(key, value);
  }
  function fresh(id, spec, v, l) {
    const template = document.createElement('template');
    template.innerHTML = rangeHTML(id, spec[0](v, l, id, scope));
    const oldHandles = handles, oldFrames = frames, before = binding;
    handles = new Map(); frames = new Map(); binding = true;
    try {
      scan(template.content);
      const f = frame(id, spec, l); remember(f);
      spec[1](api, f, v, l, null);
      return { f, fragment: template.content, handles, frames };
    } finally { binding = before; handles = oldHandles; frames = oldFrames; }
  }
  function patch(f, v, l, dirty) {
    const before = queue.length;
    try { f.spec[1](api, f, v, l, dirty); }
    catch (error) { queue.length = before; throw error; }
    if (!binding) queue.push(() => { f.locals = l; });
  }
  function select(parent, site, arm, specs, v, l, dirty) {
    const id = parent.id + '.' + site, current = parent.children.get(site);
    if (binding) {
      const child = frame(id + '.' + arm, specs[arm], l);
      if (!child.start || !child.end) throw new Error('Region/snapshot mismatch');
      parent.children.set(site, { arm, frames: [child] }); remember(child); patch(child, v, l, null); return;
    }
    if (current.arm === arm) { patch(current.frames[0], v, l, dirty); return; }
    const next = fresh(id + '.' + arm, specs[arm], v, l), old = current.frames[0];
    queue.push(() => {
      old.start.before(next.fragment); remove(old); install(next);
      parent.children.set(site, { arm, frames: [next.f] });
    });
  }
  const api = {
    text(f, id, value) {
      const target = handles.get('t:' + f.id + '|' + id);
      if (!target) throw new Error('Missing region text');
      if (!binding) { const text = String(value); if (target.data !== text) queue.push(() => { target.data = text; }); }
    },
    attribute(f, id, name, value) {
      const target = handles.get(f.id + '|' + id);
      if (!target) throw new Error('Missing region attribute');
      if (!binding) queue.push(() => {
        if (['disabled', 'checked', 'required', 'readonly', 'multiple', 'selected', 'hidden'].includes(name)) {
          if (value) target.setAttribute(name, ''); else target.removeAttribute(name);
          if (name === 'checked') target.checked = value;
        } else if (name === 'value') { if (target.value !== String(value)) target.value = String(value); }
        else if (target.getAttribute(name) !== String(value)) target.setAttribute(name, value);
      });
    },
    ...(SELECT ? { select } : {}),
    ...(EACH ? { each(parent, site, getRows, reconcile, spec, empty, v, l, dirty) {
      const current = parent.children.get(site);
      if (!binding && !reconcile) {
        for (const child of current.frames) patch(child, v, current.empty ? l : [...l, ...child.locals.slice(l.length)], dirty);
        return;
      }
      const rows = getRows();
      const id = parent.id + '.' + site, inputs = rows.length ? rows : [['empty', undefined, -1]];
      const specs = rows.length ? spec : empty;
      const makeLocals = row => rows.length ? [...l, row[1], row[2]] : l;
      if (binding) {
        const children = inputs.map(row => frame(id + '.' + row[0], specs, makeLocals(row)));
        parent.children.set(site, { frames: children, empty: !rows.length });
        children.forEach(child => { if (!child.start || !child.end) throw new Error('Region/snapshot mismatch'); remember(child); patch(child, v, child.locals, null); }); return;
      }
      const previous = new Map(current.frames.map(child => [child.id, child])), created = new Map();
      const next = inputs.map(row => {
        const childId = id + '.' + row[0], locals = makeLocals(row);
        if (previous.has(childId)) {
          const child = previous.get(childId); previous.delete(childId);
          patch(child, v, locals, new Set([...dirty, ...(locals.some((value, i) => !Object.is(value, child.locals[i])) ? ['$local'] : [])])); return child;
        }
        const result = fresh(childId, specs, v, locals); created.set(childId, result); return result.f;
      });
      const anchor = handles.get('e:' + id);
      queue.push(() => {
        previous.forEach(remove);
        let cursor = anchor;
        for (let i = next.length - 1; i >= 0; i--) {
          const child = next[i];
          if (created.has(child.id)) { const result = created.get(child.id); cursor.before(result.fragment); install(result); }
          else if (child.end.nextSibling !== cursor) {
            const range = document.createRange(); range.setStartBefore(child.start); range.setEndAfter(child.end); cursor.before(range.extractContents());
          }
          cursor = child.start;
        }
        parent.children.set(site, { frames: next, empty: !rows.length });
      });
    },
    } : {}),
    ...(BOUNDARY ? { boundary(parent, site, body, fallback, v, l, dirty) {
      const checkpoint = queue.length;
      if (binding) {
        const arm = handles.has('r:' + parent.id + '.' + site + '.0') ? 0 : 1;
        select(parent, site, arm, [body, fallback], v, arm ? [...l, 'Render failed'] : l, dirty); return;
      }
      try { select(parent, site, 0, [body, fallback], v, l, dirty); }
      catch { queue.length = checkpoint; select(parent, site, 1, [body, fallback], v, [...l, 'Render failed'], dirty); }
    } } : {}),
  };
  const top = frame('0', spec, []); remember(top);
  try { patch(top, values, [], null); } finally { binding = false; queue = []; }
  const context = {
    locals(element) { const f = frames.get(element.closest('[data-isle-frame]')?.getAttribute('data-isle-frame')); if (!f) throw new Error('Disposed region'); return f.locals; },
    prepare(v, dirty) {
      queue = [];
      try { patch(top, v, [], dirty); } catch (error) { queue = []; throw error; }
      const commits = queue; queue = [];
      return () => { commits.forEach(commit => commit()); };
    },
  };
  contexts.set(root, context); return context;
}
