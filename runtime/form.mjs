import { createFormSession } from './form-session.mjs';
import { decodeFormData } from './form-data.mjs';
import { checkIssues, createValidator } from './validation.mjs';
import { createRequester } from './request.mjs';

const owners = new WeakMap();
const messages = { required: 'Complete this field.', type: 'Enter a valid value.', duplicate: 'Use one value for this field.',
  unknownField: 'The form contains an unexpected field.', minLength: 'This value is too short.', maxLength: 'This value is too long.',
  min: 'This value is too small.', max: 'This value is too large.', integer: 'Enter a whole number.',
  equals: 'Select the required value.', sameAs: 'These values must match.', pattern: 'Use the requested format.', format: 'Enter a valid email address.',
  taken: 'This value is already in use.', validationUnavailable: 'Validation is unavailable. Try again.', submissionFailed: 'Unable to submit. Try again.' };
const message = issue => Object.hasOwn(messages, issue.code) ? messages[issue.code] : 'Check this value.';

function defaultsOf(controls) {
  return [...controls].flatMap(([name, control]) => {
    if (control.type === 'checkbox') return control.defaultChecked ? [[name, control.defaultValue || 'on']] : [];
    if (control.tagName === 'SELECT') return [[name, [...control.options].find(option => option.defaultSelected)?.value ?? control.options[0]?.value ?? '']];
    return [[name, control.defaultValue]];
  });
}

async function pause(signal) {
  if (signal.aborted) throw signal.reason;
  await new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, 150);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

function owner(form, config, bridge) {
  if (owners.get(form)?.bridge === bridge) return owners.get(form);
  const controls = new Map([...form.querySelectorAll('[data-isle-field]')].map(node => [node.getAttribute('data-isle-field'), node]));
  const errors = new Map([...form.querySelectorAll('[data-isle-error]')].map(node => [node.getAttribute('data-isle-error'), node]));
  const summary = form.querySelector('[data-isle-errors]'), status = form.querySelector('[data-isle-status]');
  const defaultEntries = defaultsOf(controls), decoded = decodeFormData(config.schema, defaultEntries);
  const entryKey = entries => JSON.stringify([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const validateOutput = createValidator(config.output);
  const transport = bridge.request ?? createRequester(form.ownerDocument);
  let attempted = false, focus = false, state, lastSummary;
  function render(view) {
    form.dataset.isleDirty = String(view.dirty); form.dataset.isleTouched = view.touched.join(' ');
    form.dataset.isleValidating = String(view.validating);
    const visible = view.issues.filter(issue => !issue.field || attempted || view.touched.includes(issue.field));
    for (const [name, control] of controls) {
      const issue = visible.find(issue => issue.field === name), target = errors.get(name);
      const invalid = String(Boolean(issue)), next = issue ? message(issue) : '';
      if (control.getAttribute('aria-invalid') !== invalid) control.setAttribute('aria-invalid', invalid);
      if (target.textContent !== next) target.textContent = next;
      target.hidden = !issue;
    }
    const summaryKey = JSON.stringify([attempted, visible]);
    if (summaryKey !== lastSummary) { summary.replaceChildren(); lastSummary = summaryKey; }
    summary.hidden = !attempted || !visible.length;
    if (!summary.hidden && !summary.childNodes.length) {
      const heading = form.ownerDocument.createElement('p'); heading.textContent = 'Please check the form.'; summary.append(heading);
      const list = form.ownerDocument.createElement('ul'); summary.append(list);
      const seen = new Set();
      for (const issue of visible) {
        if (seen.has(issue.field)) continue; seen.add(issue.field);
        const item = form.ownerDocument.createElement('li'), control = controls.get(issue.field);
        if (control) {
          const link = form.ownerDocument.createElement('a'); link.href = `#${control.id}`;
          link.textContent = `${control.labels?.[0]?.textContent?.trim() || issue.field}: ${message(issue)}`;
          link.addEventListener('click', event => { event.preventDefault(); control.focus(); });
          item.append(link);
        } else item.textContent = message(issue);
        list.append(item);
      }
    }
    const nextStatus = view.status || (view.validating ? 'Checking…' : '');
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    if (focus && attempted && visible.length) {
      (controls.get(visible.find(issue => controls.has(issue.field) && controls.get(issue.field).type !== 'hidden')?.field) ?? summary).focus(); focus = false;
    }
  }
  async function request(mode, values, signal) {
    const response = await transport(mode, config.action, values, signal);
    const result = await response.json();
    if (response.ok && result.ok) {
      if (mode === 'action' && validateOutput(result.value).length) throw new Error('Invalid form response');
      return result;
    }
    if (response.status === 422 && result.error === 'validation_failed') return { ok: false, issues: checkIssues(result.issues, config.schema.fields) };
    throw new Error('Form request failed');
  }
  state = createFormSession(config, decoded.ok ? decoded.value : {}, {
    live: () => form.isConnected && !bridge.life.signal.aborted,
    change: render,
    validate: async (values, signal) => { await pause(signal); const result = await request('validate', values, signal); return result.ok ? [] : result.issues; },
    submit: (values, signal) => request('action', values, signal),
    success: value => { focus = false; form.dispatchEvent(new form.ownerDocument.defaultView.CustomEvent('isle:submit', { detail: value, bubbles: true, composed: true })); },
  });
  bridge.cancelValidation = state.cancelValidation;
  bridge.cancelAll = () => { attempted = false; focus = false; state.reset(); };
  bridge.life.signal.addEventListener('abort', () => state.dispose(), { once: true });
  const result = { state, bridge,
    async handle(payload, type) {
      if (bridge.life.signal.aborted || payload.generation !== bridge.generation) return;
      if (payload.field) state.touch(payload.field);
      if (type === 'reset') { attempted = false; focus = false; state.reset(); return; }
      const current = () => payload.revision === bridge.revision && payload.generation === bridge.generation && form.isConnected;
      if (type !== 'submit' && !current()) return;
      if (['input', 'change', 'focusout'].includes(type)) focus = false;
      const input = decodeFormData(config.schema, payload.entries);
      if (type === 'submit' || type === 'invalid') { attempted = true; focus = true; }
      if (!input.ok) { state.invalid(input.issues, attempted ? undefined : payload.field, entryKey(payload.entries) !== entryKey(defaultEntries)); return; }
      if (type === 'submit') await state.submit(input.value, current);
      else await state.update(input.value, payload.field, current);
    } };
  owners.set(form, result); return result;
}

/** The engine queues delivery; async work is revision-checked and separately tracked. */
export function handleForm(event, config) {
  const payload = event.form;
  if (!payload || payload.bridge.life.signal.aborted) return;
  const current = owner(payload.bridge.form, config, payload.bridge);
  const task = current.handle(payload, event.type).finally(() => {
    if (event.type === 'submit') payload.bridge.release(payload.ticket);
    payload.bridge.tasks.delete(task);
  });
  payload.bridge.tasks.add(task);
  task.catch(error => event.reportError?.(error));
}
