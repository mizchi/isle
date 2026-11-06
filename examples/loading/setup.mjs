export function setup({ root }) {
  // Observable demo instrumentation; fetching this module alone does not run setup.
  root.setAttribute('data-setup', 'ready');
}
