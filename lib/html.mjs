/** Shared HTML encoders; independent of the compiler and Node APIs. */
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const encodeSnapshot = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
/** Build/SSR-only URL check: dynamic link writes are outside the language subset. */
export function safeHref(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value) || !['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value, 'https://isle.invalid/').protocol)) throw new TypeError('Unsafe link URL');
  return value;
}
