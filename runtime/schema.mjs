export const primitive = (type, value) => typeof value === type && (type !== 'number' || (Number.isFinite(value) && !Object.is(value, -0)));

/** Shared patterns stay in the ES2023 Unicode subset. HTML syntax is checked during compilation. */
export function compilePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.includes('&&') || pattern.includes('--') || /\(\?[ims-]/.test(pattern)) throw new Error('Unsupported shared pattern syntax');
  return new RegExp(`^(?:${pattern})$`, 'u');
}
