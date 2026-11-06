import { component$, useSignal, useComputed$, useStore, $ } from '@qwik.dev/core';
import { tasks, fields, message } from '../../../../dashboard/model.mjs';
import { savePlan, formEvent, initialFormView, visibleIssues } from '../../../../dashboard/client.mjs';

const WorkItem = component$(({ task }: { task: typeof tasks[number] }) => {
  const hours = useSignal(task.initial), saved = useSignal(task.initial), locked = useSignal(false);
  const cost = useComputed$(() => hours.value * task.rate), difference = useComputed$(() => hours.value - saved.value);
  return <article data-task={task.id} data-team={task.team} aria-label={task.title}>
    <p class="meta">{task.team} · {task.rate} credits per hour</p><p class="description">{task.description}</p>
    <div class="numbers"><span>Planned hours <output data-value="hours">{hours.value}</output></span>
      <span>Estimated cost <output data-value="cost">{cost.value}</output></span>
      <span>Unsaved hours <output data-value="difference">{difference.value}</output></span></div>
    <div class="actions">
      <button type="button" data-action="increment" aria-label={task.title + ' add hour'} disabled={locked.value} onClick$={() => { hours.value += 1; }}>Add hour</button>
      <button type="button" data-action="reset" aria-label={task.title + ' reset draft'} disabled={locked.value} onClick$={() => { hours.value = saved.value; }}>Reset draft</button>
      <label class="check"><input type="checkbox" checked={locked.value} onChange$={(_, input) => { locked.value = input.checked; }} />Lock plan</label>
      <button type="button" data-action="save" aria-label={task.title + ' save plan'} disabled={locked.value} onClick$={async () => { saved.value = await savePlan(task.id, hours.value); }}>Save plan</button>
      <span class="saved">Saved hours <output data-value="saved">{saved.value}</output></span>
    </div><details><summary>Delivery notes</summary><p>Confirm scope, accessibility checks, and operational ownership before closing this work package.</p>
      <ul><li>Requirements reviewed with the owner.</li><li>Delivery and rollback steps documented.</li><li>Acceptance evidence attached to the project.</li></ul></details>
  </article>;
});

const ProjectForm = component$(() => {
  const view = useStore(initialFormView());
  const visible = visibleIssues(view);
  const event = $((event: Event, form: HTMLFormElement) => formEvent(form, event, next => Object.assign(view, next)));
  return <form class="project-form" data-project-form aria-label="Create project" method="post" action="/__isle/action/createProject"
    data-isle-dirty={String(view.dirty)} data-isle-validating={String(view.validating)} aria-busy={String(view.pending)}
    preventdefault:submit preventdefault:invalid onInput$={event} onChange$={event} onFocusOut$={event} onSubmit$={event} onInvalid$={event} onReset$={event}>
    {fields.map(field => <div class="field" key={field.name}>
      <label class={field.type === 'checkbox' ? 'check' : undefined}>
        {field.type !== 'checkbox' && field.label}
        <input name={field.name} id={`project-${field.name}`} type={field.type} required={field.required}
          minLength={field.minLength} maxLength={field.maxLength} min={field.min} max={field.max} step={field.step}
          autoComplete={field.autoComplete} value={field.type === 'checkbox' ? undefined : view.values[field.name]}
          checked={field.type === 'checkbox' ? view.values.accepted : undefined}
          aria-invalid={String(visible.some(issue => issue.field === field.name))} aria-describedby={`error-${field.name}`} />
        {field.type === 'checkbox' && field.label}
      </label><p id={`error-${field.name}`} hidden={!visible.some(issue => issue.field === field.name)}>{visible.find(issue => issue.field === field.name) ? message(visible.find(issue => issue.field === field.name)) : ''}</p>
    </div>)}
    <button type="submit" disabled={view.pending}>Create project</button><button type="reset">Reset form</button>
    <div role="alert" hidden={!view.attempted || !visible.length} tabIndex={-1}>
      {view.attempted && visible.length > 0 && <><p>Please check the form.</p><ul>{visible.filter((issue, i) => visible.findIndex(other => other.field === issue.field) === i).map(issue => <li key={issue.field}><a href={`#project-${issue.field}`}>{fields.find(field => field.name === issue.field)?.label}: {message(issue)}</a></li>)}</ul></>}
    </div><p role="status">{view.status || (view.validating ? 'Checking…' : '')}</p>
  </form>;
});
export const App = component$(() => <><section class="card"><h2>Create a project</h2><ProjectForm /></section>
  {tasks.map(task => <section class="card" key={task.id}><h2>{task.title}</h2><WorkItem task={task} /></section>)}</>);
