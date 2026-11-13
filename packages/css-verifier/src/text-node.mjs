// Node entry: loads the mizchi/font FFI (MoonBit -> JS, build-time only) and
// font files, then returns `createTextMetrics`. Never part of app runtime.
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createTextMetrics} from './text.mjs';

export {createTextMetrics, upperBound, layoutAllowance} from './text.mjs';

// CSS_TEXT_METRICS_JS selects another FFI build.
export const textMetricsPath = process.env.CSS_TEXT_METRICS_JS ?? fileURLToPath(new URL('../text-metrics/_build/js/release/build/font_ffi/font_ffi.js', import.meta.url));

export async function loadShaper(path = textMetricsPath) {
  if (!existsSync(path)) throw new Error(`Text metrics FFI is not built: run "just css-text-build" (${path})`);
  const ffi = await import(path);
  return {
    load: data => ffi.load_font(data instanceof Uint8Array ? data : new Uint8Array(data)),
    info: handle => JSON.parse(ffi.font_info(handle)),
    shape: (handle, text, size, axes) => JSON.parse(ffi.shape(handle, text, size, JSON.stringify(axes ?? {}))),
  };
}

/**
 * @param {{fonts: Record<string, {file?: string, data?: Uint8Array, weight?: number}>, limits?: object}} options
 */
export async function loadTextMetrics({fonts, limits}) {
  const shaper = await loadShaper(), entries = {};
  for (const [family, entry] of Object.entries(fonts ?? {})) {
    const data = entry.data ?? new Uint8Array(await readFile(entry.file));
    entries[family] = {...entry, data, sha256: createHash('sha256').update(data).digest('hex')};
  }
  return createTextMetrics({fonts: entries, shaper, limits});
}
