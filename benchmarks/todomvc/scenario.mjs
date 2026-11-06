import { readFileSync } from 'node:fs';
export const variants = ['isle', 'qwik', 'qwik-next', 'preact'];
export const css = readFileSync(new URL('../../examples/todomvc/style.css', import.meta.url), 'utf8');
export function shell(app, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TodoMVC comparison</title><style>${css}</style></head><body><main>${app}</main><aside class="info"><p>Double-click or activate a todo to edit.</p><p>Enter saves · Escape cancels · Changes are saved locally.</p><p>TodoMVC · Isle / Qwik / Preact comparison</p></aside>${script}</body></html>`;
}
