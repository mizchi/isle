// Natural pixel size of a static image file, read from its header at build time (PNG, GIF, JPEG, WebP, SVG): the
// `images` option of the layout analysis ({src: imageSize(bytes)}) checks image reservations against it.
// Returns {width, height} or null when the format or its size is not known (an SVG without width/height or a
// viewBox, a progressive format this reader does not parse). Never decodes pixel data.
export function imageSize(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const u16be = i => (b[i] << 8) | b[i + 1], u16le = i => b[i] | (b[i + 1] << 8), u24le = i => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = i => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const ascii = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  const ok = (width, height) => Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 ? {width, height} : null;
  // PNG: the IHDR chunk follows the 8-byte signature.
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') return ok(u32be(16), u32be(20));
  // GIF: logical screen size.
  if (b.length >= 10 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return ok(u16le(6), u16le(8));
  // JPEG: the first SOFn segment (not DHT C4, JPG C8, DAC CC).
  if (b.length >= 4 && b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) return null;
      const marker = b[i + 1];
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) { i += 2; continue; }
      const length = u16be(i + 2);
      if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) return ok(u16be(i + 7), u16be(i + 5));
      i += 2 + length;
    }
    return null;
  }
  // WebP: lossy (VP8 ), lossless (VP8L) or extended (VP8X).
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8 ') return ok(u16le(26) & 0x3FFF, u16le(28) & 0x3FFF);
    if (chunk === 'VP8L') { const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return ok((bits & 0x3FFF) + 1, ((bits >>> 14) & 0x3FFF) + 1); }
    if (chunk === 'VP8X') return ok(u24le(24) + 1, u24le(27) + 1);
    return null;
  }
  // SVG: px (or unitless) width and height on the root, else the viewBox's size.
  const text = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096)));
  const root = /<svg\b[^>]*>/i.exec(text);
  if (root) {
    const attr = name => new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`, 'i').exec(root[0])?.[1];
    const [w, h] = [attr('width'), attr('height')].map(v => v === undefined ? undefined : Number(v));
    if (Number.isInteger(w) && Number.isInteger(h)) return ok(w, h);
    const box = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(root[0]);
    if (box && Number.isInteger(Number(box[1])) && Number.isInteger(Number(box[2]))) return ok(Number(box[1]), Number(box[2]));
    return null;
  }
  return null;
}
