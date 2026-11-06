import { createFormSession } from '../../runtime/form-session.mjs';
import { decodeFormData } from '../../runtime/form-data.mjs';
import { projectSchema, projectDefaults } from './model.mjs';

export async function rpc(action, input, signal, mode = 'action') {
  const response = await fetch(`/__isle/${mode}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal });
  const result = await response.json();
  if (!response.ok && response.status !== 422) throw new Error('Dashboard request failed');
  return result;
}
export async function savePlan(id, hours) { const result = await rpc('savePlan', { id, hours }); if (!result.ok) throw new Error('Plan rejected'); return result.value.hours; }

const sessions = new WeakMap();
export const initialFormView = () => ({ values: { ...projectDefaults }, issues: [], touched: [], dirty: false, pending: false, validating: false, status: '', attempted: false });
export function visibleIssues(view) { return view.issues.filter(issue => view.attempted || view.touched.includes(issue.field)); }

function delay(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 150);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Shared headless state/validation; the benchmark framework owns DOM updates through publish(). */
export async function formEvent(form, event, publish) {
  if (event.type === 'submit' || event.type === 'invalid') event.preventDefault();
  let owner = sessions.get(form);
  if (!owner) {
    let attempted = false, focus = false;
    const session = createFormSession({ schema: projectSchema, asyncValidation: true }, projectDefaults, {
      live: () => form.isConnected,
      change: view => {
        publish({ ...view, attempted });
        if (focus && view.issues.length) {
          focus = false;
          requestAnimationFrame(() => form.querySelector(`[name="${view.issues[0].field}"]`)?.focus());
        }
      },
      validate: async (values, signal) => { await delay(signal); const result = await rpc('createProject', values, signal, 'validate'); return result.ok ? [] : result.issues; },
      submit: (values, signal) => rpc('createProject', values, signal),
    });
    owner = { session, attempt() { attempted = true; focus = true; }, reset() { attempted = false; focus = false; session.reset(); } };
    sessions.set(form, owner);
  }
  if (event.type === 'reset') { owner.reset(); return; }
  const decoded = decodeFormData(projectSchema, new FormData(form));
  const field = event.target?.name;
  if (event.type === 'submit' || event.type === 'invalid') owner.attempt();
  if (!decoded.ok) { owner.session.invalid(decoded.issues, field); return; }
  if (event.type === 'submit') await owner.session.submit(decoded.value);
  else await owner.session.update(decoded.value, field);
}
