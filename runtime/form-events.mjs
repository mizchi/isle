const forms = new WeakMap();
const formsIn = root => [root, ...root.querySelectorAll('form[data-isle-form]')].filter(node => node.matches('form[data-isle-form]'));

function restore(state) {
  for (const [button, disabled] of state.buttons) button.disabled = disabled;
  state.buttons.clear(); state.pending = false;
  state.form.dataset.islePending = 'false'; state.form.setAttribute('aria-busy', 'false');
}

/** Only primitive entries and internal identities cross an import; the Event object never does. */
export function captureFormEvent(document, event, form) {
  let state = forms.get(form);
  if (!state) {
    state = { form, revision: 0, generation: 0, ticket: 0, pending: false, tasks: new Set(),
      buttons: new Map(), life: new document.defaultView.AbortController() };
    state.release = ticket => { if (ticket === state.ticket && forms.get(form) === state && !state.life.signal.aborted) restore(state); };
    forms.set(form, state);
  }
  if (state.life.signal.aborted) return null;
  if (event.type === 'submit' && state.pending) return null;
  if (event.type === 'focusout' && !event.target?.hasAttribute('data-isle-field')) return null;
  if (event.type !== 'focusout') state.revision++;
  if (['input', 'change'].includes(event.type)) state.cancelValidation?.();
  if (event.type === 'reset') {
    state.generation++; state.ticket++; state.cancelAll?.(); restore(state);
  }
  if (event.type === 'submit') {
    state.pending = true; state.ticket++;
    for (const button of form.querySelectorAll('button[type=submit],input[type=submit]')) { state.buttons.set(button, button.disabled); button.disabled = true; }
    form.dataset.islePending = 'true'; form.setAttribute('aria-busy', 'true');
  }
  return { bridge: state, revision: state.revision, generation: state.generation, ticket: state.ticket,
    field: event.target?.getAttribute('data-isle-field'), entries: [...new document.defaultView.FormData(form)] };
}

export function disposeFormEvents(root) {
  for (const form of formsIn(root)) {
    const state = forms.get(form);
    if (state) { state.life.abort(); restore(state); forms.delete(form); }
  }
}

export async function settleFormEvents(roots) {
  for (;;) {
    const tasks = [...roots].flatMap(root => formsIn(root).flatMap(form => [...(forms.get(form)?.tasks ?? [])]));
    if (!tasks.length) return;
    await Promise.allSettled(tasks);
  }
}
