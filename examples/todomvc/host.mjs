// Browser capabilities only; shared unchanged by all four benchmark implementations.
export function connectTodoHost(root, framework) {
  const key = `todos-${framework}`;
  const input = selector => root.querySelector(selector);
  function dispatch(selector, value) {
    const control = input(selector);
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function route() {
    const value = location.hash === '#/active' ? 'active' : location.hash === '#/completed' ? 'completed' : 'all';
    if (root.dataset.filter !== value) dispatch('[data-route]', value);
  }
  try {
    const saved = localStorage.getItem(key);
    if (saved && saved !== '[]') {
      const rows = JSON.parse(saved);
      if (Array.isArray(rows) && rows.every(row => row && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.title === 'string' && row.title.trim() && typeof row.completed === 'boolean' && Object.keys(row).length === 3) && new Set(rows.map(row => row.id)).size === rows.length) dispatch('[data-restore]', saved);
    }
  } catch { /* Storage may be unavailable or contain an invalid previous value. */ }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === root && record.attributeName === 'data-todos')) {
      try { localStorage.setItem(key, root.dataset.todos); } catch { /* Optional persistence. */ }
    }
    const editor = input('.editing .edit');
    if (editor && document.activeElement !== editor) { editor.focus(); editor.select(); }
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-todos', 'class'] });
  addEventListener('hashchange', route);
  route();
  return () => { observer.disconnect(); removeEventListener('hashchange', route); };
}
