import { createValidator, checkIssues } from './validation.mjs';

/** State/async scheduling are independent of DOM and HTTP. Services receive immutable values. */
export function createFormSession(contract, initial, services) {
  const defaults = Object.freeze({ ...initial }), validate = createValidator(contract.schema);
  const names = contract.schema.fields.map(field => field.name);
  let values = { ...defaults }, issues = [], touched = new Set(), pending = false, validating = false, status = '';
  let revision = 0, generation = 0, alive = true, validation, submission, invalidDirty = false;
  const live = () => alive && (!services.live || services.live());
  const current = (version, epoch, external) => live() && version === revision && epoch === generation && (!external || external());
  const snapshot = () => ({ values: { ...values }, issues: issues.map(issue => ({ ...issue })), touched: [...touched],
    dirty: invalidDirty || names.some(name => !Object.is(values[name], defaults[name])), pending, validating, status });
  const publish = () => { if (live()) services.change?.(snapshot()); };
  const cancelValidation = () => { validation?.abort(); validating = false; };
  const applyIssues = incoming => checkIssues(incoming, contract.schema.fields);
  return {
    snapshot, cancelValidation,
    async update(input, field, external) {
      if (!live()) return;
      if (pending && names.every(name => Object.is(values[name], input[name]))) {
        if (field) touched.add(field); publish(); return;
      }
      cancelValidation(); const version = ++revision, epoch = generation;
      values = { ...input }; invalidDirty = false; if (field) touched.add(field);
      issues = validate(values); if (!pending) status = '';
      publish();
      if (issues.length || !contract.asyncValidation || !services.validate || !current(version, epoch, external)) return;
      validation = new AbortController(); const signal = validation.signal;
      validating = true; publish();
      try {
        const problems = applyIssues(await services.validate(Object.freeze({ ...values }), signal));
        if (current(version, epoch, external)) issues = problems;
      } catch (error) {
        if (!signal.aborted && current(version, epoch, external)) issues = [{ field: '', code: 'validationUnavailable' }];
      } finally { if (current(version, epoch, external)) { validating = false; publish(); } }
    },
    invalid(problems, field, dirty = true) {
      if (!alive) return;
      cancelValidation(); revision++;
      if (field) touched.add(field); else names.forEach(name => touched.add(name));
      invalidDirty = dirty; issues = problems.map(issue => ({ ...issue })); status = ''; publish();
    },
    touch(field) { if (alive && field && names.includes(field)) touched.add(field); },
    async submit(input, external) {
      if (!live() || pending) return;
      cancelValidation(); const version = ++revision, epoch = generation;
      values = { ...input }; invalidDirty = false; names.forEach(name => touched.add(name));
      issues = validate(values);
      if (issues.length) { publish(); return; }
      submission = new AbortController(); const signal = submission.signal;
      pending = true; status = 'Saving…'; publish();
      try {
        const result = await services.submit(Object.freeze({ ...values }), signal);
        if (!live() || epoch !== generation) return;
        if (result.ok) {
          status = current(version, epoch, external) ? 'Saved.' : 'Submitted values saved. New changes are not saved.';
          services.success?.(result.value);
        } else if (current(version, epoch, external)) {
          issues = result.issues ? applyIssues(result.issues) : [{ field: '', code: 'submissionFailed' }];
          status = '';
        }
      } catch {
        if (!signal.aborted && current(version, epoch, external)) { issues = [{ field: '', code: 'submissionFailed' }]; status = ''; }
      } finally { if (alive && epoch === generation) { pending = false; publish(); } }
    },
    reset() {
      if (!alive) return;
      generation++; revision++; cancelValidation(); submission?.abort();
      values = { ...defaults }; invalidDirty = false; issues = []; touched = new Set(); pending = false; status = ''; publish();
    },
    dispose() { if (!alive) return; generation++; revision++; validation?.abort(); submission?.abort(); pending = false; validating = false; status = ''; alive = false; },
  };
}
