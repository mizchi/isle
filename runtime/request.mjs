/** Transport belongs to the mount, never to a serialized snapshot or source handler. */
export function createRequester(document, { actionBaseURL, requestCredentials } = {}) {
  const base = new URL(actionBaseURL ?? '/__isle/', document.baseURI);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || !base.pathname.endsWith('/')) throw new Error('Invalid action base URL');
  const credentials = requestCredentials ?? (actionBaseURL ? 'omit' : 'same-origin');
  return (mode, name, input, signal) => document.defaultView.fetch(new URL(`${mode}/${encodeURIComponent(name)}`, base).href, {
    method: 'POST', credentials, headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal,
  });
}
