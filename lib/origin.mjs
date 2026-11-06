/** Same-origin by default. Explicit cross-origin access never accepts ambient credentials. */
export function acceptsOrigin(request, allowedOrigins) {
  const origin = request.headers.get('origin');
  if (origin === new URL(request.url).origin) return true;
  if (!origin || request.headers.has('cookie') || request.headers.has('authorization')) return false;
  try { const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false; }
  catch { return false; }
  return allowedOrigins === '*' || Array.isArray(allowedOrigins) && allowedOrigins.includes(origin);
}
