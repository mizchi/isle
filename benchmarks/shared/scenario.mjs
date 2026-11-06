// One observable contract for every implementation. No framework-specific labels.
export const fixture = {
  counters: [
    { initial: 37, label: 'SSR value 37' },
    { initial: 5, label: 'Independent instance' },
  ],
  editor: { id: 'demo', initial: 'Draft', label: 'Explicit server action' },
};
export const styles = `
:root { font-family: system-ui, sans-serif; color: #182b3b; background: #f4f7fa; }
body { margin: 0; padding: 24px; }
main { max-width: 720px; margin: 48px auto; }
h1 { font-size: 36px; line-height: 1.2; margin: 0 0 16px; }
h2 { font-size: 18px; margin: 0 0 16px; }
p { line-height: 1.7; }
.card { background: white; border: 1px solid #cbd5df; border-radius: 12px; padding: 24px; margin: 20px 0; }
.control { min-height: 48px; min-width: 120px; padding: 12px 20px; font: inherit; border: 1px solid #294f6f; border-radius: 8px; background: #183f60; color: white; cursor: pointer; }
.control:focus-visible { outline: 3px solid #a44f00; outline-offset: 4px; }
small { color: #43566a; }
`;
export function shell(app, scripts = '') {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>UI framework comparison</title><style>${styles}</style></head><body><main><h1>UI framework comparison</h1><p>Server HTML, independent counters, and an explicit remote action.</p>${app}<small>Shared fixture and API. Click either counter or rename Draft.</small></main>${scripts}</body></html>`;
}
