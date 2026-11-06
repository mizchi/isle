/** Per-root stylesheet slots. Fetch/parse first; applying ready rules is an explicit commit. */
export function createStyleGate(root) {
  const key = Symbol.for('isle.style.gate/1');
  if (Object.hasOwn(root, key)) return root[key];
  const template = root.querySelector?.('template[data-isle-styles="1"]');
  if (!template) return () => undefined;
  const document = root.ownerDocument ?? root, target = root === document ? document.head : root;
  const byId = new Map(), entries = new Map();
  let closed = false;
  const sources = [...template.content.querySelectorAll('link[data-isle-code]')];
  const hrefOf = source => new URL(source.getAttribute('href'), template.getAttribute('data-isle-base') || document.baseURI).href;
  const eager = new Map([...target.querySelectorAll('link[data-isle-eager-style],link[data-isle-style]')].map(link => [link.href, link]));
  let next = null;
  for (const source of sources.toReversed()) {
    const href = hrefOf(source);
    if (eager.has(href)) next = eager.get(href);
    const anchor = document.createComment('isle:style'); target.insertBefore(anchor, next); next = anchor;
    entries.set(href, { href, source, anchor });
  }
  for (const source of sources) {
    const href = hrefOf(source);
    for (const id of source.getAttribute('data-isle-code').split(' ')) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(entries.get(href));
    }
  }
  function prepare(entry) {
    if (entry.ready) return entry.ready;
    const existing = [...target.querySelectorAll('link[rel="stylesheet"]')].find(link => link.href === entry.href && !link.disabled && !link.media && link.sheet);
    if (existing) return entry.ready = Promise.resolve();
    const link = entry.link = entry.source.cloneNode();
    link.nonce = entry.source.nonce;
    link.setAttribute('data-isle-style', '');
    link.href = entry.href; link.media = 'not all';
    entry.ready = new Promise((resolve, reject) => {
      let finished = false;
      const finish = error => {
        if (finished) return;
        finished = true; entry.cancel = undefined;
        link.removeEventListener('load', loaded); link.removeEventListener('error', failed);
        if (error) reject(new Error('Stylesheet unavailable')); else resolve();
      };
      const loaded = () => finish(false), failed = () => finish(true);
      entry.cancel = () => { finish(false); link.remove(); };
      link.addEventListener('load', loaded); link.addEventListener('error', failed);
      entry.anchor.before(link);
    }).catch(error => { link.remove(); entry.ready = undefined; entry.link = undefined; throw error; });
    return entry.ready;
  }
  const gate = id => {
    const selected = byId.get(id);
    if (closed || !selected || selected.every(entry => entry.applied)) return undefined;
    return Promise.all(selected.map(prepare)).then(() => closed ? undefined : () => {
      for (const entry of selected) { if (entry.link?.media) entry.link.media = ''; entry.applied = true; }
    });
  };
  gate.close = () => {
    closed = true; if (root[key] === gate) delete root[key];
    for (const entry of entries.values()) {
      entry.cancel?.(); if (entry.link?.media === 'not all') entry.link.remove(); entry.anchor.remove();
    }
  };
  Object.defineProperty(root, key, { value: gate, configurable: true });
  return gate;
}
